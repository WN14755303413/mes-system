import {
  AlertOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  FundOutlined,
  InboxOutlined,
  ProjectOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Empty, Progress, Tag } from 'antd';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  RECORD_STATUS_LABEL,
  RiskLevel,
  type WorkbenchTodoItem,
} from '@mes/shared';
import { useWorkbenchSummary } from '@/api/dashboard';
import { useAuthStore } from '@/stores/auth';

/**
 * 工作台。指标/交付进度/动态均来自 /dashboard/workbench 一次聚合
 * （M2 骨架页在 M10 接入真实数据，布局保持不变）。
 */

interface Metric {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tint: string; // 图标底色
}

const RISK_TAG: Record<RiskLevel, { color: string; label: string }> = {
  LOW: { color: 'green', label: '正常' },
  MEDIUM: { color: 'gold', label: '关注' },
  HIGH: { color: 'orange', label: '预警' },
  CRITICAL: { color: 'red', label: '高危' },
};

const TODO_META: Record<WorkbenchTodoItem['kind'], { icon: React.ReactNode; tint: string; label: string }> = {
  EXCEPTION: { icon: <AlertOutlined />, tint: 'text-amber-500', label: '现场异常' },
  QUALITY: { icon: <CheckCircleOutlined />, tint: 'text-rose-500', label: '质量问题' },
  DEBUG: { icon: <ExperimentOutlined />, tint: 'text-violet-500', label: '调试问题' },
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data, isLoading } = useWorkbenchSummary();
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  const m = data?.metrics;
  const fmt = (v: number | undefined | null, suffix = '') =>
    isLoading || v === undefined || v === null ? '—' : `${v}${suffix}`;

  const metrics: Metric[] = [
    {
      key: 'projects',
      label: '在制项目',
      value: fmt(m?.activeProjects),
      sub: `本月新增 ${fmt(m?.newProjectsThisMonth)}`,
      icon: <ProjectOutlined />,
      tint: 'from-industrial-500 to-industrial-700',
    },
    {
      key: 'kitting',
      label: '平均齐套率',
      value: m && m.kittingProjects === 0 ? '—' : fmt(m?.avgKitRate, '%'),
      sub: `缺口物料 ${fmt(m?.shortageItems)} 项`,
      icon: <InboxOutlined />,
      tint: 'from-emerald-500 to-teal-600',
    },
    {
      key: 'assembly',
      label: '装配任务完工率',
      value: m && m.taskTotal === 0 ? '—' : fmt(m?.assemblyCompletionRate, '%'),
      sub: `在制工单 ${fmt(m?.activeWorkOrders)}`,
      icon: <ToolOutlined />,
      tint: 'from-amber-500 to-orange-600',
    },
    {
      key: 'issues',
      label: '未闭环问题',
      value: fmt(m ? m.openQualityIssues + m.openDebugIssues : undefined),
      sub: `质量 ${fmt(m?.openQualityIssues)} · 调试 ${fmt(m?.openDebugIssues)}`,
      icon: <AlertOutlined />,
      tint: 'from-rose-500 to-red-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-industrial-600 via-industrial-600 to-industrial-800 p-6 text-white shadow-lg shadow-industrial-500/20"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(#ffffff22 1px, transparent 1px), linear-gradient(90deg, #ffffff22 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse at 80% 0%, black, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 80% 0%, black, transparent 70%)',
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting}，{user?.displayName ?? '用户'}
            </h1>
            <p className="mt-1.5 text-sm text-white/75">
              {user?.deptName ?? '未分配部门'} · {user?.roles?.join('、') || '无角色'}　·　欢迎回到 MES 项目管理系统
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/company')}
            className="group flex cursor-pointer items-center gap-2 rounded-lg border border-solid border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <FundOutlined />
            查看经营看板
            <ArrowRightOutlined className="text-xs transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </motion.div>

      {/* 指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * i }}
            className="group rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-lg text-white shadow-md ${metric.tint}`}
              >
                {metric.icon}
              </span>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-800">{metric.value}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm text-slate-500">{metric.label}</span>
              <span className="text-xs text-slate-400">{metric.sub}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 两栏：项目交付进度 + 待办动态 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl lg:col-span-2"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">重点项目交付进度</h2>
            <button
              type="button"
              onClick={() => navigate('/project/list')}
              className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-industrial-600 transition-colors hover:text-industrial-500"
            >
              全部项目 <ArrowRightOutlined className="text-[10px]" />
            </button>
          </div>
          {!isLoading && (data?.delivery.length ?? 0) === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无在制项目" />
          ) : (
            <div className="space-y-5">
              {(data?.delivery ?? []).map((d) => {
                const tag = RISK_TAG[d.riskLevel] ?? RISK_TAG.LOW;
                return (
                  <div key={d.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-700">
                        {d.code} {d.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {RECORD_STATUS_LABEL[d.status] ?? d.status}
                          {d.planEndAt && ` · 交期 ${dayjs(d.planEndAt).format('MM-DD')}`}
                        </span>
                        <Tag color={tag.color} className="!m-0">
                          {tag.label}
                        </Tag>
                      </div>
                    </div>
                    <Progress
                      percent={d.progress}
                      showInfo
                      size="small"
                      strokeColor={
                        d.riskLevel === 'HIGH' || d.riskLevel === 'CRITICAL'
                          ? { from: '#f43f5e', to: '#e11d48' }
                          : { from: '#2f6cb5', to: '#1f5497' }
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">待办与动态</h2>
            <ClockCircleOutlined className="text-slate-300" />
          </div>
          {!isLoading && (data?.todos.length ?? 0) === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无未闭环事项" />
          ) : (
            <ul className="space-y-4">
              {(data?.todos ?? []).map((t) => {
                const meta = TODO_META[t.kind];
                return (
                  <li key={t.code} className="flex gap-3">
                    <span className={`mt-0.5 shrink-0 ${meta.tint}`}>{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-slate-600">
                        <span className="mr-1 text-slate-400">[{meta.label}]</span>
                        {t.code} {t.title}
                      </p>
                      <span className="text-[11px] text-slate-400">{dayjs(t.createdAt).format('MM-DD HH:mm')}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {data && (
            <div className="mt-5 rounded-lg bg-industrial-50/70 px-3 py-2 text-center text-[11px] text-industrial-600/80">
              数据时间 {dayjs(data.generatedAt).format('MM-DD HH:mm:ss')}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
