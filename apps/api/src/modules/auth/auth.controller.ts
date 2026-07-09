import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type {
  CaptchaResponse,
  CurrentUser as CurrentUserDto,
  LoginResponse,
} from '@mes/shared';
import { ErrorCode } from '@mes/shared';
import {
  AllowPasswordChangePending,
  CurrentUser,
  Public,
  ReqMeta,
} from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/exceptions/app.exception';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  baseCookieOptions,
} from './auth.constants';
import { type RequestMeta, AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { ChangePasswordDto, LoginDto, PasswordResetRequestDto } from './dto/auth.dto';
import type { IssuedTokens } from './token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly config: ConfigService,
  ) {}

  private get secure(): boolean {
    return this.config.get<boolean>('COOKIE_SECURE') === true;
  }

  /**
   * 三个 Cookie 一起下发：
   * - access / refresh 是 httpOnly 的，JS 读不到，F12 的 Console 也拿不到值
   * - csrf 刻意可读，前端需要把它回填进请求头（见 CsrfGuard）
   */
  private setAuthCookies(res: Response, tokens: IssuedTokens): void {
    const base = baseCookieOptions(this.secure);

    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessMaxAge });

    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      path: REFRESH_COOKIE_PATH,
      maxAge: tokens.refreshMaxAge,
    });

    res.cookie(CSRF_COOKIE, tokens.csrfToken, {
      ...base,
      httpOnly: false,
      maxAge: tokens.refreshMaxAge,
    });
  }

  private clearAuthCookies(res: Response): void {
    const base = baseCookieOptions(this.secure);
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
  }

  // ----------------------------------------------------------------

  /** 验证码。限流比登录更宽松：正常用户刷新几次很常见。 */
  @Public()
  @Get('captcha')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  getCaptcha(): CaptchaResponse {
    return this.captcha.generate();
  }

  /**
   * 探测某账号当前是否需要验证码，供登录页在用户输完账号后预先渲染验证码框。
   *
   * 不泄露账号是否存在：计数是「失败尝试」维度的，对不存在的账号连撞几次同样返回 true。
   */
  @Public()
  @Get('captcha-required')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async captchaRequired(
    @Query('username') username: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ required: boolean }> {
    if (!username) return { required: false };
    return { required: await this.auth.isCaptchaRequired(username.trim(), meta.ip) };
  }

  /** 登录。独立的严格限流：单 IP 每分钟 10 次，与全局的 120 次/分钟无关。 */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { user, tokens, mustChangePassword } = await this.auth.login(dto, meta);
    this.setAuthCookies(res, tokens);
    return { user, mustChangePassword };
  }

  /**
   * 用 refresh token 换新的一对 token。
   *
   * 标 @Public 是因为此时 access token 多半已过期，走不了 JwtAuthGuard；
   * 真正的凭据是 httpOnly 的 refresh cookie，SameSite=Strict 保证它不会随跨站请求发出。
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async refresh(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!presented) {
      this.clearAuthCookies(res);
      throw new AppException(ErrorCode.TOKEN_EXPIRED, '请重新登录', HttpStatus.UNAUTHORIZED);
    }

    try {
      const tokens = await this.auth.refresh(presented, meta);
      this.setAuthCookies(res, tokens);
      return { ok: true };
    } catch (err) {
      // 刷新失败意味着这套 Cookie 已无价值，清掉它免得前端反复重试
      this.clearAuthCookies(res);
      throw err;
    }
  }

  /** 登出。强制改密期间也允许调用，否则用户会被困在改密对话框里出不来。 */
  @Post('logout')
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined, user);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  /** 当前用户上下文。前端刷新页面后靠它恢复登录态——token 在 httpOnly Cookie 里，读不到。 */
  @Get('me')
  me(@CurrentUser() user: CurrentUserDto): CurrentUserDto {
    return user;
  }

  @Post('change-password')
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: CurrentUserDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user.id, dto, meta);
    // 改密会吊销全部会话，包括当前这条。清掉 Cookie，让前端跳回登录页。
    this.clearAuthCookies(res);
    return { ok: true };
  }

  /**
   * 忘记密码。无论账号是否存在都返回成功——这个接口不需要认证，
   * 一旦按存在性区分返回值，它就成了比登录接口更好用的用户名枚举器。
   */
  @Public()
  @Post('password-reset-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600_000, limit: 5 } })
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ ok: true }> {
    await this.auth.requestPasswordReset(dto, meta);
    return { ok: true };
  }
}
