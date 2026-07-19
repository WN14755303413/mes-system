import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AlertOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DEBUG_ISSUE_ACTION_LABEL,
  DEBUG_ISSUE_ACTION_RULES,
  DEBUG_ISSUE_STATUS_LABEL,
  DEBUG_STAGE_LABEL,
  DebugIssueStatus,
  ISSUE_SEVERITY_LABEL,
  type DebugIssueActionItem,
  type DebugIssueRow,
  type DebugStage,
  type IssueSeverity,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  debugIssuePhotoUrl,
  uploadDebugIssuePhoto,
  useAssignDebugIssue,
  useCreateDebugIssue,
  useDebugIssueDetail,
  useDebugIssues,
  useDebugRecords,
  useRecheckDebugIssue,
  useSubmitDebugIssue,
  useUpdateDebugIssue,
  useVoidDebugIssue,
} from '@/api/debug';
import { useProjects, useUserOptions } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { DebugIssueStatusTag, SeverityTag, StageTag, fmtTime } from '../shared';

/** 动作在给定状态下是否可用（shared 动作规则表，前后端同源）。 */
const actionAllowed = (
  action: keyof typeof DEBUG_ISSUE_ACTION_RULES,
  status: DebugIssueStatus,
): boolean => DEBUG_ISSUE_ACTION_RULES[action].from.includes(status);

