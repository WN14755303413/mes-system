import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 全局异常出口。
 *
 * 关键安全考量：绝不把堆栈、SQL 语句、内部路径回传给客户端。
 * 未预期的异常一律对外呈现为「服务器内部错误」，细节只进服务端日志。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let errorCode: string | undefined;
    let data: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // ValidationPipe 的 message 是字符串数组，取第一条即可，其余是同一次提交的其它字段
        message = Array.isArray(b.message)
          ? String(b.message[0])
          : ((b.message as string) ?? exception.message);
        errorCode = b.errorCode as string | undefined;
        data = b.data ?? null;
      }
    } else {
      // 非受控异常：完整信息只写日志
      this.logger.error(
        `未处理异常 ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      code: status,
      message,
      errorCode,
      data,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
