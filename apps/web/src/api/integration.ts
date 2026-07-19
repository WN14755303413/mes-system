import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IntegrationRunResult,
  IntegrationStatusResponse,
  TriggerSyncRequest,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  系统集成（M11）：适配器状态 / 手动同步 / 异常池重试与补偿
//  异常池列表复用 system.ts 的 useIntegrationLogs
// ============================================================

const integrationApi = {
  status: () => http.get<never, IntegrationStatusResponse>('/integration/status'),
  sync: (action: string, body: TriggerSyncRequest) =>
    http.post<never, IntegrationRunResult>(`/integration/sync/${action}`, body),
  retry: (id: string) => http.post<never, IntegrationRunResult>(`/integration/logs/${id}/retry`),
  resolve: (id: string) => http.post<never, { ok: true }>(`/integration/logs/${id}/resolve`),
};

export function useIntegrationStatus() {
  return useQuery({ queryKey: ['integration', 'status'], queryFn: integrationApi.status });
}

/** 同步/重试/补偿都会同时改变状态页与日志列表，统一失效两处缓存 */
function useInvalidateIntegration() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['integration', 'status'] });
    void qc.invalidateQueries({ queryKey: ['sys', 'integration-logs'] });
  };
}

export function useTriggerSync() {
  const invalidate = useInvalidateIntegration();
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body: TriggerSyncRequest }) =>
      integrationApi.sync(action, body),
    onSettled: invalidate,
  });
}

export function useRetryLog() {
  const invalidate = useInvalidateIntegration();
  return useMutation({
    mutationFn: (id: string) => integrationApi.retry(id),
    onSettled: invalidate,
  });
}

export function useResolveLog() {
  const invalidate = useInvalidateIntegration();
  return useMutation({
    mutationFn: (id: string) => integrationApi.resolve(id),
    onSettled: invalidate,
  });
}
