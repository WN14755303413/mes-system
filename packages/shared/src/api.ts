import type { DataScope, UserStatus } from './enums';
import type {
  IssuePriority,
  IssueStatus,
  RiskLevel,
  RiskStatus,
  TaskStatus,
} from './enums';
import type { Permission } from './permissions';

/** 统一响应包裹。后端 TransformInterceptor 自动套上。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/** 统一错误码。前端据此决定跳转/提示，不依赖 message 文案。 */
export const ErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  CAPTCHA_INVALID: 'CAPTCHA_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  CSRF_INVALID: 'CSRF_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface PageQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 登录请求。注意：密码明文经 HTTPS 传输，前端不做预哈希（预哈希只会让哈希值本身变成密码）。 */
export interface LoginRequest {
  username: string;
  password: string;
  captchaId?: string;
  captchaCode?: string;
}

/**
 * 登录响应。
 * 刻意不包含任何 token —— access/refresh token 均通过 httpOnly Cookie 下发，
 * JavaScript 读不到，因此 F12 也无法从中窃取凭据。
 */
export interface LoginResponse {
  user: CurrentUser;
  mustChangePassword: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  deptId: string | null;
  deptName: string | null;
  roles: string[];
  permissions: Permission[];
  dataScope: DataScope;
}

/**
 * 登录失败时随错误一并返回的提示信息。
 *
 * 这里只暴露「本次登录尝试」维度的状态，不暴露账号是否存在——
 * captchaRequired 由 IP+账号的失败计数决定，对不存在的账号同样会触发，
 * 因此不能用它来枚举用户名。
 */
export interface LoginFailureDetail {
  captchaRequired: boolean;
  /** 账号锁定的剩余秒数；未锁定时为 0 */
  lockedForSeconds: number;
}

export interface CaptchaResponse {
  captchaId: string;
  /** SVG 源码，前端直接内联渲染，避免再发一次图片请求 */
  svg: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * 忘记密码。本系统没有邮件服务，重置走「提交申请 → 管理员核实身份 → 后台重置」，
 * 因此这里提交的是可供人工核对的身份信息，而非收件邮箱。
 */
export interface PasswordResetRequestPayload {
  username: string;
  displayName: string;
  phone: string;
  reason?: string;
  captchaId: string;
  captchaCode: string;
}

/** 密码强度下限，前后端共用一套规则，避免前端放行、后端拒绝的割裂体验。 */
export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
}

// ============================================================
//  M3 系统管理：用户 / 角色 / 部门 / 审计 / 接口日志
//
//  这些类型是前后端的契约：后端 controller 的返回值与 DTO、前端 api/system.ts
//  的 hooks 都引用它们，避免各写一份导致字段漂移。
// ============================================================

// ---- 用户 ----

