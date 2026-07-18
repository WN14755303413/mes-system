import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ArrivalType,
  ErrorCode,
  PoStatus,
  SyncSource,
  type ArrivalRow,
  type ImportResult,
  type PageResult,
  type PoItemRow,
  type StockRow,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ArrivalListQueryDto,
  ImportArrivalsDto,
  ImportPoDto,
  ImportStocksDto,
  PoItemListQueryDto,
  StockListQueryDto,
  UpdatePoItemDto,
} from '../dto/material.dto';

const PO_ITEM_INCLUDE = Prisma.validator<Prisma.PurchaseOrderItemInclude>()({
  order: { select: { orderNo: true, supplierName: true, status: true, syncedAt: true } },
  project: { select: { code: true } },
});

type PoItemWithMeta = Prisma.PurchaseOrderItemGetPayload<{ include: typeof PO_ITEM_INCLUDE }>;

/**
 * 供应数据（M6）：采购订单镜像 / 到货记录 / 库存快照。
 *
 * 一期 ERP 接口未开通，数据经 Excel 粘贴导入进入（业务方案 §21 兜底策略）。
 * 每次导入写一条 sys_integration_log——将来接 ERP 后，同一张日志表继续记录
 * 接口同步，异常池/重试机制无缝衔接。
 */
