import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ApiResponse } from '@mes/shared';

/**
 * 把 controller 返回值统一包成 ApiResponse，前端只需处理一种结构。
 * 文件流（StreamableFile，如图纸下载）原样透传——包成 JSON 会破坏二进制响应。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | StreamableFile> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) =>
        data instanceof StreamableFile
          ? data
          : {
              code: 0,
              message: 'ok',
              data,
              timestamp: new Date().toISOString(),
            },
      ),
    );
  }
}
