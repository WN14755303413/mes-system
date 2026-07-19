import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  PartitionOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Button, Descriptions, Empty, Progress, Select, Spin, Table, Tag, Timeline } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CRAFT_TYPE_LABEL,
  DEBUG_ISSUE_STATUS_LABEL,
  DEBUG_STAGE_LABEL,
  ISSUE_SEVERITY_LABEL,
  IssueSeverity,
  QUALITY_ISSUE_STATUS_LABEL,
  RECORD_STATUS_LABEL,
  RISK_LEVEL_LABEL,
  RiskLevel,
  type OpenIssueRow,
  type ShortageTopRow,
  type WorkOrderProgressRow,
} from '@mes/shared';
import { useProjectDashboard } from '@/api/dashboard';
import { useProjects } from '@/api/project';
import { ChartCard } from '../components/ChartCard';
import { EChart } from '../components/EChart';
import { StatTile } from '../components/StatTile';
import {
  SERIES,
  areaLineSeries,
  barSeries,
  baseGrid,
  categoryAxis,
  hBarSeries,
  isAllZero,
  tooltipBase,
  valueAxis,
} from '../components/theme';

const RISK_TAG_COLOR: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

const SEVERITY_TAG_COLOR: Record<IssueSeverity, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

/** 质量问题状态固定展示序。 */
const QUALITY_STATUS_ORDER = ['OPEN', 'HANDLING', 'RECHECKING', 'CLOSED'] as const;

/**
 * 项目看板（M10，业务方案 §8.12「项目经理看板」）。
 * 选择项目后下钻单项目的进度/齐套/质量/调试/工时全景。
 */
