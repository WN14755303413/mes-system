import { useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  IssuePriority,
  IssueStatus,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  RiskLevel,
  RiskStatus,
  type IssueItem,
  type RiskItem,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useDeleteIssue,
  useDeleteRisk,
  useProjectIssues,
  useProjectRisks,
  useProjects,
  useSaveIssue,
  useSaveRisk,
  useUserOptions,
} from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

const ISSUE_STATUS_COLOR: Record<IssueStatus, string> = {
  OPEN: 'red',
  IN_PROGRESS: 'processing',
  RESOLVED: 'green',
  CLOSED: 'default',
};

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  LOW: 'default',
  MEDIUM: 'gold',
  HIGH: 'red',
};

const fmt = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');

export default function ProjectRiskPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('project:risk:write'));

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const [projectId, setProjectId] = useState<string>();
  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? [])
        .filter((p) => p.status !== 'VOIDED')
        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const effectiveProjectId = projectId ?? projectOptions[0]?.value;

  const { data: userOptions } = useUserOptions();
  const userSelectOptions = useMemo(
    () => (userOptions ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [userOptions],
  );

  return (
    <PageContainer
      title="风险与问题"
      subtitle="项目风险登记与问题闭环。风险是可能发生的隐患，问题是已经发生、需要处理到关闭的事项。"
    >
      <div className="mb-4">
        <Select
          className="!w-80"
          placeholder="选择项目"
          showSearch
          optionFilterProp="label"
          value={effectiveProjectId}
          onChange={setProjectId}
          options={projectOptions}
        />
      </div>

      {!effectiveProjectId ? (
        <Empty description="请先在上方选择项目" />
      ) : (
        <Tabs
          defaultActiveKey="risk"
          items={[
            {
              key: 'risk',
              label: '风险登记',
              children: (
                <RiskTab
                  projectId={effectiveProjectId}
                  canWrite={canWrite}
                  userOptions={userSelectOptions}
                />
              ),
            },
            {
              key: 'issue',
              label: '问题闭环',
              children: (
                <IssueTab
                  projectId={effectiveProjectId}
                  canWrite={canWrite}
                  userOptions={userSelectOptions}
                />
              ),
            },
          ]}
        />
      )}
    </PageContainer>
  );
}

// ============================================================
//  风险 Tab
// ============================================================

