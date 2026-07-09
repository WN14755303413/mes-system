import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@mes/shared';
import { CSRF_COOKIE, CSRF_HEADER } from '../../modules/auth/auth.constants';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedRequest } from './jwt-auth.guard';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie 形式的 CSRF 校验。
 *
 * 这是 SameSite=Strict 之上的第二道防线。Strict 已经能挡住绝大多数跨站请求，
 * 但它依赖浏览器实现，且对同站的子域名劫持无能为力。
 *
 * 原理：登录时下发一个**可被 JS 读取**的 mes_csrf Cookie，前端把它回填到请求头。
 * 攻击者的站点能让浏览器带上 Cookie，却读不到它的值（同源策略），因此填不出这个头。
 *
 * 公开接口（登录、验证码、忘记密码）跳过校验——此时用户还没有会话，
 * 也就没有可被冒用的凭据。
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (SAFE_METHODS.has(req.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const fromCookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const fromHeader = req.headers[CSRF_HEADER] as string | undefined;

    if (!fromCookie || !fromHeader || !constantTimeEqual(fromCookie, fromHeader)) {
      throw new AppException(ErrorCode.CSRF_INVALID, '请求校验失败，请刷新页面重试', HttpStatus.FORBIDDEN);
    }

    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual 要求等长，长度不同时直接判否（长度本身不是秘密）
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