/** 用户列表行。不含 passwordHash 等敏感字段——它们永远不出后端。 */
export interface SysUserListItem {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  deptId: string | null;
  deptName: string | null;
  roles: { code: string; name: string }[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SysUserListQuery extends PageQuery {
  deptId?: string;
  status?: UserStatus;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  deptId?: string;
  roleIds: string[];
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  deptId?: string | null;
}

/**
 * 新建用户 / 重置密码后一次性返回的临时密码。
 * 系统生成随机强密码，明文只在这一次响应里出现，之后无法再取回。
 * 用户首次登录被强制改密（mustChangePassword）。
 */
export interface TempPasswordResponse {
  username: string;
  tempPassword: string;
}

export interface AssignRolesRequest {
  roleIds: string[];
}

export interface UpdateUserStatusRequest {
  /** 仅允许在 ACTIVE / DISABLED 间切换；LOCKED 由登录失败自动产生，不在此设置。 */
  status: Extract<UserStatus, 'ACTIVE' | 'DISABLED'>;
}

// ---- 角色与权限 ----

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  remark: string | null;
  dataScope: DataScope;
  builtin: boolean;
  enabled: boolean;
  userCount: number;
  permissionCount: number;
}

export interface RoleDetail extends RoleListItem {
  permissions: Permission[];
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  remark?: string;
  dataScope: DataScope;
}

export interface UpdateRoleRequest {
  name?: string;
  remark?: string | null;
  dataScope?: DataScope;
  enabled?: boolean;
}

export interface UpdateRolePermissionsRequest {
  permissions: Permission[];
}

/** 权限点，供前端权限树按 module 分组渲染。 */
export interface PermissionItem {
  code: Permission;
  name: string;
  module: string;
}

// ---- 部门 ----

/** 部门树节点。后端返回扁平数组，前端按 parentId 建树；或后端直接返回嵌套 children。 */
export interface DeptNode {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  sort: number;
  enabled: boolean;
  userCount: number;
  children: DeptNode[];
}

export interface SaveDeptRequest {
  name: string;
  code: string;
  parentId?: string | null;
  sort?: number;
  enabled?: boolean;
}

// ---- 审计日志 ----

export interface AuditLogItem {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  changes: unknown;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  errorMsg: string | null;
  createdAt: string;
}

export interface AuditLogQuery extends PageQuery {
  username?: string;
  action?: string;
  from?: string;
  to?: string;
}

// ---- 接口日志（M3 只读展示，重试补偿留 M11） ----

export interface IntegrationLogItem {
  id: string;
  interfaceName: string;
  sourceSystem: string;
  targetSystem: string;
  success: boolean;
  errorMsg: string | null;
  retryCount: number;
  needsAttention: boolean;
  resolvedAt: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

export interface IntegrationLogQuery extends PageQuery {
  interfaceName?: string;
  success?: boolean;
  needsAttention?: boolean;
}

// ============================================================
//  M4 项目管理：台账 / 里程碑 / WBS / 风险 / 问题 / 成员
//
//  前后端契约。后端 controller 返回值、DTO 与前端 api/project.ts 共用，
//  避免字段漂移。日期统一用 ISO 字符串在网络上传输。
// ============================================================

/** 项目台账列表行。 */
export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  contractNo: string | null;
  projectType: string | null;
  status: string; // RecordStatus
  riskLevel: RiskLevel;
  equipmentCount: number;
  managerId: string | null;
  managerName: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  actualEndAt: string | null;
  /** 未关闭风险数与未关闭问题数，列表页红点提示用。 */
  openRiskCount: number;
  openIssueCount: number;
  createdAt: string;
}

export interface ProjectListQuery extends PageQuery {
  status?: string;
  riskLevel?: RiskLevel;
  managerId?: string;
}

/** 项目详情：列表行 + 描述 + 里程碑 + 成员。 */
export interface ProjectDetail extends ProjectListItem {
  description: string | null;
  milestones: MilestoneItem[];
  members: ProjectMemberItem[];
}

export interface SaveProjectRequest {
  name: string;
  customerName?: string | null;
  contractNo?: string | null;
  projectType?: string | null;
  equipmentCount?: number;
  managerId?: string | null;
  planStartAt?: string | null;
  planEndAt?: string | null;
  riskLevel?: RiskLevel;
  description?: string | null;
}

/** 变更项目状态（走通用状态机，后端校验合法跃迁）。 */
export interface ChangeProjectStatusRequest {
  status: string; // 目标 RecordStatus
}

// ---- 里程碑 ----

export interface MilestoneItem {
  id: string;
  projectId: string;
  name: string;
  planDate: string | null;
  actualDate: string | null;
  sort: number;
}

export interface SaveMilestoneRequest {
  name: string;
  planDate?: string | null;
  actualDate?: string | null;
  sort?: number;
}

// ---- WBS 任务（甘特图数据源）----

/** WBS 任务节点。后端返回扁平数组（含 parentId），前端按需建树或直接喂甘特图。 */
export interface TaskItem {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  progress: number;
  status: TaskStatus;
  sort: number;
}

export interface SaveTaskRequest {
  name: string;
  parentId?: string | null;
  ownerId?: string | null;
  planStartAt?: string | null;
  planEndAt?: string | null;
  progress?: number;
  status?: TaskStatus;
  sort?: number;
}

// ---- 风险 ----

export interface RiskItem {
  id: string;
  projectId: string;
  title: string;
  level: RiskLevel;
  mitigation: string | null;
  status: RiskStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

export interface SaveRiskRequest {
  title: string;
  level: RiskLevel;
  mitigation?: string | null;
  status?: RiskStatus;
  ownerId?: string | null;
}

// ---- 问题 ----

export interface IssueItem {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SaveIssueRequest {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  ownerId?: string | null;
  dueDate?: string | null;
}

// ---- 成员 ----

export interface ProjectMemberItem {
  userId: string;
  displayName: string;
  roleInProject: string | null;
}

export interface SaveMemberRequest {
  userId: string;
  roleInProject?: string | null;
}

/**
 * 评估密码强度。前端用它渲染强度条，后端用它做准入校验（score < 2 拒绝）。
 * 注意：这只挡住弱密码，真正的防护来自 Argon2id 哈希与登录限流。
 */
export function evaluatePassword(pwd: string): PasswordStrength {
  const issues: string[] = [];
  if (pwd.length < PASSWORD_MIN_LENGTH) issues.push(`长度至少 ${PASSWORD_MIN_LENGTH} 位`);
  if (!/[a-z]/.test(pwd)) issues.push('需包含小写字母');
  if (!/[A-Z]/.test(pwd)) issues.push('需包含大写字母');
  if (!/\d/.test(pwd)) issues.push('需包含数字');
  if (!/[^\w\s]/.test(pwd)) issues.push('需包含符号');

  const passed = 5 - issues.length;
  // 长度是强度的主要来源，够长时额外加一档
  const bonus = pwd.length >= 16 ? 1 : 0;
  const score = Math.max(0, Math.min(4, passed - 1 + bonus)) as PasswordStrength['score'];

  return {
    score,
    label: ['极弱', '弱', '一般', '强', '很强'][score],
    issues,
  };
}
