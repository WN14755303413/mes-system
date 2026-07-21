import type { Request } from 'express';

/**
 * 提取客户端 IP，并规范化为人类可读形式。
 *
 * 取值直接用 req.ip——它已由 Express 按 main.ts 的 trust proxy 配置解析过
 * X-Forwarded-For（只信任我方反代网段）。这里绝不能绕开它自行读转发头，
 * 否则客户端伪造的 X-Forwarded-For 会原样进入审计与登录限流。
 *
 * 规范化两类噪音：
 * - 双栈 socket 上 Node 把 IPv4 呈现为 IPv6 映射形式（::ffff:192.168.1.8）
 * - IPv6 环回 ::1 统一写成 127.0.0.1，与 IPv4 环回口径一致
 */
export function getClientIp(req: Request): string | undefined {
  const raw = req.ip ?? req.socket?.remoteAddress ?? undefined;
  if (!raw) return undefined;
  if (raw === '::1') return '127.0.0.1';
  return raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
}
