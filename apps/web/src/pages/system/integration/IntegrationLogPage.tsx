import { useMemo, useState } from 'react';
import { Button, Input, Segmented, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import type { IntegrationLogItem } from '@mes/shared';
import { useIntegrationLogs } from '@/api/system';
import { PageContainer } from '../PageContainer';

type Filter = 'all' | 'failed' | 'attention';

export default function IntegrationLogPage() {
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
      width: 160,
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
      width: 120,
      render: (v: string | null) => v ?? '—',
    },
  ];

  return (
    <PageContainer
      title="接口日志"
      subtitle="ERP / 钉钉等外部系统的数据同步记录。失败记录构成异常池，重试与补偿将在集成阶段（M11）接入。"
    >
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
            { label: '待处理', value: 'attention' },
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
        scroll={{ x: 900 }}
        rowClassName={(row) => (!row.success && !row.resolvedAt ? 'bg-red-50/50' : '')}
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
        locale={{ emptyText: '暂无接口调用记录（外部系统集成将在 M11 接入）' }}
      />
    </PageContainer>
  );
}
