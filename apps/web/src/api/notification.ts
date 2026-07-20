import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationItem, PageResult, UnreadCountResult } from '@mes/shared';
import { http } from './client';

/** 顶栏铃铛的未读数。30s 轮询——站内通知的「准实时」，避免 WebSocket 复杂度。 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notification', 'unread-count'],
    queryFn: () => http.get<never, UnreadCountResult>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
}

export function useNotifications(page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['notification', 'list', page],
    queryFn: () =>
      http.get<never, PageResult<NotificationItem>>('/notifications', {
        params: { page, pageSize: 10 },
      }),
    enabled,
    placeholderData: (prev) => prev,
  });
}

function useInvalidateNotification() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['notification'] });
}

export function useMarkRead() {
  const invalidate = useInvalidateNotification();
  return useMutation({
    mutationFn: (ids: string[]) => http.post<never, { ok: true }>('/notifications/read', { ids }),
    onSuccess: () => invalidate(),
  });
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotification();
  return useMutation({
    mutationFn: () => http.post<never, { ok: true }>('/notifications/read-all'),
    onSuccess: () => invalidate(),
  });
}