@Injectable()
export class SupplyService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ 采购订单 ============

  async listPoItems(query: PoItemListQueryDto): Promise<PageResult<PoItemRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.PurchaseOrderItemWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.materialCode ? { materialCode: query.materialCode } : {}),
      ...(query.keyword
        ? {
            OR: [
              { materialCode: { contains: query.keyword, mode: 'insensitive' } },
              { materialName: { contains: query.keyword, mode: 'insensitive' } },
              { order: { orderNo: { contains: query.keyword, mode: 'insensitive' } } },
              { order: { supplierName: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
      // 「只看在途」：未到齐且订单未完结
      ...(query.inTransitOnly
        ? {
            order: { status: PoStatus.OPEN },
            quantity: { gt: this.prisma.purchaseOrderItem.fields.arrivedQuantity },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.purchaseOrderItem.count({ where }),
      this.prisma.purchaseOrderItem.findMany({
        where,
        include: PO_ITEM_INCLUDE,
        orderBy: [{ expectedDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toPoItemRow(r)), total, page, pageSize };
  }

  /**
   * 导入采购订单行：同 orderNo 归并为一张单（upsert），明细按 orderNo+materialCode
   * 匹配——已存在则覆盖数量/交期，不存在则新建。
   */
  async importPo(dto: ImportPoDto, userId: string): Promise<ImportResult> {
    const projectIdByCode = await this.resolveProjectCodes(
      dto.items.map((i) => i.projectCode).filter((c): c is string => !!c),
    );

    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        const order = await tx.purchaseOrder.upsert({
          where: { orderNo: row.orderNo.trim() },
          create: {
            orderNo: row.orderNo.trim(),
            supplierName: row.supplierName?.trim() || null,
            orderDate: row.orderDate ? new Date(row.orderDate) : null,
            syncSource: SyncSource.IMPORT,
            syncedAt: new Date(),
          },
          update: {
            ...(row.supplierName ? { supplierName: row.supplierName.trim() } : {}),
            ...(row.orderDate ? { orderDate: new Date(row.orderDate) } : {}),
            syncedAt: new Date(),
          },
          select: { id: true },
        });

        const itemData = {
          materialName: row.materialName?.trim() || null,
          quantity: new Prisma.Decimal(row.quantity),
          ...(row.arrivedQuantity !== undefined
            ? { arrivedQuantity: new Prisma.Decimal(row.arrivedQuantity) }
            : {}),
          expectedDate: row.expectedDate ? new Date(row.expectedDate) : null,
          projectId: row.projectCode ? (projectIdByCode.get(row.projectCode) ?? null) : null,
        };

        const existing = await tx.purchaseOrderItem.findFirst({
          where: { orderId: order.id, materialCode: row.materialCode.trim() },
          select: { id: true },
        });
        if (existing) {
          await tx.purchaseOrderItem.update({ where: { id: existing.id }, data: itemData });
          updated += 1;
        } else {
          await tx.purchaseOrderItem.create({
            data: { orderId: order.id, materialCode: row.materialCode.trim(), ...itemData },
          });
          created += 1;
        }
      }
    });

    await this.logImport('采购订单导入', dto.items.length, userId);
    return { created, updated };
  }

  /** 采购员仅可维护交期与风险备注（业务方案 §7.6）。 */
  async updatePoItem(id: string, dto: UpdatePoItemDto): Promise<void> {
    const item = await this.prisma.purchaseOrderItem.findUnique({ where: { id }, select: { id: true } });
    if (!item) throw new AppException(ErrorCode.NOT_FOUND, '采购明细不存在', HttpStatus.NOT_FOUND);

    await this.prisma.purchaseOrderItem.update({
      where: { id },
      data: {
        ...(dto.expectedDate !== undefined
          ? { expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null }
          : {}),
        ...(dto.riskNote !== undefined ? { riskNote: dto.riskNote?.trim() || null } : {}),
      },
    });
  }

  // ============ 到货记录 ============

  async listArrivals(query: ArrivalListQueryDto): Promise<PageResult<ArrivalRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ArrivalWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.materialCode ? { materialCode: query.materialCode } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.arrival.count({ where }),
      this.prisma.arrival.findMany({
        where,
        include: {
          poItem: { select: { order: { select: { orderNo: true } } } },
          project: { select: { code: true } },
        },
        orderBy: { arrivedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        materialCode: r.materialCode,
        quantity: Number(r.quantity),
        type: r.type as ArrivalType,
        arrivedAt: r.arrivedAt.toISOString(),
        orderNo: r.poItem?.order.orderNo ?? null,
        projectId: r.projectId,
        projectCode: r.project?.code ?? null,
        syncSource: r.syncSource as SyncSource,
        remark: r.remark,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 导入到货记录。带 orderNo 时匹配采购明细（orderNo+materialCode）并累加其
   * 已到货量；匹配不到不报错——允许无单到货，只是不冲减在途。
   */
  async importArrivals(dto: ImportArrivalsDto, userId: string): Promise<ImportResult> {
    const projectIdByCode = await this.resolveProjectCodes(
      dto.items.map((i) => i.projectCode).filter((c): c is string => !!c),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        let poItemId: string | null = null;
        if (row.orderNo) {
          const poItem = await tx.purchaseOrderItem.findFirst({
            where: {
              materialCode: row.materialCode.trim(),
              order: { orderNo: row.orderNo.trim() },
            },
            select: { id: true },
          });
          if (poItem) {
            poItemId = poItem.id;
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: { arrivedQuantity: { increment: new Prisma.Decimal(row.quantity) } },
            });
          }
        }

        await tx.arrival.create({
          data: {
            poItemId,
            materialCode: row.materialCode.trim(),
            quantity: new Prisma.Decimal(row.quantity),
            type: row.type ?? ArrivalType.ARRIVED,
            arrivedAt: new Date(row.arrivedAt),
            projectId: row.projectCode ? (projectIdByCode.get(row.projectCode) ?? null) : null,
            syncSource: SyncSource.IMPORT,
            syncedAt: new Date(),
            remark: row.remark?.trim() || null,
          },
        });
      }
    });

    await this.logImport('到货记录导入', dto.items.length, userId);
    return { created: dto.items.length, updated: 0 };
  }

  // ============ 库存快照 ============

  async listStocks(query: StockListQueryDto): Promise<PageResult<StockRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.StockWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.keyword
        ? { materialCode: { contains: query.keyword, mode: 'insensitive' } }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stock.count({ where }),
      this.prisma.stock.findMany({
        where,
        include: { project: { select: { code: true } } },
        orderBy: { materialCode: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // 物料名冗余展示：从主数据反查
    const nameByCode = new Map(
      (
        await this.prisma.material.findMany({
          where: { code: { in: rows.map((r) => r.materialCode) } },
          select: { code: true, name: true },
        })
      ).map((m) => [m.code, m.name]),
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        materialCode: r.materialCode,
        materialName: nameByCode.get(r.materialCode) ?? null,
        projectId: r.projectId,
        projectCode: r.project?.code ?? null,
        quantity: Number(r.quantity),
        availableQuantity: Number(r.availableQuantity),
        syncedAt: r.syncedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 库存快照导入：**整体覆盖**——先清空再写入。库存账务主权在 ERP
   * （业务方案 §5.1），MES 不记增减账，快照時点即看板上的同步时间。
   */
  async importStocks(dto: ImportStocksDto, userId: string): Promise<ImportResult> {
    const projectIdByCode = await this.resolveProjectCodes(
      dto.items.map((i) => i.projectCode).filter((c): c is string => !!c),
    );

    // 同批次内 materialCode+projectCode 查重，避免违反唯一约束
    const keys = dto.items.map((i) => `${i.materialCode.trim()}::${i.projectCode ?? ''}`);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `导入数据中「物料+项目」组合 ${dup.replace('::', ' / ')} 重复`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.stock.deleteMany({}),
      this.prisma.stock.createMany({
        data: dto.items.map((row) => ({
          materialCode: row.materialCode.trim(),
          projectId: row.projectCode ? (projectIdByCode.get(row.projectCode) ?? null) : null,
          quantity: new Prisma.Decimal(row.quantity),
          availableQuantity: new Prisma.Decimal(row.availableQuantity ?? row.quantity),
          syncSource: SyncSource.IMPORT,
          syncedAt: now,
        })),
      }),
    ]);

    await this.logImport('库存快照导入', dto.items.length, userId);
    return { created: dto.items.length, updated: 0 };
  }

  // ---- 私有辅助 ----

  private toPoItemRow(row: PoItemWithMeta): PoItemRow {
    const quantity = Number(row.quantity);
    const arrived = Number(row.arrivedQuantity);
    const inTransit =
      row.order.status === PoStatus.OPEN ? Math.max(0, quantity - arrived) : 0;
    return {
      id: row.id,
      orderId: row.orderId,
      orderNo: row.order.orderNo,
      supplierName: row.order.supplierName,
      poStatus: row.order.status as PoStatus,
      materialCode: row.materialCode,
      materialName: row.materialName,
      quantity,
      arrivedQuantity: arrived,
      inTransitQuantity: inTransit,
      expectedDate: row.expectedDate?.toISOString() ?? null,
      delayed: inTransit > 0 && !!row.expectedDate && row.expectedDate < new Date(),
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      riskNote: row.riskNote,
      syncedAt: row.order.syncedAt.toISOString(),
    };
  }

  /** 项目编号 → id。编号不存在时报错，防止导入数据挂空。 */
  private async resolveProjectCodes(codes: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(codes.map((c) => c.trim()))];
    if (!unique.length) return new Map();

    const projects = await this.prisma.project.findMany({
      where: { code: { in: unique }, deletedAt: null },
      select: { id: true, code: true },
    });
    const map = new Map(projects.map((p) => [p.code, p.id]));

    const missing = unique.filter((c) => !map.has(c));
    if (missing.length) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `项目编号不存在：${missing.join('、')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return map;
  }

  /** 导入即一次「集成动作」，写接口日志（业务方案 §11.3），来源标记为人工导入。 */
  private async logImport(name: string, rowCount: number, userId: string): Promise<void> {
    await this.prisma.integrationLog.create({
      data: {
        interfaceName: name,
        sourceSystem: 'IMPORT',
        targetSystem: 'MES',
        requestSummary: { rowCount },
        success: true,
        triggeredBy: userId,
      },
    });
  }
}
