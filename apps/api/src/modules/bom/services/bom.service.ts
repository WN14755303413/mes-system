import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BOM_SHOP_VISIBLE_STATUSES,
  BOM_STATUS_LABEL,
  BOM_STATUS_TRANSITIONS,
  BomStatus,
  ErrorCode,
  Permission,
  type BomDetail,
  type BomItemRow,
  type BomVersionItem,
  type CurrentUser,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StateMachineService } from '../../../common/state/state-machine.service';
import type {
  BatchBomItemsDto,
  CreateBomDto,
  SaveBomItemDto,
  UpdateBomDto,
} from '../dto/bom.dto';

/** 列表/详情统一 include，保证 sourceVersion 等派生字段来源一致。 */
const BOM_INCLUDE = Prisma.validator<Prisma.BomInclude>()({
  source: { select: { version: true } },
  releasedBy: { select: { displayName: true } },
  createdBy: { select: { displayName: true } },
  _count: { select: { items: true } },
});

type BomWithMeta = Prisma.BomGetPayload<{ include: typeof BOM_INCLUDE }>;

/**
 * BOM 版本管理（M5）。
 *
 * 两条硬规则贯穿本服务：
 * 1. 可见性——无 bom:write 权限（现场、管理层等）只能看到已发布/已冻结版本
 *    （业务方案 §8.2），列表与详情都在此过滤，不依赖前端。
 * 2. 明细只在草稿态可编辑——发布即定格，改动必须走 ECO 派生新版本。
 */
