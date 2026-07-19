import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AuditOutlined, DeleteOutlined, FilePdfOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  ACCEPTANCE_STATUS_LABEL,
  ACCEPTANCE_TYPE_LABEL,
  AcceptanceStatus,
  AcceptanceType,
  type AcceptanceDetail,
  type AcceptanceItemInput,
  type AcceptanceRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useAcceptanceDetail,
  useAcceptances,
  useConcludeAcceptance,
  useCreateAcceptance,
  useUpdateAcceptance,
  useVoidAcceptance,
} from '@/api/debug';
import { useProjects } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { AcceptanceStatusTag, AcceptanceTypeTag, ItemPassedTag, fmtDate, fmtTime } from '../shared';

/** FAT/SAT 验收（M9，§8.8 / §9.8 / §9.9）。检查项 + 结论门禁 + 报告打印。 */
export default function AcceptancePage() {
  const canWrite = useAuthStore((s) => s.hasPermission('acceptance:write'));
  const navigate = useNavigate();

  const [type, setType] = useState<AcceptanceType>();
  const [status, setStatus] = useState<AcceptanceStatus>();
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useAcceptances({
    type,
    status,
    projectId,
    keyword: keyword || undefined,
    page,
    pageSize,
  });
  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AcceptanceDetail | null>(null);
  const [detailId, setDetailId] = useState<string>();

  const columns: ColumnsType<AcceptanceRow> = [
    {
      title: '单号',
      dataIndex: 'code',
      width: 140,
      render: (v: string, r) => (
        <Button type="link" size="small" className="!px-0 font-mono" onClick={() => setDetailId(r.id)}>
          {v}
        </Button>
      ),
    },
    { title: '类型', dataIndex: 'type', width: 115, render: (v) => <AcceptanceTypeTag type={v} /> },
    { title: '验收对象', dataIndex: 'title', width: 200, ellipsis: true },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string | null, r) => (v ? `${v} ${r.projectName}` : '—'),
    },
    { title: '设备号', dataIndex: 'equipmentNo', width: 130, ellipsis: true, render: (v) => v ?? '—' },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => <AcceptanceStatusTag status={v} /> },
    {
      title: '检查项',
      key: 'items',
      width: 90,
      render: (_, r) =>
        r.itemCount ? `${r.itemCount}${r.failedItemCount ? ` / ${r.failedItemCount} 不符` : ''}` : '—',
    },
    { title: '计划日期', dataIndex: 'plannedAt', width: 100, render: fmtDate },
    { title: '结论人', dataIndex: 'concludedByName', width: 90, render: (v) => v ?? '—' },
    {
      title: '报告',
      key: 'report',
      width: 80,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          className="!px-0"
          icon={<FilePdfOutlined />}
          onClick={() => navigate(`/commissioning/acceptance/report/${r.id}`)}
        >
          报告
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="FAT / SAT 验收"
      subtitle="出厂与客户现场验收：检查项核查 → 出具结论 → 打印验收报告。「通过」前调试问题必须全部闭环。"
      extra={
        canWrite && (
          <Button
            type="primary"
            icon={<AuditOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新建验收单
          </Button>
        )
      }
    >
      <Space className="mb-3" wrap>
        <Select
          allowClear
          placeholder="类型"
          style={{ width: 130 }}
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={Object.entries(ACCEPTANCE_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 115 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(ACCEPTANCE_STATUS_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="全部项目"
          style={{ width: 220 }}
          value={projectId}
          onChange={(v) => {
            setProjectId(v);
            setPage(1);
          }}
          options={projectOptions}
        />
        <Input.Search
          allowClear
          placeholder="单号 / 验收对象 / 设备号"
          style={{ width: 210 }}
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
        />
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        scroll={{ x: 1250 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <AcceptanceFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <AcceptanceDetailDrawer
        id={detailId}
        onClose={() => setDetailId(undefined)}
        onEdit={(detail) => {
          setEditing(detail);
          setFormOpen(true);
        }}
      />
    </PageContainer>
  );
}

interface HeaderFormValues {
  type: AcceptanceType;
  title: string;
  projectId: string;
  equipmentNo?: string;
  plannedAt?: dayjs.Dayjs;
  location?: string;
  customerRep?: string;
  remark?: string;
}

interface EditableItem extends AcceptanceItemInput {
  key: string;
}

let itemKeySeed = 0;
const nextItemKey = () => `acc-item-${++itemKeySeed}`;

const EMPTY_ITEM = (): EditableItem => ({
  key: nextItemKey(),
  name: '',
  standard: null,
  actual: null,
  passed: null,
  remark: null,
});

/** 创建/编辑验收单（编辑仅限验收中）。检查项本地编辑，提交时全量替换。 */
function AcceptanceFormModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: AcceptanceDetail | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<HeaderFormValues>();
  const [items, setItems] = useState<EditableItem[]>([]);
  const create = useCreateAcceptance();
  const update = useUpdateAcceptance();

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        type: editing.type,
        title: editing.title,
        projectId: editing.projectId,
        equipmentNo: editing.equipmentNo ?? undefined,
        plannedAt: editing.plannedAt ? dayjs(editing.plannedAt) : undefined,
        location: editing.location ?? undefined,
        customerRep: editing.customerRep ?? undefined,
        remark: editing.remark ?? undefined,
      });
      setItems(
        editing.items.map((it) => ({
          key: nextItemKey(),
          name: it.name,
          standard: it.standard,
          actual: it.actual,
          passed: it.passed,
          remark: it.remark,
        })),
      );
    } else {
      form.resetFields();
      setItems([EMPTY_ITEM()]);
    }
  }, [open, editing, form]);

  const patchItem = (key: string, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const itemColumns: ColumnsType<EditableItem> = [
    {
      title: '检查项',
      dataIndex: 'name',
      width: 190,
      render: (_, r) => (
        <Input
          size="small"
          value={r.name}
          maxLength={128}
          placeholder="如：UPH 产能验证 / 安全联锁测试"
          onChange={(e) => patchItem(r.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: '验收标准',
      dataIndex: 'standard',
      width: 170,
      render: (_, r) => (
        <Input
          size="small"
          value={r.standard ?? ''}
          maxLength={512}
          onChange={(e) => patchItem(r.key, { standard: e.target.value || null })}
        />
      ),
    },
    {
      title: '实测 / 核查结果',
      dataIndex: 'actual',
      width: 170,
      render: (_, r) => (
        <Input
          size="small"
          value={r.actual ?? ''}
          maxLength={512}
          onChange={(e) => patchItem(r.key, { actual: e.target.value || null })}
        />
      ),
    },
    {
      title: '判定',
      dataIndex: 'passed',
      width: 95,
      render: (_, r) => (
        <Select
          size="small"
          className="w-full"
          value={r.passed === null || r.passed === undefined ? 'NA' : r.passed ? 'PASS' : 'FAIL'}
          onChange={(v) => patchItem(r.key, { passed: v === 'NA' ? null : v === 'PASS' })}
          options={[
            { value: 'NA', label: '未核查' },
            { value: 'PASS', label: '符合' },
            { value: 'FAIL', label: '不符合' },
          ]}
        />
      ),
    },
    {
      title: '',
      key: 'op',
      width: 40,
      render: (_, r) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setItems((prev) => prev.filter((it) => it.key !== r.key))}
        />
      ),
    },
  ];

  const handleOk = async () => {
    const v = await form.validateFields();
    if (items.some((it) => !it.name.trim() && (it.standard || it.actual))) {
      message.warning('存在未填写「检查项」名称的明细行');
      return;
    }
    const payloadItems: AcceptanceItemInput[] = items
      .filter((it) => it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        standard: it.standard?.trim() || null,
        actual: it.actual?.trim() || null,
        passed: it.passed ?? null,
        remark: it.remark?.trim() || null,
      }));

    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: {
            title: v.title,
            equipmentNo: v.equipmentNo || null,
            plannedAt: v.plannedAt ? v.plannedAt.toISOString() : null,
            location: v.location || null,
            customerRep: v.customerRep || null,
            remark: v.remark || null,
            items: payloadItems,
          },
        });
        message.success('验收单已更新');
      } else {
        const created = await create.mutateAsync({
          type: v.type,
          title: v.title,
          projectId: v.projectId,
          equipmentNo: v.equipmentNo || null,
          plannedAt: v.plannedAt ? v.plannedAt.toISOString() : null,
          location: v.location || null,
          customerRep: v.customerRep || null,
          remark: v.remark || null,
          items: payloadItems,
        });
        message.success(`验收单 ${created.code} 已创建`);
      }
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  return (
    <Modal
      open={open}
      width={900}
      title={editing ? `编辑验收单 ${editing.code}` : '新建验收单'}
      okText={editing ? '保存' : '创建'}
      confirmLoading={create.isPending || update.isPending}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" className="mt-2">
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="type" label="验收类型" initialValue={AcceptanceType.FAT}>
            <Select
              disabled={!!editing}
              options={Object.entries(ACCEPTANCE_TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="验收对象说明"
            rules={[{ required: true, message: '请填写验收对象' }]}
          >
            <Input maxLength={128} placeholder="如：单片清洗机 #01 FAT 出厂验收" />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="projectId"
              label="所属项目"
              rules={[{ required: true, message: '验收单必须关联项目' }]}
            >
              <Select showSearch optionFilterProp="label" options={projectOptions} placeholder="必选" />
            </Form.Item>
          )}
          <Form.Item name="equipmentNo" label="设备编号">
            <Input maxLength={64} placeholder="多台设备各出各的验收单与报告" />
          </Form.Item>
          <Form.Item name="plannedAt" label="计划验收日期">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="location" label="验收地点">
            <Input maxLength={256} placeholder="FAT 厂内 / SAT 客户现场" />
          </Form.Item>
          <Form.Item name="customerRep" label="客户代表">
            <Input maxLength={64} placeholder="可选，签字记录" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input maxLength={2000} placeholder="可选" />
          </Form.Item>
        </div>
      </Form>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">验收检查项（{items.length}）</span>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setItems((prev) => [...prev, EMPTY_ITEM()])}>
          添加检查项
        </Button>
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={itemColumns}
        dataSource={items}
        pagination={false}
        scroll={{ y: 260 }}
        locale={{ emptyText: '暂无检查项，可直接创建后再补充' }}
      />
    </Modal>
  );
}

