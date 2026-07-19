import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Image,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileProtectOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  InspectionStatus,
  type InspectionItemRow,
  type InspectionRow,
  type InspectionType,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  inspectionPhotoUrl,
  uploadInspectionPhoto,
  useInspectionDetail,
  useInspections,
  useJudgeInspection,
  useVoidInspection,
} from '@/api/quality';
import { useProjects } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { fmtTime, InspectionStatusTag, InspectionTypeTag, ItemPassedTag } from '../shared';
import { InspectionFormModal } from './InspectionFormModal';

/** 检验单（M8，§8.7 五类检验）。判定即终态；不合格自动生成质量问题单。 */
export default function InspectionPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('inspection:write'));

  const [type, setType] = useState<InspectionType>();
  const [status, setStatus] = useState<InspectionStatus>();
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useInspections({
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
  const [detailId, setDetailId] = useState<string>();

  const columns: ColumnsType<InspectionRow> = [
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
    { title: '类型', dataIndex: 'type', width: 90, render: (v) => <InspectionTypeTag type={v} /> },
    { title: '检验对象', dataIndex: 'title', width: 200, ellipsis: true },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string | null, r) => (v ? `${v} ${r.projectName}` : '—'),
    },
    {
      title: '工单 / 任务',
      key: 'ctx',
      width: 170,
      ellipsis: true,
      render: (_, r) =>
        r.workOrderCode ? `${r.workOrderCode}${r.taskName ? ` · ${r.taskName}` : ''}` : '—',
    },
    {
      title: '物料 / 批次',
      key: 'mat',
      width: 140,
      ellipsis: true,
      render: (_, r) =>
        r.materialCode ? `${r.materialCode}${r.batchNo ? ` / ${r.batchNo}` : ''}` : (r.batchNo ?? '—'),
    },
    {
      title: '明细',
      dataIndex: 'itemCount',
      width: 80,
      align: 'center',
      render: (v: number, r) =>
        r.failedItemCount > 0 ? (
          <span>
            {v} <Tag color="error">{r.failedItemCount} 不合格</Tag>
          </span>
        ) : (
          v || '—'
        ),
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <InspectionStatusTag status={v} /> },
    { title: '检验员', dataIndex: 'inspectorName', width: 90, render: (v) => v ?? '—' },
    { title: '判定时间', dataIndex: 'judgedAt', width: 110, render: fmtTime },
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
  ];

  return (
    <PageContainer
      title="检验单"
      subtitle="来料 / 过程 / 装配 / 出厂检验记录。判定不合格将自动生成质量问题单进入闭环。"
      extra={
        canWrite && (
          <Button type="primary" icon={<FileProtectOutlined />} onClick={() => setFormOpen(true)}>
            新建检验单
          </Button>
        )
      }
    >
      <Space className="mb-3" wrap>
        <Select
          allowClear
          placeholder="检验类型"
          style={{ width: 120 }}
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={Object.entries(INSPECTION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
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
          options={Object.entries(INSPECTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
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
        <Input.Search
          allowClear
          placeholder="单号 / 对象 / 物料 / 批次"
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

      <InspectionFormModal open={formOpen} editing={null} onClose={() => setFormOpen(false)} />
      <InspectionDetailDrawer
        id={detailId}
        canWrite={canWrite}
        onClose={() => setDetailId(undefined)}
        onOpenIssue={undefined}
      />
    </PageContainer>
  );
}

/** 检验单详情：单头 + 明细项 + 照片墙 + 待检态的编辑/判定/作废。 */
export function InspectionDetailDrawer({
  id,
  canWrite,
  onClose,
  onOpenIssue,
}: {
  id: string | undefined;
  canWrite: boolean;
  onClose: () => void;
  /** 问题单页复用本抽屉时，点击关联问题单的回调。 */
  onOpenIssue?: (issueId: string) => void;
}) {
  const { message } = App.useApp();
  const { data: row, isLoading, refetch } = useInspectionDetail(id);
  const judge = useJudgeInspection();
  const voidMutation = useVoidInspection();

  const [editOpen, setEditOpen] = useState(false);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [judgeResult, setJudgeResult] = useState<'PASSED' | 'REJECTED'>('PASSED');
  const [judgeRemark, setJudgeRemark] = useState('');
  const [uploading, setUploading] = useState(false);

  const isPending = row?.status === InspectionStatus.PENDING;
  const failedCount = (row?.items ?? []).filter((it) => it.passed === false).length;

  const openJudge = () => {
    // 明细里有不合格行时默认判不合格，减少误判
    setJudgeResult(failedCount > 0 ? 'REJECTED' : 'PASSED');
    setJudgeRemark('');
    setJudgeOpen(true);
  };

  const submitJudge = async () => {
    if (!row) return;
    try {
      const result = await judge.mutateAsync({
        id: row.id,
        body: { result: judgeResult, remark: judgeRemark.trim() || null },
      });
      if (result.issueCode) {
        message.warning(`已判定不合格，自动生成质量问题单 ${result.issueCode}`, 5);
      } else {
        message.success('已判定合格');
      }
      setJudgeOpen(false);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '判定失败');
    }
  };

  const handleVoid = async () => {
    if (!row) return;
    try {
      await voidMutation.mutateAsync(row.id);
      message.success('检验单已作废');
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '作废失败');
    }
  };

  const itemColumns: ColumnsType<InspectionItemRow> = [
    { title: '#', dataIndex: 'seq', width: 40 },
    { title: '检验项目', dataIndex: 'name', width: 170, ellipsis: true },
    { title: '标准要求', dataIndex: 'standard', ellipsis: true, render: (v) => v ?? '—' },
    { title: '实测 / 实况', dataIndex: 'actual', ellipsis: true, render: (v) => v ?? '—' },
    {
      title: '判定',
      dataIndex: 'passed',
      width: 80,
      render: (v: boolean | null) => <ItemPassedTag passed={v} />,
    },
  ];

  return (
    <Drawer
      open={!!id}
      width={640}
      title={row ? `${row.code} ${row.title}` : '检验单详情'}
      onClose={onClose}
      loading={isLoading}
      extra={
        row &&
        canWrite && (
          <Space>
            {isPending && (
              <>
                <Button size="small" onClick={() => setEditOpen(true)}>
                  编辑
                </Button>
                <Button type="primary" size="small" onClick={openJudge}>
                  判定
                </Button>
                <Popconfirm title="确认作废该检验单？" onConfirm={() => void handleVoid()}>
                  <Button size="small" danger>
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
              { key: 'type', label: '类型', children: <InspectionTypeTag type={row.type} /> },
              { key: 'status', label: '状态', children: <InspectionStatusTag status={row.status} /> },
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
              { key: 'material', label: '物料', children: row.materialCode ?? '—' },
              { key: 'batch', label: '批次 / 序列号', children: row.batchNo ?? '—' },
              { key: 'supplier', label: '供应商', children: row.supplierName ?? '—' },
              { key: 'inspector', label: '检验员', children: row.inspectorName ?? '—' },
              ...(row.judgedAt
                ? [
                    {
                      key: 'judged',
                      label: '判定',
                      children: `${row.judgedByName ?? ''} ${fmtTime(row.judgedAt)}`,
                    },
                  ]
                : []),
              { key: 'createdAt', label: '创建时间', children: fmtTime(row.createdAt) },
            ]}
          />

          {row.remark && (
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {row.remark}
            </div>
          )}

          {row.issues.length > 0 && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm">
              <span className="mr-2 font-medium text-red-600">关联质量问题单：</span>
              {row.issues.map((issue) => (
                <Button
                  key={issue.id}
                  type="link"
                  size="small"
                  className="!px-1 font-mono"
                  onClick={() => onOpenIssue?.(issue.id)}
                  disabled={!onOpenIssue}
                >
                  {issue.code}
                </Button>
              ))}
              {!onOpenIssue && (
                <span className="text-slate-500">（在「质量问题」页跟踪闭环）</span>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">
              检验项明细（{row.items.length}
              {failedCount > 0 ? `，${failedCount} 项不合格` : ''}）
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={row.items}
              pagination={false}
              locale={{ emptyText: '无明细项' }}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">检验照片（{row.photos.length}）</span>
              {canWrite && row.status !== InspectionStatus.VOIDED && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setUploading(true);
                    uploadInspectionPhoto(row.id, file)
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
                      src={inspectionPhotoUrl(p.id)}
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

      {/* 编辑复用创建表单（仅待检态可达） */}
      {row && (
        <InspectionFormModal
          open={editOpen}
          editing={row}
          onClose={() => {
            setEditOpen(false);
            void refetch();
          }}
        />
      )}

      <Modal
        open={judgeOpen}
        title="检验判定"
        okText="确认判定"
        confirmLoading={judge.isPending}
        onOk={() => void submitJudge()}
        onCancel={() => setJudgeOpen(false)}
      >
        <div className="space-y-3">
          {failedCount > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              明细中有 {failedCount} 项不合格。
            </div>
          )}
          <Radio.Group
            value={judgeResult}
            onChange={(e) => setJudgeResult(e.target.value as 'PASSED' | 'REJECTED')}
            options={[
              { value: 'PASSED', label: '合格' },
              { value: 'REJECTED', label: '不合格' },
            ]}
          />
          {judgeResult === 'REJECTED' && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              判定不合格后将自动生成质量问题单，进入「分派 → 整改 → 复检 → 关闭」闭环。
            </div>
          )}
          <Input.TextArea
            rows={3}
            maxLength={2000}
            value={judgeRemark}
            onChange={(e) => setJudgeRemark(e.target.value)}
            placeholder="判定意见（可选）"
          />
        </div>
      </Modal>
    </Drawer>
  );
}
