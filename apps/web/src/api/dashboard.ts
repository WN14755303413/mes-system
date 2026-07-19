import { useQuery } from '@tanstack/react-query';
import type { CompanyDashboard, ProjectDashboard, WorkbenchSummary } from '@mes/shared';
import { http } from './client';

// ============================================================
//  M10 数据看板：每个看板一个请求拿整板数据（对应验收「加载 < 2s」，
//  不逐图取数）。看板数据是聚合快照，30s 内视为新鲜，避免切页反复打表。
// ============================================================

export function useWorkbenchSummary() {
  return useQuery({
    queryKey: ['dashboard', 'workbench'],
    queryFn: () => http.get<never, WorkbenchSummary>('/dashboard/workbench'),
    staleTime: 30_000,
  });
}

export function useCompanyDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'company'],
    queryFn: () => http.get<never, CompanyDashboard>('/dashboard/company'),
    staleTime: 30_000,
  });
}

export function useProjectDashboard(projectId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'project', projectId],
    queryFn: () => http.get<never, ProjectDashboard>(`/dashboard/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 30_000,
    // 换项目时保留上一板的渲染（透明度过渡在页面层做），不闪骨架屏
    placeholderData: (prev) => prev,
  });
}
