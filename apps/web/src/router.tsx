import { Spin } from 'antd';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { AppLayout } from '@/layout/AppLayout';
import { NAV_TREE, type NavItem } from '@/layout/nav';
import LoginPage from '@/pages/login/LoginPage';
import { useAuthStore } from '@/stores/auth';

import DashboardPage from '@/pages/dashboard/DashboardPage';
import PlaceholderPage from '@/pages/placeholder/PlaceholderPage';
import ProfilePage from '@/pages/profile/ProfilePage';

// M3 系统管理：五个真实页面，其余业务路径仍走占位页
import UserListPage from '@/pages/system/user/UserListPage';
import RolePage from '@/pages/system/role/RolePage';
import DeptPage from '@/pages/system/dept/DeptPage';
import AuditLogPage from '@/pages/system/audit/AuditLogPage';
import IntegrationLogPage from '@/pages/system/integration/IntegrationLogPage';

/** 已实现真实页面的路径 → 组件。不在此表中的叶子路径回退到占位页。 */
const REAL_PAGES: Record<string, React.ReactNode> = {
  '/system/user': <UserListPage />,
  '/system/role': <RolePage />,
  '/system/dept': <DeptPage />,
  '/system/audit': <AuditLogPage />,
  '/system/integration': <IntegrationLogPage />,
};

function FullscreenSpin() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Spin size="large" />
    </div>
  );
}

/**
 * 前端路由守卫。
 *
 * 这只是体验优化——它防止未登录用户看到空壳页面，不构成访问控制。
 * 真正的拦截在后端 Guard：手工构造的请求同样会被 401/403 挡回。
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const location = useLocation();

  if (bootstrapping) return <FullscreenSpin />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}

/** 已登录用户不该再看到登录页。 */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);

  if (bootstrapping) return <FullscreenSpin />;
  if (user) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/** 收集导航树里所有叶子路径（除根路径外），M2 阶段一律先渲染占位页 */
function collectLeafPaths(tree: readonly NavItem[]): string[] {
  return tree.flatMap((item) => {
    if (item.children) return collectLeafPaths(item.children);
    return item.path === '/' ? [] : [item.path];
  });
}

export function AppRoutes() {
  useSessionBootstrap();

  const leafPaths = collectLeafPaths(NAV_TREE);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />

      {/* 主框架：所有业务页面都嵌套在 AppLayout 的 <Outlet /> 里 */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        {/* 业务模块：已实现的走真实页面，其余先用占位页，后续里程碑逐一替换 */}
        {leafPaths.map((path) => (
          <Route key={path} path={path} element={REAL_PAGES[path] ?? <PlaceholderPage />} />
        ))}
      </Route>

      {/* 未知路径回工作台 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
