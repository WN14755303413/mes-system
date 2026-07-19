import { Injectable } from '@nestjs/common';
import type {
  AuditLogItem,
  IntegrationLogItem,
  PageResult,
} from '@mes/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditLogQueryDto, IntegrationLogQueryDto } from '../dto/system.dto';

@Injectable()
export class LogService {
  constructor(private readonly prisma: PrismaService) {}

  async auditLogs(query: AuditLogQueryDto): Promise<PageResult<AuditLogItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.username) where.username = { contains: query.username, mode: 'insensitive' };
    if (query.action) where.action = { contains: query.action };
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword, mode: 'insensitive' } },
        { action: { contains: query.keyword } },
        { targetId: { contains: query.keyword } },
      ];
    }
    const createdAt = this.dateRange(query.from, query.to);
    if (createdAt) where.createdAt = createdAt;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        changes: r.changes ?? null,
        ip: r.ip,
        userAgent: r.userAgent,
        success: r.success,
        errorMsg: r.errorMsg,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async integrationLogs(query: IntegrationLogQueryDto): Promise<PageResult<IntegrationLogItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.IntegrationLogWhereInput = {};
    if (query.interfaceName) where.interfaceName = { contains: query.interfaceName };
    if (query.success !== undefined) where.success = query.success;
    if (query.needsAttention !== undefined) where.needsAttention = query.needsAttention;
    if (query.keyword) {
      where.OR = [
        { interfaceName: { contains: query.keyword } },
        { sourceSystem: { contains: query.keyword } },
        { targetSystem: { contains: query.keyword } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.integrationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.integrationLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        interfaceName: r.interfaceName,
        sourceSystem: r.sourceSystem,
        targetSystem: r.targetSystem,
        action: r.action,
        requestSummary: r.requestSummary ?? null,
        responseSummary: r.responseSummary ?? null,
        success: r.success,
        errorMsg: r.errorMsg,
        retryCount: r.retryCount,
        needsAttention: r.needsAttention,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        triggeredBy: r.triggeredBy,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 把前端传来的 from/to 日期字符串转成 Prisma 的时间范围过滤；非法值忽略。 */
  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) filter.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) filter.lte = d;
    }
    return filter.gte || filter.lte ? filter : undefined;
  }
}
