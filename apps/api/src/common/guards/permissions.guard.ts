import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Permission } from '@mes/shared';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * 功能权限校验。必须排在 JwtAuthGuard 之后——它依赖后者注入的 req.user。
 *
 * 这里是访问控制真正落地的地方。前端隐藏按钮只是体验优化，
 * 用户手工构造的请求同样要过这一关。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAny = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length && !requiredAny?.length) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;

    // 没有 user 说明该路由是 @Public 的却又标了权限要求，属于配置错误
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, '未登录', HttpStatus.UNAUTHORIZED);
    }

    const granted = new Set(user.permissions);
    if (required?.length && !required.every((p) => granted.has(p))) {
      throw new AppException(ErrorCode.FORBIDDEN, '没有操作权限', HttpStatus.FORBIDDEN);
    }
    if (requiredAny?.length && !requiredAny.some((p) => granted.has(p))) {
      throw new AppException(ErrorCode.FORBIDDEN, '没有操作权限', HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
