import { useMemo, useState } from 'react';
import { App, Button, Input, Popconfirm, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, RedoOutlined, ReloadOutlined } from '@ant-design/icons';
import type { IntegrationLogItem } from '@mes/shared';
import { isApiError } from '@/api/client';
import { useRetryLog, useResolveLog } from '@/api/integration';
import { useIntegrationLogs } from '@/api/system';

type Filter = 'all' | 'failed' | 'attention';

/** 一行日志是否还挂在异常池里 */
function inPool(row: IntegrationLogItem): boolean {
  return !row.success && !row.resolvedAt;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * 接口日志与异常池（M11）。
 *
 * 失败且未处理的记录即异常池：带 action 的可原样重放（重试），
 * 不可重放的（如人工导入）走「标记已处理」人工补偿。
 */
export function LogPanel({ canWrite }: { canWrite: boolean }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword || undefined,
      success: filter === 'failed' ? false : undefined,
      needsAttention: filter === 'attention' ? true : undefined,
    }),
    [page, pageSize, keyword, filter],
  );
  const { data, isFetching } = useIntegrationLogs(query);
  const retryLog = useRetryLog();
  const resolveLog = useResolveLog();
  const [actingId, setActingId] = useState<string | null>(null);

  const onRetry = (row: IntegrationLogItem) => {
    setActingId(row.id);
    retryLog.mutate(row.id, {
      onSuccess: (result) => {
        if (result.success) {
          message.success(`「${row.interfaceName}」重试成功，已移出异常池`);
        } else {
          message.warning(`重试仍失败（第 ${row.retryCount + 1} 次）：${result.errorMsg ?? ''}`);
        }
      },
      onError: (err: unknown) => message.error(isApiError(err) ? err.message : '重试失败'),
      onSettled: () => setActingId(null),
    });
  };

  const onResolve = (row: IntegrationLogItem) => {
    setActingId(row.id);
    resolveLog.mutate(row.id, {
      onSuccess: () => message.success('已标记为人工处理，移出异常池'),
      onError: (err: unknown) => message.error(isApiError(err) ? err.message : '操作失败'),
      onSettled: () => setActingId(null),
    });
  };

  const columns: ColumnsType<IntegrationLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    { title: '接口', dataIndex: 'interfaceName', width: 200 },
    {
      title: '方向',
      key: 'direction',
      width: 150,
      render: (_, row) => (
        <span className="text-xs text-slate-500">
          {row.sourceSystem} → {row.targetSystem}
        </span>
      ),
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 90,
      render: (v: boolean, row) =>
        v ? (
          <Tag color="green" className="!m-0">
            成功
          </Tag>
        ) : (
          <Tooltip title={row.errorMsg ?? ''}>
            <Tag color="red" className="!m-0">
              失败
            </Tag>
          </Tooltip>
        ),
    },
    { title: '重试', dataIndex: 'retryCount', width: 70, align: 'center' },
    {
      title: '状态',
      dataIndex: 'needsAttention',
      width: 110,
      render: (v: boolean, row) =>
        row.resolvedAt ? (
          <Tag color="blue" className="!m-0">
            已处理
          </Tag>
        ) : v ? (
          <Tag color="orange" className="!m-0">
            待处理
          </Tag>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      title: '触发者',
      dataIndex: 'triggeredBy',
      width: 110,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '操作',
      key: 'op',
      width: 190,
      render: (_, row) => {
        if (!inPool(row) || !canWrite) return <span className="text-slate-400">—</span>;
        return (
          <Space size={4}>
            {row.action ? (
              <Button
                size="small"
                icon={<RedoOutlined />}
                loading={actingId === row.id && retryLog.isPending}
                onClick={() => onRetry(row)}
              >
                重试
              </Button>
            ) : (
              <Tooltip title="该记录没有可重放的动作（如人工导入），只能人工补偿">
                <Button size="small" icon={<RedoOutlined />} disabled>
                  重试
                </Button>
              </Tooltip>
            )}
            <Popconfirm
              title="确认已在系统外解决该异常？"
              description="标记后记录移出异常池，此操作会留审计。"
              onConfirm={() => onResolve(row)}
            >
              <Button
                size="small"
                icon={<CheckOutlined />}
                loading={actingId === row.id && resolveLog.isPending}
              >
                标记已处理
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索接口 / 来源 / 目标系统"
          className="!w-72"
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Segmented<Filter>
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { label: '全部', value: 'all' },
            { label: '失败', value: 'failed' },
            { label: '异常池', value: 'attention' },
          ]}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeyword('');
            setFilter('all');
            setPage(1);
          }}
        >
          重置
        </Button>
      </div>

      <Table<IntegrationLogItem>
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 1100 }}
        rowClassName={(row) => (inPool(row) ? 'bg-red-50/50' : '')}
        expandable={{
          rowExpandable: (row) =>
            row.requestSummary != null || row.responseSummary != null || row.errorMsg != null,
          expandedRowRender: (row) => (
            <div className="grid gap-3 md:grid-cols-2">
              {row.errorMsg && (
                <div className="md:col-span-2 text-xs text-red-600">失败原因：{row.errorMsg}</div>
              )}
              <JsonBlock label="请求摘要" value={row.requestSummary} />
              <JsonBlock label="返回结果" value={row.responseSummary} />
            </div>
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: '暂无接口调用记录' }}
      />
    </div>
  );
}
