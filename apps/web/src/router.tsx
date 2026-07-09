import { Spin } from 'antd';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import HomePage from '@/pages/home/HomePage';
import LoginPage from '@/pages/login/LoginPage';
import { useAuthStore } from '@/stores/auth';

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

export function AppRoutes() {
  useSessionBootstrap();

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
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      {/* M2 会用真正的主框架布局接管这里；在那之前，未知路径一律回首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
