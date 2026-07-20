import { useEffect, useMemo, useState } from 'react';
import { CommentOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Segmented, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPE_LABEL,
  type FeedbackRow,
  type FeedbackStatus,
  type FeedbackType,
} from '@mes/shared';
import { useFeedbackStats, useFeedbacks } from '@/api/feedback';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '@/pages/system/PageContainer';
import { FeedbackDetailDrawer } from './FeedbackDetailDrawer';
import { FeedbackModal } from './FeedbackModal';
import { FeedbackSeverityTag, FeedbackStatusTag, FeedbackTypeTag, timeAgo } from './shared';

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  ...(Object.entries(FEEDBACK_STATUS_LABEL) as [FeedbackStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

const TYPE_OPTIONS = (Object.entries(FEEDBACK_TYPE_LABEL) as [FeedbackType, string][]).map(
  ([value, label]) => ({ value, label }),
);

/** 状态统计小格：数字 + 标签，一行四格不占高度。 */
function StatCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-1 items-baseline justify-between rounded-xl border border-slate-200/70 bg-white/60 px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/**
 * 反馈中心（M12）。所有登录用户可见：普通用户是「我的反馈」，
 * 有 feedback:manage 者默认「全部反馈」并可切换视角。
 * 通知点进来带 ?id=，自动打开对应详情。
 */
export default function FeedbackPage() {
  const canManage = useAuthStore((s) => s.hasPermission('feedback:manage'));

  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const [type, setType] = useState<FeedbackType>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const mine = !canManage || scope === 'mine';
  const { data, isLoading } = useFeedbacks({
    status: status || undefined,
    type,
    keyword: keyword || undefined,
    mine: mine ? '1' : undefined,
    page,
    pageSize,
  });
  const { data: stats } = useFeedbackStats();

  const [createOpen, setCreateOpen] = useState(false);

  // 通知跳转：/feedback?id=xxx 直开详情。参数在关闭抽屉时才清——
  // AppLayout 的页面过渡（AnimatePresence mode="wait"）会让本页先短暂挂载一次
  // 再重挂真正的实例，若挂载即清参，第二个实例就读不到 id 了。
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedId = searchParams.get('id') ?? undefined;
  const [detailId, setDetailId] = useState<string | undefined>(linkedId);
  useEffect(() => {
    if (linkedId) setDetailId(linkedId);
  }, [linkedId]);
  const closeDetail = () => {
    setDetailId(undefined);
    if (searchParams.get('id')) setSearchParams({}, { replace: true });
  };

  const columns: ColumnsType<FeedbackRow> = useMemo(
    () => [
      {
        title: '编号',
        dataIndex: 'code',
        width: 140,
        render: (v: string, r) => (
          <Button type="link" size="small" className="!px-0 font-mono" onClick={() => setDetailId(r.id)}>
            {v}
          </Button>
        ),
      },
      { title: '类型', dataIndex: 'type', width: 90, render: (v: FeedbackType) => <FeedbackTypeTag type={v} /> },
      {
        title: '标题',
        dataIndex: 'title',
        ellipsis: true,
        render: (v: string, r) => (
          <div className="min-w-0">
            <div className="truncate text-[13px] text-slate-700">{v}</div>
            {r.pageTitle && <div className="truncate text-xs text-slate-400">来自「{r.pageTitle}」</div>}
          </div>
        ),
      },
      {
        title: '影响',
        dataIndex: 'severity',
        width: 90,
        render: (v: FeedbackRow['severity']) => <FeedbackSeverityTag severity={v} />,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (v: FeedbackStatus) => <FeedbackStatusTag status={v} />,
      },
      ...(mine
        ? []
        : [
            {
              title: '提交人',
              dataIndex: 'submitterName',
              width: 90,
              render: (v: string | null) => v ?? '—',
            } satisfies ColumnsType<FeedbackRow>[number],
          ]),
      {
        title: '处理人',
        dataIndex: 'handlerName',
        width: 90,
        render: (v: string | null) => v ?? <Tag color="orange">待接单</Tag>,
      },
      {
        title: '附件',
        dataIndex: 'attachmentCount',
        width: 70,
        align: 'center',
        render: (v: number) =>
          v ? (
            <span className="text-xs text-slate-500">
              <PaperClipOutlined className="mr-0.5" />
              {v}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        title: '最后动态',
        dataIndex: 'lastActionAt',
        width: 110,
        render: (v: string) => <span className="text-xs text-slate-500">{timeAgo(v)}</span>,
      },
    ],
    [mine],
  );

  return (
    <PageContainer
      title="反馈中心"
      subtitle="产品使用中的任何问题与建议——提交后处理进展会通过顶栏铃铛通知你"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          提交反馈
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatCell label="待处理" value={stats?.open ?? 0} tone={stats?.open ? 'text-rose-500' : 'text-slate-400'} />
          <StatCell label="处理中" value={stats?.processing ?? 0} tone="text-industrial-500" />
          <StatCell label="已解决" value={stats?.resolved ?? 0} tone="text-emerald-500" />
          <StatCell label="已驳回" value={stats?.rejected ?? 0} tone="text-slate-400" />
          <div className="hidden shrink-0 text-xs text-slate-400 lg:block">
            近 7 天新增 <span className="font-medium text-slate-600">{stats?.weekNew ?? 0}</span> 条
            {stats?.scope === 'MINE' && '（我提交的）'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canManage && (
            <Segmented
              value={scope}
              onChange={(v) => {
                setScope(v as 'all' | 'mine');
                setPage(1);
              }}
              options={[
                { value: 'all', label: '全部反馈' },
                { value: 'mine', label: '我的反馈' },
              ]}
            />
          )}
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v as FeedbackStatus | '');
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
          <Select
            allowClear
            placeholder="类型"
            style={{ width: 110 }}
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            placeholder="编号 / 标题"
            style={{ width: 190 }}
            onSearch={(v) => {
              setKeyword(v.trim());
              setPage(1);
            }}
          />
        </div>

        <Table
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items}
          locale={{
            emptyText: (
              <div className="py-10 text-center text-sm text-slate-400">
                <CommentOutlined className="mb-2 block text-2xl text-slate-300" />
                还没有反馈——遇到问题点右上角「提交反馈」，或在任意页面点顶栏 💬
              </div>
            ),
          }}
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
      </div>

      <FeedbackModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <FeedbackDetailDrawer id={detailId} onClose={closeDetail} />
    </PageContainer>
  );
}
