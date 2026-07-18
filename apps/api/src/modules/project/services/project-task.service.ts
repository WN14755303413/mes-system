import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, TaskStatus, type TaskItem } from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { SaveTaskDto } from '../dto/project.dto';

interface TaskRow {
  id: string;
  projectId: string;
  parentId: string | null;
  path: string;
  name: string;
  ownerId: string | null;
  owner: { displayName: string } | null;
  planStartAt: Date | null;
  planEndAt: Date | null;
  progress: number;
  status: string;
  sort: number;
}

/**
 * WBS 任务树。自引用树，是甘特图的数据源。
 * path 存祖先链（/rootId/parentId/），与 Dept 同构：移动子树时前缀替换，删除即级联。
 */
@Injectable()
export class ProjectTaskService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回某项目的全部任务（扁平数组，按 path+sort 排序，前端建树或直接喂甘特图）。 */
  async list(projectId: string): Promise<TaskItem[]> {
    await this.assertProjectExists(projectId);
    const rows = await this.prisma.projectTask.findMany({
      where: { projectId },
      include: { owner: { select: { displayName: true } } },
      orderBy: [{ path: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTaskItem);
  }

  async create(projectId: string, dto: SaveTaskDto): Promise<{ id: string }> {
    await this.assertProjectExists(projectId);
    await this.assertOwnerExists(dto.ownerId);
    this.assertDateOrder(dto.planStartAt, dto.planEndAt);

    const path = await this.resolvePath(projectId, dto.parentId ?? null);

    const task = await this.prisma.projectTask.create({
      data: {
        projectId,
        parentId: dto.parentId || null,
        path,
        name: dto.name,
        ownerId: dto.ownerId || null,
        planStartAt: parseDate(dto.planStartAt),
        planEndAt: parseDate(dto.planEndAt),
        progress: dto.progress ?? 0,
        status: dto.status ?? TaskStatus.DRAFT,
        sort: dto.sort ?? 0,
      },
      select: { id: true },
    });
    return task;
  }

  async update(projectId: string, id: string, dto: SaveTaskDto): Promise<void> {
    const task = await this.getTaskOrThrow(projectId, id);
    await this.assertOwnerExists(dto.ownerId);
    this.assertDateOrder(dto.planStartAt, dto.planEndAt);

    const nextParentId = dto.parentId ?? null;
    if (nextParentId === id) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '任务不能以自己为父任务', HttpStatus.BAD_REQUEST);
    }

    let path = task.path;
    if (nextParentId !== task.parentId) {
      if (nextParentId) {
        const parent = await this.getTaskOrThrow(projectId, nextParentId);
        // 禁止移动到自己的后代下，否则成环
        if (parent.path.startsWith(`${task.path}${task.id}/`)) {
          throw new AppException(
            ErrorCode.VALIDATION_FAILED,
            '不能移动到自己的子任务下',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      path = await this.resolvePath(projectId, nextParentId);
      await this.recomputeSubtreePaths(task, path);
    }

    await this.prisma.projectTask.update({
      where: { id },
      data: {
        parentId: nextParentId,
        path,
        name: dto.name,
        ownerId: dto.ownerId || null,
        planStartAt: parseDate(dto.planStartAt),
        planEndAt: parseDate(dto.planEndAt),
        progress: dto.progress ?? task.progress,
        status: dto.status ?? (task.status as TaskStatus),
        sort: dto.sort ?? task.sort,
      },
    });
  }

  /** 删除任务及其整棵子树（DB 外键 onDelete: Cascade 会连带删除后代）。 */
  async remove(projectId: string, id: string): Promise<void> {
    await this.getTaskOrThrow(projectId, id);
    await this.prisma.projectTask.delete({ where: { id } });
  }

  // ---- 私有辅助 ----

  private async resolvePath(projectId: string, parentId: string | null): Promise<string> {
    if (!parentId) return '/';
    const parent = await this.getTaskOrThrow(projectId, parentId);
    return `${parent.path}${parent.id}/`;
  }

  private async recomputeSubtreePaths(task: TaskRow, newParentPath: string): Promise<void> {
    const oldPrefix = `${task.path}${task.id}/`;
    const newPrefix = `${newParentPath}${task.id}/`;
    if (oldPrefix === newPrefix) return;

    const descendants = await this.prisma.projectTask.findMany({
      where: { path: { startsWith: oldPrefix } },
      select: { id: true, path: true },
    });
    if (descendants.length === 0) return;

    await this.prisma.$transaction(
      descendants.map((d) =>
        this.prisma.projectTask.update({
          where: { id: d.id },
          data: { path: newPrefix + d.path.slice(oldPrefix.length) },
        }),
      ),
    );
  }

  private async getTaskOrThrow(projectId: string, id: string): Promise<TaskRow> {
    const task = await this.prisma.projectTask.findFirst({
      where: { id, projectId },
      include: { owner: { select: { displayName: true } } },
    });
    if (!task) throw new AppException(ErrorCode.NOT_FOUND, '任务不存在', HttpStatus.NOT_FOUND);
    return task;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
  }

  private async assertOwnerExists(ownerId?: string | null): Promise<void> {
    if (!ownerId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '指定的负责人不存在', HttpStatus.BAD_REQUEST);
    }
  }

  private assertDateOrder(start?: string | null, end?: string | null): void {
    if (start && end && new Date(start) > new Date(end)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '任务开始日期不能晚于结束日期',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

function toTaskItem(row: TaskRow): TaskItem {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    ownerId: row.ownerId,
    ownerName: row.owner?.displayName ?? null,
    planStartAt: iso(row.planStartAt),
    planEndAt: iso(row.planEndAt),
    progress: row.progress,
    status: row.status as TaskStatus,
    sort: row.sort,
  };
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function parseDate(s?: string | null): Date | null {
  return s ? new Date(s) : null;
}
