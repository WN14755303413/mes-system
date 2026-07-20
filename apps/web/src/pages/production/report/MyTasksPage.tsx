import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Slider,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AlertOutlined,
  FileImageOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import {
  REPORT_ACTION_RULES,
  WORK_REPORT_TYPE_LABEL,
  WorkReportType,
  type AssemblyTaskStatus,
  type TaskWithContextRow,
  type WorkReportRow,
} from '@mes/shared';
import { downloadDrawing } from '@/api/bom';
import { isApiError } from '@/api/client';
import { useCreateReport, useMyTaskDetail, useMyTasks } from '@/api/production';
import { PageContainer } from '../../system/PageContainer';
import { ExceptionCreateModal } from '../exception/ExceptionCreateModal';
import { CraftTag, TaskStatusTag, fmtDate, fmtTime } from '../shared';

/** 动作在报工弹窗中的展示顺序。 */
const ACTION_ORDER: WorkReportType[] = [
  WorkReportType.START,
  WorkReportType.PROGRESS,
  WorkReportType.PAUSE,
  WorkReportType.RESUME,
  WorkReportType.COMPLETE,
  WorkReportType.REWORK,
];

/** 当前任务状态下可用的报工动作（与后端同一张规则表）。 */
function availableActions(status: AssemblyTaskStatus): WorkReportType[] {
  return ACTION_ORDER.filter((t) => REPORT_ACTION_RULES[t].from.includes(status));
}

/** 现场报工（M7 验收标准：装配工只看到派给自己的任务；报工回写项目进度）。 */
export default function MyTasksPage() {
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useMyTasks({
    status: tab === 'done' ? 'COMPLETED' : undefined,
    page,
    pageSize,
  });

  const [detailTaskId, setDetailTaskId] = useState<string>();
  const [reportingTask, setReportingTask] = useState<TaskWithContextRow | null>(null);
  const [exceptionTask, setExceptionTask] = useState<TaskWithContextRow | null>(null);

  const columns: ColumnsType<TaskWithContextRow> = [
    { title: '任务', dataIndex: 'name', width: 200, ellipsis: true },
    {
      title: '工单 / 项目',
      dataIndex: 'workOrderCode',
      width: 230,
      ellipsis: true,
      render: (v: string, r) => (
        <div className="leading-tight">
          <div className="font-mono">{v}</div>
          <div className="text-xs text-slate-500">
            {r.projectCode} {r.projectName}
          </div>
        </div>
      ),
    },
    { title: '专业', dataIndex: 'craft', width: 95, render: (v) => <CraftTag craft={v} /> },
    {
      title: '计划完工',
      dataIndex: 'planEndAt',
      width: 110,
      render: (v: string | null, r) => {
        const overdue = v && r.status !== 'COMPLETED' && new Date(v).getTime() < Date.now();
        return <span className={overdue ? 'font-medium text-red-600' : ''}>{fmtDate(v)}</span>;
      },
    },
    { title: '状态', dataIndex: 'status', width: 85, render: (v) => <TaskStatusTag status={v} /> },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 120,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
    {
      title: '工时',
      dataIndex: 'actualHours',
      width: 75,
      align: 'right',
      render: (v: number, r) => (
        <Tooltip title={`标准工时 ${r.standardHours ?? '—'}`}>{v}h</Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      render: (_, r) => {
        const woPaused = r.workOrderStatus === 'PAUSED';
        const actions = availableActions(r.status);
        return (
          <Space size={0}>
            <Tooltip title={woPaused ? '所属工单已整单暂停' : undefined}>
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
                disabled={woPaused || actions.length === 0}
                onClick={() => setReportingTask(r)}
              >
                报工
              </Button>
            </Tooltip>
            <Button
              type="link"
              size="small"
              icon={<ProfileOutlined />}
              onClick={() => setDetailTaskId(r.id)}
            >
              详情
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<AlertOutlined />}
              onClick={() => setExceptionTask(r)}
            >
              异常
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="现场报工"
      subtitle="这里只显示派给你的任务。开工/完工请及时报工，进度会自动汇总到工单与项目计划。"
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k as 'todo' | 'done');
          setPage(1);
        }}
        items={[
          { key: 'todo', label: '待办任务' },
          { key: 'done', label: '已完工' },
        ]}
      />
      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        locale={{ emptyText: <Empty description="暂无任务，等待计划员派工" /> }}
        scroll={{ x: 1100 }}
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

      <ReportModal task={reportingTask} onClose={() => setReportingTask(null)} />
      <TaskDetailDrawer
        taskId={detailTaskId}
        onReport={(t) => setReportingTask(t)}
        onClose={() => setDetailTaskId(undefined)}
      />
      <ExceptionCreateModal
        open={!!exceptionTask}
        prefillTask={exceptionTask}
        onClose={() => setExceptionTask(null)}
      />
    </PageContainer>
  );
}

interface ReportFormValues {
  hours?: number;
  progress?: number;
  note?: string;
}

