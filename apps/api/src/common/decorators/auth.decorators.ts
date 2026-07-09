import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Permission } from '@mes/shared';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

export const IS_PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ALLOW_PASSWORD_CHANGE_PENDING = 'auth:allow-pwd-pending';

/** 跳过认证。全局 Guard 默认拦截一切，公开接口必须显式标注。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 要求持有全部列出的权限点。 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * 允许 mustChangePassword=true 的用户访问。
 * 只应加在「改密」和「登出」这类必须让人走出死锁的接口上。
 */
export const AllowPasswordChangePending = () => SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true);

/** 取出 JwtAuthGuard 注入的当前用户。 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req.user;
});

/**
 * 客户端真实 IP 与 UA。
 *
 * 生产环境走 nginx 反代，Express 需开启 trust proxy，否则 req.ip 恒为 127.0.0.1，
 * 基于 IP 的限流会把所有人算作同一个来源。见 main.ts。
 */
export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
    userAgent: req.headers['user-agent'],
  };
});
