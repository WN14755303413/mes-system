import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  CaptchaResponse,
  ChangePasswordRequest,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  PasswordResetRequestPayload,
} from '@mes/shared';
import { http } from './client';

export const authApi = {
  login: (body: LoginRequest) => http.post<never, LoginResponse>('/auth/login', body),
  logout: () => http.post<never, { ok: true }>('/auth/logout'),
  me: () => http.get<never, CurrentUser>('/auth/me'),
  captcha: () => http.get<never, CaptchaResponse>('/auth/captcha'),
  captchaRequired: (username: string) =>
    http.get<never, { required: boolean }>('/auth/captcha-required', { params: { username } }),
  changePassword: (body: ChangePasswordRequest) =>
    http.post<never, { ok: true }>('/auth/change-password', body),
  requestPasswordReset: (body: PasswordResetRequestPayload) =>
    http.post<never, { ok: true }>('/auth/password-reset-request', body),
};

export function useCaptcha(enabled: boolean) {
  return useQuery({
    queryKey: ['captcha'],
    queryFn: authApi.captcha,
    enabled,
    // 验证码是一次性的，缓存它只会让用户看到一张已被后端消费掉的图
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
}

export function useLogin() {
  return useMutation({ mutationFn: authApi.login });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authApi.changePassword });
}

export function usePasswordResetRequest() {
  return useMutation({ mutationFn: authApi.requestPasswordReset });
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptime: number;
}

/** 登录页展示用。未认证也能调（@Public），失败时不重试，免得在后端没起来时刷屏。 */
export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => http.get('/health'),
    refetchInterval: 30_000,
    retry: false,
  });
}