/** 报工弹窗：动作 + 本次工时 + 进度 + 备注。动作可用性与后端共用同一规则表。 */
function ReportModal({
  task,
  onClose,
}: {
  task: TaskWithContextRow | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReportFormValues>();
  const [action, setAction] = useState<WorkReportType>();
  const report = useCreateReport();

  const actions = task ? availableActions(task.status) : [];
  const effectiveAction = action && actions.includes(action) ? action : actions[0];

  // 完工强制 100；返工需要重设进度；开工/暂停/恢复保持原进度不需要填
  const showProgress =
    effectiveAction === WorkReportType.PROGRESS || effectiveAction === WorkReportType.REWORK;

  const afterOpenChange = (visible: boolean) => {
    if (!visible) return;
    setAction(undefined);
    form.setFieldsValue({ hours: 0, progress: task?.progress ?? 0, note: undefined });
  };

  const handleOk = async () => {
    if (!task || !effectiveAction) return;
    const v = await form.validateFields();
    try {
      await report.mutateAsync({
        taskId: task.id,
        body: {
          type: effectiveAction,
          hours: v.hours ?? 0,
          ...(showProgress ? { progress: v.progress ?? 0 } : {}),
          note: v.note || null,
        },
      });
      message.success(`已${WORK_REPORT_TYPE_LABEL[effectiveAction]}`);
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '报工失败');
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={!!task}
      title={task ? `报工：${task.name}` : ''}
      okText="提交"
      confirmLoading={report.isPending}
      afterOpenChange={afterOpenChange}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      {task && (
        <>
          <div className="mb-3 text-sm text-slate-500">
            {task.workOrderCode} · {task.projectCode} · 当前进度 {task.progress}%
          </div>
          <Segmented
            className="mb-4"
            value={effectiveAction}
            onChange={(v) => setAction(v as WorkReportType)}
            options={actions.map((a) => ({ value: a, label: WORK_REPORT_TYPE_LABEL[a] }))}
          />
          <Form form={form} layout="vertical">
            <Form.Item
              name="hours"
              label="本次工时（小时）"
              tooltip="自上次报工以来投入的工时，会累计到任务实际工时"
            >
              <InputNumber min={0} max={999} step={0.5} className="w-full" />
            </Form.Item>
            {showProgress && (
              <Form.Item name="progress" label="完成进度（%）">
                <Slider min={0} max={100} step={5} marks={{ 0: '0', 50: '50', 100: '100' }} />
              </Form.Item>
            )}
            {effectiveAction === WorkReportType.COMPLETE && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                完工后进度记为 100%，进度将汇总到工单与项目计划。
              </div>
            )}
            <Form.Item name="note" label="备注">
              <Input.TextArea rows={2} maxLength={500} placeholder="情况说明（可选）" />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

/** 任务详情：作业要求、图纸入口、报工轨迹。 */
function TaskDetailDrawer({
  taskId,
  onReport,
  onClose,
}: {
  taskId: string | undefined;
  onReport: (task: TaskWithContextRow) => void;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { data, isLoading } = useMyTaskDetail(taskId);
  const task = data?.task;

  const timelineItems = useMemo(
    () =>
      (data?.reports ?? []).map((r: WorkReportRow) => ({
        color: r.type === 'COMPLETE' ? 'green' : r.type === 'REWORK' ? 'red' : 'blue',
        children: (
          <div className="text-sm">
            <span className="font-medium">{WORK_REPORT_TYPE_LABEL[r.type]}</span>
            <span className="ml-2 text-slate-500">
              {fmtTime(r.createdAt)} · 进度 {r.progress}%{r.hours ? ` · ${r.hours}h` : ''}
            </span>
            {r.note && <div className="text-slate-600">{r.note}</div>}
          </div>
        ),
      })),
    [data?.reports],
  );

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      open={!!taskId}
      width={520}
      title={task ? task.name : '任务详情'}
      onClose={onClose}
      loading={isLoading}
      extra={
        task &&
        availableActions(task.status).length > 0 &&
        task.workOrderStatus !== 'PAUSED' && (
          <Button type="primary" size="small" onClick={() => onReport(task)}>
            报工
          </Button>
        )
      }
    >
      {task && (
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <div>
              <Space size={8}>
                <CraftTag craft={task.craft} />
                <TaskStatusTag status={task.status} />
                <Tag>进度 {task.progress}%</Tag>
              </Space>
            </div>
            <div className="text-slate-600">
              工单：{task.workOrderCode} {task.workOrderName}
            </div>
            <div className="text-slate-600">
              项目：{task.projectCode} {task.projectName}
            </div>
            <div className="text-slate-600">
              计划：{fmtDate(task.planStartAt)} ~ {fmtDate(task.planEndAt)} · 实际：
              {fmtDate(task.actualStartAt)} ~ {fmtDate(task.actualEndAt)}
            </div>
            <div className="text-slate-600">
              工时：{task.actualHours}h（标准 {task.standardHours ?? '—'}h）
            </div>
          </div>

          {task.drawingId && (
            <Button
              icon={<FileImageOutlined />}
              onClick={() => {
                downloadDrawing(
                  { id: task.drawingId!, fileName: task.drawingName ?? '图纸' },
                  true,
                ).catch((e: unknown) => message.error(isApiError(e) ? e.message : '图纸打开失败'));
              }}
            >
              查看图纸 {task.drawingCode}
            </Button>
          )}

          {task.requirement && (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-600">作业要求</div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {task.requirement}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-slate-600">报工轨迹</div>
            {timelineItems.length ? (
              <Timeline items={timelineItems} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未报工" />
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
