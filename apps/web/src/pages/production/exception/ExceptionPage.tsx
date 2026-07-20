import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AlertOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  EXCEPTION_STATUS_LABEL,
  ExceptionStatus,
  type ExceptionRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  exceptionPhotoUrl,
  uploadExceptionPhoto,
  useAssignException,
  useCloseException,
  useExceptionDetail,
  useExceptions,
  useReopenException,
  useResolveException,
} from '@/api/production';
import { useProjects, useUserOptions } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { ExceptionStatusTag, fmtTime } from '../shared';
import { ExceptionCreateModal } from './ExceptionCreateModal';

type ActionKind = 'assign' | 'resolve' | 'close' | 'reopen';

/** 现场异常（M7，§9.6 装配异常到问题闭环）。计划侧看全部，现场只看与自己相关的。 */
export default function ExceptionPage() {
  const canManage = useAuthStore((s) => s.hasPermission('plan:write'));
  const canSeeAll = useAuthStore((s) => s.hasPermission('plan:read'));
  const canReport = useAuthStore((s) => s.hasPermission('task:exception'));

  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<ExceptionStatus>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useExceptions({
    projectId,
    status,
    onlyMine: onlyMine || undefined,
    keyword: keyword || undefined,
    page,
    pageSize,
  });
  const { data: projectPage } = useProjects(
    canSeeAll ? { page: 1, pageSize: 100 } : { page: 1, pageSize: 1 },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string>();

  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const columns: ColumnsType<ExceptionRow> = [
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
    { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 160,
      ellipsis: true,
      render: (v: string, r) => `${v} ${r.projectName}`,
    },
    {
      title: '工单 / 任务',
      key: 'ctx',
      width: 180,
      ellipsis: true,
      render: (_, r) =>
        r.workOrderCode ? `${r.workOrderCode}${r.taskName ? ` · ${r.taskName}` : ''}` : '—',
    },
    {
      title: '物料',
      dataIndex: 'materialCode',
      width: 120,
      render: (v: string | null) => v ?? '—',
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <ExceptionStatusTag status={v} /> },
    { title: '提交人', dataIndex: 'reporterName', width: 90, render: (v) => v ?? '—' },
    {
      title: '责任人',
      dataIndex: 'handlerName',
      width: 90,
      render: (v: string | null) => v ?? <Tag color="orange">未指派</Tag>,
    },
    {
      title: '照片',
      dataIndex: 'photoCount',
      width: 70,
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
    { title: '提交时间', dataIndex: 'createdAt', width: 120, render: fmtTime },
  ];

  return (
    <PageContainer
      title="异常上报"
      subtitle="装配现场的执行异常：提交 → 指派责任人 → 处理 → 确认关闭。质量问题单闭环在质量管理模块（M8）。"
      extra={
        canReport && (
          <Button type="primary" danger icon={<AlertOutlined />} onClick={() => setCreateOpen(true)}>
            上报异常
          </Button>
        )
      }
    >
      <Space className="mb-3" wrap>
        {canSeeAll && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部项目"
            style={{ width: 240 }}
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setPage(1);
            }}
            options={projectOptions}
          />
        )}
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 110 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(EXCEPTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {canSeeAll && (
          <Select
            value={onlyMine}
            style={{ width: 130 }}
            onChange={(v) => {
              setOnlyMine(v);
              setPage(1);
            }}
            options={[
              { value: false, label: '全部异常' },
              { value: true, label: '与我相关' },
            ]}
          />
        )}
        <Input.Search
          allowClear
          placeholder="单号 / 标题 / 物料"
          style={{ width: 220 }}
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

      <ExceptionCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ExceptionDetailDrawer id={detailId} canManage={canManage} onClose={() => setDetailId(undefined)} />
    </PageContainer>
  );
}

