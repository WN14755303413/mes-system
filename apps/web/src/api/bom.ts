import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BatchBomItemsRequest,
  BomDetail,
  BomStatus,
  BomVersionItem,
  ChangeBomStatusRequest,
  CreateBomRequest,
  DrawingItem,
  DrawingListQuery,
  SaveBomItemRequest,
  UpdateBomRequest,
  UploadDrawingFields,
  UploadDrawingResponse,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  BOM 版本
// ============================================================

const bomApi = {
  list: (projectId: string) =>
    http.get<never, BomVersionItem[]>('/boms', { params: { projectId } }),
  detail: (id: string) => http.get<never, BomDetail>(`/boms/${id}`),
  create: (body: CreateBomRequest) =>
    http.post<never, { id: string; version: string }>('/boms', body),
  update: (id: string, body: UpdateBomRequest) =>
    http.patch<never, { ok: true }>(`/boms/${id}`, body),
  changeStatus: (id: string, body: ChangeBomStatusRequest) =>
    http.patch<never, { ok: true }>(`/boms/${id}/status`, body),
  remove: (id: string) => http.delete<never, { ok: true }>(`/boms/${id}`),
};

export function useBoms(projectId: string | undefined) {
  return useQuery({
    queryKey: ['bom', 'list', projectId],
    queryFn: () => bomApi.list(projectId!),
    enabled: !!projectId,
  });
}

export function useBomDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['bom', 'detail', id],
    queryFn: () => bomApi.detail(id!),
    enabled: !!id,
  });
}

/** 任何 BOM 写操作后同时刷新版本列表与详情。 */
function useInvalidateBom() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['bom', 'list'] });
    if (id) void qc.invalidateQueries({ queryKey: ['bom', 'detail', id] });
  };
}

export function useCreateBom() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: bomApi.create,
    onSuccess: () => invalidate(),
  });
}

export function useChangeBomStatus() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BomStatus }) =>
      bomApi.changeStatus(id, { status }),
    onSuccess: (_d, { id }) => invalidate(id),
  });
}

export function useDeleteBom() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: (id: string) => bomApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  BOM 明细
// ============================================================

const bomItemApi = {
  add: (bomId: string, body: SaveBomItemRequest) =>
    http.post<never, { id: string }>(`/boms/${bomId}/items`, body),
  batchAdd: (bomId: string, body: BatchBomItemsRequest) =>
    http.post<never, { count: number }>(`/boms/${bomId}/items/batch`, body),
  update: (bomId: string, itemId: string, body: SaveBomItemRequest) =>
    http.put<never, { ok: true }>(`/boms/${bomId}/items/${itemId}`, body),
  remove: (bomId: string, itemId: string) =>
    http.delete<never, { ok: true }>(`/boms/${bomId}/items/${itemId}`),
};

export function useSaveBomItem() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: ({
      bomId,
      itemId,
      body,
    }: {
      bomId: string;
      itemId?: string;
      body: SaveBomItemRequest;
    }) =>
      itemId
        ? bomItemApi.update(bomId, itemId, body).then(() => undefined)
        : bomItemApi.add(bomId, body).then(() => undefined),
    onSuccess: (_d, { bomId }) => invalidate(bomId),
  });
}

export function useBatchAddBomItems() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: ({ bomId, body }: { bomId: string; body: BatchBomItemsRequest }) =>
      bomItemApi.batchAdd(bomId, body),
    onSuccess: (_d, { bomId }) => invalidate(bomId),
  });
}

export function useDeleteBomItem() {
  const invalidate = useInvalidateBom();
  return useMutation({
    mutationFn: ({ bomId, itemId }: { bomId: string; itemId: string }) =>
      bomItemApi.remove(bomId, itemId),
    onSuccess: (_d, { bomId }) => invalidate(bomId),
  });
}

// ============================================================
//  图纸
// ============================================================

export function useDrawings(query: DrawingListQuery | undefined) {
  return useQuery({
    queryKey: ['drawing', 'list', query],
    queryFn: () => http.get<never, DrawingItem[]>('/drawings', { params: query }),
    enabled: !!query?.projectId,
  });
}

export function useUploadDrawing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, file }: { fields: UploadDrawingFields; file: File }) => {
      const form = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value != null && value !== '') form.append(key, String(value));
      });
      form.append('file', file);
      // 大文件走慢网络时 20s 全局超时不够
      return http.post<never, UploadDrawingResponse>('/drawings', form, { timeout: 120_000 });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drawing', 'list'] });
    },
  });
}

export function useVoidDrawing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.patch<never, { ok: true }>(`/drawings/${id}/void`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drawing', 'list'] });
    },
  });
}

/**
 * 下载/预览图纸。走带 Cookie 的 XHR 拿 Blob（响应拦截器对 Blob 原样透传），
 * 再经 ObjectURL 触发浏览器行为——预览开新标签，下载落文件。
 * 后端在该接口上记 drawing.download 审计。
 */
export async function downloadDrawing(
  drawing: Pick<DrawingItem, 'id' | 'fileName'>,
  inline = false,
): Promise<void> {
  const blob = await http.get<never, Blob>(`/drawings/${drawing.id}/download`, {
    responseType: 'blob',
    params: inline ? { inline: '1' } : undefined,
    timeout: 120_000,
  });
  const url = URL.createObjectURL(blob);
  if (inline) {
    window.open(url, '_blank', 'noopener');
    // 新标签页需要时间从 ObjectURL 加载，延迟回收
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = drawing.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}
