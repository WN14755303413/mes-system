import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/**
 * 全局审计拦截器。
 *
 * 只对标了 @Audit() 的 handler 生效。成功与失败都记一条——失败的写操作
 * （越权、非法状态、并发冲突）恰恰是审计最该留痕的。
 *
 * 落库失败绝不影响主流程：审计是旁路，不能因为日志写不进去就让用户的正常操作报错。
 *
 * 执行顺序：它在 JwtAuthGuard 之后（能读到 req.user），包在业务 handler 外层。
 * 与 TransformInterceptor 相互独立——本拦截器读的是 handler 的原始返回值（未包装），
 * 因为 APP_INTERCEPTOR 注册的拦截器在 main.ts 的 useGlobalInterceptors 之内层执行。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
    const userAgent = (req.headers['user-agent'] as string | undefined)?.slice(0, 255);

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.write(meta, req, user, ip, userAgent, true, undefined, result);
        },
        error: (err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          void this.write(meta, req, user, ip, userAgent, false, errorMsg, undefined);
        },
      }),
    );
  }

  private resolveTargetId(
    meta: AuditMeta,
    req: AuthenticatedRequest,
    result: unknown,
  ): string | undefined {
    const from = meta.targetIdFrom ?? 'param:id';
    if (from === 'result') {
      // 对拦截器执行顺序不作假设：handler 的原始返回是 { id }，但若 TransformInterceptor
      // 已先一步把它包成 { data: { id } }，这里也要能取到。两种形态都试。
      const obj = result as Record<string, unknown> | null | undefined;
      const direct = obj && typeof obj === 'object' ? obj.id : undefined;
      if (direct != null) return String(direct);
      const nested =
        obj && typeof obj.data === 'object' && obj.data !== null
          ? (obj.data as Record<string, unknown>).id
          : undefined;
      return nested != null ? String(nested) : undefined;
    }
    // param:xxx
    const key = from.slice('param:'.length);
    const value = (req.params as Record<string, string | undefined>)?.[key];
    return value;
  }

  private async write(
    meta: AuditMeta,
    req: AuthenticatedRequest,
    user: AuthenticatedRequest['user'],
    ip: string | undefined,
    userAgent: string | undefined,
    success: boolean,
    errorMsg: string | undefined,
    result: unknown,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: user?.id ?? null,
          username: user?.username ?? null,
          action: meta.action,
          targetType: meta.targetType ?? null,
          targetId: this.resolveTargetId(meta, req, result) ?? null,
          ip,
          userAgent,
          success,
          errorMsg: errorMsg?.slice(0, 500) ?? null,
        },
      });
    } catch (err) {
      // 审计是旁路，写不进去只告警，不打断主流程
      this.logger.warn(`审计日志写入失败 [${meta.action}]: ${(err as Error).message}`);
    }
  }
}
