import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptanceDetail,
  AcceptanceListQuery,
  AcceptanceReport,
  AcceptanceRow,
  AssignDebugIssueRequest,
  AttachmentItem,
  ConcludeAcceptanceRequest,
  CreateAcceptanceRequest,
  CreateDebugIssueRequest,
  CreateDebugRecordRequest,
  DebugIssueDetail,
  DebugIssueListQuery,
  DebugIssueRow,
  DebugRecordDetail,
  DebugRecordListQuery,
  DebugRecordRow,
  PageResult,
  RecheckDebugIssueRequest,
  SubmitDebugIssueRequest,
  UpdateAcceptanceRequest,
  UpdateDebugIssueRequest,
  UpdateDebugRecordRequest,
  VoidDebugIssueRequest,
} from '@mes/shared';
import { http } from './client';

/**
 * 调试域任一写操作后整域失效——问题闭环会影响验收门禁与记录的问题计数，
 * 记录/问题/验收的列表与详情统一刷新，避免遗漏。
 */
function useInvalidateDebug() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['debug'] });
}

// ============================================================
//  调试记录
// ============================================================

export function useDebugRecords(query: DebugRecordListQuery) {
  return useQuery({
    queryKey: ['debug', 'record', 'list', query],
    queryFn: () => http.get<never, PageResult<DebugRecordRow>>('/debug-records', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useDebugRecordDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['debug', 'record', 'detail', id],
    queryFn: () => http.get<never, DebugRecordDetail>(`/debug-records/${id}`),
    enabled: !!id,
  });
}

export function useCreateDebugRecord() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (body: CreateDebugRecordRequest) =>
      http.post<never, { id: string; code: string }>('/debug-records', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateDebugRecord() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDebugRecordRequest }) =>
      http.put<never, { ok: true }>(`/debug-records/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useCompleteDebugRecord() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/debug-records/${id}/complete`),
    onSuccess: () => invalidate(),
  });
}

export function useVoidDebugRecord() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/debug-records/${id}/void`),
    onSuccess: () => invalidate(),
  });
}

/** 上传调试现场照片（multipart）。 */
export async function uploadDebugRecordPhoto(
  recordId: string,
  file: File,
): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/debug-records/${recordId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

/** 照片直链（<img> 用）。同源请求自动带 httpOnly Cookie，后端仍做权限校验。 */
export function debugRecordPhotoUrl(attachmentId: string): string {
  return `/api/debug-records/photos/${attachmentId}?inline=1`;
}

// ============================================================
//  调试问题
// ============================================================

export function useDebugIssues(query: DebugIssueListQuery) {
  return useQuery({
    queryKey: ['debug', 'issue', 'list', query],
    queryFn: () => http.get<never, PageResult<DebugIssueRow>>('/debug-issues', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useDebugIssueDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['debug', 'issue', 'detail', id],
    queryFn: () => http.get<never, DebugIssueDetail>(`/debug-issues/${id}`),
    enabled: !!id,
  });
}

export function useCreateDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (body: CreateDebugIssueRequest) =>
      http.post<never, { id: string; code: string }>('/debug-issues', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDebugIssueRequest }) =>
      http.patch<never, { ok: true }>(`/debug-issues/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useAssignDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignDebugIssueRequest }) =>
      http.post<never, { ok: true }>(`/debug-issues/${id}/assign`, body),
    onSuccess: () => invalidate(),
  });
}

export function useSubmitDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubmitDebugIssueRequest }) =>
      http.post<never, { ok: true }>(`/debug-issues/${id}/submit`, body),
    onSuccess: () => invalidate(),
  });
}

export function useRecheckDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecheckDebugIssueRequest }) =>
      http.post<never, { ok: true }>(`/debug-issues/${id}/recheck`, body),
    onSuccess: () => invalidate(),
  });
}

export function useVoidDebugIssue() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VoidDebugIssueRequest }) =>
      http.post<never, { ok: true }>(`/debug-issues/${id}/void`, body),
    onSuccess: () => invalidate(),
  });
}

/** 上传调试问题照片（multipart）。 */
export async function uploadDebugIssuePhoto(issueId: string, file: File): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/debug-issues/${issueId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

export function debugIssuePhotoUrl(attachmentId: string): string {
  return `/api/debug-issues/photos/${attachmentId}?inline=1`;
}

// ============================================================
//  FAT / SAT 验收
// ============================================================

export function useAcceptances(query: AcceptanceListQuery) {
  return useQuery({
    queryKey: ['debug', 'acceptance', 'list', query],
    queryFn: () => http.get<never, PageResult<AcceptanceRow>>('/acceptances', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useAcceptanceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['debug', 'acceptance', 'detail', id],
    queryFn: () => http.get<never, AcceptanceDetail>(`/acceptances/${id}`),
    enabled: !!id,
  });
}

/** 验收报告聚合数据（打印视图数据源）。 */
export function useAcceptanceReport(id: string | undefined) {
  return useQuery({
    queryKey: ['debug', 'acceptance', 'report', id],
    queryFn: () => http.get<never, AcceptanceReport>(`/acceptances/${id}/report`),
    enabled: !!id,
  });
}

export function useCreateAcceptance() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (body: CreateAcceptanceRequest) =>
      http.post<never, { id: string; code: string }>('/acceptances', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAcceptance() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAcceptanceRequest }) =>
      http.put<never, { ok: true }>(`/acceptances/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useConcludeAcceptance() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConcludeAcceptanceRequest }) =>
      http.post<never, { ok: true }>(`/acceptances/${id}/conclude`, body),
    onSuccess: () => invalidate(),
  });
}

export function useVoidAcceptance() {
  const invalidate = useInvalidateDebug();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/acceptances/${id}/void`),
    onSuccess: () => invalidate(),
  });
}
