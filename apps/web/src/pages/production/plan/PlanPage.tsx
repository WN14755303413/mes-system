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
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  OrderedListOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CRAFT_TYPE_LABEL,
  CraftType,
  DrawingStatus,
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TRANSITIONS,
  RecordStatus,
  type AssemblyTaskRow,
  type ProductionOverviewItem,
  type WorkOrderRow,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { useDrawings } from '@/api/bom';
import {
  useAddTask,
  useChangeWorkOrderStatus,
  useCreateWorkOrder,
  useDeleteTask,
  useProductionOverview,
  useUpdateTask,
  useUpdateWorkOrder,
  useWorkOrderDetail,
  useWorkOrders,
} from '@/api/production';
import { useProjects, useProjectTasks } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { CraftTag, TaskStatusTag, WO_STATUS_ACTIONS, WoStatusTag, fmtDate } from '../shared';

const CRAFT_OPTIONS = Object.entries(CRAFT_TYPE_LABEL).map(([value, label]) => ({ value, label }));

interface WoFormValues {
  projectId: string;
  name: string;
  craft: CraftType;
  planStartAt?: Dayjs | null;
  planEndAt?: Dayjs | null;
  wbsTaskId?: string | null;
  remark?: string | null;
}

interface TaskFormValues {
  name: string;
  planStartAt?: Dayjs | null;
  planEndAt?: Dayjs | null;
  standardHours?: number | null;
  drawingId?: string | null;
  requirement?: string | null;
  remark?: string | null;
}

const toIso = (d?: Dayjs | null) => (d ? d.toISOString() : null);
const toDay = (iso: string | null) => (iso ? dayjs(iso) : null);

