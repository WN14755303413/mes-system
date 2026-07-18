import { useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Gantt, ViewMode, type Task as GanttTask } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import {
  TASK_STATUS_LABEL,
  TaskStatus,
  type TaskItem,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useDeleteTask,
  useProjects,
  useProjectTasks,
  useSaveTask,
  useUserOptions,
} from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';

const STATUS_COLOR: Record<TaskStatus, string> = {
  DRAFT: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
};

/** 按 parentId 建树后 DFS 拍平——gantt-task-react 要求子任务紧跟在父任务之后。 */
function dfsOrder(tasks: TaskItem[]): { item: TaskItem; depth: number; hasChildren: boolean }[] {
  const byParent = new Map<string | null, TaskItem[]>();
  for (const t of tasks) {
    const key = t.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(t);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }
  const out: { item: TaskItem; depth: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const t of byParent.get(parentId) ?? []) {
      const children = byParent.get(t.id) ?? [];
      out.push({ item: t, depth, hasChildren: children.length > 0 });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function ProjectGanttPage() {
  const { message, modal } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('project:task:write'));

  // 项目选择：取前 100 个非作废项目当选项
  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const [projectId, setProjectId] = useState<string>();
  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? [])
        .filter((p) => p.status !== 'VOIDED')
        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  // 默认选中第一个项目
  const effectiveProjectId = projectId ?? projectOptions[0]?.value;

  const { data: tasks } = useProjectTasks(effectiveProjectId);
  const { data: userOptions } = useUserOptions();
  const saveTask = useSaveTask();
  const deleteTask = useDeleteTask();

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);

  const ordered = useMemo(() => dfsOrder(tasks ?? []), [tasks]);

  /** 有起止日期的进甘特图；缺日期的归入「未排期」列表。 */
  const { ganttTasks, unscheduled } = useMemo(() => {
    const scheduled: GanttTask[] = [];
    const unscheduled: TaskItem[] = [];
    for (const { item, hasChildren } of ordered) {
      if (item.planStartAt && item.planEndAt) {
        scheduled.push({
          id: item.id,
          name: item.name,
          start: new Date(item.planStartAt),
          end: new Date(item.planEndAt),
          progress: item.progress,
          type: hasChildren ? 'project' : 'task',
          project: item.parentId ?? undefined,
          hideChildren: false,
          styles:
            item.status === TaskStatus.COMPLETED
              ? { backgroundColor: '#86efac', progressColor: '#22c55e', progressSelectedColor: '#16a34a' }
              : undefined,
        });
      } else {
        unscheduled.push(item);
      }
    }
    return { ganttTasks: scheduled, unscheduled };
  }, [ordered]);

  // ---- 新建/编辑弹窗 ----
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [form] = Form.useForm();

  const parentOptions = useMemo(
    () =>
      ordered
        .filter(({ item }) => item.id !== editing?.id)
        .map(({ item, depth }) => ({
          value: item.id,
          label: `${'　'.repeat(depth)}${item.name}`,
        })),
    [ordered, editing],
  );

  const openCreate = (parentId?: string) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ parentId, status: TaskStatus.DRAFT, progress: 0 });
    setEditOpen(true);
  };

  const openEdit = (t: TaskItem) => {
    setEditing(t);
    form.setFieldsValue({
      name: t.name,
      parentId: t.parentId ?? undefined,
      ownerId: t.ownerId ?? undefined,
      status: t.status,
      progress: t.progress,
      range:
        t.planStartAt || t.planEndAt
          ? [t.planStartAt ? dayjs(t.planStartAt) : null, t.planEndAt ? dayjs(t.planEndAt) : null]
          : undefined,
    });
    setEditOpen(true);
  };

  const submit = async () => {
    if (!effectiveProjectId) return;
    const v = await form.validateFields();
    const [start, end] = v.range ?? [null, null];
    try {
      await saveTask.mutateAsync({
        projectId: effectiveProjectId,
        taskId: editing?.id,
        body: {
          name: v.name,
          parentId: v.parentId || null,
          ownerId: v.ownerId || null,
          status: v.status,
          progress: v.progress ?? 0,
          planStartAt: start ? start.startOf('day').toISOString() : null,
          planEndAt: end ? end.startOf('day').toISOString() : null,
        },
      });
      message.success(editing ? '已保存' : '任务已创建');
      setEditOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  const onDelete = (t: TaskItem) => {
    if (!effectiveProjectId) return;
    modal.confirm({
      title: `删除任务「${t.name}」？`,
      content: '其下的子任务将一并删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteTask.mutateAsync({ projectId: effectiveProjectId, taskId: t.id });
          message.success('已删除');
        } catch (err) {
          message.error(isApiError(err) ? err.message : '删除失败');
        }
      },
    });
  };

  /** 甘特图上拖拽改期 → 回写。 */
  const onDateChange = async (gt: GanttTask) => {
    if (!effectiveProjectId || !canWrite) return;
    const t = (tasks ?? []).find((x) => x.id === gt.id);
    if (!t) return;
    try {
      await saveTask.mutateAsync({
        projectId: effectiveProjectId,
        taskId: t.id,
        body: {
          name: t.name,
          parentId: t.parentId,
          ownerId: t.ownerId,
          status: t.status,
          progress: t.progress,
          sort: t.sort,
          planStartAt: dayjs(gt.start).toISOString(),
          planEndAt: dayjs(gt.end).toISOString(),
        },
      });
    } catch (err) {
      message.error(isApiError(err) ? err.message : '调整失败');
    }
  };

  /** 拖拽进度条 → 回写进度；拖到 100 自动置为已完成。 */
  const onProgressChange = async (gt: GanttTask) => {
    if (!effectiveProjectId || !canWrite) return;
    const t = (tasks ?? []).find((x) => x.id === gt.id);
    if (!t) return;
    const progress = Math.round(gt.progress);
    try {
      await saveTask.mutateAsync({
        projectId: effectiveProjectId,
        taskId: t.id,
        body: {
          name: t.name,
          parentId: t.parentId,
          ownerId: t.ownerId,
          sort: t.sort,
          planStartAt: t.planStartAt,
          planEndAt: t.planEndAt,
          progress,
          status:
            progress >= 100
              ? TaskStatus.COMPLETED
              : progress > 0
                ? TaskStatus.IN_PROGRESS
                : t.status,
        },
      });
    } catch (err) {
      message.error(isApiError(err) ? err.message : '调整失败');
    }
  };

  return (
    <PageContainer
      title="计划甘特图"
      subtitle="项目 WBS 任务分解与进度总览。拖动任务条调整工期，拖动进度块更新完成度。"
      extra={
        canWrite &&
        effectiveProjectId && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            新建任务
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="!w-80"
          placeholder="选择项目"
          showSearch
          optionFilterProp="label"
          value={effectiveProjectId}
          onChange={setProjectId}
          options={projectOptions}
        />
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '日', value: ViewMode.Day },
            { label: '周', value: ViewMode.Week },
            { label: '月', value: ViewMode.Month },
          ]}
        />
      </div>

      {!effectiveProjectId ? (
        <Empty description="请先在上方选择项目（或到项目台账新建）" />
      ) : ganttTasks.length === 0 ? (
        <Empty description="该项目还没有排期任务。点击右上角「新建任务」并填写起止日期。" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 [&_.calendar]:!fill-slate-500">
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            locale="zh-CN"
            listCellWidth="200px"
            columnWidth={viewMode === ViewMode.Day ? 48 : viewMode === ViewMode.Week ? 90 : 160}
            barCornerRadius={4}
            barFill={70}
            fontSize="12px"
            rowHeight={40}
            todayColor="rgba(59,130,246,0.08)"
            TaskListHeader={TaskListHeader}
            TaskListTable={(props) => (
              <TaskListTable
                {...props}
                ordered={ordered}
                canWrite={canWrite}
                onEdit={(id) => {
                  const t = (tasks ?? []).find((x) => x.id === id);
                  if (t) openEdit(t);
                }}
              />
            )}
            onDateChange={canWrite ? onDateChange : undefined}
            onProgressChange={canWrite ? onProgressChange : undefined}
            onDoubleClick={(gt) => {
              const t = (tasks ?? []).find((x) => x.id === gt.id);
              if (t && canWrite) openEdit(t);
            }}
          />
        </div>
      )}

      {/* 未排期任务 */}
      {unscheduled.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">
            未排期任务（{unscheduled.length}）
          </h3>
          <div className="space-y-1.5">
            {unscheduled.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 px-3 py-2"
              >
                <Space size={8}>
                  <span className="text-sm text-slate-700">{t.name}</span>
                  <Tag color={STATUS_COLOR[t.status]} className="!m-0">
                    {TASK_STATUS_LABEL[t.status]}
                  </Tag>
                  {t.ownerName && <span className="text-xs text-slate-400">{t.ownerName}</span>}
                </Space>
                {canWrite && (
                  <Space size={0}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(t)} />
                  </Space>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新建/编辑任务 */}
      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submit}
        confirmLoading={saveTask.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="如 机械装配 / 主框架装配" />
          </Form.Item>
          <Form.Item name="parentId" label="父任务">
            <Select allowClear placeholder="不选则为顶级任务" options={parentOptions} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="ownerId" label="负责人">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择负责人"
                options={(userOptions ?? []).map((u) => ({ value: u.id, label: u.displayName }))}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                options={Object.values(TaskStatus).map((s) => ({
                  value: s,
                  label: TASK_STATUS_LABEL[s],
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="range" label="计划起止">
            <DatePicker.RangePicker className="!w-full" allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="progress" label="进度（%）">
            <InputNumber min={0} max={100} className="!w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}

// ---- 甘特图左侧任务列（自定义中文表头与行） ----

function TaskListHeader({ headerHeight }: { headerHeight: number; rowWidth: string; fontFamily: string; fontSize: string }) {
  return (
    <div
      className="flex items-center border-b border-r border-slate-200 bg-slate-50/80 px-3 text-xs font-semibold text-slate-500"
      style={{ height: headerHeight, width: 200 }}
    >
      任务名称
    </div>
  );
}

function TaskListTable({
  tasks,
  rowHeight,
  ordered,
  canWrite,
  onEdit,
}: {
  tasks: GanttTask[];
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  selectedTaskId: string;
  setSelectedTask: (id: string) => void;
  onExpanderClick: (task: GanttTask) => void;
  ordered: { item: TaskItem; depth: number; hasChildren: boolean }[];
  canWrite: boolean;
  onEdit: (id: string) => void;
}) {
  const depthById = useMemo(
    () => new Map(ordered.map(({ item, depth }) => [item.id, depth])),
    [ordered],
  );
  return (
    <div className="border-r border-slate-200">
      {tasks.map((t) => (
        <div
          key={t.id}
          className="group flex items-center justify-between gap-1 border-b border-slate-100 px-3 text-sm text-slate-700"
          style={{ height: rowHeight, width: 200 }}
        >
          <span
            className="truncate"
            style={{ paddingLeft: (depthById.get(t.id) ?? 0) * 14 }}
            title={t.name}
          >
            {t.type === 'project' ? <b>{t.name}</b> : t.name}
          </span>
          {canWrite && (
            <Button
              type="text"
              size="small"
              className="!hidden group-hover:!inline-flex"
              icon={<EditOutlined className="text-slate-400" />}
              onClick={() => onEdit(t.id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