function RiskTab({
  projectId,
  canWrite,
  userOptions,
}: {
  projectId: string;
  canWrite: boolean;
  userOptions: { value: string; label: string }[];
}) {
  const { message, modal } = App.useApp();
  const { data: risks, isFetching } = useProjectRisks(projectId);
  const saveRisk = useSaveRisk();
  const deleteRisk = useDeleteRisk();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RiskItem | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ level: RiskLevel.MEDIUM, status: RiskStatus.OPEN });
    setOpen(true);
  };

  const openEdit = (r: RiskItem) => {
    setEditing(r);
    form.setFieldsValue({
      title: r.title,
      level: r.level,
      status: r.status,
      mitigation: r.mitigation ?? undefined,
      ownerId: r.ownerId ?? undefined,
    });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await saveRisk.mutateAsync({
        projectId,
        id: editing?.id,
        body: {
          title: v.title,
          level: v.level,
          status: v.status,
          mitigation: v.mitigation || null,
          ownerId: v.ownerId || null,
        },
      });
      message.success('已保存');
      setOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  const columns: ColumnsType<RiskItem> = [
    { title: '风险描述', dataIndex: 'title', ellipsis: true },
    {
      title: '等级',
      dataIndex: 'level',
      width: 80,
      render: (l: RiskLevel) => <Tag color={RISK_COLOR[l]}>{RISK_LEVEL_LABEL[l]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: RiskStatus) => (
        <Tag color={s === 'OPEN' ? 'orange' : 'default'}>{RISK_STATUS_LABEL[s]}</Tag>
      ),
    },
    { title: '责任人', dataIndex: 'ownerName', width: 100, render: (v) => v ?? '—' },
    { title: '应对措施', dataIndex: 'mitigation', ellipsis: true, render: (v) => v ?? '—' },
    { title: '登记时间', dataIndex: 'createdAt', width: 110, render: fmt },
    ...(canWrite
      ? [
          {
            title: '操作',
            width: 90,
            render: (_: unknown, r: RiskItem) => (
              <Space size={0}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: `删除风险「${r.title}」？`,
                      okText: '删除',
                      okButtonProps: { danger: true },
                      onOk: () =>
                        deleteRisk
                          .mutateAsync({ projectId, id: r.id })
                          .then(() => message.success('已删除'))
                          .catch((err) =>
                            message.error(isApiError(err) ? err.message : '删除失败'),
                          ),
                    })
                  }
                />
              </Space>
            ),
          } satisfies ColumnsType<RiskItem>[number],
        ]
      : []),
  ];

  return (
    <div>
      {canWrite && (
        <div className="mb-3 flex justify-end">
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            登记风险
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={risks ?? []}
        pagination={false}
      />

      <Modal
        maskClosable={false}
        keyboard={false}
        title={editing ? '编辑风险' : '登记风险'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saveRisk.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="title" label="风险描述" rules={[{ required: true, message: '请输入风险描述' }]}>
            <Input placeholder="如 关键泵件供应商交期风险" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="level" label="等级" rules={[{ required: true }]}>
              <Select
                options={Object.values(RiskLevel).map((l) => ({
                  value: l,
                  label: RISK_LEVEL_LABEL[l],
                }))}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                options={Object.values(RiskStatus).map((s) => ({
                  value: s,
                  label: RISK_STATUS_LABEL[s],
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="ownerId" label="责任人">
            <Select allowClear showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item name="mitigation" label="应对措施">
            <Input.TextArea rows={3} maxLength={1000} placeholder="如 提前下单 + 备选供应商" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============================================================
//  问题 Tab
// ============================================================

function IssueTab({
  projectId,
  canWrite,
  userOptions,
}: {
  projectId: string;
  canWrite: boolean;
  userOptions: { value: string; label: string }[];
}) {
  const { message, modal } = App.useApp();
  const { data: issues, isFetching } = useProjectIssues(projectId);
  const saveIssue = useSaveIssue();
  const deleteIssue = useDeleteIssue();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IssueItem | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: IssueStatus.OPEN, priority: IssuePriority.MEDIUM });
    setOpen(true);
  };

  const openEdit = (i: IssueItem) => {
    setEditing(i);
    form.setFieldsValue({
      title: i.title,
      description: i.description ?? undefined,
      status: i.status,
      priority: i.priority,
      ownerId: i.ownerId ?? undefined,
      dueDate: i.dueDate ? dayjs(i.dueDate) : undefined,
    });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await saveIssue.mutateAsync({
        projectId,
        id: editing?.id,
        body: {
          title: v.title,
          description: v.description || null,
          status: v.status,
          priority: v.priority,
          ownerId: v.ownerId || null,
          dueDate: v.dueDate ? v.dueDate.startOf('day').toISOString() : null,
        },
      });
      message.success('已保存');
      setOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  const columns: ColumnsType<IssueItem> = [
    { title: '问题', dataIndex: 'title', ellipsis: true },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p: IssuePriority) => <Tag color={PRIORITY_COLOR[p]}>{ISSUE_PRIORITY_LABEL[p]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: IssueStatus) => (
        <Tag color={ISSUE_STATUS_COLOR[s]}>{ISSUE_STATUS_LABEL[s]}</Tag>
      ),
    },
    { title: '责任人', dataIndex: 'ownerName', width: 100, render: (v) => v ?? '—' },
    {
      title: '要求完成',
      dataIndex: 'dueDate',
      width: 110,
      render: (d: string | null, i) => {
        if (!d) return '—';
        const overdue =
          dayjs(d).isBefore(dayjs(), 'day') &&
          i.status !== IssueStatus.RESOLVED &&
          i.status !== IssueStatus.CLOSED;
        return <span className={overdue ? 'font-medium text-red-500' : ''}>{fmt(d)}</span>;
      },
    },
    { title: '解决时间', dataIndex: 'resolvedAt', width: 110, render: fmt },
    ...(canWrite
      ? [
          {
            title: '操作',
            width: 90,
            render: (_: unknown, i: IssueItem) => (
              <Space size={0}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(i)} />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: `删除问题「${i.title}」？`,
                      okText: '删除',
                      okButtonProps: { danger: true },
                      onOk: () =>
                        deleteIssue
                          .mutateAsync({ projectId, id: i.id })
                          .then(() => message.success('已删除'))
                          .catch((err) =>
                            message.error(isApiError(err) ? err.message : '删除失败'),
                          ),
                    })
                  }
                />
              </Space>
            ),
          } satisfies ColumnsType<IssueItem>[number],
        ]
      : []),
  ];

  return (
    <div>
      {canWrite && (
        <div className="mb-3 flex justify-end">
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            新增问题
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={issues ?? []}
        pagination={false}
      />

      <Modal
        maskClosable={false}
        keyboard={false}
        title={editing ? '编辑问题' : '新增问题'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saveIssue.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="title" label="问题标题" rules={[{ required: true, message: '请输入问题标题' }]}>
            <Input placeholder="如 管路接口与图纸不符" />
          </Form.Item>
          <Form.Item name="description" label="问题描述">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="priority" label="优先级">
              <Select
                options={Object.values(IssuePriority).map((p) => ({
                  value: p,
                  label: ISSUE_PRIORITY_LABEL[p],
                }))}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                options={Object.values(IssueStatus).map((s) => ({
                  value: s,
                  label: ISSUE_STATUS_LABEL[s],
                }))}
              />
            </Form.Item>
            <Form.Item name="ownerId" label="责任人">
              <Select allowClear showSearch optionFilterProp="label" options={userOptions} />
            </Form.Item>
            <Form.Item name="dueDate" label="要求完成日期">
              <DatePicker className="!w-full" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
