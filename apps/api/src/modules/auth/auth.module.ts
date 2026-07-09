import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * 标为 @Global：JwtAuthGuard 在 app.module 里注册为全局 Guard，
 * 需要注入 TokenService 与 AuthService。
 */
@Global()
@Module({
  // 密钥不在这里配置：access 与 refresh 用的是两把不同的密钥，
  // 由 TokenService 在每次签发/校验时显式传入。
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, CaptchaService],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
