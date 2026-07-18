import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ALL_PERMISSIONS, DataScope, type Permission, UserStatus } from '@mes/shared';

/** 分页查询基类。page/pageSize 带默认值与上限，keyword 用于模糊搜索。 */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

const USER_STATUSES = Object.values(UserStatus);
const DATA_SCOPES = Object.values(DataScope);

// ---- 用户 ----

export class UserListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  deptId?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;
}

export class CreateUserDto {
  @IsString()
  @Length(3, 64, { message: '账号长度应为 3-64 位' })
  @Matches(/^[\w.@-]+$/, { message: '账号含有非法字符' })
  username!: string;

  @IsString()
  @Length(2, 32, { message: '姓名长度应为 2-32 位' })
  displayName!: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请填写有效的手机号' })
  phone?: string;

  @IsOptional()
  @IsString()
  deptId?: string;

  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 32, { message: '姓名长度应为 2-32 位' })
  displayName?: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请填写有效的手机号' })
  phone?: string | null;

  @IsOptional()
  @IsString()
  deptId?: string | null;
}

export class UpdateUserStatusDto {
  // 只允许在启用/禁用间切换；LOCKED 是登录失败自动产生的，不由管理员手工设置
  @IsIn(['ACTIVE', 'DISABLED'], { message: '状态只能是启用或禁用' })
  status!: 'ACTIVE' | 'DISABLED';
}

export class AssignRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}

// ---- 角色 ----

export class CreateRoleDto {
  @IsString()
  @Length(2, 32, { message: '角色编码长度应为 2-32 位' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: '角色编码须为大写字母、数字与下划线，且以字母开头' })
  code!: string;

  @IsString()
  @Length(2, 32, { message: '角色名称长度应为 2-32 位' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsIn(DATA_SCOPES, { message: '数据范围不合法' })
  dataScope!: DataScope;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string | null;

  @IsOptional()
  @IsIn(DATA_SCOPES, { message: '数据范围不合法' })
  dataScope?: DataScope;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true, message: '包含未知权限点' })
  permissions!: Permission[];
}

// ---- 部门 ----

export class SaveDeptDto {
  @IsString()
  @Length(2, 32, { message: '部门名称长度应为 2-32 位' })
  name!: string;

  @IsString()
  @Length(2, 32, { message: '部门编码长度应为 2-32 位' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: '部门编码须为字母、数字、下划线或连字符' })
  code!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

// ---- 审计日志 ----

export class AuditLogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

// ---- 接口日志 ----

export class IntegrationLogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  interfaceName?: string;

  // 注意：不能用 @Type(() => Boolean)——Boolean("false") 为 true，会把「查失败」反转成「查成功」。
  // 显式按字符串映射：只有 "true" 才是 true。
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  success?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  needsAttention?: boolean;
}
