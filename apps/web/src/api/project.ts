import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeProjectStatusRequest,
  IssueItem,
  MilestoneItem,
  PageResult,
  ProjectDetail,
  ProjectListItem,
  ProjectListQuery,
  ProjectMemberItem,
  RiskItem,
  SaveIssueRequest,
  SaveMemberRequest,
  SaveMilestoneRequest,
  SaveProjectRequest,
  SaveRiskRequest,
  SaveTaskRequest,
  TaskItem,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  项目台账
// ============================================================

const projectApi = {
  list: (query: ProjectListQuery) =>
    http.get<never, PageResult<ProjectListItem>>('/projects', { params: query }),
  detail: (id: string) => http.get<never, ProjectDetail>(`/projects/${id}`),
  create: (body: SaveProjectRequest) =>
    http.post<never, { id: string; code: string }>('/projects', body),
  update: (id: string, body: SaveProjectRequest) =>
    http.put<never, ProjectDetail>(`/projects/${id}`, body),
  changeStatus: (id: string, body: ChangeProjectStatusRequest) =>
    http.patch<never, ProjectDetail>(`/projects/${id}/status`, body),
  remove: (id: string) => http.delete<never, { ok: true }>(`/projects/${id}`),
};

export function useProjects(query: ProjectListQuery) {
  return useQuery({
    queryKey: ['project', 'list', query],
    queryFn: () => projectApi.list(query),
    placeholderData: (prev) => prev,
  });
}

/** 轻量用户选项（项目经理/负责人下拉）。只需 project:read 权限。 */
export function useUserOptions() {
  return useQuery({
    queryKey: ['project', 'user-options'],
    queryFn: () =>
      http.get<never, { id: string; displayName: string }[]>('/projects/options/users'),
    staleTime: 60_000,
  });
}

export function useProjectDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['project', 'detail', id],
    queryFn: () => projectApi.detail(id!),
    enabled: !!id,
  });
}

/** 详情/列表共用的失效逻辑：任何项目写操作后同时刷新两者。 */
function useInvalidateProject() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['project', 'list'] });
    if (id) void qc.invalidateQueries({ queryKey: ['project', 'detail', id] });
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: projectApi.create,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveProjectRequest }) =>
      projectApi.update(id, body),
    onSuccess: (_d, { id }) => invalidate(id),
  });
}

export function useChangeProjectStatus() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ChangeProjectStatusRequest }) =>
      projectApi.changeStatus(id, body),
    onSuccess: (_d, { id }) => invalidate(id),
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (id: string) => projectApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  WBS 任务（甘特图数据源）
// ============================================================

const taskApi = {
  list: (projectId: string) => http.get<never, TaskItem[]>(`/projects/${projectId}/tasks`),
  create: (projectId: string, body: SaveTaskRequest) =>
    http.post<never, { id: string }>(`/projects/${projectId}/tasks`, body),
  update: (projectId: string, taskId: string, body: SaveTaskRequest) =>
    http.put<never, { ok: true }>(`/projects/${projectId}/tasks/${taskId}`, body),
  remove: (projectId: string, taskId: string) =>
    http.delete<never, { ok: true }>(`/projects/${projectId}/tasks/${taskId}`),
};

export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'tasks', projectId],
    queryFn: () => taskApi.list(projectId!),
    enabled: !!projectId,
  });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      body,
    }: {
      projectId: string;
      taskId?: string;
      body: SaveTaskRequest;
    }) =>
      taskId
        ? taskApi.update(projectId, taskId, body).then(() => undefined)
        : taskApi.create(projectId, body).then(() => undefined),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'tasks', projectId] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, taskId }: { projectId: string; taskId: string }) =>
      taskApi.remove(projectId, taskId),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'tasks', projectId] }),
  });
}

// ============================================================
//  里程碑
// ============================================================

const milestoneApi = {
  list: (projectId: string) =>
    http.get<never, MilestoneItem[]>(`/projects/${projectId}/milestones`),
  create: (projectId: string, body: SaveMilestoneRequest) =>
    http.post<never, { id: string }>(`/projects/${projectId}/milestones`, body),
  update: (projectId: string, id: string, body: SaveMilestoneRequest) =>
    http.put<never, { ok: true }>(`/projects/${projectId}/milestones/${id}`, body),
  remove: (projectId: string, id: string) =>
    http.delete<never, { ok: true }>(`/projects/${projectId}/milestones/${id}`),
};

