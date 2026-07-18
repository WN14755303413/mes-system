import {
  AlertOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeploymentUnitOutlined,
  FundOutlined,
  InboxOutlined,
  ProjectOutlined,
  RiseOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Progress, Tag } from 'antd';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

/**
 * 工作台。M2 阶段业务数据尚未接入，这里用结构完整、样式到位的骨架页占位——
 * 后续里程碑把静态数字替换成 TanStack Query 拉取的真实指标即可，布局无需重排。
 */

interface Metric {
  key: string;
  label: string;
  value: string;
  sub: string;
  trend?: string;
  icon: React.ReactNode;
  tint: string; // 图标底色
}

const METRICS: Metric[] = [
  {
    key: 'projects',
    label: '在制项目',
    value: '18',
    sub: '本月新增 3',
    trend: '+12%',
    icon: <ProjectOutlined />,
    tint: 'from-industrial-500 to-industrial-700',
  },
  {
    key: 'kitting',
    label: '平均齐套率',
    value: '86%',
    sub: '缺口物料 24 项',
    trend: '+4%',
    icon: <InboxOutlined />,
    tint: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'assembly',
    label: '装配完成率',
    value: '73%',
    sub: '在装工单 41',
    trend: '+9%',
    icon: <ToolOutlined />,
    tint: 'from-amber-500 to-orange-600',
  },
  {
    key: 'issues',
    label: '未闭环问题',
    value: '12',
    sub: '质量 7 · 调试 5',
    icon: <AlertOutlined />,
    tint: 'from-rose-500 to-red-600',
  },
];

const DELIVERY = [
  { name: 'PJ-2026-ABC-001 单片清洗机', stage: '装配执行', pct: 68, risk: 'low' },
  { name: 'PJ-2026-DEF-002 槽式湿法线', stage: '物料齐套', pct: 42, risk: 'mid' },
  { name: 'PJ-2026-GHI-003 电镀设备', stage: '调试整改', pct: 85, risk: 'low' },
  { name: 'PJ-2026-JKL-004 浓度检测装置', stage: 'BOM 设计', pct: 20, risk: 'high' },
];

const TODOS = [
  { icon: <InboxOutlined />, text: 'DEF-002 有 6 项长周期物料预计延期', time: '10 分钟前', tint: 'text-amber-500' },
  { icon: <AlertOutlined />, text: 'GHI-003 调试问题 #QC-0312 待复测', time: '1 小时前', tint: 'text-rose-500' },
  { icon: <CheckCircleOutlined />, text: 'ABC-001 机械装配工序已完工', time: '2 小时前', tint: 'text-emerald-500' },
  { icon: <DeploymentUnitOutlined />, text: 'JKL-004 BOM V1.1 已发布，待确认', time: '今天 09:20', tint: 'text-industrial-500' },
];

const RISK_TAG: Record<string, { color: string; label: string }> = {
  low: { color: 'green', label: '正常' },
  mid: { color: 'gold', label: '关注' },
  high: { color: 'red', label: '预警' },
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

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
        {METRICS.map((m, i) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * i }}
            className="group rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-lg text-white shadow-md ${m.tint}`}
              >
                {m.icon}
              </span>
              {m.trend && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <RiseOutlined />
                  {m.trend}
                </span>
              )}
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-800">{m.value}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm text-slate-500">{m.label}</span>
              <span className="text-xs text-slate-400">{m.sub}</span>
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
          <div className="space-y-5">
            {DELIVERY.map((d) => {
              const tag = RISK_TAG[d.risk];
              return (
                <div key={d.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-slate-700">{d.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-400">{d.stage}</span>
                      <Tag color={tag.color} className="!m-0">
                        {tag.label}
                      </Tag>
                    </div>
                  </div>
                  <Progress
                    percent={d.pct}
                    showInfo
                    size="small"
                    strokeColor={
                      d.risk === 'high'
                        ? { from: '#f43f5e', to: '#e11d48' }
                        : { from: '#2f6cb5', to: '#1f5497' }
                    }
                  />
                </div>
              );
            })}
          </div>
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
          <ul className="space-y-4">
            {TODOS.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-0.5 shrink-0 ${t.tint}`}>{t.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-slate-600">{t.text}</p>
                  <span className="text-[11px] text-slate-400">{t.time}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-lg bg-industrial-50/70 px-3 py-2 text-center text-[11px] text-industrial-600/80">
            示例数据 · 业务模块上线后自动替换
          </div>
        </motion.div>
      </div>
    </div>
  );
}
