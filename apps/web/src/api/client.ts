import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ErrorCode } from '@mes/shared';

const CSRF_COOKIE = 'mes_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

/** 后端错误响应体（AllExceptionsFilter 的输出）。 */
interface ErrorBody {
  code: number;
  message: string;
  errorCode?: ErrorCode;
  data?: unknown;
}

/**
 * 归一化后的 API 错误。
 *
 * 组件一律按 errorCode 分支，不解析 message —— 文案随时会改，错误码才是契约。
 */
export class ApiError extends Error {
  constructor(
    readonly errorCode: ErrorCode | undefined,
    message: string,
    readonly status: number,
    readonly data: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * 全局 HTTP 客户端。
 *
 * withCredentials: true —— 让浏览器自动携带 httpOnly Cookie 中的 token。
 * 这里刻意没有 Authorization 头的 token 注入逻辑：前端根本拿不到 token，
 * 也就无从注入。凭据的存取完全由浏览器和后端在 Cookie 层面完成。
 */
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
});

function readCookie(name: string): string | undefined {
  const hit = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

/**
 * double-submit CSRF：把可读的 mes_csrf Cookie 回填进请求头。
 * 攻击者的站点能让浏览器带上 Cookie，却因同源策略读不到它的值，也就填不出这个头。
 */
http.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCookie(CSRF_COOKIE);
    if (token) config.headers.set(CSRF_HEADER, token);
  }
  return config;
});

/** 会话彻底失效时的回调，由 auth store 注册，避免这里反向依赖 store。 */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

/**
 * 并发请求同时撞上 401 时，只发一次 refresh。
 *
 * 否则 N 个请求会触发 N 次刷新，而 refresh token 是轮换的——后到的那几次
 * 拿着已被作废的 token，反会被后端判定为「token 复用」，整个会话族当场吊销。
 */
let refreshing: Promise<void> | null = null;

function refreshOnce(): Promise<void> {
  refreshing ??= http
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (res) => res.data?.data ?? res.data,
  async (err: AxiosError<ErrorBody>) => {
    const status = err.response?.status ?? 0;
    const body = err.response?.data;
    const config = err.config as RetriableConfig | undefined;
    const url = config?.url ?? '';

    // refresh / login 自身返回 401 时不能再触发刷新，否则会无限递归
    const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (
      status === 401 &&
      body?.errorCode === 'TOKEN_EXPIRED' &&
      config &&
      !config._retried &&
      !isAuthEndpoint
    ) {
      config._retried = true;
      try {
        await refreshOnce();
        return await http.request(config);
      } catch {
        onSessionExpired?.();
      }
    } else if (status === 401 && !isAuthEndpoint) {
      onSessionExpired?.();
    }

    if (err.response) {
      throw new ApiError(body?.errorCode, body?.message ?? '请求失败', status, body?.data);
    }

    // 没有 response：网络不可达、超时或被浏览器拦截
    throw new ApiError(
      undefined,
      err.code === 'ECONNABORTED' ? '请求超时，请检查网络' : '无法连接服务器',
      0,
      null,
    );
  },
);