export function useSaveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      id,
      body,
    }: {
      projectId: string;
      id?: string;
      body: SaveMilestoneRequest;
    }) =>
      id
        ? milestoneApi.update(projectId, id, body).then(() => undefined)
        : milestoneApi.create(projectId, body).then(() => undefined),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'detail', projectId] }),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
      milestoneApi.remove(projectId, id),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'detail', projectId] }),
  });
}

// ============================================================
//  风险 / 问题
// ============================================================

const riskApi = {
  list: (projectId: string) => http.get<never, RiskItem[]>(`/projects/${projectId}/risks`),
  create: (projectId: string, body: SaveRiskRequest) =>
    http.post<never, { id: string }>(`/projects/${projectId}/risks`, body),
  update: (projectId: string, id: string, body: SaveRiskRequest) =>
    http.put<never, { ok: true }>(`/projects/${projectId}/risks/${id}`, body),
  remove: (projectId: string, id: string) =>
    http.delete<never, { ok: true }>(`/projects/${projectId}/risks/${id}`),
};

export function useProjectRisks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'risks', projectId],
    queryFn: () => riskApi.list(projectId!),
    enabled: !!projectId,
  });
}

export function useSaveRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      id,
      body,
    }: {
      projectId: string;
      id?: string;
      body: SaveRiskRequest;
    }) =>
      id
        ? riskApi.update(projectId, id, body).then(() => undefined)
        : riskApi.create(projectId, body).then(() => undefined),
    onSuccess: (_d, { projectId }) => {
      void qc.invalidateQueries({ queryKey: ['project', 'risks', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', 'list'] });
    },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
      riskApi.remove(projectId, id),
    onSuccess: (_d, { projectId }) => {
      void qc.invalidateQueries({ queryKey: ['project', 'risks', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', 'list'] });
    },
  });
}

const issueApi = {
  list: (projectId: string) => http.get<never, IssueItem[]>(`/projects/${projectId}/issues`),
  create: (projectId: string, body: SaveIssueRequest) =>
    http.post<never, { id: string }>(`/projects/${projectId}/issues`, body),
  update: (projectId: string, id: string, body: SaveIssueRequest) =>
    http.put<never, { ok: true }>(`/projects/${projectId}/issues/${id}`, body),
  remove: (projectId: string, id: string) =>
    http.delete<never, { ok: true }>(`/projects/${projectId}/issues/${id}`),
};

export function useProjectIssues(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'issues', projectId],
    queryFn: () => issueApi.list(projectId!),
    enabled: !!projectId,
  });
}

export function useSaveIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      id,
      body,
    }: {
      projectId: string;
      id?: string;
      body: SaveIssueRequest;
    }) =>
      id
        ? issueApi.update(projectId, id, body).then(() => undefined)
        : issueApi.create(projectId, body).then(() => undefined),
    onSuccess: (_d, { projectId }) => {
      void qc.invalidateQueries({ queryKey: ['project', 'issues', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', 'list'] });
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
      issueApi.remove(projectId, id),
    onSuccess: (_d, { projectId }) => {
      void qc.invalidateQueries({ queryKey: ['project', 'issues', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', 'list'] });
    },
  });
}

// ============================================================
//  成员
// ============================================================

const memberApi = {
  list: (projectId: string) =>
    http.get<never, ProjectMemberItem[]>(`/projects/${projectId}/members`),
  add: (projectId: string, body: SaveMemberRequest) =>
    http.post<never, { ok: true }>(`/projects/${projectId}/members`, body),
  remove: (projectId: string, userId: string) =>
    http.delete<never, { ok: true }>(`/projects/${projectId}/members/${userId}`),
};

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: SaveMemberRequest }) =>
      memberApi.add(projectId, body),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'detail', projectId] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      memberApi.remove(projectId, userId),
    onSuccess: (_d, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['project', 'detail', projectId] }),
  });
}
