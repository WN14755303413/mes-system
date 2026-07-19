import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignQualityIssueRequest,
  AttachmentItem,
  CreateInspectionRequest,
  CreateQualityIssueRequest,
  InspectionDetail,
  InspectionListQuery,
  InspectionRow,
  JudgeInspectionRequest,
  JudgeInspectionResult,
  PageResult,
  QualityIssueDetail,
  QualityIssueListQuery,
  QualityIssueRow,
  RecheckQualityIssueRequest,
  SubmitQualityIssueRequest,
  UpdateInspectionRequest,
  UpdateQualityIssueRequest,
  VoidQualityIssueRequest,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  检验单
// ============================================================

export function useInspections(query: InspectionListQuery) {
  return useQuery({
    queryKey: ['quality', 'inspection', 'list', query],
    queryFn: () => http.get<never, PageResult<InspectionRow>>('/inspections', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useInspectionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['quality', 'inspection', 'detail', id],
    queryFn: () => http.get<never, InspectionDetail>(`/inspections/${id}`),
    enabled: !!id,
  });
}

/**
 * 质量域任一写操作后整域失效——judge 会跨资源生成问题单，
 * 检验单与问题单的列表/详情统一刷新，避免遗漏。
 */
function useInvalidateQuality() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['quality'] });
}

export function useCreateInspection() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: (body: CreateInspectionRequest) =>
      http.post<never, { id: string; code: string }>('/inspections', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateInspection() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInspectionRequest }) =>
      http.put<never, { ok: true }>(`/inspections/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useJudgeInspection() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: JudgeInspectionRequest }) =>
      http.post<never, JudgeInspectionResult>(`/inspections/${id}/judge`, body),
    onSuccess: () => invalidate(),
  });
}

export function useVoidInspection() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/inspections/${id}/void`),
    onSuccess: () => invalidate(),
  });
}

/** 上传检验照片（multipart）。 */
export async function uploadInspectionPhoto(
  inspectionId: string,
  file: File,
): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/inspections/${inspectionId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

/** 照片直链（<img> 用）。同源请求自动带 httpOnly Cookie，后端仍做权限校验。 */
export function inspectionPhotoUrl(attachmentId: string): string {
  return `/api/inspections/photos/${attachmentId}?inline=1`;
}

// ============================================================
//  质量问题单
// ============================================================

export function useQualityIssues(query: QualityIssueListQuery) {
  return useQuery({
    queryKey: ['quality', 'issue', 'list', query],
    queryFn: () => http.get<never, PageResult<QualityIssueRow>>('/quality-issues', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useQualityIssueDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['quality', 'issue', 'detail', id],
    queryFn: () => http.get<never, QualityIssueDetail>(`/quality-issues/${id}`),
    enabled: !!id,
  });
}

export function useCreateQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: (body: CreateQualityIssueRequest) =>
      http.post<never, { id: string; code: string }>('/quality-issues', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateQualityIssueRequest }) =>
      http.patch<never, { ok: true }>(`/quality-issues/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useAssignQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignQualityIssueRequest }) =>
      http.post<never, { ok: true }>(`/quality-issues/${id}/assign`, body),
    onSuccess: () => invalidate(),
  });
}

export function useSubmitQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubmitQualityIssueRequest }) =>
      http.post<never, { ok: true }>(`/quality-issues/${id}/submit`, body),
    onSuccess: () => invalidate(),
  });
}

export function useRecheckQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecheckQualityIssueRequest }) =>
      http.post<never, { ok: true }>(`/quality-issues/${id}/recheck`, body),
    onSuccess: () => invalidate(),
  });
}

export function useVoidQualityIssue() {
  const invalidate = useInvalidateQuality();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VoidQualityIssueRequest }) =>
      http.post<never, { ok: true }>(`/quality-issues/${id}/void`, body),
    onSuccess: () => invalidate(),
  });
}

/** 上传问题单照片（multipart）。 */
export async function uploadIssuePhoto(issueId: string, file: File): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/quality-issues/${issueId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
}

export function issuePhotoUrl(attachmentId: string): string {
  return `/api/quality-issues/photos/${attachmentId}?inline=1`;
}