/** 异常详情：照片墙 + 处理记录 + 按状态与权限渲染的闭环动作。 */
function ExceptionDetailDrawer({
  id,
  canManage,
  onClose,
}: {
  id: string | undefined;
  canManage: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const myId = useAuthStore((s) => s.user?.id);
  const { data: row, isLoading, refetch } = useExceptionDetail(id);
  const { data: users } = useUserOptions();

  const assign = useAssignException();
  const resolve = useResolveException();
  const close = useCloseException();
  const reopen = useReopenException();

  const [action, setAction] = useState<ActionKind | null>(null);
  const [handlerId, setHandlerId] = useState<string>();
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [users],
  );

  const isHandler = !!row && row.handlerId === myId;
  const isReporter = !!row && row.reporterId === myId;
  const canUpload = !!row && row.status !== 'CLOSED' && (canManage || isHandler || isReporter);

  const openAction = (kind: ActionKind) => {
    setHandlerId(row?.handlerId ?? undefined);
    setNote('');
    setAction(kind);
  };

  const submitAction = async () => {
    if (!row || !action) return;
    try {
      if (action === 'assign') {
        if (!handlerId) return;
        await assign.mutateAsync({ id: row.id, body: { handlerId } });
        message.success('已指派');
      } else if (action === 'resolve') {
        if (!note.trim()) {
          message.warning('请填写处理说明');
          return;
        }
        await resolve.mutateAsync({ id: row.id, body: { handleNote: note.trim() } });
        message.success('已提交处理结果');
      } else if (action === 'close') {
        await close.mutateAsync({ id: row.id, body: { note: note.trim() || null } });
        message.success('已关闭');
      } else {
        await reopen.mutateAsync({ id: row.id, body: { note: note.trim() || null } });
        message.success('已退回整改');
      }
      setAction(null);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const actionButtons = row && (
    <Space wrap>
      {canManage && (row.status === 'OPEN' || row.status === 'HANDLING') && (
        <Button type="primary" size="small" onClick={() => openAction('assign')}>
          {row.handlerId ? '改派' : '指派责任人'}
        </Button>
      )}
      {row.status === 'HANDLING' && (isHandler || canManage) && (
        <Button type="primary" size="small" onClick={() => openAction('resolve')}>
          提交处理结果
        </Button>
      )}
      {canManage && row.status === 'RESOLVED' && (
        <>
          <Button type="primary" size="small" onClick={() => openAction('close')}>
            确认关闭
          </Button>
          <Button size="small" danger onClick={() => openAction('reopen')}>
            退回整改
          </Button>
        </>
      )}
      {canManage && (row.status === 'OPEN' || row.status === 'HANDLING') && (
        <Button size="small" onClick={() => openAction('close')}>
          直接关闭
        </Button>
      )}
    </Space>
  );

  const ACTION_TITLE: Record<ActionKind, string> = {
    assign: '指派责任人',
    resolve: '提交处理结果',
    close: '确认关闭',
    reopen: '退回整改',
  };

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      open={!!id}
      width={560}
      title={row ? `${row.code} ${row.title}` : '异常详情'}
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
              { key: 'status', label: '状态', children: <ExceptionStatusTag status={row.status} /> },
              { key: 'project', label: '项目', children: `${row.projectCode} ${row.projectName}` },
              { key: 'wo', label: '工单', children: row.workOrderCode ?? '—' },
              { key: 'task', label: '任务', children: row.taskName ?? '—' },
              { key: 'material', label: '物料', children: row.materialCode ?? '—' },
              { key: 'reporter', label: '提交人', children: row.reporterName ?? '—' },
              { key: 'handler', label: '责任人', children: row.handlerName ?? '未指派' },
              { key: 'createdAt', label: '提交时间', children: fmtTime(row.createdAt) },
              ...(row.resolvedAt
                ? [{ key: 'resolvedAt', label: '处理时间', children: fmtTime(row.resolvedAt) }]
                : []),
              ...(row.closedAt
                ? [
                    {
                      key: 'closedAt',
                      label: '关闭',
                      children: `${row.closedByName ?? ''} ${fmtTime(row.closedAt)}`,
                    },
                  ]
                : []),
            ]}
          />

          {row.description && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">详细说明</div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {row.description}
              </div>
            </div>
          )}

          {row.handleNote && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">处理记录</div>
              <div className="whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-700">
                {row.handleNote}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">现场照片（{row.photos.length}）</span>
              {canUpload && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setUploading(true);
                    uploadExceptionPhoto(row.id, file)
                      .then(() => refetch())
                      .catch((e: unknown) =>
                        message.error(isApiError(e) ? e.message : '上传失败'),
                      )
                      .finally(() => setUploading(false));
                    return false;
                  }}
                >
                  <Button size="small" icon={<PlusOutlined />} loading={uploading}>
                    补传照片
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
                      src={exceptionPhotoUrl(p.id)}
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
        title={action ? ACTION_TITLE[action] : ''}
        okText="确认"
        confirmLoading={assign.isPending || resolve.isPending || close.isPending || reopen.isPending}
        okButtonProps={action === 'assign' ? { disabled: !handlerId } : undefined}
        onOk={() => void submitAction()}
        onCancel={() => setAction(null)}
      >
        {action === 'assign' ? (
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择责任人"
            className="w-full"
            value={handlerId}
            onChange={setHandlerId}
            options={userOptions}
          />
        ) : (
          <Input.TextArea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === 'resolve'
                ? '处理措施与结果（必填）'
                : action === 'reopen'
                  ? '退回原因（可选）'
                  : '关闭意见（可选）'
            }
          />
        )}
      </Modal>
    </Drawer>
  );
}
