import { useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, EditOutlined, ImportOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ARRIVAL_TYPE_LABEL,
  ArrivalType,
  PO_STATUS_LABEL,
  REQUISITION_STATUS_LABEL,
  REQUISITION_TYPE_LABEL,
  RequisitionStatus,
  RequisitionType,
  type ArrivalRow,
  type PoItemRow,
  type RequisitionRow,
  type StockRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useArrivals,
  useCancelRequisition,
  useConfirmRequisition,
  useCreateRequisition,
  useImportArrivals,
  useImportPo,
  useImportStocks,
  usePoItems,
  useRequisitions,
  useStocks,
  useUpdatePoItem,
} from '@/api/material';
import { useProjects } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { PasteImportModal, splitTsv, toNumber } from '../PasteImportModal';

const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');

/** 项目筛选下拉（全 Tab 共用）。 */
function useProjectOptions() {
  const { data } = useProjects({ page: 1, pageSize: 100 });
  return useMemo(
    () =>
      (data?.items ?? [])
        .filter((p) => p.status !== 'VOIDED')
        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [data],
  );
}

// ============================================================
//  采购订单 Tab
// ============================================================

function PoTab({ canWrite }: { canWrite: boolean }) {
  const { message } = App.useApp();
  const projectOptions = useProjectOptions();
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [inTransitOnly, setInTransitOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePoItems({
    projectId,
    keyword: keyword || undefined,
    inTransitOnly: inTransitOnly || undefined,
    page,
    pageSize: 20,
  });

  const importMut = useImportPo();
  const updateMut = useUpdatePoItem();
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PoItemRow | null>(null);
  const [form] = Form.useForm<{ expectedDate: dayjs.Dayjs | null; riskNote: string | null }>();

  const handleUpdate = async () => {
    const values = await form.validateFields();
    try {
      await updateMut.mutateAsync({
        id: editing!.id,
        body: {
          expectedDate: values.expectedDate?.toISOString() ?? null,
          riskNote: values.riskNote ?? null,
        },
      });
      message.success('已更新');
      setEditing(null);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '更新失败');
    }
  };

  const columns: ColumnsType<PoItemRow> = [
    { title: '采购单号', dataIndex: 'orderNo', width: 130 },
    { title: '供应商', dataIndex: 'supplierName', width: 140, render: (v) => v ?? '—' },
    { title: '物料编码', dataIndex: 'materialCode', width: 130 },
    { title: '名称', dataIndex: 'materialName', width: 140, render: (v) => v ?? '—' },
    { title: '订购', dataIndex: 'quantity', width: 80, align: 'right' },
    { title: '已到', dataIndex: 'arrivedQuantity', width: 80, align: 'right' },
    {
      title: '在途',
      dataIndex: 'inTransitQuantity',
      width: 80,
      align: 'right',
      render: (v: number) => (v > 0 ? <span className="font-medium text-amber-600">{v}</span> : 0),
    },
    {
      title: '预计到货',
      dataIndex: 'expectedDate',
      width: 120,
      render: (v: string | null, row) => (
        <span className={row.delayed ? 'font-medium text-red-500' : ''}>
          {fmtDate(v)}
          {row.delayed && ' (逾期)'}
        </span>
      ),
    },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 130,
      render: (v) => v ?? <Tag>通用</Tag>,
    },
    { title: '状态', dataIndex: 'poStatus', width: 80, render: (v: PoItemRow['poStatus']) => PO_STATUS_LABEL[v] },
    {
      title: '风险备注',
      dataIndex: 'riskNote',
      ellipsis: true,
      render: (v) => (v ? <Tooltip title={v}><Tag color="orange">{v}</Tag></Tooltip> : '—'),
    },
    ...(canWrite
      ? [
          {
            title: '操作',
            width: 70,
            render: (_: unknown, row: PoItemRow) => (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(row);
                  form.setFieldsValue({
                    expectedDate: row.expectedDate ? dayjs(row.expectedDate) : null,
                    riskNote: row.riskNote,
                  });
                }}
              />
            ),
          } satisfies ColumnsType<PoItemRow>[number],
        ]
      : []),
  ];

  return (
    <div>
      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="全部项目"
          style={{ width: 220 }}
          options={projectOptions}
          value={projectId}
          onChange={(v) => { setProjectId(v); setPage(1); }}
        />
        <Input.Search
          allowClear
          placeholder="单号 / 供应商 / 物料"
          style={{ width: 220 }}
          onSearch={(v) => { setKeyword(v.trim()); setPage(1); }}
        />
        <Select
          value={inTransitOnly}
          style={{ width: 130 }}
          onChange={(v) => { setInTransitOnly(v); setPage(1); }}
          options={[
            { value: false, label: '全部明细' },
            { value: true, label: '仅在途' },
          ]}
        />
        {canWrite && (
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            导入采购订单
          </Button>
        )}
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
        }}
      />

      <Modal
        open={!!editing}
        title={`维护交期：${editing?.orderNo} / ${editing?.materialCode}`}
        okText="保存"
        confirmLoading={updateMut.isPending}
        onOk={() => void handleUpdate()}
        onCancel={() => setEditing(null)}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="expectedDate" label="预计到货日期">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="riskNote" label="交期风险备注">
            <Input.TextArea rows={3} placeholder="如：供应商产能紧张，预计延期两周" />
          </Form.Item>
        </Form>
      </Modal>

      <PasteImportModal
        open={importOpen}
        title="导入采购订单"
        hint="列顺序：采购单号、供应商、下单日期、物料编码、物料名称、数量、已到数量、预计到货日期、项目编号。单号+物料编码相同则覆盖更新；项目编号留空为通用采购。"
        loading={importMut.isPending}
        parse={(text) =>
          splitTsv(text)
            .map(([orderNo, supplierName, orderDate, materialCode, materialName, qty, arrived, expected, projectCode]) => ({
              orderNo: orderNo ?? '',
              supplierName: supplierName || undefined,
              orderDate: orderDate ? dayjs(orderDate).toISOString() : undefined,
              materialCode: materialCode ?? '',
              materialName: materialName || undefined,
              quantity: toNumber(qty, 0),
              arrivedQuantity: arrived ? toNumber(arrived, 0) : undefined,
              expectedDate: expected ? dayjs(expected).toISOString() : undefined,
              projectCode: projectCode || undefined,
            }))
            .filter((r) => r.orderNo && r.materialCode && r.quantity > 0)
        }
        onImport={(rows) => importMut.mutateAsync({ items: rows })}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

