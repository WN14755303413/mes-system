import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Descriptions,
  Drawer,
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
  DISPOSITION_TYPE_LABEL,
  ISSUE_ACTION_RULES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_SOURCE_LABEL,
  QUALITY_ISSUE_ACTION_LABEL,
  QUALITY_ISSUE_STATUS_LABEL,
  QualityIssueStatus,
  type DispositionType,
  type IssueSeverity,
  type IssueSource,
  type QualityIssueActionItem,
  type QualityIssueRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { useProjects, useUserOptions } from '@/api/project';
import {
  issuePhotoUrl,
  uploadIssuePhoto,
  useAssignQualityIssue,
  useQualityIssueDetail,
  useQualityIssues,
  useRecheckQualityIssue,
  useSubmitQualityIssue,
  useUpdateQualityIssue,
  useVoidQualityIssue,
} from '@/api/quality';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { fmtTime, IssueStatusTag, SeverityTag, SourceTag } from '../shared';
import { IssueCreateModal } from './IssueCreateModal';

/** 动作在给定状态下是否可用（shared 动作规则表，前后端同源）。 */
const actionAllowed = (
  action: keyof typeof ISSUE_ACTION_RULES,
  status: QualityIssueStatus,
): boolean => ISSUE_ACTION_RULES[action].from.includes(status);

