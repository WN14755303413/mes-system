import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  RecordStatus,
  RiskLevel,
  type ProjectDetail,
  type ProjectListItem,
  type ProjectListQuery,
  type PageResult,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StateMachineService } from '../../../common/state/state-machine.service';
import type { SaveProjectDto } from '../dto/project.dto';

/** 列表/详情统一的 project include，保证 managerName 等派生字段来源一致。 */
const PROJECT_INCLUDE = Prisma.validator<Prisma.ProjectInclude>()({
  manager: { select: { id: true, displayName: true } },
  _count: {
    select: {
      risks: { where: { status: 'OPEN' } },
      issues: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
    },
  },
});

type ProjectWithCounts = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly stateMachine: StateMachineService,
  ) {}

  /**
   * 供「项目经理/负责人」下拉的轻量用户选项。
   * 只暴露 id 与姓名——比 /system/users 少得多，因此仅要求 project:read 而非 sys:user:read。
   */
  async userOptions(): Promise<{ id: string; displayName: string }[]> {
    return this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async list(query: ProjectListQuery): Promise<PageResult<ProjectListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' as const } },
              { name: { contains: query.keyword, mode: 'insensitive' as const } },
              { customerName: { contains: query.keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toListItem(r)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...PROJECT_INCLUDE,
        milestones: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
        members: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    return {
      ...this.toListItem(project),
      description: project.description,
      milestones: project.milestones.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        name: m.name,
        planDate: iso(m.planDate),
        actualDate: iso(m.actualDate),
        sort: m.sort,
      })),
      members: project.members.map((pm) => ({
        userId: pm.userId,
        displayName: pm.user.displayName,
        roleInProject: pm.roleInProject,
      })),
    };
  }

  /** 新建项目：编号由 CodeGeneratorService 生成，初始状态为草稿。 */
  async create(dto: SaveProjectDto): Promise<{ id: string; code: string }> {
    await this.assertManagerExists(dto.managerId);
    this.assertDateOrder(dto.planStartAt, dto.planEndAt);

    // 编号规则 PJ-年份-流水号。年份取计划开工年，缺省用当前年。
    const year = (dto.planStartAt ? new Date(dto.planStartAt) : new Date()).getFullYear();
    const code = await this.codeGen.next(`PJ-${year}`);

    const project = await this.prisma.project.create({
      data: {
        code,
        name: dto.name,
        customerName: dto.customerName ?? null,
        contractNo: dto.contractNo ?? null,
        projectType: dto.projectType ?? null,
        equipmentCount: dto.equipmentCount ?? 1,
        managerId: dto.managerId || null,
        planStartAt: parseDate(dto.planStartAt),
        planEndAt: parseDate(dto.planEndAt),
        riskLevel: dto.riskLevel ?? RiskLevel.LOW,
        description: dto.description ?? null,
        status: RecordStatus.DRAFT,
      },
      select: { id: true, code: true },
    });
    return project;
  }

  async update(id: string, dto: SaveProjectDto): Promise<ProjectDetail> {
    await this.getProjectOrThrow(id);
    await this.assertManagerExists(dto.managerId);
    this.assertDateOrder(dto.planStartAt, dto.planEndAt);

    await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        customerName: dto.customerName ?? null,
        contractNo: dto.contractNo ?? null,
        projectType: dto.projectType ?? null,
        equipmentCount: dto.equipmentCount ?? 1,
        managerId: dto.managerId || null,
        planStartAt: parseDate(dto.planStartAt),
        planEndAt: parseDate(dto.planEndAt),
        riskLevel: dto.riskLevel ?? undefined,
        description: dto.description ?? null,
      },
    });
    return this.detail(id);
  }

  /** 状态流转：交由 StateMachineService 校验合法性；进入已完成时补记实际交期。 */
  async changeStatus(id: string, target: string): Promise<ProjectDetail> {
    const project = await this.getProjectOrThrow(id);
    this.stateMachine.assertTransition(
      project.status as RecordStatus,
      target as RecordStatus,
    );

    await this.prisma.project.update({
      where: { id },
      data: {
        status: target,
        // 首次进入已完成时落实际交期；其它跃迁不动它
        actualEndAt:
          target === RecordStatus.COMPLETED && !project.actualEndAt
            ? new Date()
            : undefined,
      },
    });
    return this.detail(id);
  }

  /** 软删除。已发布及以后的项目禁止删除，避免误删有执行数据的项目。 */
  async remove(id: string): Promise<void> {
    const project = await this.getProjectOrThrow(id);
    if (project.status !== RecordStatus.DRAFT) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '仅草稿状态的项目可删除，请先作废',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ---- 私有辅助 ----

  private toListItem(row: ProjectWithCounts): ProjectListItem {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      customerName: row.customerName,
      contractNo: row.contractNo,
      projectType: row.projectType,
      status: row.status,
      riskLevel: row.riskLevel as RiskLevel,
      equipmentCount: row.equipmentCount,
      managerId: row.managerId,
      managerName: row.manager?.displayName ?? null,
      planStartAt: iso(row.planStartAt),
      planEndAt: iso(row.planEndAt),
      actualEndAt: iso(row.actualEndAt),
      openRiskCount: row._count.risks,
      openIssueCount: row._count.issues,
      createdAt: iso(row.createdAt)!,
    };
  }

  private async getProjectOrThrow(id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
    return project;
  }

  private async assertManagerExists(managerId?: string | null): Promise<void> {
    if (!managerId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: managerId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '指定的项目经理不存在', HttpStatus.BAD_REQUEST);
    }
  }

  private assertDateOrder(start?: string | null, end?: string | null): void {
    if (start && end && new Date(start) > new Date(end)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '计划开工日期不能晚于计划交期',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

/** Date → ISO 字符串，null 透传。网络层统一用 ISO 传日期。 */
function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** ISO 字符串 → Date，空值存 null。 */
function parseDate(s?: string | null): Date | null {
  return s ? new Date(s) : null;
}
