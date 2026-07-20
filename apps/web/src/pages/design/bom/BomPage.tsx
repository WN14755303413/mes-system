import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  ForkOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  BOM_STATUS_LABEL,
  BOM_STATUS_TRANSITIONS,
  BomStatus,
  DrawingStatus,
  type BomItemRow,
  type BomVersionItem,
  type SaveBomItemRequest,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useBatchAddBomItems,
  useBomDetail,
  useBoms,
  useChangeBomStatus,
  useCreateBom,
  useDeleteBom,
  useDeleteBomItem,
  useDrawings,
  useSaveBomItem,
} from '@/api/bom';
import { useProjects } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';

export const BOM_STATUS_COLOR: Record<BomStatus, string> = {
  DRAFT: 'default',
  RELEASED: 'green',
  FROZEN: 'geekblue',
  CHANGING: 'gold',
  VOIDED: 'red',
};

/** 手动状态按钮的文案。CHANGING 不在其中——它只能由「发起变更」进入。 */
const STATUS_ACTION_LABEL: Partial<Record<BomStatus, string>> = {
  RELEASED: '发布',
  FROZEN: '冻结',
  VOIDED: '作废',
};

const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—');

export default function BomPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('bom:write'));
  const canRelease = useAuthStore((s) => s.hasPermission('bom:release'));

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const [projectId, setProjectId] = useState<string>();
  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? [])
        .filter((p) => p.status !== 'VOIDED')
        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const effectiveProjectId = projectId ?? projectOptions[0]?.value;

  const { data: boms, isFetching } = useBoms(effectiveProjectId);
  const [selectedBomId, setSelectedBomId] = useState<string>();
  // 选中版本被删除/切换项目后自动落回第一个版本
  const effectiveBomId = boms?.some((b) => b.id === selectedBomId)
    ? selectedBomId
    : boms?.[0]?.id;

  return (
    <PageContainer
      title="项目 BOM"
      subtitle="BOM 版本管理与 ECO 变更。草稿仅设计人员可见；现场只能看到已发布或已冻结版本，发布后明细锁定，改动须发起变更派生新版本。"
    >
      <div className="mb-4">
        <Select
          className="!w-80"
          placeholder="选择项目"
          showSearch
          optionFilterProp="label"
          value={effectiveProjectId}
          onChange={(v) => {
            setProjectId(v);
            setSelectedBomId(undefined);
          }}
          options={projectOptions}
        />
      </div>

      {!effectiveProjectId ? (
        <Empty description="请先在上方选择项目" />
      ) : (
        <>
          <VersionTable
            projectId={effectiveProjectId}
            boms={boms ?? []}
            loading={isFetching}
            selectedBomId={effectiveBomId}
            onSelect={setSelectedBomId}
            canWrite={canWrite}
            canRelease={canRelease}
          />
          {effectiveBomId && (
            <ItemPanel projectId={effectiveProjectId} bomId={effectiveBomId} canWrite={canWrite} />
          )}
        </>
      )}
    </PageContainer>
  );
}

// ============================================================
//  版本列表
// ============================================================