/** 生产计划（M7，§8.4 精简版）：项目汇总 + 工单计划/实际对比 + 任务工序管理。 */
export default function PlanPage() {
  const { message } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('plan:write'));

  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [craft, setCraft] = useState<CraftType>();
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: overview, isLoading: overviewLoading } = useProductionOverview();
  const { data, isLoading } = useWorkOrders({
    projectId,
    status,
    craft,
    delayedOnly: delayedOnly || undefined,
    keyword: keyword || undefined,
    page,
    pageSize,
  });
  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });

  const changeStatus = useChangeWorkOrderStatus();

  const [woModalOpen, setWoModalOpen] = useState(false);
  const [editingWo, setEditingWo] = useState<WorkOrderRow | null>(null);
  const [taskDrawerWoId, setTaskDrawerWoId] = useState<string>();

  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const overviewColumns: ColumnsType<ProductionOverviewItem> = [
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 240,
      render: (v: string, row) => (
        <Button type="link" size="small" className="!px-0" onClick={() => setProjectId(row.projectId)}>
          {v} {row.projectName}
        </Button>
      ),
    },
    { title: '项目交期', dataIndex: 'projectPlanEndAt', width: 110, render: fmtDate },
    { title: '工单', dataIndex: 'workOrderCount', width: 70, align: 'right' },
    { title: '已完工', dataIndex: 'completedCount', width: 80, align: 'right' },
    { title: '执行中', dataIndex: 'inProgressCount', width: 80, align: 'right' },
    {
      title: '延期',
      dataIndex: 'delayedCount',
      width: 70,
      align: 'right',
      render: (v: number) => (v > 0 ? <span className="font-medium text-red-600">{v}</span> : v),
    },
    {
      title: '未派工',
      dataIndex: 'unassignedCount',
      width: 80,
      align: 'right',
      render: (v: number) => (v > 0 ? <span className="text-orange-500">{v}</span> : v),
    },
    {
      title: '未关闭异常',
      dataIndex: 'openExceptionCount',
      width: 100,
      align: 'right',
      render: (v: number) => (v > 0 ? <span className="text-red-600">{v}</span> : v),
    },
    {
      title: '装配进度',
      dataIndex: 'avgProgress',
      width: 160,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const woColumns: ColumnsType<WorkOrderRow> = [
    {
      title: '工单号',
      dataIndex: 'code',
      width: 150,
      render: (v: string, row) => (
        <Space size={4}>
          <span className="font-mono">{v}</span>
          {row.delayed && (
            <Tooltip title={`计划完工 ${fmtDate(row.planEndAt)} 已过期`}>
              <WarningOutlined className="text-red-500" />
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: '名称', dataIndex: 'name', width: 180, ellipsis: true },
    {
      title: '项目',
      dataIndex: 'projectCode',
      width: 150,
      ellipsis: true,
      render: (v: string, row) => `${v} ${row.projectName}`,
    },
    { title: '专业', dataIndex: 'craft', width: 100, render: (v: CraftType) => <CraftTag craft={v} /> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <WoStatusTag status={v} /> },
    {
      title: '计划起止',
      key: 'plan',
      width: 190,
      render: (_, row) => `${fmtDate(row.planStartAt)} ~ ${fmtDate(row.planEndAt)}`,
    },
    {
      title: '实际起止',
      key: 'actual',
      width: 190,
      render: (_, row) => `${fmtDate(row.actualStartAt)} ~ ${fmtDate(row.actualEndAt)}`,
    },
    {
      title: '任务',
      key: 'tasks',
      width: 110,
      render: (_, row) => (
        <span>
          {row.doneTaskCount}/{row.taskCount}
          {row.unassignedCount > 0 && (
            <Tooltip title={`${row.unassignedCount} 条任务未派工`}>
              <Tag color="orange" className="ml-1">
                未派 {row.unassignedCount}
              </Tag>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: '工时(标/实)',
      key: 'hours',
      width: 110,
      align: 'right',
      render: (_, row) => `${row.totalStandardHours || '—'} / ${row.totalActualHours || 0}`,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 140,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
    {
      title: '操作',
      key: 'actions',
      width: canWrite ? 190 : 80,
      render: (_, row) => {
        const nextTargets = new Set(RECORD_STATUS_TRANSITIONS[row.status as RecordStatus] ?? []);
        const actions = WO_STATUS_ACTIONS.filter((a) => nextTargets.has(a.target));
        return (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              icon={<OrderedListOutlined />}
              onClick={() => setTaskDrawerWoId(row.id)}
            >
              任务
            </Button>
            {canWrite && (
              <>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={['COMPLETED', 'CLOSED', 'VOIDED'].includes(row.status)}
                  onClick={() => {
                    setEditingWo(row);
                    setWoModalOpen(true);
                  }}
                />
                {actions.length > 0 && (
                  <Dropdown
                    menu={{
                      items: actions.map((a) => ({
                        key: a.target,
                        label: a.label,
                        danger: a.danger,
                      })),
                      onClick: ({ key }) => {
                        const action = actions.find((a) => a.target === key);
                        Modal.confirm({
                          title: `确认${action?.label}工单 ${row.code}？`,
                          content:
                            key === 'VOIDED'
                              ? '作废后不可恢复，已有的报工记录仍保留可追溯。'
                              : undefined,
                          okButtonProps: { danger: action?.danger },
                          onOk: async () => {
                            try {
                              await changeStatus.mutateAsync({
                                id: row.id,
                                body: { status: key },
                              });
                              message.success(`已${action?.label}`);
                            } catch (e) {
                              message.error(isApiError(e) ? e.message : '操作失败');
                            }
                          },
                        });
                      },
                    }}
                  >
                    <Button type="link" size="small">
                      流转 <DownOutlined />
                    </Button>
                  </Dropdown>
                )}
              </>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="生产计划"
      subtitle="工单即计划单元：按设备/专业开单、下达、跟踪计划与实际。延期与未派工在此预警。"
      extra={
        canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingWo(null);
              setWoModalOpen(true);
            }}
          >
            新建工单
          </Button>
        )
      }
    >
      <div className="mb-5">
        <div className="mb-2 text-sm font-medium text-slate-600">项目装配总览</div>
        <Table
          rowKey="projectId"
          size="small"
          loading={overviewLoading}
          columns={overviewColumns}
          dataSource={overview}
          pagination={false}
        />
      </div>

      <div className="mb-2 text-sm font-medium text-slate-600">装配工单</div>
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
          placeholder="状态"
          style={{ width: 120 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(RECORD_STATUS_LABEL)
            .filter(([value]) => value !== 'CHANGING')
            .map(([value, label]) => ({ value, label }))}
        />
        <Select
          allowClear
          placeholder="专业"
          style={{ width: 120 }}
          value={craft}
          onChange={(v) => {
            setCraft(v);
            setPage(1);
          }}
          options={CRAFT_OPTIONS}
        />
        <Select
          value={delayedOnly}
          style={{ width: 130 }}
          onChange={(v) => {
            setDelayedOnly(v);
            setPage(1);
          }}
          options={[
            { value: false, label: '全部工单' },
            { value: true, label: '仅延期工单' },
          ]}
        />
        <Input.Search
          allowClear
          placeholder="工单号 / 名称"
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
        columns={woColumns}
        dataSource={data?.items}
        scroll={{ x: 1500 }}
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

      <WorkOrderModal
        open={woModalOpen}
        editing={editingWo}
        projectOptions={projectOptions}
        onClose={() => setWoModalOpen(false)}
      />

      <TaskDrawer woId={taskDrawerWoId} canWrite={canWrite} onClose={() => setTaskDrawerWoId(undefined)} />
    </PageContainer>
  );
}

/** 工单新建/编辑。WBS 关联使报工进度回写到甘特图（M7 验收标准）。 */
function WorkOrderModal({
  open,
  editing,
  projectOptions,
  onClose,
}: {
  open: boolean;
  editing: WorkOrderRow | null;
  projectOptions: { value: string; label: string }[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WoFormValues>();
  const create = useCreateWorkOrder();
  const update = useUpdateWorkOrder();

  const watchedProjectId = Form.useWatch('projectId', form);
  const { data: wbsTasks } = useProjectTasks(watchedProjectId);
  const wbsOptions = useMemo(
    () => (wbsTasks ?? []).map((t) => ({ value: t.id, label: t.name })),
    [wbsTasks],
  );

  // Modal 每次打开时同步表单值（antd Modal 默认不销毁内容）
  const afterOpenChange = (visible: boolean) => {
    if (!visible) return;
    form.setFieldsValue(
      editing
        ? {
            projectId: editing.projectId,
            name: editing.name,
            craft: editing.craft,
            planStartAt: toDay(editing.planStartAt),
            planEndAt: toDay(editing.planEndAt),
            wbsTaskId: editing.wbsTaskId,
            remark: editing.remark,
          }
        : {
            projectId: undefined,
            name: '',
            craft: CraftType.MECH,
            planStartAt: null,
            planEndAt: null,
            wbsTaskId: null,
            remark: null,
          },
    );
  };

  const handleOk = async () => {
    const v = await form.validateFields();
    const body = {
      name: v.name,
      craft: v.craft,
      planStartAt: toIso(v.planStartAt),
      planEndAt: toIso(v.planEndAt),
      wbsTaskId: v.wbsTaskId ?? null,
      remark: v.remark ?? null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
        message.success('已更新');
      } else {
        const created = await create.mutateAsync({ ...body, projectId: v.projectId });
        message.success(`已创建工单 ${created.code}，请添加任务后下达`);
      }
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      title={editing ? `编辑工单 ${editing.code}` : '新建装配工单'}
      okText="保存"
      confirmLoading={create.isPending || update.isPending}
      afterOpenChange={afterOpenChange}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item name="projectId" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={projectOptions}
            disabled={!!editing}
            placeholder="选择项目"
          />
        </Form.Item>
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="name" label="工单名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：1# 设备机械装配" />
          </Form.Item>
          <Form.Item name="craft" label="装配专业" rules={[{ required: true }]}>
            <Select options={CRAFT_OPTIONS} disabled={!!editing && editing.status !== 'DRAFT'} />
          </Form.Item>
          <Form.Item name="planStartAt" label="计划开始">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="planEndAt" label="计划完工">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>
        <Form.Item
          name="wbsTaskId"
          label="关联 WBS 任务"
          tooltip="关联后，现场报工进度将自动回写该 WBS 任务，甘特图实时反映装配进度"
        >
          <Select allowClear showSearch optionFilterProp="label" options={wbsOptions} placeholder="可选" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** 工单任务管理抽屉：工序计划 + 图纸/作业要求维护。派工在「装配派工」页。 */
function TaskDrawer({
  woId,
  canWrite,
  onClose,
}: {
  woId: string | undefined;
  canWrite: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { data: wo, isLoading } = useWorkOrderDetail(woId);
  const addTask = useAddTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AssemblyTaskRow | null>(null);
  const [form] = Form.useForm<TaskFormValues>();

  const { data: drawings } = useDrawings(
    wo ? { projectId: wo.projectId, status: DrawingStatus.ACTIVE } : undefined,
  );
  const drawingOptions = useMemo(
    () => (drawings ?? []).map((d) => ({ value: d.id, label: `${d.code} ${d.name} (${d.version})` })),
    [drawings],
  );

  const openTaskModal = (task: AssemblyTaskRow | null) => {
    setEditingTask(task);
    form.setFieldsValue(
      task
        ? {
            name: task.name,
            planStartAt: toDay(task.planStartAt),
            planEndAt: toDay(task.planEndAt),
            standardHours: task.standardHours,
            drawingId: task.drawingId,
            requirement: task.requirement,
            remark: task.remark,
          }
        : {
            name: '',
            planStartAt: null,
            planEndAt: null,
            standardHours: null,
            drawingId: null,
            requirement: null,
            remark: null,
          },
    );
    setTaskModalOpen(true);
  };

  const handleTaskSave = async () => {
    if (!wo) return;
    const v = await form.validateFields();
    const body = {
      name: v.name,
      planStartAt: toIso(v.planStartAt),
      planEndAt: toIso(v.planEndAt),
      standardHours: v.standardHours ?? null,
      drawingId: v.drawingId ?? null,
      requirement: v.requirement ?? null,
      remark: v.remark ?? null,
    };
    try {
      if (editingTask) {
        await updateTask.mutateAsync({ id: editingTask.id, body });
        message.success('已更新');
      } else {
        await addTask.mutateAsync({ workOrderId: wo.id, body });
        message.success('已添加任务');
      }
      setTaskModalOpen(false);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  const columns: ColumnsType<AssemblyTaskRow> = [
    { title: '#', dataIndex: 'seq', width: 45 },
    { title: '任务', dataIndex: 'name', width: 170, ellipsis: true },
    {
      title: '负责人',
      dataIndex: 'assigneeName',
      width: 90,
      render: (v: string | null) => v ?? <Tag color="orange">未派工</Tag>,
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <TaskStatusTag status={v} /> },
    {
      title: '计划起止',
      key: 'plan',
      width: 175,
      render: (_, r) => `${fmtDate(r.planStartAt)} ~ ${fmtDate(r.planEndAt)}`,
    },
    {
      title: '工时(标/实)',
      key: 'hours',
      width: 95,
      align: 'right',
      render: (_, r) => `${r.standardHours ?? '—'} / ${r.actualHours}`,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 110,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
    {
      title: '图纸',
      dataIndex: 'drawingCode',
      width: 110,
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    ...(canWrite
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 90,
            render: (_: unknown, r: AssemblyTaskRow) => (
              <Space size={0}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={r.status === 'COMPLETED'}
                  onClick={() => openTaskModal(r)}
                />
                <Popconfirm
                  title="删除该任务？"
                  disabled={r.status !== 'PENDING'}
                  onConfirm={async () => {
                    try {
                      await deleteTask.mutateAsync(r.id);
                      message.success('已删除');
                    } catch (e) {
                      message.error(isApiError(e) ? e.message : '删除失败');
                    }
                  }}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={r.status !== 'PENDING'}
                  />
                </Popconfirm>
              </Space>
            ),
          } satisfies ColumnsType<AssemblyTaskRow>[number],
        ]
      : []),
  ];

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      open={!!woId}
      width={960}
      title={
        wo ? (
          <Space>
            <span>
              {wo.code} {wo.name}
            </span>
            <CraftTag craft={wo.craft} />
            <WoStatusTag status={wo.status} />
          </Space>
        ) : (
          '工单任务'
        )
      }
      onClose={onClose}
      extra={
        canWrite &&
        wo &&
        !['COMPLETED', 'CLOSED', 'VOIDED'].includes(wo.status) && (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openTaskModal(null)}>
            添加任务
          </Button>
        )
      }
    >
      {wo && (
        <div className="mb-3 text-sm text-slate-500">
          项目 {wo.projectCode} {wo.projectName} · 计划 {fmtDate(wo.planStartAt)} ~ {fmtDate(wo.planEndAt)}
          {wo.wbsTaskName && ` · 回写 WBS：${wo.wbsTaskName}`}
        </div>
      )}
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={wo?.tasks}
        pagination={false}
        expandable={{
          rowExpandable: (r) => !!(r.requirement || r.remark),
          expandedRowRender: (r) => (
            <div className="space-y-1 text-sm text-slate-600">
              {r.requirement && <div>作业要求：{r.requirement}</div>}
              {r.remark && <div>备注：{r.remark}</div>}
            </div>
          ),
        }}
      />

      <Modal
        maskClosable={false}
        keyboard={false}
        open={taskModalOpen}
        title={editingTask ? `编辑任务：${editingTask.name}` : '添加装配任务'}
        okText="保存"
        confirmLoading={addTask.isPending || updateTask.isPending}
        onOk={() => void handleTaskSave()}
        onCancel={() => setTaskModalOpen(false)}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="如：主框架吊装与调平" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="planStartAt" label="计划开始">
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="planEndAt" label="计划完工">
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item
              name="standardHours"
              label="标准工时（小时）"
              tooltip="作为工单进度加权权重与工时分析基准"
            >
              <InputNumber min={0.1} max={9999} step={0.5} className="w-full" />
            </Form.Item>
            <Form.Item name="drawingId" label="作业图纸">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={drawingOptions}
                placeholder="仅可选本项目有效图纸"
              />
            </Form.Item>
          </div>
          <Form.Item name="requirement" label="作业要求">
            <Input.TextArea rows={3} placeholder="关键控制点、扭矩要求、注意事项…" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
