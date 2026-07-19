import { useMemo } from 'react';
import {
  AlertOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  ProjectOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Progress, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CRAFT_TYPE_LABEL,
  DEBUG_STAGE_LABEL,
  INSPECTION_TYPE_LABEL,
  ISSUE_SEVERITY_LABEL,
  IssueSeverity,
  RECORD_STATUS_LABEL,
  RISK_LEVEL_LABEL,
  RiskLevel,
  type DelayedProjectRow,
  type KittingOverviewItem,
} from '@mes/shared';
import { useCompanyDashboard } from '@/api/dashboard';
import { ChartCard } from '../components/ChartCard';
import { EChart } from '../components/EChart';
import { StatTile } from '../components/StatTile';
import {
  ORDINAL_BLUE,
  SERIES,
  STATUS_COLOR,
  areaLineSeries,
  barSeries,
  baseGrid,
  categoryAxis,
  hBarSeries,
  isAllZero,
  legendBase,
  lineSeries,
  tooltipBase,
  valueAxis,
} from '../components/theme';

const RISK_TAG_COLOR: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

/** 严重度固定展示序（浅→深与 ORDINAL_BLUE 一一对应）。 */
const SEVERITY_ORDER: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * 公司级看板（M10，业务方案 §8.12「公司级经营/交付看板」）。
 * 一次请求取整板数据；图表全部带表格孪生视图。
 */
