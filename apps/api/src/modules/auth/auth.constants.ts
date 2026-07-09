import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'mes_at';
export const REFRESH_COOKIE = 'mes_rt';

/**
 * CSRF 令牌 Cookie。这一个**故意不是 httpOnly**——前端必须读得到它，
 * 才能回填到 X-CSRF-Token 请求头里，构成 double-submit 校验。
 * 它本身不是凭据：拿到它并不能冒充用户，因为真正的 token 仍在 httpOnly Cookie 中。
 */
export const CSRF_COOKIE = 'mes_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** refresh token 只在刷新/登出接口用得到，限定 Path 可减少它被随请求发出的次数。 */
export const REFRESH_COOKIE_PATH = '/api/auth';

export function baseCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    // Strict：跨站请求一律不携带，从根上掐掉大部分 CSRF 场景。
    // 代价是从外部链接跳进来时需要重新登录，对内部系统可接受。
    sameSite: 'strict',
    path: '/',
  };
}

/** 把 "15m" / "7d" / "3600s" 解析为毫秒。JWT 与 Cookie 的过期时间必须由同一份配置推导，否则会出现 Cookie 还在、token 已废的错位。 */
export function parseDuration(input: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!match) throw new Error(`无法解析时长：${input}，期望形如 15m / 7d`);

  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return value * factor;
}
