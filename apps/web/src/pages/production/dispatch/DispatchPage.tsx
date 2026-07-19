import { useMemo, useState } from 'react';
import { App, Button, Input, Modal, Progress, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons';
import {
  ASSEMBLY_TASK_STATUS_LABEL,
  type AssemblyTaskStatus,
  type TaskWithContextRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { useAssignTask, useDispatchTasks } from '@/api/production';
import { useProjects, useUserOptions } from '@/api/project';
import { PageContainer } from '../../system/PageContainer';
import { CraftTag, TaskStatusTag, WoStatusTag, fmtDate } from '../shared';

/** 装配派工（M7，§8.5）。任务派到人后，装配工在「现场报工」页看到并执行。 */
export default function DispatchPage() {
  const { message } = App.useApp();

  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<AssemblyTaskStatus>();
  const [unassignedOnly, setUnassignedOnly] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useDispatchTasks({
    projectId,
    status,
    unassignedOnly: unassignedOnly || undefined,
    keyword: keyword || undefined,
    page,
    pageSize,
  });
  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const { data: users } = useUserOptions();
  const assign = useAssignTask();

  const [assigning, setAssigning] = useState<TaskWithContextRow | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>();

  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [users],
  );

  const handleAssign = async () => {
    if (!assigning || !assigneeId) return;
    try {
      await assign.mutateAsync({ id: assigning.id, body: { assigneeId } });
      message.success('已派工');
      setAssigning(null);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '派工失败');
    }
  };

  const columns: ColumnsType<TaskWithContextRow> = [
    { title: '任务', dataIndex: 'name', width: 190, ellipsis: true },
    {
      title: '工单',
      dataIndex: 'workOrderCode',
      width: 190,
      ellipsis: true,
      render: (v: string, r) => (
        <Space size={4}>
          <span className="font-mono">{v}</span>
          <WoStatusTag status={r.workOrderStatus} />
        </Space>
      ),
    },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 170,
      ellipsis: true,
      render: (v: string, r) => `${v} ${r.projectName}`,
    },
    { title: '专业', dataIndex: 'craft', width: 95, render: (v) => <CraftTag craft={v} /> },
    {
      title: '负责人',
      dataIndex: 'assigneeName',
      width: 100,
      render: (v: string | null) => v ?? <Tag color="orange">未派工</Tag>,
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <TaskStatusTag status={v} /> },
    {
      title: '计划起止',
      key: 'plan',
      width: 180,
      render: (_, r) => `${fmtDate(r.planStartAt)} ~ ${fmtDate(r.planEndAt)}`,
    },
    {
      title: '标准工时',
      dataIndex: 'standardHours',
      width: 85,
      align: 'right',
      render: (v: number | null) => v ?? '—',
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 110,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 95,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={r.assigneeId ? <UserSwitchOutlined /> : <UserAddOutlined />}
          disabled={r.status === 'COMPLETED' || !['DRAFT', 'RELEASED', 'IN_PROGRESS', 'PAUSED'].includes(r.workOrderStatus)}
          onClick={() => {
            setAssigning(r);
            setAssigneeId(r.assigneeId ?? undefined);
          }}
        >
          {r.assigneeId ? '改派' : '派工'}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="装配派工"
      subtitle="把工单任务派到具体装配人员。装配工只会看到派给自己的任务（工单下达后生效）。"
    >
      <Space className="mb-3" wrap>
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
        <Select
          allowClear
          placeholder="任务状态"
          style={{ width: 120 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(ASSEMBLY_TASK_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Select
          value={unassignedOnly}
          style={{ width: 130 }}
          onChange={(v) => {
            setUnassignedOnly(v);
            setPage(1);
          }}
          options={[
            { value: true, label: '仅未派工' },
            { value: false, label: '全部任务' },
          ]}
        />
        <Input.Search
          allowClear
          placeholder="任务名 / 工单号"
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

      <Modal
        open={!!assigning}
        title={assigning ? `${assigning.assigneeId ? '改派' : '派工'}：${assigning.name}` : ''}
        okText="确认"
        okButtonProps={{ disabled: !assigneeId }}
        confirmLoading={assign.isPending}
        onOk={() => void handleAssign()}
        onCancel={() => setAssigning(null)}
      >
        {assigning && (
          <div className="mb-3 text-sm text-slate-500">
            {assigning.workOrderCode} {assigning.workOrderName} · {assigning.projectCode}{' '}
            {assigning.projectName}
          </div>
        )}
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="选择装配人员"
          className="w-full"
          value={assigneeId}
          onChange={setAssigneeId}
          options={userOptions}
        />
      </Modal>
    </PageContainer>
  );
}
