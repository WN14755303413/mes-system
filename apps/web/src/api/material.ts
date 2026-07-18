import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArrivalListQuery,
  ArrivalRow,
  CreateRequisitionRequest,
  ImportArrivalsRequest,
  ImportMaterialsRequest,
  ImportPoRequest,
  ImportResult,
  ImportStocksRequest,
  KittingOverviewItem,
  KittingResult,
  MaterialItem,
  MaterialListQuery,
  PageResult,
  PoItemListQuery,
  PoItemRow,
  RequisitionListQuery,
  RequisitionRow,
  SaveMaterialRequest,
  StockListQuery,
  StockRow,
  UpdatePoItemRequest,
} from '@mes/shared';
import { http } from './client';

// ============================================================
//  物料主数据
// ============================================================

export function useMaterials(query: MaterialListQuery) {
  return useQuery({
    queryKey: ['material', 'list', query],
    queryFn: () => http.get<never, PageResult<MaterialItem>>('/materials', { params: query }),
  });
}

function useInvalidateMaterials() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['material', 'list'] });
}

export function useSaveMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveMaterialRequest }) =>
      id
        ? http.patch<never, { ok: true }>(`/materials/${id}`, body).then(() => undefined)
        : http.post<never, { id: string }>('/materials', body).then(() => undefined),
    onSuccess: () => invalidate(),
  });
}

export function useImportMaterials() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: (body: ImportMaterialsRequest) =>
      http.post<never, ImportResult>('/materials/import', body),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  供应数据：采购 / 到货 / 库存
// ============================================================

export function usePoItems(query: PoItemListQuery) {
  return useQuery({
    queryKey: ['supply', 'po', query],
    queryFn: () => http.get<never, PageResult<PoItemRow>>('/supply/po-items', { params: query }),
  });
}

export function useArrivals(query: ArrivalListQuery) {
  return useQuery({
    queryKey: ['supply', 'arrival', query],
    queryFn: () => http.get<never, PageResult<ArrivalRow>>('/supply/arrivals', { params: query }),
  });
}

export function useStocks(query: StockListQuery) {
  return useQuery({
    queryKey: ['supply', 'stock', query],
    queryFn: () => http.get<never, PageResult<StockRow>>('/supply/stocks', { params: query }),
  });
}

/** 供应数据任一写操作后，齐套结果也已过期，一并失效。 */
function useInvalidateSupply() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['supply'] });
    void qc.invalidateQueries({ queryKey: ['kitting'] });
  };
}

export function useImportPo() {
  const invalidate = useInvalidateSupply();
  return useMutation({
    mutationFn: (body: ImportPoRequest) =>
      http.post<never, ImportResult>('/supply/po/import', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePoItem() {
  const invalidate = useInvalidateSupply();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePoItemRequest }) =>
      http.patch<never, { ok: true }>(`/supply/po-items/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useImportArrivals() {
  const invalidate = useInvalidateSupply();
  return useMutation({
    mutationFn: (body: ImportArrivalsRequest) =>
      http.post<never, ImportResult>('/supply/arrivals/import', body),
    onSuccess: () => invalidate(),
  });
}

export function useImportStocks() {
  const invalidate = useInvalidateSupply();
  return useMutation({
    mutationFn: (body: ImportStocksRequest) =>
      http.post<never, ImportResult>('/supply/stocks/import', body),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  领料/退料
// ============================================================

export function useRequisitions(query: RequisitionListQuery) {
  return useQuery({
    queryKey: ['requisition', 'list', query],
    queryFn: () =>
      http.get<never, PageResult<RequisitionRow>>('/requisitions', { params: query }),
  });
}

function useInvalidateRequisitions() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['requisition'] });
    void qc.invalidateQueries({ queryKey: ['kitting'] });
  };
}

export function useCreateRequisition() {
  const invalidate = useInvalidateRequisitions();
  return useMutation({
    mutationFn: (body: CreateRequisitionRequest) =>
      http.post<never, { id: string; code: string }>('/requisitions', body),
    onSuccess: () => invalidate(),
  });
}

export function useConfirmRequisition() {
  const invalidate = useInvalidateRequisitions();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/requisitions/${id}/confirm`, {}),
    onSuccess: () => invalidate(),
  });
}

export function useCancelRequisition() {
  const invalidate = useInvalidateRequisitions();
  return useMutation({
    mutationFn: (id: string) => http.post<never, { ok: true }>(`/requisitions/${id}/cancel`, {}),
    onSuccess: () => invalidate(),
  });
}

// ============================================================
//  齐套计算
// ============================================================

export function useKittingOverview() {
  return useQuery({
    queryKey: ['kitting', 'overview'],
    queryFn: () => http.get<never, KittingOverviewItem[]>('/kitting/overview'),
  });
}

export function useProjectKitting(projectId: string | undefined) {
  return useQuery({
    queryKey: ['kitting', 'project', projectId],
    queryFn: () => http.get<never, KittingResult>(`/kitting/projects/${projectId}`),
    enabled: !!projectId,
  });
}
