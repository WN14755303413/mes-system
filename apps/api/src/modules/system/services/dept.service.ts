import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type DeptNode } from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { SaveDeptDto } from '../dto/system.dto';

interface DeptRow {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  path: string;
  sort: number;
  enabled: boolean;
}

@Injectable()
export class DeptService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回整棵部门树（含每个部门的直接用户数）。 */
  async tree(): Promise<DeptNode[]> {
    const [rows, deptUsers] = await this.prisma.$transaction([
      this.prisma.dept.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] }),
      // 只取 deptId 在 JS 里计数：groupBy 在 $transaction 里的类型推断很别扭，
      // 而 200 人规模下取一列 id 计数的成本可以忽略
      this.prisma.user.findMany({
        where: { deletedAt: null, deptId: { not: null } },
        select: { deptId: true },
      }),
    ]);

    const userCount = new Map<string, number>();
    for (const u of deptUsers) {
      if (u.deptId) userCount.set(u.deptId, (userCount.get(u.deptId) ?? 0) + 1);
    }

    return this.buildTree(rows, userCount);
  }

  async create(dto: SaveDeptDto): Promise<{ id: string }> {
    await this.assertCodeAvailable(dto.code, null);
    const path = await this.resolvePath(dto.parentId ?? null);

    const dept = await this.prisma.dept.create({
      data: {
        name: dto.name,
        code: dto.code,
        parentId: dto.parentId || null,
        path,
        sort: dto.sort ?? 0,
        enabled: dto.enabled ?? true,
      },
      select: { id: true },
    });
    return dept;
  }

  async update(id: string, dto: SaveDeptDto): Promise<void> {
    const dept = await this.getDeptOrThrow(id);
    await this.assertCodeAvailable(dto.code, id);

    const nextParentId = dto.parentId ?? null;
    if (nextParentId === id) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '部门不能以自己为上级', HttpStatus.BAD_REQUEST);
    }

    // 变更上级会移动整棵子树，需级联重算 path。为避免环，禁止移动到自己的后代下。
    let path = dept.path;
    if (nextParentId !== dept.parentId) {
      if (nextParentId) {
        const parent = await this.getDeptOrThrow(nextParentId);
        if (parent.path.startsWith(`${dept.path}${dept.id}/`) || parent.id === dept.id) {
          throw new AppException(
            ErrorCode.VALIDATION_FAILED,
            '不能移动到自己的下级部门',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      path = await this.resolvePath(nextParentId);
      await this.recomputeSubtreePaths(dept, path);
    }

    await this.prisma.dept.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        parentId: nextParentId,
        path,
        sort: dto.sort ?? dept.sort,
        enabled: dto.enabled ?? dept.enabled,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getDeptOrThrow(id);

    const childCount = await this.prisma.dept.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '该部门下仍有子部门，请先处理子部门',
        HttpStatus.BAD_REQUEST,
      );
    }
    const userCount = await this.prisma.user.count({ where: { deptId: id, deletedAt: null } });
    if (userCount > 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `该部门下仍有 ${userCount} 名成员，请先改派`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.dept.delete({ where: { id } });
  }

  // ---- 私有辅助 ----

  private buildTree(rows: DeptRow[], userCount: Map<string, number>): DeptNode[] {
    const nodes = new Map<string, DeptNode>();
    for (const r of rows) {
      nodes.set(r.id, {
        id: r.id,
        name: r.name,
        code: r.code,
        parentId: r.parentId,
        sort: r.sort,
        enabled: r.enabled,
        userCount: userCount.get(r.id) ?? 0,
        children: [],
      });
    }
    const roots: DeptNode[] = [];
    for (const r of rows) {
      const node = nodes.get(r.id)!;
      const parent = r.parentId ? nodes.get(r.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** 父部门的 path 拼上父 id，构成子部门的 path 前缀（如 /rootId/parentId/）。根部门为 /。 */
  private async resolvePath(parentId: string | null): Promise<string> {
    if (!parentId) return '/';
    const parent = await this.getDeptOrThrow(parentId);
    return `${parent.path}${parent.id}/`;
  }

  /** 移动子树时，把所有后代的 path 前缀从旧值替换为新值。 */
  private async recomputeSubtreePaths(dept: DeptRow, newParentPath: string): Promise<void> {
    const oldPrefix = `${dept.path}${dept.id}/`;
    const newPrefix = `${newParentPath}${dept.id}/`;
    if (oldPrefix === newPrefix) return;

    const descendants = await this.prisma.dept.findMany({
      where: { path: { startsWith: oldPrefix } },
      select: { id: true, path: true },
    });
    await this.prisma.$transaction(
      descendants.map((d) =>
        this.prisma.dept.update({
          where: { id: d.id },
          data: { path: newPrefix + d.path.slice(oldPrefix.length) },
        }),
      ),
    );
  }

  private async assertCodeAvailable(code: string, exceptId: string | null): Promise<void> {
    const existing = await this.prisma.dept.findUnique({ where: { code }, select: { id: true } });
    if (existing && existing.id !== exceptId) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '部门编码已存在', HttpStatus.CONFLICT);
    }
  }

  private async getDeptOrThrow(id: string): Promise<DeptRow> {
    const dept = await this.prisma.dept.findUnique({ where: { id } });
    if (!dept) throw new AppException(ErrorCode.NOT_FOUND, '部门不存在', HttpStatus.NOT_FOUND);
    return dept;
  }
}