/** 详情抽屉：单头 + 检查项 + 出具结论（含门禁提示）/ 作废 / 报告入口。 */
function AcceptanceDetailDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: string | undefined;
  onClose: () => void;
  onEdit: (detail: AcceptanceDetail) => void;
}) {
  const { message } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('acceptance:write'));
  const navigate = useNavigate();

  const { data: row, isLoading } = useAcceptanceDetail(id);
  const conclude = useConcludeAcceptance();
  const voidMutation = useVoidAcceptance();

  const [concludeOpen, setConcludeOpen] = useState(false);
  const [result, setResult] = useState<'PASSED' | 'CONDITIONAL' | 'FAILED'>('PASSED');
  const [conclusion, setConclusion] = useState('');

  const pending = row?.status === AcceptanceStatus.PENDING;

  const handleConclude = async () => {
    if (!row) return;
    if (result === 'CONDITIONAL' && !conclusion.trim()) {
      message.warning('「有条件通过」必须写明遗留问题与整改期限');
      return;
    }
    try {
      await conclude.mutateAsync({
        id: row.id,
        body: { result, conclusion: conclusion.trim() || null },
      });
      message.success(`已出具结论：${ACCEPTANCE_STATUS_LABEL[result]}`);
      setConcludeOpen(false);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const itemColumns: ColumnsType<AcceptanceDetail['items'][number]> = [
    { title: '#', dataIndex: 'seq', width: 45 },
    { title: '检查项', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '验收标准', dataIndex: 'standard', width: 150, render: (v) => v ?? '—' },
    { title: '实测 / 核查', dataIndex: 'actual', width: 150, render: (v) => v ?? '—' },
    { title: '判定', dataIndex: 'passed', width: 85, render: (v) => <ItemPassedTag passed={v} /> },
  ];

  return (
    <Drawer
      open={!!id}
      width={680}
      title={row ? `${row.code} ${row.title}` : '验收单详情'}
      onClose={onClose}
      loading={isLoading}
      extra={
        row && (
          <Space wrap>
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              onClick={() => navigate(`/commissioning/acceptance/report/${row.id}`)}
            >
              验收报告
            </Button>
            {canWrite && pending && (
              <>
                <Button size="small" onClick={() => onEdit(row)}>
                  编辑
                </Button>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setResult('PASSED');
                    setConclusion(row.conclusion ?? '');
                    setConcludeOpen(true);
                  }}
                >
                  出具结论
                </Button>
                <Popconfirm
                  title="作废该验收单？"
                  onConfirm={() =>
                    void voidMutation
                      .mutateAsync(row.id)
                      .then(() => message.success('已作废'))
                      .catch((e: unknown) => message.error(isApiError(e) ? e.message : '操作失败'))
                  }
                >
                  <Button size="small" danger loading={voidMutation.isPending}>
                    作废
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        )
      }
    >
      {row && (
        <div className="space-y-4">
          <Descriptions
            size="small"
            column={2}
            items={[
              { key: 'type', label: '类型', children: <AcceptanceTypeTag type={row.type} /> },
              { key: 'status', label: '状态', children: <AcceptanceStatusTag status={row.status} /> },
              {
                key: 'project',
                label: '项目',
                children: row.projectCode ? `${row.projectCode} ${row.projectName}` : '—',
              },
              { key: 'equipment', label: '设备编号', children: row.equipmentNo ?? '—' },
              { key: 'customer', label: '客户', children: row.customerName ?? '—' },
              { key: 'customerRep', label: '客户代表', children: row.customerRep ?? '—' },
              { key: 'plannedAt', label: '计划日期', children: fmtDate(row.plannedAt) },
              { key: 'location', label: '验收地点', children: row.location ?? '—' },
              { key: 'createdBy', label: '创建人', children: row.createdByName ?? '—' },
              ...(row.concludedAt
                ? [
                    {
                      key: 'concluded',
                      label: '结论',
                      children: `${row.concludedByName ?? ''} ${fmtTime(row.concludedAt)}`,
                    },
                  ]
                : []),
              ...(row.remark ? [{ key: 'remark', label: '备注', children: row.remark }] : []),
            ]}
          />

          {row.conclusion && (
            <Alert
              type={
                row.status === AcceptanceStatus.PASSED
                  ? 'success'
                  : row.status === AcceptanceStatus.FAILED
                    ? 'error'
                    : 'warning'
              }
              showIcon
              message="验收结论说明"
              description={<span className="whitespace-pre-wrap">{row.conclusion}</span>}
            />
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">
              验收检查项（{row.items.length}）
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={row.items}
              pagination={false}
              locale={{ emptyText: '无检查项' }}
            />
          </div>
        </div>
      )}

      <Modal
        open={concludeOpen}
        width={520}
        title="出具验收结论"
        okText="确认"
        confirmLoading={conclude.isPending}
        onOk={() => void handleConclude()}
        onCancel={() => setConcludeOpen(false)}
      >
        <div className="space-y-3">
          <Alert
            type="info"
            showIcon
            message="「通过」前项目的调试问题必须全部闭环；存在未关闭问题时请先处理，或选择「有条件通过」并写明遗留问题与整改期限。"
          />
          <Radio.Group
            value={result}
            onChange={(e) => setResult(e.target.value as typeof result)}
            options={[
              { value: 'PASSED', label: '通过' },
              { value: 'CONDITIONAL', label: '有条件通过（有遗留问题）' },
              { value: 'FAILED', label: '不通过' },
            ]}
          />
          <Input.TextArea
            rows={4}
            maxLength={4000}
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            placeholder={
              result === 'CONDITIONAL'
                ? '必填：遗留问题清单与整改期限'
                : '结论说明（可选），将体现在验收报告中'
            }
          />
        </div>
      </Modal>
    </Drawer>
  );
}
