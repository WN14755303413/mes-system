import { Spin } from 'antd';
import { Suspense, lazy } from 'react';
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

// M4 项目管理：台账 / 甘特图 / 风险与问题
import ProjectListPage from '@/pages/project/list/ProjectListPage';
import ProjectGanttPage from '@/pages/project/gantt/ProjectGanttPage';
import ProjectRiskPage from '@/pages/project/risk/ProjectRiskPage';

// M5 BOM 与图纸：版本管理 / 图纸 / 设计变更
import BomPage from '@/pages/design/bom/BomPage';
import DrawingPage from '@/pages/design/drawing/DrawingPage';
import EcoPage from '@/pages/design/change/EcoPage';

// M6 物料齐套：物料主数据 / 供应数据 / 齐套看板
import MaterialPage from '@/pages/material/list/MaterialPage';
import SupplyPage from '@/pages/material/supply/SupplyPage';
import KittingPage from '@/pages/material/kitting/KittingPage';

// M7 生产执行：生产计划 / 装配派工 / 现场报工 / 异常上报
import PlanPage from '@/pages/production/plan/PlanPage';
import DispatchPage from '@/pages/production/dispatch/DispatchPage';
import MyTasksPage from '@/pages/production/report/MyTasksPage';
import ExceptionPage from '@/pages/production/exception/ExceptionPage';

// M8 质量管理：检验单 / 质量问题闭环
import InspectionPage from '@/pages/quality/inspection/InspectionPage';
import IssuePage from '@/pages/quality/issue/IssuePage';

// M9 调试与验收：调试记录 / 调试问题闭环 / FAT-SAT 验收与报告
import DebugRecordPage from '@/pages/commissioning/record/DebugRecordPage';
import DebugIssuePage from '@/pages/commissioning/issue/DebugIssuePage';
import AcceptancePage from '@/pages/commissioning/acceptance/AcceptancePage';
import AcceptanceReportPage from '@/pages/commissioning/acceptance/AcceptanceReportPage';

// M10 数据看板：ECharts 体积大，两页懒加载，整套图表库不进主包
const CompanyDashboardPage = lazy(() => import('@/pages/dashboard/company/CompanyDashboardPage'));
const ProjectDashboardPage = lazy(() => import('@/pages/dashboard/project/ProjectDashboardPage'));

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spin size="large" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** 已实现真实页面的路径 → 组件。不在此表中的叶子路径回退到占位页。 */
const REAL_PAGES: Record<string, React.ReactNode> = {
  '/system/user': <UserListPage />,
  '/system/role': <RolePage />,
  '/system/dept': <DeptPage />,
  '/system/audit': <AuditLogPage />,
  '/system/integration': <IntegrationLogPage />,
  '/project/list': <ProjectListPage />,
  '/project/gantt': <ProjectGanttPage />,
  '/project/risk': <ProjectRiskPage />,
  '/design/bom': <BomPage />,
  '/design/drawing': <DrawingPage />,
  '/design/change': <EcoPage />,
  '/material/list': <MaterialPage />,
  '/material/supply': <SupplyPage />,
  '/material/kitting': <KittingPage />,
  '/production/plan': <PlanPage />,
  '/production/dispatch': <DispatchPage />,
  '/production/report': <MyTasksPage />,
  '/production/exception': <ExceptionPage />,
  '/quality/inspection': <InspectionPage />,
  '/quality/issue': <IssuePage />,
  '/commissioning/record': <DebugRecordPage />,
  '/commissioning/issue': <DebugIssuePage />,
  '/commissioning/acceptance': <AcceptancePage />,
  '/dashboard/company': (
    <LazyPage>
      <CompanyDashboardPage />
    </LazyPage>
  ),
  '/dashboard/project': (
    <LazyPage>
      <ProjectDashboardPage />
    </LazyPage>
  ),
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

      {/* 验收报告打印视图：A4 版式独立于主框架（无侧栏/顶栏），浏览器打印出 PDF */}
      <Route
        path="/commissioning/acceptance/report/:id"
        element={
          <RequireAuth>
            <AcceptanceReportPage />
          </RequireAuth>
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
