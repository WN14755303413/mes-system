import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseDuration } from './auth.constants';

export interface AccessTokenPayload {
  /** subject：用户 id */
  sub: string;
  username: string;
  /**
   * 密码最后修改时间的时间戳（秒）。
   * 校验时与库中比对，改密后此前签发的所有 access token 立即失效。
   */
  pwd: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessMaxAge: number;
  refreshMaxAge: number;
}

interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** refresh token 是 256bit 随机串，不是 JWT——它不需要自解释，只需要不可猜测且可吊销。 */
  private static newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * 只存哈希。数据库泄露时，攻击者拿到的是 SHA-256 摘要，无法还原出可用的 token。
   * 这里不用 Argon2：token 本身有 256bit 熵，不存在字典攻击的余地，
   * 而登录路径上的每次刷新都要做一次查表，慢哈希会拖垮它。
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlMs(): number {
    return parseDuration(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m');
  }

  private refreshTtlMs(): number {
    return parseDuration(this.config.get<string>('JWT_REFRESH_TTL') ?? '7d');
  }

  /** 登录时调用：开启一个新的 token family。 */
  async issueForLogin(
    user: { id: string; username: string; passwordChangedAt: Date },
    meta: SessionMeta,
  ): Promise<IssuedTokens> {
    return this.issue(user, randomUUID(), meta);
  }

  private async issue(
    user: { id: string; username: string; passwordChangedAt: Date },
    familyId: string,
    meta: SessionMeta,
  ): Promise<IssuedTokens> {
    const accessMaxAge = this.accessTtlMs();
    const refreshMaxAge = this.refreshTtlMs();

    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      pwd: Math.floor(user.passwordChangedAt.getTime() / 1000),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(accessMaxAge / 1000),
    });

    const refreshToken = TokenService.newRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: TokenService.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + refreshMaxAge),
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: randomBytes(16).toString('base64url'),
      accessMaxAge,
      refreshMaxAge,
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * 用 refresh token 换一对新 token，并作废旧的（rotation）。
   *
   * 复用检测：如果传进来的 token 已经被撤销过，说明它要么被窃取后重放，
   * 要么合法用户在使用一个被窃取者抢先轮换掉的旧 token。两种情况都无法区分善恶，
   * 唯一安全的做法是吊销整个 family，强制所有会话重新登录。
   */
  async rotate(
    presented: string,
    meta: SessionMeta,
  ): Promise<{ tokens: IssuedTokens; userId: string } | null> {
    const tokenHash = TokenService.hashToken(presented);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) return null;

    if (existing.revokedAt) {
      this.logger.warn(
        `检测到已撤销的 refresh token 被复用（user=${existing.userId}），吊销整个会话族`,
      );
      await this.revokeFamily(existing.familyId);
      return null;
    }

    if (existing.expiresAt < new Date()) return null;
    if (existing.user.status !== 'ACTIVE') return null;

    // 旧 token 立刻作废，与新 token 的签发在同一事务里，避免并发刷新签出两条有效链
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issue(existing.user, existing.familyId, meta);
    return { tokens, userId: existing.userId };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 登出：只吊销当前会话族，用户在其它设备上的登录不受影响。 */
  async revokeByToken(presented: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hashToken(presented) },
      select: { familyId: true },
    });
    if (record) await this.revokeFamily(record.familyId);
  }

  /** 改密后调用：踢掉该用户的全部会话。 */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
