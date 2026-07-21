import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CurrentUser,
  type DataScope,
  ErrorCode,
  type LoginFailureDetail,
  type Permission,
  evaluatePassword,
} from '@mes/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CaptchaService } from './captcha.service';
import type { ChangePasswordDto, LoginDto, PasswordResetRequestDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { type IssuedTokens, TokenService } from './token.service';

/**
 * 失败到多少次开始要验证码。
 *
 * 必须严格小于 LOGIN_MAX_ATTEMPTS（锁定阈值），否则账号在验证码出现之前就已经被锁死，
 * 验证码这道防线永远不会生效。
 */
const CAPTCHA_AFTER_FAILURES = 3;

/** 统计失败次数的时间窗口。超过这个时间的旧失败不再计入，避免昨天的手滑影响今天的登录。 */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** 单 IP 在窗口内的失败上限。防止攻击者用一个 IP 轮着撞不同账号来绕开账号维度的锁定。 */
const IP_FAILURE_LIMIT = 20;

/** 数据范围由松到紧。用户身兼多角色时取最松的一个。 */
const DATA_SCOPE_RANK: DataScope[] = [
  'ALL',
  'DEPT_AND_BELOW',
  'DEPT_ONLY',
  'OWNED_PROJECT',
  'SELF_ONLY',
];

export interface RequestMeta {
  ip: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly captcha: CaptchaService,
    private readonly config: ConfigService,
  ) {}

  private get maxAttempts(): number {
    return Number(this.config.get('LOGIN_MAX_ATTEMPTS') ?? 5);
  }

  private get lockoutMs(): number {
    return Number(this.config.get('LOGIN_LOCKOUT_MINUTES') ?? 15) * 60_000;
  }

  // ----------------------------------------------------------------
  //  登录
  // ----------------------------------------------------------------

  /**
   * 判断本次登录是否需要验证码。
   *
   * 按 IP 与用户名分别统计，任一超阈值即要求验证码。用用户名统计不会泄露账号是否存在——
   * 对着不存在的账号连撞 3 次，同样会弹出验证码。
   */
  async isCaptchaRequired(username: string, ip: string): Promise<boolean> {
    const since = new Date(Date.now() - FAILURE_WINDOW_MS);

    const [byUser, byIp] = await Promise.all([
      this.prisma.loginAttempt.count({
        where: { username, success: false, createdAt: { gte: since } },
      }),
      this.prisma.loginAttempt.count({
        where: { ip, success: false, createdAt: { gte: since } },
      }),
    ]);

    return byUser >= CAPTCHA_AFTER_FAILURES || byIp >= CAPTCHA_AFTER_FAILURES;
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ user: CurrentUser; tokens: IssuedTokens; mustChangePassword: boolean }> {
    const username = dto.username.trim();
    const captchaRequired = await this.isCaptchaRequired(username, meta.ip);

    // IP 维度的硬闸门。放在最前面，避免让一次分布式撞库把 Argon2 当成免费的 CPU 消耗器。
    if (await this.isIpThrottled(meta.ip)) {
      throw new AppException(
        ErrorCode.RATE_LIMITED,
        '该网络地址的失败尝试过多，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
        { captchaRequired: true, lockedForSeconds: 0 } satisfies LoginFailureDetail,
      );
    }

    if (captchaRequired && !this.captcha.verify(dto.captchaId, dto.captchaCode)) {
      await this.recordAttempt(username, meta, false, 'CAPTCHA_INVALID');
      throw new AppException(
        // 用户还没输过验证码 → 告诉前端该显示了；输了但不对 → 告诉他重输
        dto.captchaCode ? ErrorCode.CAPTCHA_INVALID : ErrorCode.CAPTCHA_REQUIRED,
        dto.captchaCode ? '验证码错误或已过期' : '请输入验证码',
        HttpStatus.BAD_REQUEST,
        { captchaRequired: true, lockedForSeconds: 0 } satisfies LoginFailureDetail,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
    });

    // 账号不存在：跑一次假哈希把耗时对齐，再抛出与「密码错误」完全一致的异常
    if (!user) {
      await this.passwords.verifyDummy(dto.password);
      await this.recordAttempt(username, meta, false, 'NO_SUCH_USER');
      throw this.invalidCredentials(await this.isCaptchaRequired(username, meta.ip));
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const lockedForSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      await this.recordAttempt(username, meta, false, 'LOCKED');
      throw new AppException(
        ErrorCode.ACCOUNT_LOCKED,
        `账号已锁定，请 ${Math.ceil(lockedForSeconds / 60)} 分钟后再试`,
        HttpStatus.FORBIDDEN,
        { captchaRequired: true, lockedForSeconds } satisfies LoginFailureDetail,
      );
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, dto.password);

    if (!passwordOk) {
      await this.onFailedPassword(user.id, username, meta);
      throw this.invalidCredentials(await this.isCaptchaRequired(username, meta.ip));
    }

    // 密码正确但账号被停用：这里可以明确告知，因为对方已经证明了自己知道密码
    if (user.status === 'DISABLED') {
      await this.recordAttempt(username, meta, false, 'DISABLED');
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        '账号已停用，请联系系统管理员',
        HttpStatus.FORBIDDEN,
      );
    }

    const tokens = await this.tokens.issueForLogin(user, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
          lastLoginAt: new Date(),
          lastLoginIp: meta.ip,
        },
      }),
      this.prisma.loginAttempt.create({
        data: { username, ip: meta.ip, success: true, userAgent: meta.userAgent?.slice(0, 255) },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.id,
          username,
          action: 'auth.login',
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
          success: true,
        },
      }),
    ]);

    return {
      user: await this.buildCurrentUser(user.id),
      tokens,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private invalidCredentials(captchaRequired: boolean): AppException {
    // 账号不存在与密码错误共用这一条消息，攻击者无法据此枚举用户名
    return new AppException(
      ErrorCode.INVALID_CREDENTIALS,
      '账号或密码错误',
      HttpStatus.UNAUTHORIZED,
      { captchaRequired, lockedForSeconds: 0 } satisfies LoginFailureDetail,
    );
  }

  private async isIpThrottled(ip: string): Promise<boolean> {
    const since = new Date(Date.now() - FAILURE_WINDOW_MS);
    const count = await this.prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    });
    return count >= IP_FAILURE_LIMIT;
  }

  private async onFailedPassword(userId: string, username: string, meta: RequestMeta): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (updated.failedLoginCount >= this.maxAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + this.lockoutMs),
          failedLoginCount: 0, // 锁定期满后重新开始计数
        },
      });
      this.logger.warn(`账号 ${username} 连续失败 ${this.maxAttempts} 次，已锁定`);
    }

    await this.recordAttempt(username, meta, false, 'BAD_PASSWORD');
  }

  private async recordAttempt(
    username: string,
    meta: RequestMeta,
    success: boolean,
    reason?: string,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        username,
        ip: meta.ip,
        success,
        reason,
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
  }

  // ----------------------------------------------------------------
  //  会话
  // ----------------------------------------------------------------

  async refresh(presented: string, meta: RequestMeta): Promise<IssuedTokens> {
    const result = await this.tokens.rotate(presented, { ip: meta.ip, userAgent: meta.userAgent });
    if (!result) {
      throw new AppException(
        ErrorCode.TOKEN_EXPIRED,
        '登录状态已失效，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return result.tokens;
  }

  async logout(
    presented: string | undefined,
    user: { id: string; username: string } | undefined,
    meta?: RequestMeta,
  ): Promise<void> {
    if (presented) await this.tokens.revokeByToken(presented);

    if (user) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          username: user.username,
          action: 'auth.logout',
          ip: meta?.ip,
          userAgent: meta?.userAgent?.slice(0, 255),
          success: true,
        },
      });
    }
  }

  /**
   * 组装前端所需的用户上下文。
   *
   * 权限是多角色的并集，数据范围取最松的一档——一个人既是项目经理又是管理层时，
   * 若取最严的一档，他反而看不到自己作为管理层应当看到的数据。
   */
  async buildCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        dept: { select: { name: true } },
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: { select: { code: true } } } } },
            },
          },
        },
      },
    });

    const activeRoles = user.roles.map((ur) => ur.role).filter((r) => r.enabled);

    const permissions = [
      ...new Set(
        activeRoles.flatMap((role) => role.permissions.map((rp) => rp.permission.code)),
      ),
    ] as Permission[];

    const dataScope =
      DATA_SCOPE_RANK.find((scope) => activeRoles.some((r) => r.dataScope === scope)) ??
      'SELF_ONLY';

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      status: user.status as CurrentUser['status'],
      deptId: user.deptId,
      deptName: user.dept?.name ?? null,
      roles: activeRoles.map((r) => r.code),
      permissions,
      dataScope,
    };
  }

  // ----------------------------------------------------------------
  //  密码
  // ----------------------------------------------------------------

  async changePassword(userId: string, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await this.passwords.verify(user.passwordHash, dto.oldPassword))) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        '当前密码不正确',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '新密码不能与当前密码相同');
    }

    const strength = evaluatePassword(dto.newPassword);
    if (strength.score < 2) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `密码强度不足：${strength.issues.join('、')}`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    // 改密后旧 access token 因 payload 里的 pwd 时间戳对不上而自动失效，
    // refresh token 则需要显式吊销——它不携带这个时间戳。
    await this.tokens.revokeAllForUser(userId);

    await this.prisma.auditLog.create({
      data: {
        userId,
        username: user.username,
        action: 'auth.change_password',
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
        success: true,
      },
    });
  }

  /**
   * 忘记密码：只登记申请，不做任何账号存在性校验。
   *
   * 无论账号是否存在，一律返回成功。否则这个未认证的接口就成了用户名枚举器——
   * 它比登录接口更好用，因为没有密码这一关。
   */
  async requestPasswordReset(dto: PasswordResetRequestDto, meta: RequestMeta): Promise<void> {
    if (!this.captcha.verify(dto.captchaId, dto.captchaCode)) {
      throw new AppException(ErrorCode.CAPTCHA_INVALID, '验证码错误或已过期');
    }

    const username = dto.username.trim();

    // 同一账号在 24 小时内已有待处理申请时，不再重复登记，避免管理员后台被刷屏
    const pending = await this.prisma.passwordResetRequest.findFirst({
      where: {
        username,
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      select: { id: true },
    });

    if (!pending) {
      await this.prisma.passwordResetRequest.create({
        data: {
          username,
          displayName: dto.displayName.trim(),
          phone: dto.phone,
          reason: dto.reason?.trim() || null,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        username,
        action: 'auth.password_reset_request',
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
        success: true,
      },
    });
  }
}
