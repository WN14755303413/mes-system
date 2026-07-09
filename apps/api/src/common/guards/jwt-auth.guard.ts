import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type CurrentUser as CurrentUserDto, ErrorCode } from '@mes/shared';
import {
  ALLOW_PASSWORD_CHANGE_PENDING,
  IS_PUBLIC_KEY,
} from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE } from '../../modules/auth/auth.constants';
import { AuthService } from '../../modules/auth/auth.service';
import { TokenService } from '../../modules/auth/token.service';

export interface AuthenticatedRequest extends Request {
  user?: CurrentUserDto;
}

/**
 * 全局认证 Guard。默认拦截所有路由，@Public() 才放行。
 *
 * 「默认拒绝」而非「默认放行」：新增的接口如果忘了加权限注解，最坏结果是 401，
 * 而不是把一个未受保护的接口暴露到公网上。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;

    if (!token) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, '未登录', HttpStatus.UNAUTHORIZED);
    }

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new AppException(
        ErrorCode.TOKEN_EXPIRED,
        '登录状态已过期',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        status: true,
        mustChangePassword: true,
        passwordChangedAt: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        '账号不可用',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // token 里的密码时间戳与库中不一致 → 签发之后改过密码 → 这张 token 作废。
    // 这让「改密即踢下线」无需维护一份 access token 黑名单。
    if (Math.floor(user.passwordChangedAt.getTime() / 1000) !== payload.pwd) {
      throw new AppException(
        ErrorCode.TOKEN_EXPIRED,
        '密码已变更，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 强制改密期间，除白名单接口外一律挡住。前端据此错误码弹出改密对话框。
    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new AppException(
          ErrorCode.PASSWORD_CHANGE_REQUIRED,
          '首次登录须修改密码',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    req.user = await this.auth.buildCurrentUser(user.id);
    return true;
  }
}