function VersionTable({
  projectId,
  boms,
  loading,
  selectedBomId,
  onSelect,
  canWrite,
  canRelease,
}: {
  projectId: string;
  boms: BomVersionItem[];
  loading: boolean;
  selectedBomId: string | undefined;
  onSelect: (id: string) => void;
  canWrite: boolean;
  canRelease: boolean;
}) {
  const { message, modal } = App.useApp();
  const createBom = useCreateBom();
  const changeStatus = useChangeBomStatus();
  const deleteBom = useDeleteBom();

  const [createOpen, setCreateOpen] = useState(false);
  const [ecoSource, setEcoSource] = useState<BomVersionItem | null>(null);
  const [form] = Form.useForm();

  const existingVersions = useMemo(() => new Set(boms.map((b) => b.version)), [boms]);

  const openCreate = () => {
    setEcoSource(null);
    form.resetFields();
    setCreateOpen(true);
  };

  /** 发起变更：从已发布/冻结版本派生新草稿，建议次版本 +1。 */
  const openEco = (source: BomVersionItem) => {
    setEcoSource(source);
    form.resetFields();
    form.setFieldsValue({ version: suggestMinorBump(source.version, existingVersions) });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const v = await form.validateFields();
    try {
      const created = await createBom.mutateAsync({
        projectId,
        version: v.version || undefined,
        sourceBomId: ecoSource?.id,
        changeReason: v.changeReason || undefined,
        remark: v.remark || null,
      });
      message.success(`已创建版本 ${created.version}`);
      setCreateOpen(false);
      onSelect(created.id);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '创建失败');
    }
  };

  const confirmTransition = (bom: BomVersionItem, target: BomStatus) => {
    const label =
      bom.status === BomStatus.CHANGING && target === BomStatus.RELEASED
        ? '恢复发布'
        : (STATUS_ACTION_LABEL[target] ?? BOM_STATUS_LABEL[target]);
    const hint: Partial<Record<BomStatus, string>> = {
      RELEASED:
        bom.status === BomStatus.DRAFT
          ? '发布后明细锁定、现场可见；如该版本由变更派生，旧版本将自动作废。'
          : '将取消在途变更，恢复本版本为现场有效版本。',
      FROZEN: '冻结表示锁定用于生产，解锁改动须发起变更。',
      VOIDED: '作废后现场不可见且不可恢复；如本版本是变更草稿，其源版本将恢复有效。',
    };
    modal.confirm({
      title: `${label}版本 ${bom.version}？`,
      content: hint[target],
      okText: label,
      okButtonProps: target === BomStatus.VOIDED ? { danger: true } : undefined,
      onOk: () =>
        changeStatus
          .mutateAsync({ id: bom.id, status: target })
          .then(() => message.success(`已${label}`))
          .catch((err) => message.error(isApiError(err) ? err.message : '操作失败')),
    });
  };

  const columns: ColumnsType<BomVersionItem> = [
    {
      title: '版本',
      dataIndex: 'version',
      width: 90,
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: BomStatus) => <Tag color={BOM_STATUS_COLOR[s]}>{BOM_STATUS_LABEL[s]}</Tag>,
    },
    { title: '明细行数', dataIndex: 'itemCount', width: 90, align: 'right' },
    {
      title: '变更信息',
      ellipsis: true,
      render: (_: unknown, b) =>
        b.sourceVersion ? (
          <Tooltip title={b.changeReason}>
            <span>
              由 {b.sourceVersion} 变更：{b.changeReason ?? '—'}
            </span>
          </Tooltip>
        ) : (
          <span className="text-gray-400">初始版本</span>
        ),
    },
    {
      title: '发布',
      width: 180,
      render: (_: unknown, b) =>
        b.releasedAt ? `${b.releasedByName ?? '—'} · ${fmtTime(b.releasedAt)}` : '—',
    },
    { title: '创建', dataIndex: 'createdAt', width: 150, render: fmtTime },
    ...(canWrite || canRelease
      ? [
          {
            title: '操作',
            width: 260,
            render: (_: unknown, b: BomVersionItem) => {
              const targets = (BOM_STATUS_TRANSITIONS[b.status] ?? []).filter(
                (t) => t !== BomStatus.CHANGING,
              );
              return (
                <Space size={4} wrap>
                  {canRelease &&
                    targets.map((t) => (
                      <Button
                        key={t}
                        size="small"
                        danger={t === BomStatus.VOIDED}
                        onClick={() => confirmTransition(b, t)}
                      >
                        {b.status === BomStatus.CHANGING && t === BomStatus.RELEASED
                          ? '恢复发布'
                          : STATUS_ACTION_LABEL[t]}
                      </Button>
                    ))}
                  {canWrite &&
                    (b.status === BomStatus.RELEASED || b.status === BomStatus.FROZEN) && (
                      <Button size="small" icon={<ForkOutlined />} onClick={() => openEco(b)}>
                        发起变更
                      </Button>
                    )}
                  {canWrite && b.status === BomStatus.DRAFT && (
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: `删除草稿版本 ${b.version}？`,
                          content: '明细一并删除；如为变更草稿，源版本恢复有效。',
                          okText: '删除',
                          okButtonProps: { danger: true },
                          onOk: () =>
                            deleteBom
                              .mutateAsync(b.id)
                              .then(() => message.success('已删除'))
                              .catch((err) =>
                                message.error(isApiError(err) ? err.message : '删除失败'),
                              ),
                        })
                      }
                    />
                  )}
                </Space>
              );
            },
          } satisfies ColumnsType<BomVersionItem>[number],
        ]
      : []),
  ];

  return (
    <div>
      {canWrite && (
        <div className="mb-3 flex justify-end">
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            新建版本
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={boms}
        pagination={false}
        rowClassName={(b) => (b.id === selectedBomId ? 'ant-table-row-selected' : '')}
        onRow={(b) => ({ onClick: () => onSelect(b.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description="暂无 BOM 版本" /> }}
      />

      <Modal
        maskClosable={false}
        keyboard={false}
        title={ecoSource ? `发起变更（源版本 ${ecoSource.version}）` : '新建 BOM 版本'}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        confirmLoading={createBom.isPending}
      >
        {/* 不能 destroyOnClose：openEco 在弹窗打开前 setFieldsValue，销毁重挂会丢值 */}
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="version"
            label="版本号"
            extra={ecoSource ? undefined : '留空自动生成（初始 V1.0）'}
            rules={[
              {
                pattern: /^V\d+\.\d+$/,
                message: '格式应为 V主版本.次版本，如 V1.0',
              },
            ]}
          >
            <Input placeholder="如 V1.0" />
          </Form.Item>
          {ecoSource && (
            <Form.Item
              name="changeReason"
              label="变更原因"
              rules={[{ required: true, message: '发起变更必须填写变更原因' }]}
            >
              <Input.TextArea
                rows={3}
                maxLength={500}
                placeholder="如 客户要求泵体材质由 PVDF 改为 PFA，影响管路物料清单"
              />
            </Form.Item>
          )}
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          {ecoSource && (
            <Typography.Text type="secondary" className="text-xs">
              将复制源版本全部明细为新草稿；源版本转入「变更中」，新版本发布时源版本自动作废。
            </Typography.Text>
          )}
        </Form>
      </Modal>
    </div>
  );
}

// ============================================================
//  明细面板（选中版本）
// ============================================================

function ItemPanel({
  projectId,
  bomId,
  canWrite,
}: {
  projectId: string;
  bomId: string;
  canWrite: boolean;
}) {
  const { message, modal } = App.useApp();
  const { data: detail, isFetching } = useBomDetail(bomId);
  const saveItem = useSaveBomItem();
  const deleteItem = useDeleteBomItem();
  const batchAdd = useBatchAddBomItems();

  // 关联图纸下拉：仅本项目的有效图纸
  const { data: drawings } = useDrawings({ projectId });
  const drawingOptions = useMemo(
    () =>
      (drawings ?? [])
        .filter((d) => d.status === DrawingStatus.ACTIVE)
        .map((d) => ({ value: d.id, label: `${d.code} ${d.name}` })),
    [drawings],
  );

  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<BomItemRow | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [form] = Form.useForm();

  const editable = canWrite && detail?.status === BomStatus.DRAFT;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ unit: '件', quantity: 1, isStandard: true });
    setItemOpen(true);
  };

  const openEdit = (row: BomItemRow) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      materialCode: row.materialCode,
      materialName: row.materialName,
      spec: row.spec ?? undefined,
      unit: row.unit,
      quantity: row.quantity,
      isStandard: row.isStandard,
      drawingId: row.drawingId ?? undefined,
      remark: row.remark ?? undefined,
    });
    setItemOpen(true);
  };

  const submitItem = async () => {
    const v = await form.validateFields();
    try {
      await saveItem.mutateAsync({
        bomId,
        itemId: editing?.id,
        body: {
          materialCode: v.materialCode,
          materialName: v.materialName,
          spec: v.spec || null,
          unit: v.unit || '件',
          quantity: v.quantity,
          isStandard: v.isStandard,
          drawingId: v.drawingId || null,
          remark: v.remark || null,
        },
      });
      message.success('已保存');
      setItemOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  const parsedRows = useMemo(() => parsePastedItems(pasteText), [pasteText]);

  const submitPaste = async () => {
    if (!parsedRows.length) {
      message.warning('没有可导入的行，请检查格式');
      return;
    }
    try {
      const { count } = await batchAdd.mutateAsync({ bomId, body: { items: parsedRows } });
      message.success(`已导入 ${count} 行`);
      setPasteOpen(false);
      setPasteText('');
    } catch (err) {
      message.error(isApiError(err) ? err.message : '导入失败');
    }
  };

  const columns: ColumnsType<BomItemRow> = [
    { title: '#', dataIndex: 'seq', width: 60 },
    { title: '物料编码', dataIndex: 'materialCode', width: 160 },
    { title: '物料名称', dataIndex: 'materialName', ellipsis: true },
    { title: '规格型号', dataIndex: 'spec', ellipsis: true, render: (v) => v ?? '—' },
    { title: '单位', dataIndex: 'unit', width: 70 },
    { title: '数量', dataIndex: 'quantity', width: 90, align: 'right' },
    {
      title: '类别',
      dataIndex: 'isStandard',
      width: 80,
      render: (std: boolean) =>
        std ? <Tag>标准件</Tag> : <Tag color="purple">非标件</Tag>,
    },
    {
      title: '关联图纸',
      dataIndex: 'drawingCode',
      width: 120,
      render: (v) => v ?? '—',
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v) => v ?? '—' },
    ...(editable
      ? [
          {
            title: '操作',
            width: 90,
            render: (_: unknown, row: BomItemRow) => (
              <Space size={0}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(row)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: `删除明细「${row.materialName}」？`,
                      okText: '删除',
                      okButtonProps: { danger: true },
                      onOk: () =>
                        deleteItem
                          .mutateAsync({ bomId, itemId: row.id })
                          .then(() => message.success('已删除'))
                          .catch((err) =>
                            message.error(isApiError(err) ? err.message : '删除失败'),
                          ),
                    })
                  }
                />
              </Space>
            ),
          } satisfies ColumnsType<BomItemRow>[number],
        ]
      : []),
  ];

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <Space>
          <Typography.Text strong>
            {detail ? `${detail.version} 明细` : '明细'}
          </Typography.Text>
          {detail && (
            <Tag color={BOM_STATUS_COLOR[detail.status]}>{BOM_STATUS_LABEL[detail.status]}</Tag>
          )}
          {detail && !editable && (
            <Typography.Text type="secondary" className="text-xs">
              {detail.status === BomStatus.DRAFT ? '' : '非草稿版本只读，改动请发起变更'}
            </Typography.Text>
          )}
        </Space>
        {editable && (
          <Space>
            <Button size="small" icon={<SnippetsOutlined />} onClick={() => setPasteOpen(true)}>
              批量粘贴
            </Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
              新增明细
            </Button>
          </Space>
        )}
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        columns={columns}
        dataSource={detail?.items ?? []}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无明细" /> }}
      />

      <Modal
        maskClosable={false}
        keyboard={false}
        title={editing ? '编辑明细' : '新增明细'}
        open={itemOpen}
        onCancel={() => setItemOpen(false)}
        onOk={submitItem}
        confirmLoading={saveItem.isPending}
      >
        {/* 不能 destroyOnClose：openEdit 在弹窗打开前 setFieldsValue，销毁重挂会丢值 */}
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="materialCode"
              label="物料编码"
              rules={[{ required: true, message: '请输入物料编码' }]}
            >
              <Input placeholder="与 ERP 物料编码一致" />
            </Form.Item>
            <Form.Item
              name="materialName"
              label="物料名称"
              rules={[{ required: true, message: '请输入物料名称' }]}
            >
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="spec" label="规格型号">
            <Input />
          </Form.Item>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="unit" label="单位">
              <Input />
            </Form.Item>
            <Form.Item
              name="quantity"
              label="数量"
              rules={[{ required: true, message: '请输入数量' }]}
            >
              <InputNumber className="!w-full" min={0.001} precision={3} />
            </Form.Item>
            <Form.Item name="isStandard" label="类别">
              <Select
                options={[
                  { value: true, label: '标准件' },
                  { value: false, label: '非标件' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="drawingId" label="关联图纸">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择本项目的有效图纸"
              options={drawingOptions}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        maskClosable={false}
        keyboard={false}
        title="批量粘贴导入"
        open={pasteOpen}
        onCancel={() => setPasteOpen(false)}
        onOk={submitPaste}
        okText={`导入 ${parsedRows.length} 行`}
        okButtonProps={{ disabled: !parsedRows.length }}
        confirmLoading={batchAdd.isPending}
        width={720}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" className="!mb-2 text-xs">
          从 Excel 复制后直接粘贴。列顺序：物料编码、物料名称、规格型号、单位、数量、类别（填「否/非标」为非标件，其余为标准件）。后两列可省略。
        </Typography.Paragraph>
        <Input.TextArea
          rows={8}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'M-PUMP-001\t隔膜泵\tPFA DN25\t台\t2\nM-PIPE-018\t管路组件\tPFA 1/2"\t套\t1\t非标'}
        />
        {parsedRows.length > 0 && (
          <Table
            className="mt-3"
            rowKey={(r) => `${r.materialCode}-${r.materialName}`}
            size="small"
            columns={[
              { title: '物料编码', dataIndex: 'materialCode' },
              { title: '名称', dataIndex: 'materialName' },
              { title: '规格', dataIndex: 'spec' },
              { title: '单位', dataIndex: 'unit', width: 60 },
              { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
              {
                title: '类别',
                dataIndex: 'isStandard',
                width: 70,
                render: (v: boolean) => (v ? '标准件' : '非标件'),
              },
            ]}
            dataSource={parsedRows.slice(0, 5)}
            pagination={false}
            footer={
              parsedRows.length > 5 ? () => `… 共 ${parsedRows.length} 行` : undefined
            }
          />
        )}
      </Modal>
    </div>
  );
}

/** 解析 Excel 粘贴的 TSV 文本为明细行。空行与缺编码/名称的行丢弃。 */
function parsePastedItems(text: string): SaveBomItemRequest[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [materialCode, materialName, spec, unit, qty, std] = line
        .split('\t')
        .map((c) => c.trim());
      const quantity = Number(qty);
      return {
        materialCode: materialCode ?? '',
        materialName: materialName ?? '',
        spec: spec || null,
        unit: unit || '件',
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        isStandard: !(std && /否|非标/.test(std)),
      };
    })
    .filter((r) => r.materialCode && r.materialName);
}

/** 建议下一个次版本号：V1.0 → V1.1，已占用则继续 +1。 */
function suggestMinorBump(source: string, existing: Set<string>): string {
  const parsed = /^V(\d+)\.(\d+)$/.exec(source);
  if (!parsed) return '';
  const major = Number(parsed[1]);
  let minor = Number(parsed[2]) + 1;
  while (existing.has(`V${major}.${minor}`)) minor += 1;
  return `V${major}.${minor}`;
}
