import { create } from 'zustand';
import type { CurrentUser, Permission } from '@mes/shared';

interface AuthState {
  user: CurrentUser | null;
  /** 首次 /auth/me 探测尚未返回。用它区分「未登录」和「还不知道」，避免闪一下登录页。 */
  bootstrapping: boolean;
  /** 后端返回 PASSWORD_CHANGE_REQUIRED 时置位，前端据此弹出强制改密对话框。 */
  mustChangePassword: boolean;

  setUser: (user: CurrentUser | null) => void;
  setMustChangePassword: (value: boolean) => void;
  finishBootstrap: () => void;
  clear: () => void;
  /** 仅用于隐藏菜单和禁用按钮。真正的访问控制在后端 Guard，改 DOM 没有用。 */
  hasPermission: (...codes: Permission[]) => boolean;
}

/**
 * 认证状态。
 *
 * 刻意不持久化到 localStorage：token 在 httpOnly Cookie 里，前端存的只是一份用户资料副本。
 * 把它写进 localStorage 只会带来两个问题——刷新后显示的是过期的角色和权限，
 * 以及在共享电脑上把用户信息留在磁盘里。每次加载都向 /auth/me 要一次，成本很低。
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  bootstrapping: true,
  mustChangePassword: false,

  setUser: (user) => set({ user }),
  setMustChangePassword: (mustChangePassword) => set({ mustChangePassword }),
  finishBootstrap: () => set({ bootstrapping: false }),
  clear: () => set({ user: null, mustChangePassword: false }),

  hasPermission: (...codes) => {
    const granted = get().user?.permissions;
    if (!granted) return false;
    return codes.every((c) => granted.includes(c));
  },
}));
