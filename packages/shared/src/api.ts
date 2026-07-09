import type { DataScope, UserStatus } from './enums';
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
