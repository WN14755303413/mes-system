import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignExceptionRequest,
  AssignTaskRequest,
  AttachmentItem,
  ChangeWorkOrderStatusRequest,
  CloseExceptionRequest,
  CreateExceptionRequest,
  CreateWorkOrderRequest,
  CreateWorkReportRequest,
  DispatchTaskQuery,
  ExceptionDetail,
  ExceptionListQuery,
  ExceptionRow,
  MyTaskDetail,
  MyTaskQuery,
  PageResult,
  ProductionOverviewItem,
  ResolveExceptionRequest,
  SaveAssemblyTaskRequest,
  TaskWithContextRow,
  UpdateWorkOrderRequest,
  WorkOrderDetail,
  WorkOrderListQuery,
  WorkOrderRow,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  装配工单（计划单元）
// ============================================================

export function useWorkOrders(query: WorkOrderListQuery) {
  return useQuery({
    queryKey: ['production', 'wo', 'list', query],
    queryFn: () => http.get<never, PageResult<WorkOrderRow>>('/work-orders', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useProductionOverview() {
  return useQuery({
    queryKey: ['production', 'overview'],
    queryFn: () => http.get<never, ProductionOverviewItem[]>('/work-orders/overview'),
  });
}

export function useWorkOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['production', 'wo', 'detail', id],
    queryFn: () => http.get<never, WorkOrderDetail>(`/work-orders/${id}`),
    enabled: !!id,
  });
}

/**
 * 生产域任一写操作后：工单/任务/我的任务全部失效；
 * 报工会回写 WBS 任务进度，项目域（甘特图）一并失效。
 */
function useInvalidateProduction() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['production'] });
    void qc.invalidateQueries({ queryKey: ['project'] });
  };
}

export function useCreateWorkOrder() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: (body: CreateWorkOrderRequest) =>
      http.post<never, { id: string; code: string }>('/work-orders', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateWorkOrder() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkOrderRequest }) =>
      http.patch<never, { ok: true }>(`/work-orders/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useChangeWorkOrderStatus() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ChangeWorkOrderStatusRequest }) =>
      http.post<never, { ok: true }>(`/work-orders/${id}/status`, body),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  装配任务（计划/派工视角）
// ============================================================

export function useDispatchTasks(query: DispatchTaskQuery) {
  return useQuery({
    queryKey: ['production', 'task', 'dispatch', query],
    queryFn: () =>
      http.get<never, PageResult<TaskWithContextRow>>('/assembly-tasks', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useAddTask() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ workOrderId, body }: { workOrderId: string; body: SaveAssemblyTaskRequest }) =>
      http.post<never, { id: string }>(`/work-orders/${workOrderId}/tasks`, body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveAssemblyTaskRequest }) =>
      http.patch<never, { ok: true }>(`/assembly-tasks/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: (id: string) => http.delete<never, { ok: true }>(`/assembly-tasks/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useAssignTask() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignTaskRequest }) =>
      http.post<never, { ok: true }>(`/assembly-tasks/${id}/assign`, body),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  我的任务与报工（装配工视角）
// ============================================================

export function useMyTasks(query: MyTaskQuery) {
  return useQuery({
    queryKey: ['production', 'my-task', 'list', query],
    queryFn: () => http.get<never, PageResult<TaskWithContextRow>>('/my-tasks', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useMyTaskDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['production', 'my-task', 'detail', id],
    queryFn: () => http.get<never, MyTaskDetail>(`/my-tasks/${id}`),
    enabled: !!id,
  });
}

export function useCreateReport() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: CreateWorkReportRequest }) =>
      http.post<never, { ok: true }>(`/my-tasks/${taskId}/reports`, body),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  异常单
// ============================================================

export function useExceptions(query: ExceptionListQuery) {
  return useQuery({
    queryKey: ['production', 'exception', 'list', query],
    queryFn: () => http.get<never, PageResult<ExceptionRow>>('/exceptions', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useExceptionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['production', 'exception', 'detail', id],
    queryFn: () => http.get<never, ExceptionDetail>(`/exceptions/${id}`),
    enabled: !!id,
  });
}

function useInvalidateExceptions() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['production', 'exception'] });
}

export function useCreateException() {
  const invalidate = useInvalidateExceptions();
  return useMutation({
    mutationFn: (body: CreateExceptionRequest) =>
      http.post<never, { id: string; code: string }>('/exceptions', body),
    onSuccess: () => invalidate(),
  });
}

export function useAssignException() {
  const invalidate = useInvalidateExceptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignExceptionRequest }) =>
      http.post<never, { ok: true }>(`/exceptions/${id}/assign`, body),
    onSuccess: () => invalidate(),
  });
}

export function useResolveException() {
  const invalidate = useInvalidateExceptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveExceptionRequest }) =>
      http.post<never, { ok: true }>(`/exceptions/${id}/resolve`, body),
    onSuccess: () => invalidate(),
  });
}

export function useCloseException() {
  const invalidate = useInvalidateExceptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CloseExceptionRequest }) =>
      http.post<never, { ok: true }>(`/exceptions/${id}/close`, body),
    onSuccess: () => invalidate(),
  });
}

export function useReopenException() {
  const invalidate = useInvalidateExceptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CloseExceptionRequest }) =>
      http.post<never, { ok: true }>(`/exceptions/${id}/reopen`, body),
    onSuccess: () => invalidate(),
  });
}

/** 上传现场照片（multipart）。 */
export async function uploadExceptionPhoto(exceptionId: string, file: File): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/exceptions/${exceptionId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

/**
 * 照片直链（<img> 用）。同源请求自动带 httpOnly Cookie，
 * 后端仍会做权限校验——拿不到别人异常单的图。
 */
export function exceptionPhotoUrl(attachmentId: string): string {
  return `/api/exceptions/photos/${attachmentId}?inline=1`;
}
