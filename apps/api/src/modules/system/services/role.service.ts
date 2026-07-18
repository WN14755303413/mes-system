import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  PERMISSION_META,
  type Permission,
  type PermissionItem,
  type RoleDetail,
  type RoleListItem,
  ALL_PERMISSIONS,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CreateRoleDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
} from '../dto/system.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全部权限点，供前端权限树按 module 分组。直接读共享包的元数据，与后端 seed 同源。 */
  listPermissions(): PermissionItem[] {
    return ALL_PERMISSIONS.map((code) => ({
      code,
      name: PERMISSION_META[code].name,
      module: PERMISSION_META[code].module,
    }));
  }

  async list(): Promise<RoleListItem[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ builtin: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { users: true, permissions: true } },
      },
    });
    return roles.map((r) => this.toListItem(r));
  }

  async detail(id: string): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, permissions: true } },
        permissions: { include: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new AppException(ErrorCode.NOT_FOUND, '角色不存在', HttpStatus.NOT_FOUND);

    return {
      ...this.toListItem(role),
      permissions: role.permissions.map((rp) => rp.permission.code as Permission),
    };
  }

  async create(dto: CreateRoleDto): Promise<{ id: string }> {
    const existing = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '角色编码已存在', HttpStatus.CONFLICT);
    }

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        remark: dto.remark || null,
        dataScope: dto.dataScope,
        builtin: false,
      },
      select: { id: true },
    });
    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleListItem> {
    await this.getRoleOrThrow(id);
    await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        remark: dto.remark === undefined ? undefined : dto.remark || null,
        dataScope: dto.dataScope,
        enabled: dto.enabled,
      },
    });
    const updated = await this.prisma.role.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { users: true, permissions: true } } },
    });
    return this.toListItem(updated);
  }

  /** 整体替换角色的权限集合。删旧建新放在一个事务里，避免中途失败留下半套权限。 */
  async setPermissions(id: string, dto: UpdateRolePermissionsDto): Promise<void> {
    await this.getRoleOrThrow(id);

    const permRows = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissions } },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permRows.map((p) => ({ roleId: id, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);
  }

  async remove(id: string): Promise<void> {
    const role = await this.getRoleOrThrow(id);
    if (role.builtin) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '内置角色不可删除', HttpStatus.BAD_REQUEST);
    }
    const userCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `仍有 ${userCount} 个用户属于该角色，请先改派`,
        HttpStatus.BAD_REQUEST,
      );
    }
    // RolePermission 有 onDelete: Cascade，随角色一并删除
    await this.prisma.role.delete({ where: { id } });
  }

  private async getRoleOrThrow(id: string): Promise<{ id: string; builtin: boolean }> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, builtin: true },
    });
    if (!role) throw new AppException(ErrorCode.NOT_FOUND, '角色不存在', HttpStatus.NOT_FOUND);
    return role;
  }

  private toListItem(r: {
    id: string;
    code: string;
    name: string;
    remark: string | null;
    dataScope: string;
    builtin: boolean;
    enabled: boolean;
    _count: { users: number; permissions: number };
  }): RoleListItem {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      remark: r.remark,
      dataScope: r.dataScope as RoleListItem['dataScope'],
      builtin: r.builtin,
      enabled: r.enabled,
      userCount: r._count.users,
      permissionCount: r._count.permissions,
    };
  }
}