@Injectable()
export class BomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /** 是否可见非现场状态（草稿/变更中/作废）。 */
  private canSeeAll(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.BOM_WRITE);
  }

  async list(projectId: string, user: CurrentUser): Promise<BomVersionItem[]> {
    const rows = await this.prisma.bom.findMany({
      where: {
        projectId,
        ...(this.canSeeAll(user)
          ? {}
          : { status: { in: [...BOM_SHOP_VISIBLE_STATUSES] } }),
      },
      include: BOM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toVersionItem(r));
  }

  async detail(id: string, user: CurrentUser): Promise<BomDetail> {
    const bom = await this.prisma.bom.findUnique({
      where: { id },
      include: {
        ...BOM_INCLUDE,
        items: {
          include: { drawing: { select: { code: true } } },
          orderBy: { seq: 'asc' },
        },
      },
    });
    if (!bom) throw new AppException(ErrorCode.NOT_FOUND, 'BOM 版本不存在', HttpStatus.NOT_FOUND);

    if (
      !this.canSeeAll(user) &&
      !BOM_SHOP_VISIBLE_STATUSES.includes(bom.status as BomStatus)
    ) {
      // 现场只允许看已发布/冻结版本（业务方案 §8.2），草稿与作废一律拒绝
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `「${BOM_STATUS_LABEL[bom.status as BomStatus]}」版本仅设计人员可见`,
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      ...this.toVersionItem(bom),
      items: bom.items.map((i) => this.toItemRow(i)),
    };
  }

  /**
   * 新建版本。带 sourceBomId 即「发起变更」（ECO）：
   * 校验源版本可变更、复制明细、源版本置为变更中，全程一个事务。
   */
  async create(
    dto: CreateBomDto,
    userId: string,
  ): Promise<{ id: string; version: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    let source: { id: string; projectId: string; version: string; status: string } | null = null;
    if (dto.sourceBomId) {
      source = await this.prisma.bom.findUnique({
        where: { id: dto.sourceBomId },
        select: { id: true, projectId: true, version: true, status: true },
      });
      if (!source || source.projectId !== dto.projectId) {
        throw new AppException(ErrorCode.NOT_FOUND, '源版本不存在', HttpStatus.NOT_FOUND);
      }
      if (source.status !== BomStatus.RELEASED && source.status !== BomStatus.FROZEN) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `仅已发布/已冻结版本可发起变更，当前为「${BOM_STATUS_LABEL[source.status as BomStatus]}」`,
          HttpStatus.BAD_REQUEST,
        );
      }
      // 变更必须记录原因（业务方案 §8.2）
      if (!dto.changeReason?.trim()) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          '发起变更必须填写变更原因',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const version = dto.version
      ? await this.assertVersionAvailable(dto.projectId, dto.version)
      : await this.suggestVersion(dto.projectId, source?.version ?? null);

    const created = await this.prisma.$transaction(async (tx) => {
      const bom = await tx.bom.create({
        data: {
          projectId: dto.projectId,
          version,
          status: BomStatus.DRAFT,
          remark: dto.remark ?? null,
          changeReason: dto.changeReason?.trim() || null,
          sourceBomId: source?.id ?? null,
          createdById: userId,
        },
        select: { id: true, version: true },
      });

      if (source) {
        // 复制源版本全部明细到新草稿
        const items = await tx.bomItem.findMany({
          where: { bomId: source.id },
          orderBy: { seq: 'asc' },
        });
        if (items.length) {
          await tx.bomItem.createMany({
            data: items.map((i) => ({
              bomId: bom.id,
              seq: i.seq,
              materialCode: i.materialCode,
              materialName: i.materialName,
              spec: i.spec,
              unit: i.unit,
              quantity: i.quantity,
              isStandard: i.isStandard,
              remark: i.remark,
              drawingId: i.drawingId,
            })),
          });
        }
        // 源版本进入「变更中」，提示所有人：该版本已有在途替代版本
        await tx.bom.update({
          where: { id: source.id },
          data: { status: BomStatus.CHANGING },
        });
      }
      return bom;
    });

    return created;
  }

  /** 草稿版本的备注/变更原因可改；其余状态一律只读。 */
  async update(id: string, dto: UpdateBomDto): Promise<void> {
    const bom = await this.getBomOrThrow(id);
    this.assertDraft(bom.status, '仅草稿版本可编辑');

    await this.prisma.bom.update({
      where: { id },
      data: {
        remark: dto.remark !== undefined ? dto.remark : undefined,
        changeReason: dto.changeReason !== undefined ? dto.changeReason : undefined,
      },
    });
  }

  /**
   * 状态流转（BomStatus 状态机）。附带的连锁动作：
   * - 发布：校验明细非空、落发布人与时间；若是 ECO 草稿，源版本自动作废（防现场误用旧版）。
   * - 作废：若是 ECO 草稿，源版本从「变更中」恢复为「已发布」。
   */
  async changeStatus(id: string, target: BomStatus, userId: string): Promise<void> {
    const bom = await this.getBomOrThrow(id);
    this.stateMachine.assertTransitionIn(
      BOM_STATUS_TRANSITIONS,
      BOM_STATUS_LABEL,
      bom.status as BomStatus,
      target,
    );

    if (target === BomStatus.RELEASED && bom.status === BomStatus.DRAFT) {
      const itemCount = await this.prisma.bomItem.count({ where: { bomId: id } });
      if (itemCount === 0) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          '明细为空，不能发布',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bom.update({
        where: { id },
        data: {
          status: target,
          // 首次发布落发布人与时间；重新发布（变更中→已发布）不覆盖
          ...(target === BomStatus.RELEASED && !bom.releasedAt
            ? { releasedAt: new Date(), releasedById: userId }
            : {}),
        },
      });

      if (bom.sourceBomId) {
        const source = await tx.bom.findUnique({
          where: { id: bom.sourceBomId },
          select: { id: true, status: true },
        });
        if (source?.status === BomStatus.CHANGING) {
          if (target === BomStatus.RELEASED) {
            // 新版生效，旧版作废——现场从此只能拿到新版
            await tx.bom.update({
              where: { id: source.id },
              data: { status: BomStatus.VOIDED },
            });
          } else if (target === BomStatus.VOIDED) {
            // 变更取消，旧版恢复有效
            await tx.bom.update({
              where: { id: source.id },
              data: { status: BomStatus.RELEASED },
            });
          }
        }
      }
    });
  }

  /** 删除仅限草稿（物理删，级联明细）。是 ECO 草稿时同步恢复源版本。 */
  async remove(id: string): Promise<void> {
    const bom = await this.getBomOrThrow(id);
    this.assertDraft(bom.status, '仅草稿版本可删除，其余请作废');

    await this.prisma.$transaction(async (tx) => {
      await tx.bom.delete({ where: { id } });
      if (bom.sourceBomId) {
        await tx.bom.updateMany({
          where: { id: bom.sourceBomId, status: BomStatus.CHANGING },
          data: { status: BomStatus.RELEASED },
        });
      }
    });
  }

  // ============ 明细 ============

  async addItem(bomId: string, dto: SaveBomItemDto): Promise<{ id: string }> {
    const bom = await this.getBomOrThrow(bomId);
    this.assertDraft(bom.status, '仅草稿版本可编辑明细，改动请走变更');
    await this.assertDrawingInProject(dto.drawingId, bom.projectId);

    const max = await this.prisma.bomItem.aggregate({
      where: { bomId },
      _max: { seq: true },
    });

    return this.prisma.bomItem.create({
      data: {
        bomId,
        seq: (max._max.seq ?? 0) + 1,
        ...this.itemData(dto),
      },
      select: { id: true },
    });
  }

  /** 批量追加（Excel 粘贴导入）。行号自最大值起自动续排。 */
  async batchAddItems(bomId: string, dto: BatchBomItemsDto): Promise<{ count: number }> {
    const bom = await this.getBomOrThrow(bomId);
    this.assertDraft(bom.status, '仅草稿版本可编辑明细，改动请走变更');

    const max = await this.prisma.bomItem.aggregate({
      where: { bomId },
      _max: { seq: true },
    });
    const start = (max._max.seq ?? 0) + 1;

    const result = await this.prisma.bomItem.createMany({
      data: dto.items.map((item, idx) => ({
        bomId,
        seq: start + idx,
        ...this.itemData(item),
      })),
    });
    return { count: result.count };
  }

  async updateItem(bomId: string, itemId: string, dto: SaveBomItemDto): Promise<void> {
    const bom = await this.getBomOrThrow(bomId);
    this.assertDraft(bom.status, '仅草稿版本可编辑明细，改动请走变更');
    await this.assertDrawingInProject(dto.drawingId, bom.projectId);

    const item = await this.prisma.bomItem.findFirst({
      where: { id: itemId, bomId },
      select: { id: true },
    });
    if (!item) throw new AppException(ErrorCode.NOT_FOUND, '明细行不存在', HttpStatus.NOT_FOUND);

    await this.prisma.bomItem.update({ where: { id: itemId }, data: this.itemData(dto) });
  }

  async removeItem(bomId: string, itemId: string): Promise<void> {
    const bom = await this.getBomOrThrow(bomId);
    this.assertDraft(bom.status, '仅草稿版本可编辑明细，改动请走变更');

    const item = await this.prisma.bomItem.findFirst({
      where: { id: itemId, bomId },
      select: { id: true },
    });
    if (!item) throw new AppException(ErrorCode.NOT_FOUND, '明细行不存在', HttpStatus.NOT_FOUND);

    await this.prisma.bomItem.delete({ where: { id: itemId } });
  }

  // ---- 私有辅助 ----

  private toVersionItem(row: BomWithMeta): BomVersionItem {
    return {
      id: row.id,
      projectId: row.projectId,
      version: row.version,
      status: row.status as BomStatus,
      remark: row.remark,
      changeReason: row.changeReason,
      sourceBomId: row.sourceBomId,
      sourceVersion: row.source?.version ?? null,
      itemCount: row._count.items,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      releasedByName: row.releasedBy?.displayName ?? null,
      createdByName: row.createdBy?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toItemRow(
    item: Prisma.BomItemGetPayload<{ include: { drawing: { select: { code: true } } } }>,
  ): BomItemRow {
    return {
      id: item.id,
      bomId: item.bomId,
      seq: item.seq,
      materialCode: item.materialCode,
      materialName: item.materialName,
      spec: item.spec,
      unit: item.unit,
      quantity: Number(item.quantity),
      isStandard: item.isStandard,
      remark: item.remark,
      drawingId: item.drawingId,
      drawingCode: item.drawing?.code ?? null,
    };
  }

  private itemData(dto: SaveBomItemDto) {
    return {
      materialCode: dto.materialCode.trim(),
      materialName: dto.materialName.trim(),
      spec: dto.spec?.trim() || null,
      unit: dto.unit?.trim() || '件',
      quantity: new Prisma.Decimal(dto.quantity),
      isStandard: dto.isStandard ?? true,
      remark: dto.remark?.trim() || null,
      drawingId: dto.drawingId || null,
    };
  }

  private async getBomOrThrow(id: string) {
    const bom = await this.prisma.bom.findUnique({ where: { id } });
    if (!bom) throw new AppException(ErrorCode.NOT_FOUND, 'BOM 版本不存在', HttpStatus.NOT_FOUND);
    return bom;
  }

  private assertDraft(status: string, message: string): void {
    if (status !== BomStatus.DRAFT) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST);
    }
  }

  /** 明细关联的图纸必须属于同一项目，防止跨项目引用。 */
  private async assertDrawingInProject(
    drawingId: string | null | undefined,
    projectId: string,
  ): Promise<void> {
    if (!drawingId) return;
    const drawing = await this.prisma.drawing.findFirst({
      where: { id: drawingId, projectId },
      select: { id: true },
    });
    if (!drawing) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '关联的图纸不存在或不属于本项目',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 手填版本号：只查重。 */
  private async assertVersionAvailable(projectId: string, version: string): Promise<string> {
    const exists = await this.prisma.bom.findUnique({
      where: { projectId_version: { projectId, version } },
      select: { id: true },
    });
    if (exists) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `版本号 ${version} 已存在`,
        HttpStatus.CONFLICT,
      );
    }
    return version;
  }

  /**
   * 自动建议版本号：初始 V1.0；从源版本派生则次版本 +1（V1.0→V1.1）。
   * 建议值已被占用时继续 +1，直到可用。
   */
  private async suggestVersion(projectId: string, sourceVersion: string | null): Promise<string> {
    const existing = new Set(
      (
        await this.prisma.bom.findMany({
          where: { projectId },
          select: { version: true },
        })
      ).map((b) => b.version),
    );

    if (!sourceVersion) {
      if (!existing.has('V1.0')) return 'V1.0';
      // 已有 V1.0（比如现存草稿）却未指定版本：从最大主版本 +1 起新链
      const majors = [...existing]
        .map((v) => /^V(\d+)\./.exec(v)?.[1])
        .filter(Boolean)
        .map(Number);
      return `V${Math.max(...majors, 0) + 1}.0`;
    }

    const parsed = /^V(\d+)\.(\d+)$/.exec(sourceVersion);
    let major = parsed ? Number(parsed[1]) : 1;
    let minor = parsed ? Number(parsed[2]) + 1 : 1;
    while (existing.has(`V${major}.${minor}`)) minor += 1;
    return `V${major}.${minor}`;
  }
}