// ============================================================
//  到货记录 Tab
// ============================================================

function ArrivalTab({ canWrite }: { canWrite: boolean }) {
  const projectOptions = useProjectOptions();
  const [projectId, setProjectId] = useState<string>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useArrivals({ projectId, page, pageSize: 20 });
  const importMut = useImportArrivals();
  const [importOpen, setImportOpen] = useState(false);

  const columns: ColumnsType<ArrivalRow> = [
    { title: '物料编码', dataIndex: 'materialCode', width: 140 },
    { title: '数量', dataIndex: 'quantity', width: 90, align: 'right' },
    {
      title: '类型',
      dataIndex: 'type',
      width: 110,
      render: (v: ArrivalRow['type']) =>
        v === ArrivalType.ARRIVED ? <Tag color="gold">{ARRIVAL_TYPE_LABEL[v]}</Tag> : <Tag color="green">{ARRIVAL_TYPE_LABEL[v]}</Tag>,
    },
    { title: '到货日期', dataIndex: 'arrivedAt', width: 120, render: fmtDate },
    { title: '采购单号', dataIndex: 'orderNo', width: 130, render: (v) => v ?? '—' },
    { title: '项目', dataIndex: 'projectCode', width: 130, render: (v) => v ?? <Tag>通用</Tag> },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v) => v ?? '—' },
  ];

  return (
    <div>
      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="全部项目"
          style={{ width: 220 }}
          options={projectOptions}
          value={projectId}
          onChange={(v) => { setProjectId(v); setPage(1); }}
        />
        {canWrite && (
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            导入到货记录
          </Button>
        )}
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
        }}
      />

      <PasteImportModal
        open={importOpen}
        title="导入到货记录"
        hint="列顺序：采购单号（可空）、物料编码、数量、到货日期、类型（到货/入库）、项目编号、备注。带单号时自动累加该采购明细的已到货量。"
        loading={importMut.isPending}
        parse={(text) =>
          splitTsv(text)
            .map(([orderNo, materialCode, qty, arrivedAt, type, projectCode, remark]) => ({
              orderNo: orderNo || undefined,
              materialCode: materialCode ?? '',
              quantity: toNumber(qty, 0),
              arrivedAt: arrivedAt ? dayjs(arrivedAt).toISOString() : dayjs().toISOString(),
              type: type && /入库/.test(type) ? ArrivalType.INBOUND : ArrivalType.ARRIVED,
              projectCode: projectCode || undefined,
              remark: remark || undefined,
            }))
            .filter((r) => r.materialCode && r.quantity > 0)
        }
        onImport={(rows) => importMut.mutateAsync({ items: rows })}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

