import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttachmentItem,
  CreateFeedbackRequest,
  FeedbackDetail,
  FeedbackListQuery,
  FeedbackReplyRequest,
  FeedbackRow,
  FeedbackStats,
  FeedbackTransitionRequest,
  PageResult,
} from '@mes/shared';
import { http } from './client';

export function useFeedbacks(query: FeedbackListQuery) {
  return useQuery({
    queryKey: ['feedback', 'list', query],
    queryFn: () => http.get<never, PageResult<FeedbackRow>>('/feedback', { params: query }),
    placeholderData: (prev) => prev,
  });
}

export function useFeedbackDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['feedback', 'detail', id],
    queryFn: () => http.get<never, FeedbackDetail>(`/feedback/${id}`),
    enabled: !!id,
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: ['feedback', 'stats'],
    queryFn: () => http.get<never, FeedbackStats>('/feedback/stats'),
  });
}

function useInvalidateFeedback() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['feedback'] });
}

export function useCreateFeedback() {
  const invalidate = useInvalidateFeedback();
  return useMutation({
    mutationFn: (body: CreateFeedbackRequest) =>
      http.post<never, { id: string; code: string }>('/feedback', body),
    onSuccess: () => invalidate(),
  });
}

export function useReplyFeedback() {
  const invalidate = useInvalidateFeedback();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: FeedbackReplyRequest }) =>
      http.post<never, { actionId: string }>(`/feedback/${id}/reply`, body),
    onSuccess: () => invalidate(),
  });
}

export function useTransitionFeedback() {
  const invalidate = useInvalidateFeedback();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: FeedbackTransitionRequest }) =>
      http.post<never, { ok: true }>(`/feedback/${id}/transition`, body),
    onSuccess: () => invalidate(),
  });
}

/** 上传附件：不带 actionId 挂主单，带 actionId 挂对应回复。 */
export function uploadFeedbackAttachment(
  feedbackId: string,
  file: File,
  actionId?: string,
): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, AttachmentItem>(`/feedback/${feedbackId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: actionId ? { actionId } : undefined,
    timeout: 120_000,
  });
}

/** 附件直链（<img>/预览用）。同源请求自动带 httpOnly Cookie，后端仍做权限校验。 */
export function feedbackAttachmentUrl(attachmentId: string, inline = true): string {
  return `/api/feedback/attachments/${attachmentId}${inline ? '?inline=1' : ''}`;
}