export default function CompanyDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, refetch } = useCompanyDashboard();

  const kpi = data?.kpi;

  // ---- 项目状态分布 ----
  const statusRows = data?.projectsByStatus ?? [];
  const statusOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({ trigger: 'item' }),
      xAxis: categoryAxis(statusRows.map((r) => RECORD_STATUS_LABEL[r.status] ?? r.status)),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [barSeries({ name: '项目数', data: statusRows.map((r) => r.count) })],
    }),
    [statusRows],
  );

  // ---- 齐套率排行（升序，最缺的排最上）----
  const kittingRows = data?.kittingRanking ?? [];
  const kittingOption = useMemo(
    () => ({
      grid: baseGrid({ right: 44 }),
      tooltip: tooltipBase({
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const r = kittingRows[p.dataIndex];
          if (!r) return '';
          return (
            `<b>${r.projectCode}</b> ${r.projectName}<br/>` +
            `齐套率 <b>${r.kitRate}%</b> · 缺料 ${r.shortageRows} 行` +
            (r.longLeadAlerts > 0 ? ` · 长周期预警 ${r.longLeadAlerts}` : '')
          );
        },
      }),
      xAxis: valueAxis({ max: 100, axisLabel: { formatter: '{value}%' } }),
      yAxis: categoryAxis(
        kittingRows.map((r) => r.projectCode),
        { type: 'category', inverse: true },
      ),
      series: [
        hBarSeries({
          name: '齐套率',
          data: kittingRows.map((r) => r.kitRate),
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
    [kittingRows],
  );

  // ---- 质量问题趋势（近 6 月，两系列折线）----
  const trend = data?.qualityTrend ?? [];
  const trendOption = useMemo(
    () => ({
      grid: baseGrid({ top: 32 }),
      legend: legendBase(),
      tooltip: tooltipBase({ trigger: 'axis', axisPointer: { type: 'line' } }),
      xAxis: categoryAxis(
        trend.map((r) => r.month.slice(2)), // 26-02 短标签
        { boundaryGap: false },
      ),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [
        lineSeries(SERIES[0], { name: '新增', data: trend.map((r) => r.opened), showSymbol: true }),
        lineSeries(SERIES[1], { name: '关闭', data: trend.map((r) => r.closed), showSymbol: true }),
      ],
    }),
    [trend],
  );

  // ---- 未关闭质量问题按严重度（有序类目 → 单色序数梯）----
  const severityRows = useMemo(() => {
    const map = new Map((data?.qualityBySeverity ?? []).map((r) => [r.severity, r.count]));
    return SEVERITY_ORDER.map((severity, i) => ({
      severity,
      label: ISSUE_SEVERITY_LABEL[severity],
      count: map.get(severity) ?? 0,
      color: ORDINAL_BLUE[i],
    }));
  }, [data?.qualityBySeverity]);
  const severityOption = useMemo(
    () => ({
      grid: baseGrid(),
      tooltip: tooltipBase({ trigger: 'item' }),
      xAxis: categoryAxis(severityRows.map((r) => r.label)),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [
        barSeries({
          name: '未关闭',
          data: severityRows.map((r) => ({ value: r.count, itemStyle: { color: r.color } })),
        }),
      ],
    }),
    [severityRows],
  );

  // ---- 未关闭调试问题按阶段（单系列单色）----
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

  // ---- 近 30 天报工工时（单系列面积线）----
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
        hoursTrend.map((r) => r.date.slice(5)), // MM-DD
        { boundaryGap: false, axisLabel: { color: '#64748b', fontSize: 12, interval: 6 } },
      ),
      yAxis: valueAxis(),
      series: [areaLineSeries(SERIES[0], { name: '报工工时', data: hoursTrend.map((r) => r.hours) })],
    }),
    [hoursTrend],
  );

  // ---- 工时按专业（名义类目 → 单系列单色，绝不越大越深）----
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

  // ---- 检验判定汇总（状态语义 → 状态色 + 图例，堆叠段 2px 表面缝）----
  const inspectionRows = data?.inspectionByType ?? [];
  const inspectionOption = useMemo(() => {
    const stackStyle = { borderColor: '#ffffff', borderWidth: 2 };
    return {
      grid: baseGrid({ top: 32 }),
      legend: legendBase(),
      tooltip: tooltipBase({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
      xAxis: categoryAxis(inspectionRows.map((r) => INSPECTION_TYPE_LABEL[r.type] ?? r.type)),
      yAxis: valueAxis({ minInterval: 1 }),
      series: [
        {
          type: 'bar',
          name: '合格',
          stack: 'total',
          barMaxWidth: 24,
          itemStyle: { color: STATUS_COLOR.good, ...stackStyle },
          data: inspectionRows.map((r) => r.passed),
        },
        {
          type: 'bar',
          name: '不合格',
          stack: 'total',
          barMaxWidth: 24,
          itemStyle: { color: STATUS_COLOR.critical, ...stackStyle },
          data: inspectionRows.map((r) => r.rejected),
        },
        {
          type: 'bar',
          name: '待检',
          stack: 'total',
          barMaxWidth: 24,
          itemStyle: { color: STATUS_COLOR.neutral, borderRadius: [4, 4, 0, 0], ...stackStyle },
          data: inspectionRows.map((r) => r.pending),
        },
      ],
    };
  }, [inspectionRows]);

  // ---- 延期项目表 ----
  const delayedColumns: ColumnsType<DelayedProjectRow> = [
    { title: '项目编号', dataIndex: 'code', width: 150 },
    { title: '项目名称', dataIndex: 'name', ellipsis: true },
    { title: '项目经理', dataIndex: 'managerName', width: 110, render: (v) => v ?? '—' },
    {
      title: '计划交期',
      dataIndex: 'planEndAt',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '超期',
      dataIndex: 'overdueDays',
      width: 90,
      render: (v: number) => <Tag color="red">{v} 天</Tag>,
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      render: (v: RiskLevel) => <Tag color={RISK_TAG_COLOR[v]}>{RISK_LEVEL_LABEL[v]}</Tag>,
    },
    {
      title: '装配进度',
      dataIndex: 'avgProgress',
      width: 160,
      render: (v: number) => <Progress percent={v} size="small" />,
    },
  ];

  const kittingTableColumns: ColumnsType<KittingOverviewItem> = [
    { title: '项目编号', dataIndex: 'projectCode', width: 140 },
    { title: '项目名称', dataIndex: 'projectName', ellipsis: true },
    { title: '齐套率', dataIndex: 'kitRate', width: 90, align: 'right', render: (v) => `${v}%` },
    { title: '缺料行', dataIndex: 'shortageRows', width: 80, align: 'right' },
    { title: '长周期预警', dataIndex: 'longLeadAlerts', width: 100, align: 'right' },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">公司级看板</h1>
          <p className="mt-1 text-sm text-slate-500">
            项目交付 · 齐套 · 质量 · 调试 · 工时全景
            {data && <span className="ml-2 text-slate-400">数据时间 {dayjs(data.generatedAt).format('MM-DD HH:mm:ss')}</span>}
          </p>
        </div>
        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => void refetch()}>
          刷新
        </Button>
      </div>

      {/* KPI 行 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatTile
          label="在制项目"
          value={kpi?.activeProjects}
          sub={`共 ${kpi?.totalProjects ?? '—'} 个`}
          icon={<ProjectOutlined />}
          tint="from-industrial-500 to-industrial-700"
          loading={isLoading}
        />
        <StatTile
          label="延期项目"
          value={kpi?.delayedProjects}
          sub={`30 天内到期 ${kpi?.dueSoonProjects ?? '—'}`}
          icon={<ClockCircleOutlined />}
          tint="from-rose-500 to-red-600"
          loading={isLoading}
        />
        <StatTile
          label="平均齐套率"
          value={kpi && kpi.kittingProjects > 0 ? kpi.avgKitRate : null}
          suffix="%"
          sub={`${kpi?.kittingProjects ?? 0} 个项目参与`}
          icon={<InboxOutlined />}
          tint="from-emerald-500 to-teal-600"
          loading={isLoading}
        />
        <StatTile
          label="未关闭质量问题"
          value={kpi?.openQualityIssues}
          sub={`现场异常 ${kpi?.openExceptions ?? '—'}`}
          icon={<AlertOutlined />}
          tint="from-amber-500 to-orange-600"
          loading={isLoading}
        />
        <StatTile
          label="未关闭调试问题"
          value={kpi?.openDebugIssues}
          icon={<ExperimentOutlined />}
          tint="from-violet-500 to-purple-600"
          loading={isLoading}
        />
        <StatTile
          label="本月报工工时"
          value={kpi?.monthWorkHours}
          suffix="h"
          icon={<FieldTimeOutlined />}
          tint="from-sky-500 to-blue-600"
          loading={isLoading}
        />
      </motion.div>

      {/* 项目状态 + 齐套排行 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="项目状态分布"
          subtitle="非作废项目"
          empty={!isLoading && statusRows.length === 0}
          table={{
            columns: [
              { title: '状态', dataIndex: 'status', render: (v) => RECORD_STATUS_LABEL[v as keyof typeof RECORD_STATUS_LABEL] ?? v },
              { title: '项目数', dataIndex: 'count', align: 'right' },
            ],
            rows: statusRows,
            rowKey: 'status',
          }}
        >
          <EChart option={statusOption} />
        </ChartCard>

        <ChartCard
          title="项目齐套率排行"
          subtitle="升序 · 最缺的排最前"
          empty={!isLoading && kittingRows.length === 0}
          extra={
            <Button
              type="link"
              size="small"
              className="!px-0"
              onClick={() => navigate('/material/kitting')}
            >
              齐套看板 <ArrowRightOutlined className="text-[10px]" />
            </Button>
          }
          table={{ columns: kittingTableColumns, rows: kittingRows, rowKey: 'projectId' }}
        >
          <EChart option={kittingOption} height={Math.max(260, kittingRows.length * 32 + 60)} />
        </ChartCard>
      </div>

      {/* 质量 + 调试 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="质量问题趋势"
          subtitle="近 6 个月 · 新增 vs 关闭"
          empty={!isLoading && isAllZero(trend.flatMap((r) => [r.opened, r.closed]))}
          table={{
            columns: [
              { title: '月份', dataIndex: 'month' },
              { title: '新增', dataIndex: 'opened', align: 'right' },
              { title: '关闭', dataIndex: 'closed', align: 'right' },
            ],
            rows: trend,
            rowKey: 'month',
          }}
        >
          <EChart option={trendOption} />
        </ChartCard>

        <ChartCard
          title="未关闭质量问题"
          subtitle="按严重度"
          empty={!isLoading && isAllZero(severityRows.map((r) => r.count))}
          table={{
            columns: [
              { title: '严重度', dataIndex: 'label' },
              { title: '数量', dataIndex: 'count', align: 'right' },
            ],
            rows: severityRows,
            rowKey: 'severity',
          }}
        >
          <EChart option={severityOption} />
        </ChartCard>

        <ChartCard
          title="未关闭调试问题"
          subtitle="按发现阶段"
          empty={!isLoading && isAllZero(stageRows.map((r) => r.count))}
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
      </div>

      {/* 工时 + 检验 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="报工工时趋势"
          subtitle="近 30 天 · 小时"
          empty={!isLoading && isAllZero(hoursTrend.map((r) => r.hours))}
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

        <ChartCard
          title="工时按专业"
          subtitle="近 30 天 · 小时"
          empty={!isLoading && craftRows.length === 0}
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

        <ChartCard
          title="检验判定汇总"
          subtitle="按检验类型 · 全部检验单"
          empty={!isLoading && inspectionRows.length === 0}
          table={{
            columns: [
              { title: '类型', dataIndex: 'type', render: (v) => INSPECTION_TYPE_LABEL[v as keyof typeof INSPECTION_TYPE_LABEL] ?? v },
              { title: '合格', dataIndex: 'passed', align: 'right' },
              { title: '不合格', dataIndex: 'rejected', align: 'right' },
              { title: '待检', dataIndex: 'pending', align: 'right' },
            ],
            rows: inspectionRows,
            rowKey: 'type',
          }}
        >
          <EChart option={inspectionOption} />
        </ChartCard>
      </div>

      {/* 延期项目清单 */}
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <WarningOutlined className="text-rose-500" />
          <h3 className="text-sm font-semibold text-slate-700">延期项目清单</h3>
          <span className="text-xs text-slate-400">超计划交期未完成 · 按超期时间排序</span>
        </div>
        <Table<DelayedProjectRow>
          size="small"
          columns={delayedColumns}
          dataSource={data?.delayedProjects ?? []}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: '没有延期项目 🎉' }}
        />
      </div>
    </div>
  );
}