// ============================================================
//  库存快照 Tab
// ============================================================

function StockTab({ canWrite }: { canWrite: boolean }) {
  const projectOptions = useProjectOptions();
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStocks({ projectId, keyword: keyword || undefined, page, pageSize: 20 });
  const importMut = useImportStocks();
  const [importOpen, setImportOpen] = useState(false);

  const syncedAt = data?.items[0]?.syncedAt;

  const columns: ColumnsType<StockRow> = [
    { title: '物料编码', dataIndex: 'materialCode', width: 150 },
    { title: '名称', dataIndex: 'materialName', width: 160, render: (v) => v ?? <Tag color="orange">未建档</Tag> },
    { title: '项目', dataIndex: 'projectCode', width: 140, render: (v) => v ?? <Tag>通用</Tag> },
    { title: '账面数量', dataIndex: 'quantity', width: 100, align: 'right' },
    { title: '可用数量', dataIndex: 'availableQuantity', width: 100, align: 'right' },
    { title: '同步时间', dataIndex: 'syncedAt', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
  ];

  return (
    <div>
      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="全部项目"
          style={{ width: 220 }}
          options={projectOptions}
          value={projectId}
          onChange={(v) => { setProjectId(v); setPage(1); }}
        />
        <Input.Search
          allowClear
          placeholder="物料编码"
          style={{ width: 200 }}
          onSearch={(v) => { setKeyword(v.trim()); setPage(1); }}
        />
        {canWrite && (
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            导入库存快照
          </Button>
        )}
        {syncedAt && (
          <span className="text-sm text-slate-400">最近同步：{dayjs(syncedAt).format('YYYY-MM-DD HH:mm')}</span>
        )}
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
        }}
      />

      <PasteImportModal
        open={importOpen}
        title="导入库存快照"
        hint="列顺序：物料编码、项目编号（留空为通用库存）、账面数量、可用数量（留空取账面数量）。注意：导入会整体覆盖现有快照——库存账务以 ERP 为准，MES 只存快照。"
        loading={importMut.isPending}
        parse={(text) =>
          splitTsv(text)
            .map(([materialCode, projectCode, qty, available]) => ({
              materialCode: materialCode ?? '',
              projectCode: projectCode || undefined,
              quantity: toNumber(qty, 0),
              availableQuantity: available ? toNumber(available, 0) : undefined,
            }))
            .filter((r) => r.materialCode)
        }
        onImport={(rows) => importMut.mutateAsync({ items: rows })}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

// ============================================================
//  领料/退料 Tab
// ============================================================

function RequisitionTab() {
  const { message } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('requisition:write'));
  const canConfirm = useAuthStore((s) => s.hasPermission('requisition:confirm'));

  const projectOptions = useProjectOptions();
  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<RequisitionStatus>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useRequisitions({ projectId, status, page, pageSize: 20 });

  const createMut = useCreateRequisition();
  const confirmMut = useConfirmRequisition();
  const cancelMut = useCancelRequisition();

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<{ projectId: string; materialCode: string; quantity: number; type: RequisitionType; remark?: string }>();

  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      const { code } = await createMut.mutateAsync(values);
      message.success(`已创建领料单 ${code}，等待仓库确认`);
      setCreateOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '创建失败');
    }
  };

  const act = async (fn: Promise<unknown>, ok: string) => {
    try {
      await fn;
      message.success(ok);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const columns: ColumnsType<RequisitionRow> = [
    { title: '单号', dataIndex: 'code', width: 150 },
    { title: '项目', dataIndex: 'projectCode', width: 140 },
    { title: '物料编码', dataIndex: 'materialCode', width: 140 },
    { title: '数量', dataIndex: 'quantity', width: 90, align: 'right' },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (v: RequisitionRow['type']) =>
        v === RequisitionType.RETURN ? <Tag color="purple">{REQUISITION_TYPE_LABEL[v]}</Tag> : REQUISITION_TYPE_LABEL[v],
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: RequisitionRow['status']) => {
        const color = v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'default';
        return <Tag color={color}>{REQUISITION_STATUS_LABEL[v]}</Tag>;
      },
    },
    { title: '申请人', dataIndex: 'requestedByName', width: 100, render: (v) => v ?? '—' },
    { title: '确认人', dataIndex: 'confirmedByName', width: 100, render: (v) => v ?? '—' },
    { title: '申请时间', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      width: 130,
      render: (_, row) =>
        row.status === 'DRAFT' ? (
          <Space size={0}>
            {canConfirm && (
              <Popconfirm title="确认该单据？确认后计入齐套「已领料」" onConfirm={() => void act(confirmMut.mutateAsync(row.id), '已确认')}>
                <Button type="link" size="small" icon={<CheckOutlined />}>确认</Button>
              </Popconfirm>
            )}
            {canWrite && (
              <Popconfirm title="取消该单据？" onConfirm={() => void act(cancelMut.mutateAsync(row.id), '已取消')}>
                <Button type="link" size="small" danger icon={<StopOutlined />} />
              </Popconfirm>
            )}
          </Space>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="全部项目"
          style={{ width: 220 }}
          options={projectOptions}
          value={projectId}
          onChange={(v) => { setProjectId(v); setPage(1); }}
        />
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 130 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={Object.entries(REQUISITION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            发起领料/退料
          </Button>
        )}
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
        }}
      />

      <Modal
        open={createOpen}
        title="发起领料/退料"
        okText="提交"
        confirmLoading={createMut.isPending}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={form} layout="vertical" className="mt-4" initialValues={{ type: RequisitionType.ISSUE }}>
          <Form.Item name="projectId" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select options={projectOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <div className="grid grid-cols-3 gap-x-4">
            <Form.Item name="materialCode" label="物料编码" className="col-span-2" rules={[{ required: true, message: '请输入编码' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber min={0.001} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="type" label="类型">
            <Select
              options={Object.entries(REQUISITION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============================================================
//  页面
// ============================================================

/** 供应数据（M6）：采购订单镜像 / 到货 / 库存快照 / 领料退料。 */
export default function SupplyPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('supply:write'));

  return (
    <PageContainer
      title="供应数据"
      subtitle="一期 ERP 未接入：采购、到货、库存经 Excel 导入进入，导入记录写接口日志；领料由仓库确认后计入齐套。"
    >
      <Tabs
        items={[
          { key: 'po', label: '采购订单', children: <PoTab canWrite={canWrite} /> },
          { key: 'arrival', label: '到货记录', children: <ArrivalTab canWrite={canWrite} /> },
          { key: 'stock', label: '库存快照', children: <StockTab canWrite={canWrite} /> },
          { key: 'requisition', label: '领料/退料', children: <RequisitionTab /> },
        ]}
      />
    </PageContainer>
  );
}
