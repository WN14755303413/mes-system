import { useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TRANSITIONS,
  RISK_LEVEL_LABEL,
  RecordStatus,
  RiskLevel,
  type MilestoneItem,
  type ProjectListItem,
  type RecordStatus as RecordStatusT,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useAddMember,
  useChangeProjectStatus,
  useCreateProject,
  useDeleteMilestone,
  useDeleteProject,
  useProjectDetail,
  useProjects,
  useRemoveMember,
  useSaveMilestone,
  useUpdateProject,
  useUserOptions,
} from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  RELEASED: 'blue',
  IN_PROGRESS: 'processing',
  PAUSED: 'orange',
  CHANGING: 'gold',
  COMPLETED: 'green',
  CLOSED: 'default',
  VOIDED: 'red',
};

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

const fmt = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');

export default function ProjectListPage() {
  const { message, modal } = App.useApp();
  const canCreate = useAuthStore((s) => s.hasPermission('project:create'));
  const canUpdate = useAuthStore((s) => s.hasPermission('project:update'));
  const canDelete = useAuthStore((s) => s.hasPermission('project:delete'));

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [riskLevel, setRiskLevel] = useState<RiskLevel | undefined>();

  const query = useMemo(
    () => ({ page, pageSize, keyword: keyword || undefined, status, riskLevel }),
    [page, pageSize, keyword, status, riskLevel],
  );
  const { data, isFetching } = useProjects(query);
  const { data: userOptions } = useUserOptions();

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const changeStatus = useChangeProjectStatus();
  const deleteProject = useDeleteProject();

  const userSelectOptions = useMemo(
    () => (userOptions ?? []).map((u) => ({ value: u.id, label: u.displayName })),
    [userOptions],
  );

  // ---- 新建/编辑弹窗 ----
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectListItem | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ equipmentCount: 1, riskLevel: 'LOW' });
    setEditOpen(true);
  };

  const openEdit = (p: ProjectListItem) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name,
      customerName: p.customerName ?? undefined,
      contractNo: p.contractNo ?? undefined,
      projectType: p.projectType ?? undefined,
      equipmentCount: p.equipmentCount,
      managerId: p.managerId ?? undefined,
      riskLevel: p.riskLevel,
      range: p.planStartAt || p.planEndAt
        ? [p.planStartAt ? dayjs(p.planStartAt) : null, p.planEndAt ? dayjs(p.planEndAt) : null]
        : undefined,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    const values = await form.validateFields();
    const [start, end] = values.range ?? [null, null];
    const body = {
      name: values.name,
      customerName: values.customerName || null,
      contractNo: values.contractNo || null,
      projectType: values.projectType || null,
      equipmentCount: values.equipmentCount ?? 1,
      managerId: values.managerId || null,
      riskLevel: values.riskLevel,
      planStartAt: start ? start.startOf('day').toISOString() : null,
      planEndAt: end ? end.startOf('day').toISOString() : null,
      description: values.description || null,
    };
    try {
      if (editing) {
        await updateProject.mutateAsync({ id: editing.id, body });
        message.success('已保存');
      } else {
        const r = await createProject.mutateAsync(body);
        message.success(`项目已创建，编号 ${r.code}`);
      }
      setEditOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '操作失败');
    }
  };

  const onDelete = (p: ProjectListItem) => {
    modal.confirm({
      title: `删除项目「${p.name}」？`,
      content: '仅草稿状态可删除。此操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProject.mutateAsync(p.id);
          message.success('已删除');
        } catch (err) {
          message.error(isApiError(err) ? err.message : '删除失败');
        }
      },
    });
  };

  const onChangeStatus = async (p: ProjectListItem, target: string) => {
    try {
      await changeStatus.mutateAsync({ id: p.id, body: { status: target } });
      message.success(`已变更为「${RECORD_STATUS_LABEL[target as RecordStatusT]}」`);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '状态变更失败');
    }
  };

  // ---- 详情抽屉 ----
  const [detailId, setDetailId] = useState<string | undefined>();

  const columns: ColumnsType<ProjectListItem> = [
    {
      title: '项目编号',
      dataIndex: 'code',
      width: 140,
      render: (code, p) => (
        <Typography.Link onClick={() => setDetailId(p.id)}>{code}</Typography.Link>
      ),
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (name, p) => (
        <Space size={6}>
          <span>{name}</span>
          {p.openRiskCount > 0 && (
            <Tag color="orange" className="!m-0 !px-1 !text-[10px] !leading-4">
              风险 {p.openRiskCount}
            </Tag>
          )}
          {p.openIssueCount > 0 && (
            <Tag color="red" className="!m-0 !px-1 !text-[10px] !leading-4">
              问题 {p.openIssueCount}
            </Tag>
          )}
        </Space>
      ),
    },
    { title: '客户', dataIndex: 'customerName', width: 130, ellipsis: true, render: (v) => v ?? '—' },
    { title: '类型', dataIndex: 'projectType', width: 100, ellipsis: true, render: (v) => v ?? '—' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s]}>{RECORD_STATUS_LABEL[s as RecordStatusT] ?? s}</Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      width: 70,
      render: (r: RiskLevel) => <Tag color={RISK_COLOR[r]}>{RISK_LEVEL_LABEL[r]}</Tag>,
    },
    { title: '项目经理', dataIndex: 'managerName', width: 100, render: (v) => v ?? '—' },
    { title: '计划交期', dataIndex: 'planEndAt', width: 110, render: fmt },
    {
      title: '操作',
      width: 190,
      render: (_, p) => {
        const nextStates = (RECORD_STATUS_TRANSITIONS[p.status as RecordStatusT] ?? []);
        return (
          <Space size={4} wrap>
            {canUpdate && nextStates.length > 0 && (
              <Dropdown
                menu={{
                  items: nextStates.map((s) => ({
                    key: s,
                    label: RECORD_STATUS_LABEL[s],
                    danger: s === RecordStatus.VOIDED,
                  })),
                  onClick: ({ key }) => void onChangeStatus(p, key),
                }}
              >
                <Button size="small">
                  状态 <DownOutlined className="!text-[10px]" />
                </Button>
              </Dropdown>
            )}
            {canUpdate && (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
            )}
            {canDelete && p.status === RecordStatus.DRAFT && (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(p)} />
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="项目台账"
      subtitle="项目从立项到交付的主线管理。编号自动生成，状态按通用状态机流转。"
      extra={
        canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建项目
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Input.Search
          className="!w-64"
          placeholder="搜索编号 / 名称 / 客户"
          allowClear
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          className="!w-36"
          placeholder="状态"
          allowClear
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.values(RecordStatus).map((s) => ({
            value: s,
            label: RECORD_STATUS_LABEL[s],
          }))}
        />
        <Select
          className="!w-32"
          placeholder="风险等级"
          allowClear
          value={riskLevel}
          onChange={(v) => {
            setRiskLevel(v);
            setPage(1);
          }}
          options={Object.values(RiskLevel).map((r) => ({
            value: r,
            label: RISK_LEVEL_LABEL[r],
          }))}
        />
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个项目`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 新建/编辑 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title={editing ? `编辑项目 ${editing.code}` : '新建项目'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={createProject.isPending || updateProject.isPending}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }, { min: 2, max: 128, message: '2-128 个字符' }]}
          >
            <Input placeholder="如 单片湿法清洗设备一号机" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="customerName" label="客户名称">
              <Input placeholder="如 华芯半导体" />
            </Form.Item>
            <Form.Item name="contractNo" label="合同/订单号">
              <Input placeholder="如 HT-2026-0301" />
            </Form.Item>
            <Form.Item name="projectType" label="项目类型">
              <Select
                allowClear
                placeholder="选择或留空"
                options={['单片湿法', '槽式湿法', '电镀/化镀', '药液浓度检测', '定制装备'].map(
                  (t) => ({ value: t, label: t }),
                )}
              />
            </Form.Item>
            <Form.Item name="equipmentCount" label="设备数量">
              <InputNumber min={1} max={9999} className="!w-full" />
            </Form.Item>
            <Form.Item name="managerId" label="项目经理">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择项目经理"
                options={userSelectOptions}
              />
            </Form.Item>
            <Form.Item name="riskLevel" label="风险等级">
              <Select
                options={Object.values(RiskLevel).map((r) => ({
                  value: r,
                  label: RISK_LEVEL_LABEL[r],
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="range" label="计划工期（开工 → 交付）">
            <DatePicker.RangePicker className="!w-full" allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="description" label="项目说明">
            <Input.TextArea rows={3} maxLength={2000} placeholder="设备配置、交付要求等" />
          </Form.Item>
        </Form>
      </Modal>

      <ProjectDetailDrawer
        id={detailId}
        onClose={() => setDetailId(undefined)}
        userOptions={userSelectOptions}
        canUpdate={canUpdate}
      />
    </PageContainer>
  );
}

// ============================================================
//  详情抽屉：基本信息 + 里程碑时间轴 + 成员
// ============================================================

function ProjectDetailDrawer({
  id,
  onClose,
  userOptions,
  canUpdate,
}: {
  id: string | undefined;
  onClose: () => void;
  userOptions: { value: string; label: string }[];
  canUpdate: boolean;
}) {
  const { message } = App.useApp();
  const { data: detail } = useProjectDetail(id);

  const saveMilestone = useSaveMilestone();
  const deleteMilestone = useDeleteMilestone();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();

  // 里程碑编辑弹窗
  const [msOpen, setMsOpen] = useState(false);
  const [msEditing, setMsEditing] = useState<MilestoneItem | null>(null);
  const [msForm] = Form.useForm();

  // 添加成员弹窗
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm] = Form.useForm();

  const openMsCreate = () => {
    setMsEditing(null);
    msForm.resetFields();
    setMsOpen(true);
  };

  const openMsEdit = (m: MilestoneItem) => {
    setMsEditing(m);
    msForm.setFieldsValue({
      name: m.name,
      planDate: m.planDate ? dayjs(m.planDate) : undefined,
      actualDate: m.actualDate ? dayjs(m.actualDate) : undefined,
    });
    setMsOpen(true);
  };

  const submitMilestone = async () => {
    if (!id) return;
    const v = await msForm.validateFields();
    try {
      await saveMilestone.mutateAsync({
        projectId: id,
        id: msEditing?.id,
        body: {
          name: v.name,
          planDate: v.planDate ? v.planDate.startOf('day').toISOString() : null,
          actualDate: v.actualDate ? v.actualDate.startOf('day').toISOString() : null,
        },
      });
      message.success('已保存');
      setMsOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  const submitMember = async () => {
    if (!id) return;
    const v = await memberForm.validateFields();
    try {
      await addMember.mutateAsync({
        projectId: id,
        body: { userId: v.userId, roleInProject: v.roleInProject || null },
      });
      message.success('成员已添加');
      setMemberOpen(false);
      memberForm.resetFields();
    } catch (err) {
      message.error(isApiError(err) ? err.message : '添加失败');
    }
  };

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      title={
        detail ? (
          <Space>
            <span>{detail.name}</span>
            <Tag color={STATUS_COLOR[detail.status]}>
              {RECORD_STATUS_LABEL[detail.status as RecordStatusT] ?? detail.status}
            </Tag>
          </Space>
        ) : (
          '项目详情'
        )
      }
      open={!!id}
      onClose={onClose}
      width={560}
    >
      {detail && (
        <div className="space-y-6">
          {/* 基本信息 */}
          <section>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <InfoItem label="项目编号" value={detail.code} mono />
              <InfoItem label="客户" value={detail.customerName ?? '—'} />
              <InfoItem label="合同号" value={detail.contractNo ?? '—'} />
              <InfoItem label="类型" value={detail.projectType ?? '—'} />
              <InfoItem label="设备数量" value={`${detail.equipmentCount} 台`} />
              <InfoItem label="项目经理" value={detail.managerName ?? '—'} />
              <InfoItem label="计划开工" value={fmt(detail.planStartAt)} />
              <InfoItem label="计划交期" value={fmt(detail.planEndAt)} />
              <InfoItem label="实际交期" value={fmt(detail.actualEndAt)} />
              <InfoItem
                label="风险等级"
                value={<Tag color={RISK_COLOR[detail.riskLevel]}>{RISK_LEVEL_LABEL[detail.riskLevel]}</Tag>}
              />
            </dl>
            {detail.description && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {detail.description}
              </p>
            )}
          </section>

          {/* 里程碑 */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FlagOutlined /> 里程碑
              </h3>
              {canUpdate && (
                <Button size="small" icon={<PlusOutlined />} onClick={openMsCreate}>
                  添加
                </Button>
              )}
            </div>
            {detail.milestones.length ? (
              <Timeline
                items={detail.milestones.map((m) => ({
                  color: m.actualDate ? 'green' : 'gray',
                  children: (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-700">{m.name}</div>
                        <div className="text-xs text-slate-400">
                          计划 {fmt(m.planDate)}
                          {m.actualDate && ` · 实际 ${fmt(m.actualDate)}`}
                        </div>
                      </div>
                      {canUpdate && (
                        <Space size={0}>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openMsEdit(m)}
                          />
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() =>
                              void deleteMilestone
                                .mutateAsync({ projectId: detail.id, id: m.id })
                                .then(() => message.success('已删除'))
                                .catch((err) =>
                                  message.error(isApiError(err) ? err.message : '删除失败'),
                                )
                            }
                          />
                        </Space>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <p className="text-sm text-slate-400">暂无里程碑</p>
            )}
          </section>

          {/* 成员 */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <TeamOutlined /> 项目成员
              </h3>
              {canUpdate && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setMemberOpen(true)}>
                  添加
                </Button>
              )}
            </div>
            {detail.members.length ? (
              <div className="flex flex-wrap gap-2">
                {detail.members.map((m) => (
                  <Tag
                    key={m.userId}
                    closable={canUpdate}
                    onClose={(e) => {
                      e.preventDefault();
                      void removeMember
                        .mutateAsync({ projectId: detail.id, userId: m.userId })
                        .then(() => message.success('已移除'))
                        .catch((err) => message.error(isApiError(err) ? err.message : '移除失败'));
                    }}
                  >
                    {m.displayName}
                    {m.roleInProject && <span className="text-slate-400">（{m.roleInProject}）</span>}
                  </Tag>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">暂无成员</p>
            )}
          </section>
        </div>
      )}

      {/* 里程碑编辑 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title={msEditing ? '编辑里程碑' : '添加里程碑'}
        open={msOpen}
        onCancel={() => setMsOpen(false)}
        onOk={submitMilestone}
        confirmLoading={saveMilestone.isPending}
        destroyOnClose
      >
        <Form form={msForm} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 设计评审 / 齐套完成 / FAT" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="planDate" label="计划日期">
              <DatePicker className="!w-full" />
            </Form.Item>
            <Form.Item name="actualDate" label="实际达成日期">
              <DatePicker className="!w-full" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 添加成员 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title="添加成员"
        open={memberOpen}
        onCancel={() => setMemberOpen(false)}
        onOk={submitMember}
        confirmLoading={addMember.isPending}
        destroyOnClose
      >
        <Form form={memberForm} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="userId" label="成员" rules={[{ required: true, message: '请选择成员' }]}>
            <Select showSearch optionFilterProp="label" options={userOptions} placeholder="选择成员" />
          </Form.Item>
          <Form.Item name="roleInProject" label="项目内角色">
            <Input placeholder="如 机械设计 / 电气调试（可空）" maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className={`m-0 text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
