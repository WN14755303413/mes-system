import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type PageResult, type SysUserListItem } from '@mes/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PasswordService } from '../../auth/password.service';
import { TokenService } from '../../auth/token.service';
import type {
  AssignRolesDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserListQueryDto,
} from '../dto/system.dto';
import { generateTempPassword } from '../temp-password.util';

const SYS_ADMIN_ROLE_CODE = 'SYS_ADMIN';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async list(query: UserListQueryDto): Promise<PageResult<SysUserListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.deptId) where.deptId = query.deptId;
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword, mode: 'insensitive' } },
        { displayName: { contains: query.keyword, mode: 'insensitive' } },
        { email: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          dept: { select: { name: true } },
          roles: { include: { role: { select: { code: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((u) => this.toListItem(u)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string): Promise<SysUserListItem> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        dept: { select: { name: true } },
        roles: { include: { role: { select: { code: true, name: true } } } },
      },
    });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND);
    return this.toListItem(user);
  }

  /** 新建用户：系统生成临时密码，明文只在返回值里出现一次，用户首登强制改密。 */
  async create(dto: CreateUserDto): Promise<{ id: string; username: string; tempPassword: string }> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '账号已存在', HttpStatus.CONFLICT);
    }

    await this.assertRolesExist(dto.roleIds);
    if (dto.deptId) await this.assertDeptExists(dto.deptId);

    const tempPassword = generateTempPassword();
    const passwordHash = await this.passwords.hash(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        displayName: dto.displayName,
        email: dto.email || null,
        phone: dto.phone || null,
        deptId: dto.deptId || null,
        passwordHash,
        mustChangePassword: true,
        status: 'ACTIVE',
        roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true, username: true },
    });

    return { ...user, tempPassword };
  }

  async update(id: string, dto: UpdateUserDto): Promise<SysUserListItem> {
    await this.getActiveUserOrThrow(id);
    if (dto.deptId) await this.assertDeptExists(dto.deptId);

    await this.prisma.user.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        email: dto.email === undefined ? undefined : dto.email || null,
        phone: dto.phone === undefined ? undefined : dto.phone || null,
        deptId: dto.deptId === undefined ? undefined : dto.deptId || null,
      },
    });

    return this.detail(id);
  }

  /** 启用 / 禁用。禁用会踢掉该用户全部会话。禁止管理员禁用自己。 */
  async setStatus(id: string, dto: UpdateUserStatusDto, operatorId: string): Promise<void> {
    if (id === operatorId && dto.status === 'DISABLED') {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '不能禁用当前登录账号', HttpStatus.BAD_REQUEST);
    }
    await this.getActiveUserOrThrow(id);

    await this.prisma.user.update({ where: { id }, data: { status: dto.status } });

    if (dto.status === 'DISABLED') {
      await this.tokens.revokeAllForUser(id);
    }
  }

  /** 重置密码：生成新的临时密码，踢掉全部会话，强制改密。 */
  async resetPassword(id: string): Promise<{ username: string; tempPassword: string }> {
    const user = await this.getActiveUserOrThrow(id);

    const tempPassword = generateTempPassword();
    const passwordHash = await this.passwords.hash(tempPassword);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        // 改密时间戳前移，使此前签发的 access token 立即失效（见 JwtAuthGuard）
        passwordChangedAt: new Date(),
        // 顺带解除可能存在的登录锁定
        lockedUntil: null,
        failedLoginCount: 0,
      },
    });
    await this.tokens.revokeAllForUser(id);

    return { username: user.username, tempPassword };
  }

  /** 分配角色：整体替换该用户的角色集合。禁止移除自己最后的管理员角色，防自锁。 */
  async assignRoles(id: string, dto: AssignRolesDto, operatorId: string): Promise<void> {
    await this.getActiveUserOrThrow(id);
    await this.assertRolesExist(dto.roleIds);

    if (id === operatorId) {
      const keepsAdmin = await this.prisma.role.findFirst({
        where: { id: { in: dto.roleIds }, code: SYS_ADMIN_ROLE_CODE },
        select: { id: true },
      });
      if (!keepsAdmin) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          '不能移除当前登录账号的系统管理员角色',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      }),
    ]);

    // 角色变了，权限也就变了：踢掉会话，强制重新登录以拿到新的权限集
    await this.tokens.revokeAllForUser(id);
  }

  /** 软删除。禁止删除自己；置 deletedAt 并吊销会话。 */
  async remove(id: string, operatorId: string): Promise<void> {
    if (id === operatorId) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '不能删除当前登录账号', HttpStatus.BAD_REQUEST);
    }
    await this.getActiveUserOrThrow(id);

    await this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED', deletedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(id);
  }

  // ---- 私有辅助 ----

  private async getActiveUserOrThrow(id: string): Promise<{ id: string; username: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, username: true },
    });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND);
    return user;
  }

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    if (!roleIds.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '至少需要分配一个角色', HttpStatus.BAD_REQUEST);
    }
    const count = await this.prisma.role.count({ where: { id: { in: roleIds } } });
    if (count !== roleIds.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '包含不存在的角色', HttpStatus.BAD_REQUEST);
    }
  }

  private async assertDeptExists(deptId: string): Promise<void> {
    const dept = await this.prisma.dept.findUnique({ where: { id: deptId }, select: { id: true } });
    if (!dept) throw new AppException(ErrorCode.VALIDATION_FAILED, '部门不存在', HttpStatus.BAD_REQUEST);
  }

  private toListItem(u: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    status: string;
    deptId: string | null;
    dept: { name: string } | null;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    roles: { role: { code: string; name: string } }[];
  }): SysUserListItem {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      phone: u.phone,
      status: u.status as SysUserListItem['status'],
      deptId: u.deptId,
      deptName: u.dept?.name ?? null,
      roles: u.roles.map((r) => ({ code: r.role.code, name: r.role.name })),
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
