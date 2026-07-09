import { useEffect } from 'react';
import { authApi } from '@/api/auth';
import { isApiError, setSessionExpiredHandler } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * 应用启动时恢复登录态。
 *
 * token 在 httpOnly Cookie 里，JS 读不到，所以「是否已登录」这个问题只能问后端。
 * 在 /auth/me 返回之前，store 里的 bootstrapping 为 true，路由不做任何跳转——
 * 否则已登录用户每次刷新页面都会看到登录页闪一下。
 */
export function useSessionBootstrap(): void {
  useEffect(() => {
    const { setUser, setMustChangePassword, finishBootstrap, clear } = useAuthStore.getState();

    // 会话彻底失效（刷新也救不回来）时，把用户状态清干净，路由自然会送他去登录页
    setSessionExpiredHandler(() => clear());

    let cancelled = false;

    authApi
      .me()
      .then((user) => {
        if (!cancelled) setUser(user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        // 会话有效，但后端要求先改密码。/auth/me 本身被挡住了，拿不到用户资料——
        // 改密对话框只需要用户输入旧密码，不依赖这份资料。
        if (isApiError(err) && err.errorCode === 'PASSWORD_CHANGE_REQUIRED') {
          setMustChangePassword(true);
        } else {
          clear();
        }
      })
      .finally(() => {
        if (!cancelled) finishBootstrap();
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
