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
