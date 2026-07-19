import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, ExperimentOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  DEBUG_RECORD_STATUS_LABEL,
  DEBUG_TYPE_LABEL,
  DebugRecordStatus,
  DebugType,
  ISSUE_SEVERITY_LABEL,
  type DebugParamInput,
  type DebugRecordDetail,
  type DebugRecordRow,
  type IssueSeverity,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  debugRecordPhotoUrl,
  uploadDebugRecordPhoto,
  useCompleteDebugRecord,
  useCreateDebugIssue,
  useCreateDebugRecord,
  useDebugRecordDetail,
  useDebugRecords,
  useUpdateDebugRecord,
  useVoidDebugRecord,
} from '@/api/debug';
import { useProjects, useUserOptions } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import {
  DebugIssueStatusTag,
  DebugRecordStatusTag,
  DebugTypeTag,
  ItemPassedTag,
  fmtTime,
} from '../shared';

/** 调试记录（M9，业务方案 §8.8）。电气/软件/工艺三类，单头 + 参数明细。 */
export default function DebugRecordPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('debug:write'));

  const [type, setType] = useState<DebugType>();
  const [status, setStatus] = useState<DebugRecordStatus>();
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useDebugRecords({
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
  const [editing, setEditing] = useState<DebugRecordDetail | null>(null);
  const [detailId, setDetailId] = useState<string>();

  const columns: ColumnsType<DebugRecordRow> = [
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
    { title: '类型', dataIndex: 'type', width: 95, render: (v) => <DebugTypeTag type={v} /> },
    { title: '调试对象', dataIndex: 'title', width: 200, ellipsis: true },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string | null, r) => (v ? `${v} ${r.projectName}` : '—'),
    },
    { title: '设备号', dataIndex: 'equipmentNo', width: 130, ellipsis: true, render: (v) => v ?? '—' },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <DebugRecordStatusTag status={v} /> },
    {
      title: '参数',
      key: 'params',
      width: 90,
      render: (_, r) =>
        r.paramCount ? (
          <span>
            {r.paramCount}
            {r.failedParamCount > 0 && (
              <Tag color="error" className="ml-1">
                {r.failedParamCount} 未达标
              </Tag>
            )}
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: '问题',
      dataIndex: 'openIssueCount',
      width: 70,
      align: 'center',
      render: (v: number) => (v > 0 ? <Tag color="orange">{v} 未闭环</Tag> : '—'),
    },
    { title: '调试人', dataIndex: 'executorName', width: 90, render: (v) => v ?? '—' },
    {
      title: '照片',
      dataIndex: 'photoCount',
      width: 65,
      align: 'center',
      render: (v: number) =>
        v > 0 ? (
          <span>
            <PictureOutlined /> {v}
          </span>
        ) : (
          '—'
        ),
    },
    { title: '调试日期', dataIndex: 'debugAt', width: 110, render: fmtTime },
  ];

  return (
    <PageContainer
      title="调试记录"
      subtitle="电气 / 软件 / 工艺调试的执行档案：参数记录、现场照片、调试问题入口。完成后锁定，构成一机一档的调试篇。"
      extra={
        canWrite && (
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新建调试记录
          </Button>
        )
      }
    >
      <Space className="mb-3" wrap>
        <Select
          allowClear
          placeholder="类型"
          style={{ width: 110 }}
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={Object.entries(DEBUG_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 100 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(DEBUG_RECORD_STATUS_LABEL).map(([value, label]) => ({
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
          placeholder="单号 / 调试对象 / 设备号"
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
        scroll={{ x: 1300 }}
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

      <DebugRecordFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <RecordDetailDrawer
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
  type: DebugType;
  title: string;
  projectId: string;
  equipmentNo?: string;
  executorId?: string;
  debugAt?: dayjs.Dayjs;
  content?: string;
  remark?: string;
}

/** 参数明细行的本地编辑态（带临时 key）。 */
interface EditableParam extends DebugParamInput {
  key: string;
}

let paramKeySeed = 0;
const nextParamKey = () => `param-${++paramKeySeed}`;

const EMPTY_PARAM = (): EditableParam => ({
  key: nextParamKey(),
  name: '',
  standard: null,
  actual: null,
  unit: null,
  passed: null,
  remark: null,
});

/**
 * 创建/编辑调试记录（编辑仅限调试中，由入口控制）。
 * 参数明细行在本地编辑，提交时整体上送（后端全量替换）。
 */
function DebugRecordFormModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: DebugRecordDetail | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<HeaderFormValues>();
  const [params, setParams] = useState<EditableParam[]>([]);
  const create = useCreateDebugRecord();
  const update = useUpdateDebugRecord();

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const { data: users } = useUserOptions();
  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [users],
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        type: editing.type,
        title: editing.title,
        projectId: editing.projectId,
        equipmentNo: editing.equipmentNo ?? undefined,
        executorId: editing.executorId ?? undefined,
        debugAt: dayjs(editing.debugAt),
        content: editing.content ?? undefined,
        remark: editing.remark ?? undefined,
      });
      setParams(
        editing.params.map((p) => ({
          key: nextParamKey(),
          name: p.name,
          standard: p.standard,
          actual: p.actual,
          unit: p.unit,
          passed: p.passed,
          remark: p.remark,
        })),
      );
    } else {
      form.resetFields();
      setParams([EMPTY_PARAM()]);
    }
  }, [open, editing, form]);

  const patchParam = (key: string, patch: Partial<EditableParam>) => {
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const paramColumns: ColumnsType<EditableParam> = [
    {
      title: '参数项',
      dataIndex: 'name',
      width: 170,
      render: (_, r) => (
        <Input
          size="small"
          value={r.name}
          maxLength={128}
          placeholder="如：药液流量 / 腔体温度"
          onChange={(e) => patchParam(r.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: '标准值 / 范围',
      dataIndex: 'standard',
      width: 140,
      render: (_, r) => (
        <Input
          size="small"
          value={r.standard ?? ''}
          maxLength={512}
          placeholder="如：2.0±0.1"
          onChange={(e) => patchParam(r.key, { standard: e.target.value || null })}
        />
      ),
    },
    {
      title: '实测值',
      dataIndex: 'actual',
      width: 120,
      render: (_, r) => (
        <Input
          size="small"
          value={r.actual ?? ''}
          maxLength={512}
          onChange={(e) => patchParam(r.key, { actual: e.target.value || null })}
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 90,
      render: (_, r) => (
        <Input
          size="small"
          value={r.unit ?? ''}
          maxLength={32}
          placeholder="L/min"
          onChange={(e) => patchParam(r.key, { unit: e.target.value || null })}
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
          onChange={(v) => patchParam(r.key, { passed: v === 'NA' ? null : v === 'PASS' })}
          options={[
            { value: 'NA', label: '未判定' },
            { value: 'PASS', label: '达标' },
            { value: 'FAIL', label: '未达标' },
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
          onClick={() => setParams((prev) => prev.filter((p) => p.key !== r.key))}
        />
      ),
    },
  ];

  const handleOk = async () => {
    const v = await form.validateFields();
    if (params.some((p) => !p.name.trim() && (p.standard || p.actual))) {
      message.warning('存在未填写「参数项」名称的明细行');
      return;
    }
    const payloadParams: DebugParamInput[] = params
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        standard: p.standard?.trim() || null,
        actual: p.actual?.trim() || null,
        unit: p.unit?.trim() || null,
        passed: p.passed ?? null,
        remark: p.remark?.trim() || null,
      }));

    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: {
            title: v.title,
            equipmentNo: v.equipmentNo || null,
            executorId: v.executorId || null,
            debugAt: v.debugAt ? v.debugAt.toISOString() : null,
            content: v.content || null,
            remark: v.remark || null,
            params: payloadParams,
          },
        });
        message.success('调试记录已更新');
      } else {
        const created = await create.mutateAsync({
          type: v.type,
          title: v.title,
          projectId: v.projectId,
          equipmentNo: v.equipmentNo || null,
          executorId: v.executorId || null,
          debugAt: v.debugAt ? v.debugAt.toISOString() : null,
          content: v.content || null,
          remark: v.remark || null,
          params: payloadParams,
        });
        message.success(`调试记录 ${created.code} 已创建`);
      }
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  return (
    <Modal
      open={open}
      width={880}
      title={editing ? `编辑调试记录 ${editing.code}` : '新建调试记录'}
      okText={editing ? '保存' : '创建'}
      confirmLoading={create.isPending || update.isPending}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" className="mt-2">
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="type" label="调试类型" initialValue={DebugType.ELEC}>
            <Select
              disabled={!!editing}
              options={Object.entries(DEBUG_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="调试对象说明"
            rules={[{ required: true, message: '请填写调试对象' }]}
          >
            <Input maxLength={128} placeholder="如：机械手示教与运动调试" />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="projectId"
              label="所属项目"
              rules={[{ required: true, message: '调试记录必须关联项目' }]}
            >
              <Select showSearch optionFilterProp="label" options={projectOptions} placeholder="必选" />
            </Form.Item>
          )}
          <Form.Item name="equipmentNo" label="设备编号">
            <Input maxLength={64} placeholder="如 EQ-PJ2026ABC001-01，一机一档追溯用" />
          </Form.Item>
          <Form.Item name="executorId" label="调试人">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={userOptions}
              placeholder="缺省为当前用户"
            />
          </Form.Item>
          <Form.Item name="debugAt" label="调试日期">
            <DatePicker showTime className="w-full" placeholder="缺省为当前时间（允许补录）" />
          </Form.Item>
        </div>
        <Form.Item name="content" label="调试内容与结果说明">
          <Input.TextArea rows={3} maxLength={8000} placeholder="调试步骤、现象、结论…" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input maxLength={2000} placeholder="可选" />
        </Form.Item>
      </Form>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">参数记录（{params.length}）</span>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setParams((prev) => [...prev, EMPTY_PARAM()])}>
          添加参数
        </Button>
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={paramColumns}
        dataSource={params}
        pagination={false}
        scroll={{ y: 240 }}
        locale={{ emptyText: '暂无参数，可直接创建后再补充' }}
      />
    </Modal>
  );
}

/** 详情抽屉：单头 + 参数表 + 照片墙 + 关联问题 + 完成/作废/登记问题动作。 */
function RecordDetailDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: string | undefined;
  onClose: () => void;
  onEdit: (detail: DebugRecordDetail) => void;
}) {
  const { message } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('debug:write'));

  const { data: row, isLoading, refetch } = useDebugRecordDetail(id);
  const complete = useCompleteDebugRecord();
  const voidMutation = useVoidDebugRecord();
  const [uploading, setUploading] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  const inProgress = row?.status === DebugRecordStatus.IN_PROGRESS;

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      message.success(success);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const paramColumns: ColumnsType<DebugRecordDetail['params'][number]> = [
    { title: '#', dataIndex: 'seq', width: 45 },
    { title: '参数项', dataIndex: 'name', width: 170, ellipsis: true },
    { title: '标准值 / 范围', dataIndex: 'standard', width: 140, render: (v) => v ?? '—' },
    {
      title: '实测值',
      dataIndex: 'actual',
      width: 130,
      render: (v: string | null, r) => (v ? `${v}${r.unit ? ` ${r.unit}` : ''}` : '—'),
    },
    { title: '判定', dataIndex: 'passed', width: 85, render: (v) => <ItemPassedTag passed={v} /> },
  ];

  return (
    <Drawer
      open={!!id}
      width={680}
      title={row ? `${row.code} ${row.title}` : '调试记录详情'}
      onClose={onClose}
      loading={isLoading}
      extra={
        row &&
        canWrite && (
          <Space wrap>
            {inProgress && (
              <>
                <Button size="small" onClick={() => onEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="完成调试？"
                  description="完成后单头与参数将锁定，不可再改。"
                  onConfirm={() => void run(() => complete.mutateAsync(row.id), '调试已完成')}
                >
                  <Button type="primary" size="small" loading={complete.isPending}>
                    完成调试
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="作废该记录？"
                  description="错录/重录时使用，作废后不计入统计。"
                  onConfirm={() => void run(() => voidMutation.mutateAsync(row.id), '已作废')}
                >
                  <Button size="small" danger loading={voidMutation.isPending}>
                    作废
                  </Button>
                </Popconfirm>
              </>
            )}
            {row.status !== DebugRecordStatus.VOIDED && (
              <Button size="small" danger type="primary" onClick={() => setIssueOpen(true)}>
                登记调试问题
              </Button>
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
              { key: 'type', label: '类型', children: <DebugTypeTag type={row.type} /> },
              { key: 'status', label: '状态', children: <DebugRecordStatusTag status={row.status} /> },
              {
                key: 'project',
                label: '项目',
                children: row.projectCode ? `${row.projectCode} ${row.projectName}` : '—',
              },
              { key: 'equipment', label: '设备编号', children: row.equipmentNo ?? '—' },
              { key: 'executor', label: '调试人', children: row.executorName ?? '—' },
              { key: 'debugAt', label: '调试日期', children: fmtTime(row.debugAt) },
              ...(row.completedAt
                ? [
                    {
                      key: 'completed',
                      label: '完成',
                      children: `${row.completedByName ?? ''} ${fmtTime(row.completedAt)}`,
                    },
                  ]
                : []),
              ...(row.remark ? [{ key: 'remark', label: '备注', children: row.remark }] : []),
            ]}
          />

          {row.content && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">调试内容与结果</div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {row.content}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">
              参数记录（{row.params.length}）
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={paramColumns}
              dataSource={row.params}
              pagination={false}
              locale={{ emptyText: '无参数记录' }}
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">
              调试问题（{row.issues.length}）
            </div>
            {row.issues.length ? (
              <div className="space-y-1">
                {row.issues.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{i.code}</span>
                    <span className="flex-1 truncate">{i.title}</span>
                    <DebugIssueStatusTag status={i.status} />
                  </div>
                ))}
                <div className="text-xs text-slate-400">在「调试问题」页面跟踪整改与复测</div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">无关联问题</div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">照片（{row.photos.length}）</span>
              {canWrite && inProgress && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setUploading(true);
                    uploadDebugRecordPhoto(row.id, file)
                      .then(() => refetch())
                      .catch((e: unknown) => message.error(isApiError(e) ? e.message : '上传失败'))
                      .finally(() => setUploading(false));
                    return false;
                  }}
                >
                  <Button size="small" icon={<PlusOutlined />} loading={uploading}>
                    上传照片
                  </Button>
                </Upload>
              )}
            </div>
            {row.photos.length ? (
              <Image.PreviewGroup>
                <div className="grid grid-cols-4 gap-2">
                  {row.photos.map((p) => (
                    <Image
                      key={p.id}
                      src={debugRecordPhotoUrl(p.id)}
                      alt={p.fileName}
                      className="rounded-lg object-cover"
                      height={90}
                    />
                  ))}
                </div>
              </Image.PreviewGroup>
            ) : (
              <div className="text-sm text-slate-400">无照片</div>
            )}
          </div>
        </div>
      )}

      {row && (
        <QuickIssueModal
          open={issueOpen}
          record={row}
          onClose={() => {
            setIssueOpen(false);
            void refetch();
          }}
        />
      )}
    </Drawer>
  );
}

/** 从调试记录快速登记问题：项目/设备号由记录带出，后端反查为准。 */
function QuickIssueModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: DebugRecordDetail;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const create = useCreateDebugIssue();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setSeverity('MEDIUM');
      setDescription('');
    }
  }, [open]);

  const handleOk = async () => {
    if (!title.trim()) {
      message.warning('请填写问题标题');
      return;
    }
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        severity,
        stage: 'DEBUG',
        recordId: record.id,
      });
      message.success(`调试问题 ${created.code} 已登记，可在「调试问题」页面分派整改`);
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '登记失败');
    }
  };

  return (
    <Modal
      open={open}
      width={480}
      title={`登记调试问题（${record.code}）`}
      okText="登记"
      confirmLoading={create.isPending}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <div className="space-y-3">
        <Input
          value={title}
          maxLength={128}
          placeholder="问题标题，如：机械手 Z 轴回零漂移"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          className="w-40"
          value={severity}
          onChange={setSeverity}
          options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Input.TextArea
          rows={3}
          maxLength={4000}
          value={description}
          placeholder="问题现象与影响（可选）"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}
