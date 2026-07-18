import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignRolesRequest,
  AuditLogItem,
  AuditLogQuery,
  CreateRoleRequest,
  CreateUserRequest,
  DeptNode,
  IntegrationLogItem,
  IntegrationLogQuery,
  PageResult,
  PermissionItem,
  RoleDetail,
  RoleListItem,
  SaveDeptRequest,
  SysUserListItem,
  SysUserListQuery,
  TempPasswordResponse,
  UpdateRolePermissionsRequest,
  UpdateRoleRequest,
  UpdateUserRequest,
  UpdateUserStatusRequest,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  用户
// ============================================================

const userApi = {
  list: (query: SysUserListQuery) =>
    http.get<never, PageResult<SysUserListItem>>('/system/users', { params: query }),
  create: (body: CreateUserRequest) =>
    http.post<never, TempPasswordResponse>('/system/users', body),
  update: (id: string, body: UpdateUserRequest) =>
    http.patch<never, SysUserListItem>(`/system/users/${id}`, body),
  setStatus: (id: string, body: UpdateUserStatusRequest) =>
    http.patch<never, { ok: true }>(`/system/users/${id}/status`, body),
  resetPassword: (id: string) =>
    http.post<never, TempPasswordResponse>(`/system/users/${id}/reset-password`),
  assignRoles: (id: string, body: AssignRolesRequest) =>
    http.patch<never, { ok: true }>(`/system/users/${id}/roles`, body),
  remove: (id: string) => http.delete<never, { ok: true }>(`/system/users/${id}`),
};

export function useUsers(query: SysUserListQuery) {
  return useQuery({
    queryKey: ['sys', 'users', query],
    queryFn: () => userApi.list(query),
    placeholderData: (prev) => prev, // 翻页/搜索时保留上一页数据，避免表格闪空
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) => userApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'users'] }),
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserStatusRequest }) =>
      userApi.setStatus(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'users'] }),
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (id: string) => userApi.resetPassword(id) });
}

export function useAssignRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignRolesRequest }) =>
      userApi.assignRoles(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'users'] }),
  });
}

// ============================================================
//  角色与权限
// ============================================================

const roleApi = {
  list: () => http.get<never, RoleListItem[]>('/system/roles'),
  detail: (id: string) => http.get<never, RoleDetail>(`/system/roles/${id}`),
  permissions: () => http.get<never, PermissionItem[]>('/system/permissions'),
  create: (body: CreateRoleRequest) => http.post<never, { id: string }>('/system/roles', body),
  update: (id: string, body: UpdateRoleRequest) =>
    http.patch<never, RoleListItem>(`/system/roles/${id}`, body),
  setPermissions: (id: string, body: UpdateRolePermissionsRequest) =>
    http.patch<never, { ok: true }>(`/system/roles/${id}/permissions`, body),
  remove: (id: string) => http.delete<never, { ok: true }>(`/system/roles/${id}`),
};

export function useRoles() {
  return useQuery({ queryKey: ['sys', 'roles'], queryFn: roleApi.list });
}

export function useRoleDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['sys', 'roles', id],
    queryFn: () => roleApi.detail(id!),
    enabled: !!id,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['sys', 'permissions'],
    queryFn: roleApi.permissions,
    staleTime: Infinity, // 权限点是编译期常量，本次会话内不会变
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roleApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'roles'] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoleRequest }) => roleApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'roles'] }),
  });
}

export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRolePermissionsRequest }) =>
      roleApi.setPermissions(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ['sys', 'roles'] });
      void qc.invalidateQueries({ queryKey: ['sys', 'roles', id] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => roleApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'roles'] }),
  });
}

// ============================================================
//  部门
// ============================================================

const deptApi = {
  tree: () => http.get<never, DeptNode[]>('/system/depts'),
  create: (body: SaveDeptRequest) => http.post<never, { id: string }>('/system/depts', body),
  update: (id: string, body: SaveDeptRequest) =>
    http.patch<never, { ok: true }>(`/system/depts/${id}`, body),
  remove: (id: string) => http.delete<never, { ok: true }>(`/system/depts/${id}`),
};

export function useDepts() {
  return useQuery({ queryKey: ['sys', 'depts'], queryFn: deptApi.tree });
}

export function useSaveDept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveDeptRequest }) =>
      id
        ? deptApi.update(id, body).then(() => undefined)
        : deptApi.create(body).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'depts'] }),
  });
}

export function useDeleteDept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deptApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys', 'depts'] }),
  });
}

// ============================================================
//  日志（只读）
// ============================================================

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: ['sys', 'audit-logs', query],
    queryFn: () =>
      http.get<never, PageResult<AuditLogItem>>('/system/audit-logs', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useIntegrationLogs(query: IntegrationLogQuery) {
  return useQuery({
    queryKey: ['sys', 'integration-logs', query],
    queryFn: () =>
      http.get<never, PageResult<IntegrationLogItem>>('/system/integration-logs', {
        params: query,
      }),
    placeholderData: (prev) => prev,
  });
}
