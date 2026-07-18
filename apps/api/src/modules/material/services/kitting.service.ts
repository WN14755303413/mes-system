import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ArrivalType,
  BomStatus,
  ErrorCode,
  KittingRowStatus,
  PoStatus,
  RequisitionStatus,
  RequisitionType,
  type KittingOverviewItem,
  type KittingResult,
  type KittingRow,
  type KittingSyncInfo,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * 齐套计算（M6，业务方案 §8.3 / §9.4）。实时计算不落表。
 *
 * 需求源：项目最新已发布/冻结的 BOM 版本，按物料编码聚合明细数量。逐行：
 *
 *   缺口 = 需求 − 已领净额 − 项目可用库存 − 通用可用库存 − 已到货未领 − 在途
 *
 * 一期简化：通用库存不做跨项目分摊锁定，直接按可用量计入并在行上标注
 * generalStock，多项目同时缺同一通用物料时看板会「双重乐观」——这在 200 人
 * 规模下先接受，二期接 ERP 预留/占用数据后修正。
 */
@Injectable()
export class KittingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 项目齐套明细。 */
  async forProject(projectId: string): Promise<KittingResult> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    const bom = await this.latestEffectiveBom(projectId);
    const sync = await this.syncInfo();

    if (!bom) {
      return {
        projectId,
        projectCode: project.code,
        projectName: project.name,
        bomId: null,
        bomVersion: null,
        totalRows: 0,
        fulfilledRows: 0,
        inTransitRows: 0,
        shortageRows: 0,
        kitRate: 0,
        kitRateByQty: 0,
        longLeadAlerts: 0,
        sync,
        rows: [],
      };
    }

    const rows = await this.computeRows(projectId, bom.id);

    const totalRows = rows.length;
    const fulfilledRows = rows.filter((r) => r.status === KittingRowStatus.FULFILLED).length;
    const inTransitRows = rows.filter((r) => r.status === KittingRowStatus.IN_TRANSIT).length;
    const shortageRows = rows.filter((r) => r.status === KittingRowStatus.SHORTAGE).length;

    const totalRequired = rows.reduce((s, r) => s + r.required, 0);
    const totalCovered = rows.reduce((s, r) => s + Math.min(r.required, r.required - Math.max(0, r.gap)), 0);

    return {
      projectId,
      projectCode: project.code,
      projectName: project.name,
      bomId: bom.id,
      bomVersion: bom.version,
      totalRows,
      fulfilledRows,
      inTransitRows,
      shortageRows,
      kitRate: totalRows ? Math.round((fulfilledRows / totalRows) * 100) : 0,
      kitRateByQty: totalRequired ? Math.round((totalCovered / totalRequired) * 100) : 0,
      longLeadAlerts: rows.filter((r) => r.isLongLead && r.status === KittingRowStatus.SHORTAGE)
        .length,
      sync,
      rows,
    };
  }

  /** 全项目齐套总览（有有效 BOM 的进行中项目）。 */
  async overview(): Promise<KittingOverviewItem[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['CLOSED', 'VOIDED'] },
        boms: { some: { status: { in: [BomStatus.RELEASED, BomStatus.FROZEN] } } },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const results = await Promise.all(projects.map((p) => this.forProject(p.id)));
    return results.map((r) => ({
      projectId: r.projectId,
      projectCode: r.projectCode,
      projectName: r.projectName,
      bomVersion: r.bomVersion,
      kitRate: r.kitRate,
      shortageRows: r.shortageRows,
      longLeadAlerts: r.longLeadAlerts,
    }));
  }

  /** 缺料清单（导出用）：仅返回缺料/在途行。 */
  async shortages(projectId: string): Promise<KittingResult> {
    const result = await this.forProject(projectId);
    return {
      ...result,
      rows: result.rows.filter((r) => r.status !== KittingRowStatus.FULFILLED),
    };
  }

  // ---- 私有 ----

  private async latestEffectiveBom(projectId: string) {
    return this.prisma.bom.findFirst({
      where: { projectId, status: { in: [BomStatus.RELEASED, BomStatus.FROZEN] } },
      orderBy: [{ releasedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, version: true },
    });
  }

  private async computeRows(projectId: string, bomId: string): Promise<KittingRow[]> {
    // 1. BOM 需求：同编码多行合并
    const items = await this.prisma.bomItem.findMany({
      where: { bomId },
      select: { materialCode: true, materialName: true, spec: true, unit: true, quantity: true },
      orderBy: { seq: 'asc' },
    });

    type Agg = {
      materialName: string;
      spec: string | null;
      unit: string;
      required: number;
    };
    const demand = new Map<string, Agg>();
    for (const i of items) {
      const prev = demand.get(i.materialCode);
      if (prev) prev.required += Number(i.quantity);
      else
        demand.set(i.materialCode, {
          materialName: i.materialName,
          spec: i.spec,
          unit: i.unit,
          required: Number(i.quantity),
        });
    }
    const codes = [...demand.keys()];
    if (!codes.length) return [];

    // 2. 各来源数据一次取齐，内存里按编码归并
    const [requisitions, stocks, arrivals, poItems, materials] = await Promise.all([
      this.prisma.requisition.findMany({
        where: { projectId, status: RequisitionStatus.CONFIRMED, materialCode: { in: codes } },
        select: { materialCode: true, quantity: true, type: true },
      }),
      this.prisma.stock.findMany({
        where: { materialCode: { in: codes }, OR: [{ projectId }, { projectId: null }] },
        select: { materialCode: true, projectId: true, availableQuantity: true },
      }),
      // 已到货未入库：项目专属 + 无项目归属的通用到货
      this.prisma.arrival.findMany({
        where: {
          materialCode: { in: codes },
          type: ArrivalType.ARRIVED,
          OR: [{ projectId }, { projectId: null }],
        },
        select: { materialCode: true, quantity: true },
      }),
      // 在途：执行中订单的未到量（项目专项 + 通用）
      this.prisma.purchaseOrderItem.findMany({
        where: {
          materialCode: { in: codes },
          order: { status: PoStatus.OPEN },
          OR: [{ projectId }, { projectId: null }],
        },
        select: {
          materialCode: true,
          quantity: true,
          arrivedQuantity: true,
          expectedDate: true,
          riskNote: true,
        },
      }),
      this.prisma.material.findMany({
        where: { code: { in: codes } },
        select: { code: true, isLongLead: true },
      }),
    ]);

    const issued = this.sumBy(requisitions, (r) =>
      r.type === RequisitionType.RETURN ? -Number(r.quantity) : Number(r.quantity),
    );
    const projectStock = this.sumBy(
      stocks.filter((s) => s.projectId === projectId),
      (s) => Number(s.availableQuantity),
    );
    const generalStock = this.sumBy(
      stocks.filter((s) => s.projectId === null),
      (s) => Number(s.availableQuantity),
    );
    const arrived = this.sumBy(arrivals, (a) => Number(a.quantity));

    const inTransit = new Map<string, number>();
    const latestExpected = new Map<string, Date>();
    const riskNotes = new Map<string, string[]>();
    for (const p of poItems) {
      const open = Math.max(0, Number(p.quantity) - Number(p.arrivedQuantity));
      if (open <= 0) continue;
      inTransit.set(p.materialCode, (inTransit.get(p.materialCode) ?? 0) + open);
      if (p.expectedDate) {
        const cur = latestExpected.get(p.materialCode);
        if (!cur || p.expectedDate > cur) latestExpected.set(p.materialCode, p.expectedDate);
      }
      if (p.riskNote) {
        const list = riskNotes.get(p.materialCode) ?? [];
        list.push(p.riskNote);
        riskNotes.set(p.materialCode, list);
      }
    }

    const materialByCode = new Map(materials.map((m) => [m.code, m]));

    // 3. 逐行计算
    return codes.map((code) => {
      const d = demand.get(code)!;
      const rowIssued = issued.get(code) ?? 0;
      const rowProjectStock = projectStock.get(code) ?? 0;
      const rowGeneralStock = generalStock.get(code) ?? 0;
      const rowArrived = arrived.get(code) ?? 0;
      const rowInTransit = inTransit.get(code) ?? 0;

      // 净缺口不含在途：>0 表示当前实物不足
      const gap = this.round3(
        d.required - rowIssued - rowProjectStock - rowGeneralStock - rowArrived,
      );

      const status =
        gap <= 0
          ? KittingRowStatus.FULFILLED
          : gap <= rowInTransit
            ? KittingRowStatus.IN_TRANSIT
            : KittingRowStatus.SHORTAGE;

      const material = materialByCode.get(code);
      return {
        materialCode: code,
        materialName: d.materialName,
        spec: d.spec,
        unit: d.unit,
        required: this.round3(d.required),
        issued: this.round3(rowIssued),
        projectStock: this.round3(rowProjectStock),
        generalStock: this.round3(rowGeneralStock),
        arrivedNotInbound: this.round3(rowArrived),
        inTransit: this.round3(rowInTransit),
        gap,
        status,
        latestExpectedDate: latestExpected.get(code)?.toISOString() ?? null,
        riskNotes: riskNotes.get(code) ?? [],
        isLongLead: material?.isLongLead ?? false,
        uncatalogued: !material,
      };
    });
  }

  /** 各数据源最后同步时间（业务方案 §5.1「看板必须标识数据同步时间」）。 */
  private async syncInfo(): Promise<KittingSyncInfo> {
    const [stock, po, arrival] = await Promise.all([
      this.prisma.stock.aggregate({ _max: { syncedAt: true } }),
      this.prisma.purchaseOrder.aggregate({ _max: { syncedAt: true } }),
      this.prisma.arrival.aggregate({ _max: { syncedAt: true } }),
    ]);
    return {
      stockSyncedAt: stock._max.syncedAt?.toISOString() ?? null,
      poSyncedAt: po._max.syncedAt?.toISOString() ?? null,
      arrivalSyncedAt: arrival._max.syncedAt?.toISOString() ?? null,
    };
  }

  private sumBy<T extends { materialCode: string }>(
    rows: T[],
    value: (row: T) => number,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.materialCode, (map.get(row.materialCode) ?? 0) + value(row));
    }
    return map;
  }

  /** Decimal(12,3) 对齐：消除 float 累加噪音。 */
  private round3(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
}
