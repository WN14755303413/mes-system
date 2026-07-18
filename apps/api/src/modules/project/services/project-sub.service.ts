import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  IssuePriority,
  IssueStatus,
  RiskStatus,
  type IssueItem,
  type MilestoneItem,
  type ProjectMemberItem,
  type RiskItem,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  SaveIssueDto,
  SaveMemberDto,
  SaveMilestoneDto,
  SaveRiskDto,
} from '../dto/project.dto';

/**
 * 项目子资源：里程碑 / 风险 / 问题 / 成员。
 * 都直接挂在 project 下，生命周期随项目（外键 onDelete: Cascade）。
 */
@Injectable()
export class ProjectSubService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ 里程碑 ============

  async listMilestones(projectId: string): Promise<MilestoneItem[]> {
    await this.assertProject(projectId);
    const rows = await this.prisma.projectMilestone.findMany({
      where: { projectId },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      planDate: iso(m.planDate),
      actualDate: iso(m.actualDate),
      sort: m.sort,
    }));
  }

  async createMilestone(projectId: string, dto: SaveMilestoneDto): Promise<{ id: string }> {
    await this.assertProject(projectId);
    return this.prisma.projectMilestone.create({
      data: {
        projectId,
        name: dto.name,
        planDate: parseDate(dto.planDate),
        actualDate: parseDate(dto.actualDate),
        sort: dto.sort ?? 0,
      },
      select: { id: true },
    });
  }

  async updateMilestone(projectId: string, id: string, dto: SaveMilestoneDto): Promise<void> {
    await this.assertOwnedRecord(this.prisma.projectMilestone, projectId, id, '里程碑');
    await this.prisma.projectMilestone.update({
      where: { id },
      data: {
        name: dto.name,
        planDate: parseDate(dto.planDate),
        actualDate: parseDate(dto.actualDate),
        sort: dto.sort ?? 0,
      },
    });
  }

  async removeMilestone(projectId: string, id: string): Promise<void> {
    await this.assertOwnedRecord(this.prisma.projectMilestone, projectId, id, '里程碑');
    await this.prisma.projectMilestone.delete({ where: { id } });
  }

  // ============ 风险 ============

  async listRisks(projectId: string): Promise<RiskItem[]> {
    await this.assertProject(projectId);
    const rows = await this.prisma.projectRisk.findMany({
      where: { projectId },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      level: r.level as RiskItem['level'],
      mitigation: r.mitigation,
      status: r.status as RiskStatus,
      ownerId: r.ownerId,
      ownerName: r.owner?.displayName ?? null,
      createdAt: iso(r.createdAt)!,
    }));
  }

  async createRisk(projectId: string, dto: SaveRiskDto): Promise<{ id: string }> {
    await this.assertProject(projectId);
    await this.assertOwner(dto.ownerId);
    return this.prisma.projectRisk.create({
      data: {
        projectId,
        title: dto.title,
        level: dto.level,
        mitigation: dto.mitigation ?? null,
        status: dto.status ?? RiskStatus.OPEN,
        ownerId: dto.ownerId || null,
      },
      select: { id: true },
    });
  }

  async updateRisk(projectId: string, id: string, dto: SaveRiskDto): Promise<void> {
    await this.assertOwnedRecord(this.prisma.projectRisk, projectId, id, '风险');
    await this.assertOwner(dto.ownerId);
    await this.prisma.projectRisk.update({
      where: { id },
      data: {
        title: dto.title,
        level: dto.level,
        mitigation: dto.mitigation ?? null,
        status: dto.status ?? undefined,
        ownerId: dto.ownerId || null,
      },
    });
  }

  async removeRisk(projectId: string, id: string): Promise<void> {
    await this.assertOwnedRecord(this.prisma.projectRisk, projectId, id, '风险');
    await this.prisma.projectRisk.delete({ where: { id } });
  }

  // ============ 问题 ============

  async listIssues(projectId: string): Promise<IssueItem[]> {
    await this.assertProject(projectId);
    const rows = await this.prisma.projectIssue.findMany({
      where: { projectId },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      title: i.title,
      description: i.description,
      status: i.status as IssueStatus,
      priority: i.priority as IssuePriority,
      ownerId: i.ownerId,
      ownerName: i.owner?.displayName ?? null,
      dueDate: iso(i.dueDate),
      resolvedAt: iso(i.resolvedAt),
      createdAt: iso(i.createdAt)!,
    }));
  }

  async createIssue(projectId: string, dto: SaveIssueDto): Promise<{ id: string }> {
    await this.assertProject(projectId);
    await this.assertOwner(dto.ownerId);
    return this.prisma.projectIssue.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status ?? IssueStatus.OPEN,
        priority: dto.priority ?? IssuePriority.MEDIUM,
        ownerId: dto.ownerId || null,
        dueDate: parseDate(dto.dueDate),
      },
      select: { id: true },
    });
  }

  async updateIssue(projectId: string, id: string, dto: SaveIssueDto): Promise<void> {
    const existing = await this.assertOwnedRecord(this.prisma.projectIssue, projectId, id, '问题');
    await this.assertOwner(dto.ownerId);

    const nextStatus = dto.status ?? (existing.status as IssueStatus);
    // 首次进入「已解决/已关闭」时补记解决时间
    const becomesResolved =
      (nextStatus === IssueStatus.RESOLVED || nextStatus === IssueStatus.CLOSED) &&
      !existing.resolvedAt;

    await this.prisma.projectIssue.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description ?? null,
        status: nextStatus,
        priority: dto.priority ?? undefined,
        ownerId: dto.ownerId || null,
        dueDate: parseDate(dto.dueDate),
        resolvedAt: becomesResolved ? new Date() : undefined,
      },
    });
  }

  async removeIssue(projectId: string, id: string): Promise<void> {
    await this.assertOwnedRecord(this.prisma.projectIssue, projectId, id, '问题');
    await this.prisma.projectIssue.delete({ where: { id } });
  }

  // ============ 成员 ============

  async listMembers(projectId: string): Promise<ProjectMemberItem[]> {
    await this.assertProject(projectId);
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((pm) => ({
      userId: pm.userId,
      displayName: pm.user.displayName,
      roleInProject: pm.roleInProject,
    }));
  }

  /** 新增或更新成员的项目内角色（upsert，避免重复加入报错）。 */
  async addMember(projectId: string, dto: SaveMemberDto): Promise<void> {
    await this.assertProject(projectId);
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '指定的成员不存在', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: { projectId, userId: dto.userId, roleInProject: dto.roleInProject ?? null },
      update: { roleInProject: dto.roleInProject ?? null },
    });
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.assertProject(projectId);
    await this.prisma.projectMember
      .delete({ where: { projectId_userId: { projectId, userId } } })
      .catch(() => {
        throw new AppException(ErrorCode.NOT_FOUND, '成员不存在', HttpStatus.NOT_FOUND);
      });
  }

  // ---- 私有辅助 ----

  private async assertProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
  }

  private async assertOwner(ownerId?: string | null): Promise<void> {
    if (!ownerId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '指定的负责人不存在', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 校验子记录存在且确实属于该项目（防越权改别的项目的数据），返回该记录。
   * delegate 用 any：四个子表的 findFirst 签名一致，但联合类型会让 Prisma 的
   * where 类型推断退化为 never，这里显式放开。
   */
  private async assertOwnedRecord(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delegate: { findFirst: (args: any) => Promise<any> },
    projectId: string,
    id: string,
    label: string,
  ): Promise<{ status?: string; resolvedAt?: Date | null }> {
    const row = await delegate.findFirst({ where: { id, projectId } });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, `${label}不存在`, HttpStatus.NOT_FOUND);
    return row;
  }
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function parseDate(s?: string | null): Date | null {
  return s ? new Date(s) : null;
}