/** 调试问题（M9，§8.8 问题清单 + 多轮整改复测）。FAT/SAT 现场问题同走本清单。 */
export default function DebugIssuePage() {
  const canWrite = useAuthStore((s) => s.hasPermission('debug:write'));
  const canSeeAll = useAuthStore((s) => s.hasPermission('debug:read'));

  const [status, setStatus] = useState<DebugIssueStatus>();
  const [severity, setSeverity] = useState<IssueSeverity>();
  const [stage, setStage] = useState<DebugStage>();
  const [projectId, setProjectId] = useState<string>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useDebugIssues({
    status,
    severity,
    stage,
    projectId,
    onlyMine: onlyMine || undefined,
    keyword: keyword || undefined,
    page,
    pageSize,
  });
  const { data: projectPage } = useProjects(
    canSeeAll ? { page: 1, pageSize: 100 } : { page: 1, pageSize: 1 },
  );
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string>();

  const columns: ColumnsType<DebugIssueRow> = [
    {
      title: '单号',
      dataIndex: 'code',
      width: 130,
      render: (v: string, r) => (
        <Button type="link" size="small" className="!px-0 font-mono" onClick={() => setDetailId(r.id)}>
          {v}
        </Button>
      ),
    },
    { title: '问题标题', dataIndex: 'title', width: 210, ellipsis: true },
    { title: '严重度', dataIndex: 'severity', width: 80, render: (v) => <SeverityTag severity={v} /> },
    { title: '阶段', dataIndex: 'stage', width: 95, render: (v) => <StageTag stage={v} /> },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string | null, r) => (v ? `${v} ${r.projectName}` : '—'),
    },
    {
      title: '调试记录 / 设备',
      key: 'record',
      width: 150,
      ellipsis: true,
      render: (_, r) => (
        <span className="font-mono text-xs">
          {r.recordCode ?? '—'}
          {r.equipmentNo ? ` · ${r.equipmentNo}` : ''}
        </span>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <DebugIssueStatusTag status={v} /> },
    {
      title: '责任人',
      dataIndex: 'handlerName',
      width: 90,
      render: (v: string | null) => v ?? <Tag color="orange">未分派</Tag>,
    },
    { title: '发起人', dataIndex: 'reporterName', width: 90, render: (v) => v ?? '—' },
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
    { title: '发起时间', dataIndex: 'createdAt', width: 110, render: fmtTime },
  ];

  return (
    <PageContainer
      title="调试问题"
      subtitle="调试与 FAT/SAT 发现问题的闭环清单：登记 → 分派 → 整改 → 复测 → 关闭，支持多轮退回。验收「通过」前必须全部闭环。"
      extra={
        canWrite && (
          <Button type="primary" danger icon={<AlertOutlined />} onClick={() => setCreateOpen(true)}>
            登记调试问题
          </Button>
        )
      }
    >
      <Space className="mb-3" wrap>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 100 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(DEBUG_ISSUE_STATUS_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Select
          allowClear
          placeholder="严重度"
          style={{ width: 95 }}
          value={severity}
          onChange={(v) => {
            setSeverity(v);
            setPage(1);
          }}
          options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Select
          allowClear
          placeholder="阶段"
          style={{ width: 110 }}
          value={stage}
          onChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          options={Object.entries(DEBUG_STAGE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {canSeeAll && (
          <>
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
            <Select
              value={onlyMine}
              style={{ width: 125 }}
              onChange={(v) => {
                setOnlyMine(v);
                setPage(1);
              }}
              options={[
                { value: false, label: '全部问题' },
                { value: true, label: '与我相关' },
              ]}
            />
          </>
        )}
        <Input.Search
          allowClear
          placeholder="单号 / 标题 / 设备号"
          style={{ width: 190 }}
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
        scroll={{ x: 1400 }}
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

      <IssueCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <IssueDetailDrawer id={detailId} onClose={() => setDetailId(undefined)} />
    </PageContainer>
  );
}

interface CreateFormValues {
  title: string;
  severity: IssueSeverity;
  stage: DebugStage;
  projectId?: string;
  recordId?: string;
  equipmentNo?: string;
  description?: string;
}

/** 登记调试问题。关联调试记录时项目/设备号由后端反查；否则必须选项目。 */
function IssueCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateFormValues>();
  const create = useCreateDebugIssue();

  const projectId = Form.useWatch('projectId', form);
  const recordId = Form.useWatch('recordId', form);

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const { data: recordPage } = useDebugRecords({ projectId, page: 1, pageSize: 100 });
  const recordOptions = useMemo(
    () =>
      (recordPage?.items ?? []).map((r) => ({ value: r.id, label: `${r.code} ${r.title}` })),
    [recordPage],
  );

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleOk = async () => {
    const v = await form.validateFields();
    if (!v.recordId && !v.projectId) {
      message.warning('请关联项目或调试记录');
      return;
    }
    try {
      const created = await create.mutateAsync({
        title: v.title,
        description: v.description || null,
        severity: v.severity,
        stage: v.stage,
        projectId: v.projectId || null,
        recordId: v.recordId || null,
        equipmentNo: v.equipmentNo || null,
      });
      message.success(`调试问题 ${created.code} 已登记`);
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '登记失败');
    }
  };

  return (
    <Modal
      open={open}
      width={560}
      title="登记调试问题"
      okText="登记"
      confirmLoading={create.isPending}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" className="mt-2">
        <Form.Item name="title" label="问题标题" rules={[{ required: true, message: '请填写标题' }]}>
          <Input maxLength={128} placeholder="如：机械手 Z 轴回零漂移" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="severity" label="严重度" initialValue="MEDIUM">
            <Select
              options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="stage" label="发现阶段" initialValue="DEBUG">
            <Select
              options={Object.entries(DEBUG_STAGE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="projectId" label="所属项目">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={projectOptions}
              placeholder={recordId ? '已由调试记录带出' : '与调试记录二选一'}
              disabled={!!recordId}
              onChange={() => form.setFieldValue('recordId', undefined)}
            />
          </Form.Item>
          <Form.Item name="recordId" label="关联调试记录">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={recordOptions}
              placeholder="可选，项目/设备号自动带出"
            />
          </Form.Item>
          <Form.Item name="equipmentNo" label="设备编号">
            <Input maxLength={64} placeholder="可选，追溯用" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="问题现象与影响">
          <Input.TextArea rows={3} maxLength={4000} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

type ActionKind = 'assign' | 'submit' | 'recheck' | 'void' | 'edit';

const ACTION_TITLE: Record<ActionKind, string> = {
  assign: '分派责任人',
  submit: '提交整改',
  recheck: '复测',
  void: '作废（误报）',
  edit: '编辑整改措施',
};

/** 问题详情：整改措施 + 动作时间线 + 照片墙 + 按规则表渲染的闭环动作。 */
function IssueDetailDrawer({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { message } = App.useApp();
  const myId = useAuthStore((s) => s.user?.id);
  const canWrite = useAuthStore((s) => s.hasPermission('debug:write'));

  const { data: row, isLoading, refetch } = useDebugIssueDetail(id);
  const { data: users } = useUserOptions();
  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [users],
  );

  const assign = useAssignDebugIssue();
  const submit = useSubmitDebugIssue();
  const recheck = useRecheckDebugIssue();
  const voidMutation = useVoidDebugIssue();
  const update = useUpdateDebugIssue();

  const [action, setAction] = useState<ActionKind | null>(null);
  const [handlerId, setHandlerId] = useState<string>();
  const [note, setNote] = useState('');
  const [recheckPass, setRecheckPass] = useState(true);
  const [solution, setSolution] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');
  const [uploading, setUploading] = useState(false);

  const isHandler = !!row && row.handlerId === myId;
  const isReporter = !!row && row.reporterId === myId;
  const status = row?.status;
  const isFinal = status === DebugIssueStatus.CLOSED || status === DebugIssueStatus.VOIDED;
  const canUpload = !!row && !isFinal && (canWrite || isHandler || isReporter);

  const openAction = (kind: ActionKind) => {
    if (!row) return;
    setHandlerId(row.handlerId ?? undefined);
    setNote('');
    setRecheckPass(true);
    setSolution(row.solution ?? '');
    setSeverity(row.severity);
    setAction(kind);
  };

  const submitAction = async () => {
    if (!row || !action) return;
    try {
      if (action === 'assign') {
        if (!handlerId) return;
        await assign.mutateAsync({ id: row.id, body: { handlerId, note: note.trim() || null } });
        message.success('已分派');
      } else if (action === 'submit') {
        if (!note.trim()) {
          message.warning('请填写整改说明');
          return;
        }
        await submit.mutateAsync({
          id: row.id,
          body: { note: note.trim(), solution: solution.trim() || null },
        });
        message.success('已提交整改，待复测');
      } else if (action === 'recheck') {
        await recheck.mutateAsync({
          id: row.id,
          body: { pass: recheckPass, note: note.trim() || null },
        });
        message.success(recheckPass ? '复测通过，问题已关闭' : '复测未通过，已退回整改');
      } else if (action === 'void') {
        await voidMutation.mutateAsync({ id: row.id, body: { note: note.trim() || null } });
        message.success('已作废');
      } else {
        await update.mutateAsync({
          id: row.id,
          body: { severity, solution: solution.trim() || null },
        });
        message.success('已保存');
      }
      setAction(null);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const actionButtons = row && status && (
    <Space wrap>
      {canWrite && actionAllowed('ASSIGN', status) && (
        <Button type="primary" size="small" onClick={() => openAction('assign')}>
          {row.handlerId ? '改派' : '分派责任人'}
        </Button>
      )}
      {(isHandler || canWrite) && actionAllowed('SUBMIT', status) && (
        <Button type="primary" size="small" onClick={() => openAction('submit')}>
          提交整改
        </Button>
      )}
      {canWrite && actionAllowed('RECHECK_PASS', status) && (
        <Button type="primary" size="small" onClick={() => openAction('recheck')}>
          复测
        </Button>
      )}
      {(canWrite || isHandler) && !isFinal && (
        <Button size="small" onClick={() => openAction('edit')}>
          编辑措施
        </Button>
      )}
      {canWrite && actionAllowed('VOID', status) && (
        <Button size="small" danger onClick={() => openAction('void')}>
          作废
        </Button>
      )}
    </Space>
  );

  return (
    <Drawer
      open={!!id}
      width={640}
      title={row ? `${row.code} ${row.title}` : '调试问题详情'}
      onClose={onClose}
      loading={isLoading}
      extra={actionButtons}
    >
      {row && (
        <div className="space-y-4">
          <Descriptions
            size="small"
            column={2}
            items={[
              { key: 'status', label: '状态', children: <DebugIssueStatusTag status={row.status} /> },
              { key: 'severity', label: '严重度', children: <SeverityTag severity={row.severity} /> },
              { key: 'stage', label: '发现阶段', children: <StageTag stage={row.stage} /> },
              {
                key: 'record',
                label: '调试记录',
                children: row.recordCode ? (
                  <span className="font-mono text-xs">{row.recordCode}</span>
                ) : (
                  '—'
                ),
              },
              {
                key: 'project',
                label: '项目',
                children: row.projectCode ? `${row.projectCode} ${row.projectName}` : '—',
              },
              { key: 'equipment', label: '设备编号', children: row.equipmentNo ?? '—' },
              { key: 'reporter', label: '发起人', children: row.reporterName ?? '—' },
              { key: 'handler', label: '责任人', children: row.handlerName ?? '未分派' },
              { key: 'createdAt', label: '发起时间', children: fmtTime(row.createdAt) },
              ...(row.closedAt
                ? [
                    {
                      key: 'closedAt',
                      label: row.status === DebugIssueStatus.VOIDED ? '作废' : '关闭',
                      children: `${row.closedByName ?? ''} ${fmtTime(row.closedAt)}`,
                    },
                  ]
                : []),
            ]}
          />

          {row.description && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">问题描述</div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {row.description}
              </div>
            </div>
          )}

          {row.solution && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">整改措施（最新）</div>
              <div className="whitespace-pre-wrap rounded-lg bg-blue-50/60 px-3 py-2 text-sm text-slate-700">
                {row.solution}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">整改复测时间线</div>
            <Timeline
              className="mt-1"
              items={row.actions.map((a: DebugIssueActionItem) => ({
                color: TIMELINE_COLOR[a.type] ?? 'gray',
                children: (
                  <div className="text-sm">
                    <div>
                      <span className="font-medium">{DEBUG_ISSUE_ACTION_LABEL[a.type]}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {a.operatorName ?? '系统'} · {fmtTime(a.createdAt)}
                      </span>
                    </div>
                    {a.note && (
                      <div className="mt-0.5 whitespace-pre-wrap text-slate-600">{a.note}</div>
                    )}
                  </div>
                ),
              }))}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">照片（{row.photos.length}）</span>
              {canUpload && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setUploading(true);
                    uploadDebugIssuePhoto(row.id, file)
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
                      src={debugIssuePhotoUrl(p.id)}
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

      <Modal
        open={!!action}
        width={action === 'submit' || action === 'edit' ? 560 : 420}
        title={action ? ACTION_TITLE[action] : ''}
        okText="确认"
        confirmLoading={
          assign.isPending ||
          submit.isPending ||
          recheck.isPending ||
          voidMutation.isPending ||
          update.isPending
        }
        okButtonProps={action === 'assign' ? { disabled: !handlerId } : undefined}
        onOk={() => void submitAction()}
        onCancel={() => setAction(null)}
      >
        {action === 'assign' && (
          <div className="space-y-3">
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择责任人（电气/软件/工艺设计等）"
              className="w-full"
              value={handlerId}
              onChange={setHandlerId}
              options={userOptions}
            />
            <Input.TextArea
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="分派说明（可选）"
            />
          </div>
        )}

        {action === 'recheck' && (
          <div className="space-y-3">
            <Radio.Group
              value={recheckPass}
              onChange={(e) => setRecheckPass(e.target.value as boolean)}
              options={[
                { value: true, label: '复测通过（关闭问题）' },
                { value: false, label: '复测不通过（退回整改）' },
              ]}
            />
            <Input.TextArea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="复测结果与数据（可选）"
            />
          </div>
        )}

        {action === 'void' && (
          <Input.TextArea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="作废原因（可选，如误报）"
          />
        )}

        {(action === 'submit' || action === 'edit') && (
          <div className="space-y-3">
            {action === 'submit' && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-600">本轮整改说明（必填）</div>
                <Input.TextArea
                  rows={3}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="整改动作与结果，将记入复测时间线"
                />
              </div>
            )}
            {action === 'edit' && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-600">严重度</div>
                <Select
                  className="w-40"
                  value={severity}
                  onChange={setSeverity}
                  options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </div>
            )}
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">整改措施</div>
              <Input.TextArea
                rows={3}
                maxLength={4000}
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="根因与整改方案（主表存最新值，历史见时间线）"
              />
            </div>
          </div>
        )}
      </Modal>
    </Drawer>
  );
}

const TIMELINE_COLOR: Record<string, string> = {
  CREATE: 'gray',
  ASSIGN: 'blue',
  SUBMIT: 'orange',
  RECHECK_PASS: 'green',
  RECHECK_FAIL: 'red',
  VOID: 'gray',
};
