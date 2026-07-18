import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import type { AuditLogItem } from '@mes/shared';
import { useAuditLogs } from '@/api/system';
import { PageContainer } from '../PageContainer';

const { RangePicker } = DatePicker;

/** 动作前缀 → 中文，让审计列表可读。未知动作原样显示。 */
const ACTION_LABEL: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.change-password': '修改密码',
  'user.create': '新建用户',
  'user.update': '编辑用户',
  'user.set-status': '启用/禁用用户',
  'user.reset-password': '重置密码',
  'user.assign-roles': '分配角色',
  'user.delete': '删除用户',
  'role.create': '新建角色',
  'role.update': '编辑角色',
  'role.set-permissions': '设置角色权限',
  'role.delete': '删除角色',
  'dept.create': '新建部门',
  'dept.update': '编辑部门',
  'dept.delete': '删除部门',
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState<[string, string] | undefined>();

  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword || undefined,
      from: range?.[0],
      to: range?.[1],
    }),
    [page, pageSize, keyword, range],
  );
  const { data, isFetching } = useAuditLogs(query);

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作人',
      dataIndex: 'username',
      width: 140,
      render: (v: string | null) => v ?? <span className="text-slate-400">系统/匿名</span>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 150,
      render: (v: string) => ACTION_LABEL[v] ?? v,
    },
    {
      title: '对象',
      key: 'target',
      width: 200,
      render: (_, row) =>
        row.targetType ? (
          <span className="text-slate-600">
            {row.targetType}
            {row.targetId && <span className="ml-1 font-mono text-xs text-slate-400">#{row.targetId.slice(0, 8)}</span>}
          </span>
        ) : (
          '—'
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
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v) => v ?? '—' },
  ];

  return (
    <PageContainer
      title="审计日志"
      subtitle="记录关键写操作的操作人、动作、对象与结果。成功与失败都留痕，用于安全追溯。"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索操作人 / 动作 / 对象 ID"
          className="!w-72"
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <RangePicker
          showTime
          onChange={(_, strings) => {
            setRange(strings[0] && strings[1] ? [strings[0], strings[1]] : undefined);
            setPage(1);
          }}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeyword('');
            setRange(undefined);
            setPage(1);
          }}
        >
          重置
        </Button>
      </div>

      <Table<AuditLogItem>
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 900 }}
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
      />
    </PageContainer>
  );
}
