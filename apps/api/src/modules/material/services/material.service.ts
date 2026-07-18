import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  SyncSource,
  type ImportResult,
  type MaterialItem,
  type PageResult,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { ImportMaterialsDto, MaterialListQueryDto, SaveMaterialDto } from '../dto/material.dto';

/**
 * 物料主数据（M6）。主数据以 ERP 为准（业务方案 §5.1），一期 ERP 未接入，
 * 由采购在 MES 内维护/导入；isLongLead、leadTimeDays 是 MES 侧执行扩展字段。
 */
@Injectable()
export class MaterialService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MaterialListQueryDto): Promise<PageResult<MaterialItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.MaterialWhereInput = {
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { spec: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.isLongLead !== undefined ? { isLongLead: query.isLongLead } : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toItem(r)), total, page, pageSize };
  }

  async create(dto: SaveMaterialDto): Promise<{ id: string }> {
    await this.assertCodeAvailable(dto.code.trim());
    return this.prisma.material.create({
      data: { ...this.data(dto), syncSource: SyncSource.MANUAL, syncedAt: new Date() },
      select: { id: true },
    });
  }

  async update(id: string, dto: SaveMaterialDto): Promise<void> {
    const existing = await this.prisma.material.findUnique({ where: { id }, select: { code: true } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '物料不存在', HttpStatus.NOT_FOUND);
    if (existing.code !== dto.code.trim()) await this.assertCodeAvailable(dto.code.trim());

    await this.prisma.material.update({ where: { id }, data: this.data(dto) });
  }

  /**
   * 批量导入（按 code upsert）。导入动作由 controller 写接口日志。
   */
  async import(dto: ImportMaterialsDto): Promise<ImportResult> {
    // 同批次内编码查重，避免 upsert 顺序依赖
    const codes = dto.items.map((i) => i.code.trim());
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `导入数据中物料编码 ${dup} 重复`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = new Set(
      (
        await this.prisma.material.findMany({
          where: { code: { in: codes } },
          select: { code: true },
        })
      ).map((m) => m.code),
    );

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.material.upsert({
          where: { code: item.code.trim() },
          create: { ...this.data(item), syncSource: SyncSource.IMPORT, syncedAt: new Date() },
          update: { ...this.data(item), syncSource: SyncSource.IMPORT, syncedAt: new Date() },
        }),
      ),
    );

    const updated = codes.filter((c) => existing.has(c)).length;
    return { created: codes.length - updated, updated };
  }

  // ---- 私有辅助 ----

  private toItem(row: Prisma.MaterialGetPayload<Record<string, never>>): MaterialItem {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      spec: row.spec,
      unit: row.unit,
      category: row.category,
      isStandard: row.isStandard,
      isLongLead: row.isLongLead,
      leadTimeDays: row.leadTimeDays,
      syncSource: row.syncSource as SyncSource,
      syncedAt: row.syncedAt.toISOString(),
      enabled: row.enabled,
      remark: row.remark,
    };
  }

  private data(dto: SaveMaterialDto) {
    return {
      code: dto.code.trim(),
      name: dto.name.trim(),
      spec: dto.spec?.trim() || null,
      unit: dto.unit?.trim() || '件',
      category: dto.category?.trim() || null,
      isStandard: dto.isStandard ?? true,
      isLongLead: dto.isLongLead ?? false,
      leadTimeDays: dto.leadTimeDays ?? null,
      enabled: dto.enabled ?? true,
      remark: dto.remark?.trim() || null,
    };
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const exists = await this.prisma.material.findUnique({ where: { code }, select: { id: true } });
    if (exists) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `物料编码 ${code} 已存在`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
