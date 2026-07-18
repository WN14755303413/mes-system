import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AuditLogItem,
  DeptNode,
  IntegrationLogItem,
  PageResult,
  PermissionItem,
  RoleDetail,
  RoleListItem,
  SysUserListItem,
  TempPasswordResponse,
} from '@mes/shared';
import type { CurrentUser as CurrentUserDto } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  AssignRolesDto,
  AuditLogQueryDto,
  CreateRoleDto,
  CreateUserDto,
  IntegrationLogQueryDto,
  SaveDeptDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserListQueryDto,
} from './dto/system.dto';
import { DeptService } from './services/dept.service';
import { LogService } from './services/log.service';
import { RoleService } from './services/role.service';
import { UserService } from './services/user.service';

@Controller('system/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermission('sys:user:read')
  list(@Query() query: UserListQueryDto): Promise<PageResult<SysUserListItem>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermission('sys:user:read')
  detail(@Param('id') id: string): Promise<SysUserListItem> {
    return this.users.detail(id);
  }

  @Post()
  @RequirePermission('sys:user:write')
  @Audit('user.create', { targetType: 'user', targetIdFrom: 'result' })
  create(@Body() dto: CreateUserDto): Promise<TempPasswordResponse> {
    return this.users.create(dto).then((r) => ({ username: r.username, tempPassword: r.tempPassword }));
  }

  @Patch(':id')
  @RequirePermission('sys:user:write')
  @Audit('user.update', { targetType: 'user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<SysUserListItem> {
    return this.users.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('sys:user:write')
  @Audit('user.set-status', { targetType: 'user' })
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() operator: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.users.setStatus(id, dto, operator.id);
    return { ok: true };
  }

  @Post(':id/reset-password')
  @RequirePermission('sys:user:write')
  @Audit('user.reset-password', { targetType: 'user' })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string): Promise<TempPasswordResponse> {
    return this.users.resetPassword(id);
  }

  @Patch(':id/roles')
  @RequirePermission('sys:user:write')
  @Audit('user.assign-roles', { targetType: 'user' })
  @HttpCode(HttpStatus.OK)
  async assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() operator: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.users.assignRoles(id, dto, operator.id);
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('sys:user:write')
  @Audit('user.delete', { targetType: 'user' })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser() operator: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.users.remove(id, operator.id);
    return { ok: true };
  }
}

@Controller('system')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  /** 全部权限点，供前端权限树。只要能读角色就能读权限点。 */
  @Get('permissions')
  @RequirePermission('sys:role:read')
  listPermissions(): PermissionItem[] {
    return this.roles.listPermissions();
  }

  @Get('roles')
  @RequirePermission('sys:role:read')
  list(): Promise<RoleListItem[]> {
    return this.roles.list();
  }

  @Get('roles/:id')
  @RequirePermission('sys:role:read')
  detail(@Param('id') id: string): Promise<RoleDetail> {
    return this.roles.detail(id);
  }

  @Post('roles')
  @RequirePermission('sys:role:write')
  @Audit('role.create', { targetType: 'role', targetIdFrom: 'result' })
  create(@Body() dto: CreateRoleDto): Promise<{ id: string }> {
    return this.roles.create(dto);
  }

  @Patch('roles/:id')
  @RequirePermission('sys:role:write')
  @Audit('role.update', { targetType: 'role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto): Promise<RoleListItem> {
    return this.roles.update(id, dto);
  }

  @Patch('roles/:id/permissions')
  @RequirePermission('sys:role:write')
  @Audit('role.set-permissions', { targetType: 'role' })
  @HttpCode(HttpStatus.OK)
  async setPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<{ ok: true }> {
    await this.roles.setPermissions(id, dto);
    return { ok: true };
  }

  @Delete('roles/:id')
  @RequirePermission('sys:role:write')
  @Audit('role.delete', { targetType: 'role' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.roles.remove(id);
    return { ok: true };
  }
}

@Controller('system/depts')
export class DeptController {
  constructor(private readonly depts: DeptService) {}

  @Get()
  @RequirePermission('sys:dept:read')
  tree(): Promise<DeptNode[]> {
    return this.depts.tree();
  }

  @Post()
  @RequirePermission('sys:dept:write')
  @Audit('dept.create', { targetType: 'dept', targetIdFrom: 'result' })
  create(@Body() dto: SaveDeptDto): Promise<{ id: string }> {
    return this.depts.create(dto);
  }

  @Patch(':id')
  @RequirePermission('sys:dept:write')
  @Audit('dept.update', { targetType: 'dept' })
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: SaveDeptDto): Promise<{ ok: true }> {
    await this.depts.update(id, dto);
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('sys:dept:write')
  @Audit('dept.delete', { targetType: 'dept' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.depts.remove(id);
    return { ok: true };
  }
}

@Controller('system')
export class LogController {
  constructor(private readonly logs: LogService) {}

  @Get('audit-logs')
  @RequirePermission('sys:audit:read')
  auditLogs(@Query() query: AuditLogQueryDto): Promise<PageResult<AuditLogItem>> {
    return this.logs.auditLogs(query);
  }

  @Get('integration-logs')
  @RequirePermission('sys:integration:read')
  integrationLogs(@Query() query: IntegrationLogQueryDto): Promise<PageResult<IntegrationLogItem>> {
    return this.logs.integrationLogs(query);
  }
}
