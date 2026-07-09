import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@mes/shared';

/**
 * 带机器可读错误码的业务异常。
 *
 * 前端一律根据 errorCode 分支（跳转登录、弹验证码、强制改密…），
 * 绝不解析 message 文案——文案随时可能改，错误码是契约。
 *
 * `data` 用于附带前端决策所需的结构化信息（如锁定剩余秒数），
 * 内容必须是可以安全暴露给未认证调用方的，不要往里放内部状态。
 */
export class AppException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    data?: unknown,
  ) {
    super({ errorCode, message, data }, status);
  }
}