/** 质量问题单（M8，§9.7 检验到整改闭环）。责任人可能是任何角色，无读权限者只见与自己相关的。 */
export default function IssuePage() {
  const canWrite = useAuthStore((s) => s.hasPermission('quality:issue:write'));
  const canSeeAll = useAuthStore((s) => s.hasPermission('quality:issue:read'));

  const [status, setStatus] = useState<QualityIssueStatus>();
  const [severity, setSeverity] = useState<IssueSeverity>();
  const [source, setSource] = useState<IssueSource>();
  const [projectId, setProjectId] = useState<string>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useQualityIssues({
    status,
    severity,
    source,
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

  const columns: ColumnsType<QualityIssueRow> = [
    {
      title: '单号',
      dataIndex: 'code',
      width: 135,
      render: (v: string, r) => (
        <Button type="link" size="small" className="!px-0 font-mono" onClick={() => setDetailId(r.id)}>
          {v}
        </Button>
      ),
    },
    { title: '问题标题', dataIndex: 'title', width: 200, ellipsis: true },
    { title: '严重度', dataIndex: 'severity', width: 80, render: (v) => <SeverityTag severity={v} /> },
    {
      title: '来源',
      dataIndex: 'source',
      width: 130,
      render: (v: IssueSource, r) => (
        <Space size={4}>
          <SourceTag source={v} />
          {r.inspectionCode && <span className="font-mono text-xs">{r.inspectionCode}</span>}
        </Space>
      ),
    },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string | null, r) => (v ? `${v} ${r.projectName}` : '—'),
    },
    {
      title: '物料 / 批次',
      key: 'mat',
      width: 130,
      ellipsis: true,
      render: (_, r) =>
        r.materialCode ? `${r.materialCode}${r.batchNo ? ` / ${r.batchNo}` : ''}` : (r.batchNo ?? '—'),
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <IssueStatusTag status={v} /> },
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
      title="质量问题"
      subtitle="检验驱动的质量闭环：发现 → 分派 → 整改 → 复检 → 关闭（8D 留痕）。装配现场执行异常在生产执行模块。"
      extra={
        canWrite && (
          <Button type="primary" danger icon={<AlertOutlined />} onClick={() => setCreateOpen(true)}>
            发起质量问题
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
          options={Object.entries(QUALITY_ISSUE_STATUS_LABEL).map(([value, label]) => ({
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
          placeholder="来源"
          style={{ width: 105 }}
          value={source}
          onChange={(v) => {
            setSource(v);
            setPage(1);
          }}
          options={Object.entries(ISSUE_SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
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
          placeholder="单号 / 标题 / 物料"
          style={{ width: 200 }}
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

type ActionKind = 'assign' | 'submit' | 'recheck' | 'void' | 'edit';

const ACTION_TITLE: Record<ActionKind, string> = {
  assign: '分派责任人',
  submit: '提交整改',
  recheck: '复检',
  void: '作废（误报）',
  edit: '编辑 8D 与处置信息',
};

/** 问题单详情：8D 字段 + 动作时间线 + 照片墙 + 按规则表渲染的闭环动作。 */
function IssueDetailDrawer({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { message } = App.useApp();
  const myId = useAuthStore((s) => s.user?.id);
  const canWrite = useAuthStore((s) => s.hasPermission('quality:issue:write'));
  const canClose = useAuthStore((s) => s.hasPermission('quality:issue:close'));

  const { data: row, isLoading, refetch } = useQualityIssueDetail(id);
  const { data: users } = useUserOptions();
  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [users],
  );

  const assign = useAssignQualityIssue();
  const submit = useSubmitQualityIssue();
  const recheck = useRecheckQualityIssue();
  const voidMutation = useVoidQualityIssue();
  const update = useUpdateQualityIssue();

  const [action, setAction] = useState<ActionKind | null>(null);
  const [handlerId, setHandlerId] = useState<string>();
  const [note, setNote] = useState('');
  const [recheckPass, setRecheckPass] = useState(true);
  const [eightD, setEightD] = useState<{
    containmentAction: string;
    rootCause: string;
    correctiveAction: string;
    preventiveAction: string;
    disposition: DispositionType | '';
    severity: IssueSeverity;
  }>({
    containmentAction: '',
    rootCause: '',
    correctiveAction: '',
    preventiveAction: '',
    disposition: '',
    severity: 'MEDIUM',
  });
  const [uploading, setUploading] = useState(false);

  const isHandler = !!row && row.handlerId === myId;
  const isReporter = !!row && row.reporterId === myId;
  const status = row?.status;
  const isFinal = status === QualityIssueStatus.CLOSED || status === QualityIssueStatus.VOIDED;
  const canUpload = !!row && !isFinal && (canWrite || isHandler || isReporter);

  const openAction = (kind: ActionKind) => {
    if (!row) return;
    setHandlerId(row.handlerId ?? undefined);
    setNote('');
    setRecheckPass(true);
    setEightD({
      containmentAction: row.containmentAction ?? '',
      rootCause: row.rootCause ?? '',
      correctiveAction: row.correctiveAction ?? '',
      preventiveAction: row.preventiveAction ?? '',
      disposition: row.disposition ?? '',
      severity: row.severity,
    });
    setAction(kind);
  };

  const eightDPayload = () => ({
    containmentAction: eightD.containmentAction.trim() || null,
    rootCause: eightD.rootCause.trim() || null,
    correctiveAction: eightD.correctiveAction.trim() || null,
    preventiveAction: eightD.preventiveAction.trim() || null,
    disposition: eightD.disposition || null,
  });

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
          body: { note: note.trim(), ...eightDPayload() },
        });
        message.success('已提交整改，待复检');
      } else if (action === 'recheck') {
        await recheck.mutateAsync({
          id: row.id,
          body: { pass: recheckPass, note: note.trim() || null },
        });
        message.success(recheckPass ? '复检通过，问题已关闭' : '复检未通过，已退回整改');
      } else if (action === 'void') {
        await voidMutation.mutateAsync({ id: row.id, body: { note: note.trim() || null } });
        message.success('已作废');
      } else {
        await update.mutateAsync({
          id: row.id,
          body: { severity: eightD.severity, ...eightDPayload() },
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
      {canClose && actionAllowed('RECHECK_PASS', status) && (
        <Button type="primary" size="small" onClick={() => openAction('recheck')}>
          复检
        </Button>
      )}
      {(canWrite || isHandler) && !isFinal && (
        <Button size="small" onClick={() => openAction('edit')}>
          编辑 8D
        </Button>
      )}
      {canClose && actionAllowed('VOID', status) && (
        <Button size="small" danger onClick={() => openAction('void')}>
          作废
        </Button>
      )}
    </Space>
  );

  const eightDItems = row
    ? ([
        ['遏制措施 (D3)', row.containmentAction],
        ['根因分析 (D4)', row.rootCause],
        ['纠正措施 (D5/D6)', row.correctiveAction],
        ['预防措施 (D7)', row.preventiveAction],
      ] as const)
    : [];
  const hasEightD = eightDItems.some(([, v]) => v) || !!row?.disposition;

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      open={!!id}
      width={640}
      title={row ? `${row.code} ${row.title}` : '问题单详情'}
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
              { key: 'status', label: '状态', children: <IssueStatusTag status={row.status} /> },
              { key: 'severity', label: '严重度', children: <SeverityTag severity={row.severity} /> },
              {
                key: 'source',
                label: '来源',
                children: (
                  <Space size={4}>
                    <SourceTag source={row.source} />
                    {row.inspectionCode && (
                      <span className="font-mono text-xs">{row.inspectionCode}</span>
                    )}
                  </Space>
                ),
              },
              {
                key: 'disposition',
                label: '处置方式',
                children: row.disposition ? DISPOSITION_TYPE_LABEL[row.disposition] : '—',
              },
              {
                key: 'project',
                label: '项目',
                children: row.projectCode ? `${row.projectCode} ${row.projectName}` : '—',
              },
              {
                key: 'wo',
                label: '工单 / 任务',
                children: row.workOrderCode
                  ? `${row.workOrderCode}${row.taskName ? ` · ${row.taskName}` : ''}`
                  : '—',
              },
              {
                key: 'material',
                label: '物料 / 批次',
                children: row.materialCode
                  ? `${row.materialCode}${row.batchNo ? ` / ${row.batchNo}` : ''}`
                  : (row.batchNo ?? '—'),
              },
              { key: 'supplier', label: '供应商', children: row.supplierName ?? '—' },
              { key: 'reporter', label: '发起人', children: row.reporterName ?? '—' },
              { key: 'handler', label: '责任人', children: row.handlerName ?? '未分派' },
              { key: 'createdAt', label: '发起时间', children: fmtTime(row.createdAt) },
              ...(row.closedAt
                ? [
                    {
                      key: 'closedAt',
                      label: row.status === QualityIssueStatus.VOIDED ? '作废' : '关闭',
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

          {hasEightD && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">8D 整改信息</div>
              <div className="space-y-2 rounded-lg bg-blue-50/60 px-3 py-2">
                {eightDItems.map(
                  ([label, value]) =>
                    value && (
                      <div key={label} className="text-sm">
                        <span className="font-medium text-slate-600">{label}：</span>
                        <span className="whitespace-pre-wrap text-slate-700">{value}</span>
                      </div>
                    ),
                )}
                {row.disposition && (
                  <div className="text-sm">
                    <span className="font-medium text-slate-600">不合格品处置：</span>
                    <Tag>{DISPOSITION_TYPE_LABEL[row.disposition]}</Tag>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">处理时间线</div>
            <Timeline
              className="mt-1"
              items={row.actions.map((a: QualityIssueActionItem) => ({
                color: TIMELINE_COLOR[a.type] ?? 'gray',
                children: (
                  <div className="text-sm">
                    <div>
                      <span className="font-medium">{QUALITY_ISSUE_ACTION_LABEL[a.type]}</span>
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
                    uploadIssuePhoto(row.id, file)
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
                      src={issuePhotoUrl(p.id)}
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
        maskClosable={false}
        keyboard={false}
        open={!!action}
        width={action === 'submit' || action === 'edit' ? 620 : 420}
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
              placeholder="选择责任人"
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
                { value: true, label: '复检通过（关闭问题）' },
                { value: false, label: '复检不通过（退回整改）' },
              ]}
            />
            <Input.TextArea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="复检意见（可选）"
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
                  placeholder="整改措施与结果，将记入处理时间线"
                />
              </div>
            )}
            {action === 'edit' && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-600">严重度</div>
                <Select
                  className="w-40"
                  value={eightD.severity}
                  onChange={(v) => setEightD((p) => ({ ...p, severity: v }))}
                  options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </div>
            )}
            {(
              [
                ['containmentAction', '遏制措施 (D3)', '临时围堵措施，防止不良流出'],
                ['rootCause', '根因分析 (D4)', '问题的根本原因'],
                ['correctiveAction', '纠正措施 (D5/D6)', '针对根因的纠正措施及实施情况'],
                ['preventiveAction', '预防措施 (D7)', '防止再发生、横向展开'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key}>
                <div className="mb-1 text-sm font-medium text-slate-600">{label}</div>
                <Input.TextArea
                  rows={2}
                  maxLength={4000}
                  value={eightD[key]}
                  onChange={(e) => setEightD((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">不合格品处置</div>
              <Select
                allowClear
                className="w-40"
                placeholder="选择处置方式"
                value={eightD.disposition || undefined}
                onChange={(v) => setEightD((p) => ({ ...p, disposition: v ?? '' }))}
                options={Object.entries(DISPOSITION_TYPE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
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