export default function ProjectDashboardPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string>();

  // 选择器数据源：project:read（凡有 dashboard:project 的角色 preset 均含该权限）
  const { data: projectPage, isLoading: projectsLoading } = useProjects({ page: 1, pageSize: 100 });
  const effectiveProjectId = projectId ?? projectPage?.items[0]?.id;
  const { data, isLoading, isFetching, refetch } = useProjectDashboard(effectiveProjectId);

  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? []).map((p) => ({
        value: p.id,
        label: `${p.code} ${p.name}`,
      })),
    [projectPage],
  );

  const kpi = data?.kpi;
  const info = data?.project;

  // ---- 工单进度（横向条，单色；专业进 tooltip 与表格）----
  const workOrders = data?.workOrders ?? [];
  const woShown = workOrders.slice(0, 12);
  const woOption = useMemo(
    () => ({
      grid: baseGrid({ right: 44 }),
      tooltip: tooltipBase({
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const w = woShown[p.dataIndex];
          if (!w) return '';
          return (
            `<b>${w.code}</b> ${w.name}<br/>` +
            `${CRAFT_TYPE_LABEL[w.craft] ?? w.craft} · ${RECORD_STATUS_LABEL[w.status] ?? w.status}` +
            ` · 进度 <b>${w.progress}%</b>`
          );
        },
      }),
      xAxis: valueAxis({ max: 100, axisLabel: { formatter: '{value}%' } }),
      yAxis: categoryAxis(
        woShown.map((w) => w.code),
        { type: 'category', inverse: true },
      ),
      series: [
        hBarSeries({
          name: '进度',
          data: woShown.map((w) => w.progress),
          label: {
            show: true,
            position: 'right',
            color: '#64748b',
            fontSize: 12,
            formatter: '{c}%',
          },
        }),
      ],
    }),
    [woShown],
  );

  // ---- 质量问题按状态（单系列单色）----
  const qualityRows = useMemo(() => {
    const map = new Map((data?.qualityByStatus ?? []).map((r) => [r.status, r.count]));
    return QUALITY_STATUS_ORDER.map((status) => ({
      status,
      label: QUALITY_ISSUE_STATUS_LABEL[status],
      count: map.get(status) ?? 0,
    }));
  }, [data?.qualityByStatus]);
  const qualityOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({ trigger: 'item' }),
      xAxis: categoryAxis(qualityRows.map((r) => r.label)),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [barSeries({ name: '数量', data: qualityRows.map((r) => r.count) })],
    }),
    [qualityRows],
  );

  // ---- 调试问题按阶段 ----
  const stageRows = useMemo(() => {
    const map = new Map((data?.debugByStage ?? []).map((r) => [r.stage, r.count]));
    return (['DEBUG', 'FAT', 'SAT'] as const).map((stage) => ({
      stage,
      label: DEBUG_STAGE_LABEL[stage],
      count: map.get(stage) ?? 0,
    }));
  }, [data?.debugByStage]);
  const stageOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({ trigger: 'item' }),
      xAxis: categoryAxis(stageRows.map((r) => r.label)),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [barSeries({ name: '未关闭', data: stageRows.map((r) => r.count) })],
    }),
    [stageRows],
  );

  // ---- 工时按专业（项目累计）----
  const craftRows = data?.workHoursByCraft ?? [];
  const craftOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({ trigger: 'item', valueFormatter: (v: number) => `${v} h` }),
      xAxis: categoryAxis(craftRows.map((r) => CRAFT_TYPE_LABEL[r.craft] ?? r.craft)),
      yAxis: valueAxis(),
      series: [barSeries({ name: '工时', data: craftRows.map((r) => r.hours) })],
    }),
    [craftRows],
  );

  // ---- 近 30 天工时（面积线）----
  const hoursTrend = data?.workHoursTrend ?? [];
  const hoursOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({
        trigger: 'axis',
        axisPointer: { type: 'line' },
        valueFormatter: (v: number) => `${v} h`,
      }),
      xAxis: categoryAxis(
        hoursTrend.map((r) => r.date.slice(5)),
        { boundaryGap: false, axisLabel: { color: '#64748b', fontSize: 12, interval: 6 } },
      ),
      yAxis: valueAxis(),
      series: [areaLineSeries(SERIES[0], { name: '报工工时', data: hoursTrend.map((r) => r.hours) })],
    }),
    [hoursTrend],
  );

  // ---- 未闭环问题表 ----
  const issueColumns: ColumnsType<OpenIssueRow> = [
    {
      title: '类型',
      dataIndex: 'kind',
      width: 76,
      render: (v: OpenIssueRow['kind'], row) =>
        v === 'QUALITY' ? (
          <Tag color="orange">质量</Tag>
        ) : (
          <Tag color="purple">{row.stage ? DEBUG_STAGE_LABEL[row.stage] : '调试'}</Tag>
        ),
    },
    { title: '编号', dataIndex: 'code', width: 140 },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 90,
      render: (v: IssueSeverity) => <Tag color={SEVERITY_TAG_COLOR[v]}>{ISSUE_SEVERITY_LABEL[v]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string, row) =>
        row.kind === 'QUALITY'
          ? (QUALITY_ISSUE_STATUS_LABEL[v as keyof typeof QUALITY_ISSUE_STATUS_LABEL] ?? v)
          : (DEBUG_ISSUE_STATUS_LABEL[v as keyof typeof DEBUG_ISSUE_STATUS_LABEL] ?? v),
    },
    { title: '责任人', dataIndex: 'handlerName', width: 100, render: (v) => v ?? '未分派' },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
  ];

  const shortageColumns: ColumnsType<ShortageTopRow> = [
    { title: '物料编码', dataIndex: 'materialCode', width: 130 },
    { title: '名称', dataIndex: 'materialName', ellipsis: true },
    {
      title: '缺口',
      dataIndex: 'gap',
      width: 90,
      align: 'right',
      render: (v: number, row) => (
        <span className="font-medium text-rose-600">
          {v} {row.unit}
        </span>
      ),
    },
    {
      title: '最晚预计到货',
      dataIndex: 'latestExpectedDate',
      width: 110,
      render: (v: string | null) => (v ? dayjs(v).format('MM-DD') : '—'),
    },
    {
      title: '长周期',
      dataIndex: 'isLongLead',
      width: 70,
      render: (v: boolean) => (v ? <Tag color="red">是</Tag> : '—'),
    },
  ];

  const woTableColumns: ColumnsType<WorkOrderProgressRow> = [
    { title: '工单号', dataIndex: 'code', width: 140 },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '专业',
      dataIndex: 'craft',
      width: 90,
      render: (v) => CRAFT_TYPE_LABEL[v as keyof typeof CRAFT_TYPE_LABEL] ?? v,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => RECORD_STATUS_LABEL[v as keyof typeof RECORD_STATUS_LABEL] ?? v,
    },
    { title: '进度', dataIndex: 'progress', width: 140, render: (v: number) => <Progress percent={v} size="small" /> },
  ];

  const noProjects = !projectsLoading && projectOptions.length === 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">项目看板</h1>
          <p className="mt-1 text-sm text-slate-500">
            单项目交付全景：进度 · 齐套 · 质量 · 调试 · 工时
            {data && <span className="ml-2 text-slate-400">数据时间 {dayjs(data.generatedAt).format('MM-DD HH:mm:ss')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择项目"
            style={{ width: 320 }}
            loading={projectsLoading}
            value={effectiveProjectId}
            onChange={setProjectId}
            options={projectOptions}
          />
          <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => void refetch()} />
        </div>
      </div>

      {noProjects ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-16 shadow-sm backdrop-blur-xl">
          <Empty description="暂无项目，请先在项目台账中立项" />
        </div>
      ) : isLoading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <Spin size="large" />
        </div>
      ) : !data || !info || !kpi ? null : (
        <div className={isFetching ? 'space-y-5 opacity-60 transition-opacity' : 'space-y-5 transition-opacity'}>
          {/* 项目信息头 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-slate-800">
                {info.code} · {info.name}
              </h2>
              <Tag color="blue">{RECORD_STATUS_LABEL[info.status] ?? info.status}</Tag>
              <Tag color={RISK_TAG_COLOR[info.riskLevel]}>风险 {RISK_LEVEL_LABEL[info.riskLevel]}</Tag>
            </div>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, lg: 4 }}
              items={[
                { key: 'customer', label: '客户', children: info.customerName ?? '—' },
                { key: 'contract', label: '合同号', children: info.contractNo ?? '—' },
                { key: 'type', label: '项目类型', children: info.projectType ?? '—' },
                { key: 'manager', label: '项目经理', children: info.managerName ?? '—' },
                { key: 'equip', label: '设备数量', children: `${info.equipmentCount} 台` },
                {
                  key: 'plan',
                  label: '计划周期',
                  children: `${info.planStartAt ? dayjs(info.planStartAt).format('YYYY-MM-DD') : '—'} ~ ${info.planEndAt ? dayjs(info.planEndAt).format('YYYY-MM-DD') : '—'}`,
                },
                {
                  key: 'actual',
                  label: '实际交期',
                  children: info.actualEndAt ? dayjs(info.actualEndAt).format('YYYY-MM-DD') : '未交付',
                },
              ]}
            />
          </motion.div>

          {/* KPI 行 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="齐套率"
              value={kpi.kitRate}
              suffix="%"
              sub={kpi.kitRate === null ? '无有效 BOM' : `缺料 ${kpi.shortageRows} 行`}
              icon={<InboxOutlined />}
              tint="from-emerald-500 to-teal-600"
            />
            <StatTile
              label="装配进度"
              value={kpi.avgWorkOrderProgress}
              suffix="%"
              sub={`工单 ${kpi.workOrderCount} 个`}
              icon={<ToolOutlined />}
              tint="from-industrial-500 to-industrial-700"
            />
            <StatTile
              label="WBS 完成率"
              value={kpi.wbsCompletionRate}
              suffix="%"
              sub={`${kpi.wbsCompleted}/${kpi.wbsTotal} 任务`}
              icon={<PartitionOutlined />}
              tint="from-sky-500 to-blue-600"
            />
            <StatTile
              label="未关闭质量问题"
              value={kpi.openQualityIssues}
              sub={`现场异常 ${kpi.openExceptions}`}
              icon={<AlertOutlined />}
              tint="from-amber-500 to-orange-600"
            />
            <StatTile
              label="未关闭调试问题"
              value={kpi.openDebugIssues}
              sub={`风险登记 ${kpi.openRisks}`}
              icon={<ExperimentOutlined />}
              tint="from-violet-500 to-purple-600"
            />
            <StatTile
              label="累计报工工时"
              value={kpi.totalWorkHours}
              suffix="h"
              icon={<FieldTimeOutlined />}
              tint="from-rose-500 to-red-600"
            />
          </div>

          {/* 工单进度 + 里程碑 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard
                title="工单进度"
                subtitle={workOrders.length > 12 ? `共 ${workOrders.length} 个 · 图表显示前 12 个（表格视图看全部）` : '全部工单'}
                empty={woShown.length === 0}
                table={{ columns: woTableColumns, rows: workOrders, rowKey: 'id' }}
                height={Math.max(260, woShown.length * 32 + 60)}
              >
                <EChart option={woOption} height={Math.max(260, woShown.length * 32 + 60)} />
              </ChartCard>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">项目里程碑</h3>
                <ClockCircleOutlined className="text-slate-300" />
              </div>
              {data.milestones.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未维护里程碑" />
              ) : (
                <Timeline
                  items={data.milestones.map((m) => {
                    const done = !!m.actualDate;
                    const overdue = !done && m.planDate && dayjs(m.planDate).isBefore(dayjs(), 'day');
                    return {
                      color: done ? 'green' : overdue ? 'red' : 'blue',
                      dot: done ? <CheckCircleOutlined /> : undefined,
                      children: (
                        <div>
                          <div className="text-sm text-slate-700">{m.name}</div>
                          <div className="text-xs text-slate-400">
                            计划 {m.planDate ? dayjs(m.planDate).format('YYYY-MM-DD') : '—'}
                            {done && ` · 达成 ${dayjs(m.actualDate).format('YYYY-MM-DD')}`}
                            {overdue && <span className="ml-1 text-rose-500">已超期</span>}
                          </div>
                        </div>
                      ),
                    };
                  })}
                />
              )}
            </div>
          </div>

          {/* 质量 / 调试 / 工时专业 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <ChartCard
              title="质量问题"
              subtitle="按状态（不含作废）"
              empty={isAllZero(qualityRows.map((r) => r.count))}
              table={{
                columns: [
                  { title: '状态', dataIndex: 'label' },
                  { title: '数量', dataIndex: 'count', align: 'right' },
                ],
                rows: qualityRows,
                rowKey: 'status',
              }}
            >
              <EChart option={qualityOption} />
            </ChartCard>

            <ChartCard
              title="未关闭调试问题"
              subtitle="按发现阶段"
              empty={isAllZero(stageRows.map((r) => r.count))}
              table={{
                columns: [
                  { title: '阶段', dataIndex: 'label' },
                  { title: '数量', dataIndex: 'count', align: 'right' },
                ],
                rows: stageRows,
                rowKey: 'stage',
              }}
            >
              <EChart option={stageOption} />
            </ChartCard>

            <ChartCard
              title="工时按专业"
              subtitle="项目累计 · 小时"
              empty={craftRows.length === 0}
              table={{
                columns: [
                  { title: '专业', dataIndex: 'craft', render: (v) => CRAFT_TYPE_LABEL[v as keyof typeof CRAFT_TYPE_LABEL] ?? v },
                  { title: '工时 (h)', dataIndex: 'hours', align: 'right' },
                ],
                rows: craftRows,
                rowKey: 'craft',
              }}
            >
              <EChart option={craftOption} />
            </ChartCard>
          </div>

          {/* 工时趋势 + 齐套摘要 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard
                title="报工工时趋势"
                subtitle="近 30 天 · 小时"
                empty={isAllZero(hoursTrend.map((r) => r.hours))}
                table={{
                  columns: [
                    { title: '日期', dataIndex: 'date' },
                    { title: '工时 (h)', dataIndex: 'hours', align: 'right' },
                  ],
                  rows: [...hoursTrend].reverse(),
                  rowKey: 'date',
                }}
              >
                <EChart option={hoursOption} />
              </ChartCard>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">物料齐套</h3>
                <Button
                  type="link"
                  size="small"
                  className="!px-0"
                  onClick={() => navigate('/material/kitting')}
                >
                  齐套看板 <ArrowRightOutlined className="text-[10px]" />
                </Button>
              </div>
              {!data.kitting ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无已发布/冻结的 BOM，未纳入齐套统计" />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <Progress
                      type="circle"
                      size={88}
                      percent={data.kitting.kitRate}
                      status={data.kitting.kitRate >= 100 ? 'success' : data.kitting.kitRate < 60 ? 'exception' : 'normal'}
                    />
                    <div className="space-y-1 text-sm text-slate-600">
                      <div>BOM 版本：{data.kitting.bomVersion}</div>
                      <div>
                        齐套 <span className="font-medium text-emerald-600">{data.kitting.fulfilledRows}</span>
                        {' · '}在途 <span className="font-medium text-amber-500">{data.kitting.inTransitRows}</span>
                        {' · '}缺料 <span className="font-medium text-rose-600">{data.kitting.shortageRows}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        数量口径齐套率 {data.kitting.kitRateByQty}%
                        {data.kitting.longLeadAlerts > 0 && (
                          <span className="ml-1 text-rose-500">· 长周期预警 {data.kitting.longLeadAlerts}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {data.shortageTop.length > 0 && (
                    <Table<ShortageTopRow>
                      size="small"
                      columns={shortageColumns}
                      dataSource={data.shortageTop}
                      rowKey="materialCode"
                      pagination={false}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 未闭环问题清单 */}
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertOutlined className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-700">未闭环问题</h3>
              <span className="text-xs text-slate-400">质量 + 调试 · 按严重度排序 · 最多 10 条</span>
            </div>
            <Table<OpenIssueRow>
              size="small"
              columns={issueColumns}
              dataSource={data.openIssues}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: '没有未闭环问题 🎉' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
