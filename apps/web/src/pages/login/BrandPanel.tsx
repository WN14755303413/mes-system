import {
  ApartmentOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useHealth } from '@/api/auth';
import loginBg from '@/assets/login-bg.png';
import { ParticleField } from './ParticleField';

const FEATURES = [
  {
    icon: <ApartmentOutlined />,
    title: '项目全过程管控',
    desc: '立项、设计、采购、装配、调试、验收一条主线贯通',
  },
  {
    icon: <DeploymentUnitOutlined />,
    title: '物料齐套穿透',
    desc: '打通 ERP 采购与库存，缺口与长周期物料实时可见',
  },
  {
    icon: <ExperimentOutlined />,
    title: '一机一档追溯',
    desc: '设备关联 BOM、图纸、工艺、检验与调试的完整版本链',
  },
] as const;

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // 对齐到整秒再启动，避免显示的秒数因初始偏移而跳变
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString('zh-CN', { hour12: false });
  const date = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="text-right">
      <div className="font-mono text-2xl font-medium tracking-wider text-industrial-800 tabular-nums">
        {time}
      </div>
      <div className="mt-0.5 text-xs text-industrial-600/80">{date}</div>
    </div>
  );
}

/** 真实的后端与数据库状态。登录页最有用的一条信息：登不上时，先看这里是不是红的。 */
function SystemStatus() {
  const { data, isError, isLoading } = useHealth();

  const online = !isError && data?.status === 'ok';
  const dbUp = !isError && data?.database === 'up';

  const dot = (ok: boolean) =>
    `inline-block h-1.5 w-1.5 rounded-full ${
      ok ? 'bg-emerald-500 animate-pulse-dot' : 'bg-rose-500'
    }`;

  return (
    <div className="flex items-center gap-5 text-xs text-industrial-700/80">
      <span className="flex items-center gap-1.5">
        <i className={dot(online)} />
        服务 {isLoading ? '检测中' : online ? '正常' : '异常'}
      </span>
      <span className="flex items-center gap-1.5">
        <i className={dot(dbUp)} />
        数据库 {isLoading ? '检测中' : dbUp ? '已连接' : '未连接'}
      </span>
    </div>
  );
}

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:w-[56%] xl:w-[58%]">
      {/* 背景图 + 极缓慢的 Ken Burns 推移 */}
      <img
        src={loginBg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full origin-center animate-ken-burns object-cover"
      />

      {/*
        浅色蒙版。左侧压得轻，让厂房与机械臂仍然可辨；越靠右白色越重，
        使品牌墙与右侧的浅色登录区平滑接续，中间不出现一条生硬的分界。
      */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-white/35 via-industrial-50/45 to-slate-50"
      />
      {/* 底部再压一层，保证系统状态与时钟这些小字有足够对比度 */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-white/55 via-transparent to-transparent" />

      <ParticleField className="absolute inset-0 h-full w-full" />

      {/* 自左向右扫过的一道极淡光带 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent"
      />

      <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
        {/* 顶部：品牌 */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex items-center gap-3.5"
        >
          <BrandMark />
          <div>
            <div className="text-lg font-semibold tracking-wide text-industrial-800">
              MES 项目管理系统
            </div>
            <div className="text-xs tracking-wide text-industrial-600/80">
              半导体湿法装备制造执行平台
            </div>
          </div>
        </motion.div>

        {/* 中部：标语与能力 */}
        <div className="max-w-xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="text-[2.6rem] font-semibold leading-tight tracking-tight text-industrial-900 xl:text-5xl"
          >
            让每一台设备的
            <br />
            <span className="bg-gradient-to-r from-industrial-600 to-industrial-400 bg-clip-text text-transparent">
              交付过程
            </span>
            都有迹可循
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-4 max-w-lg text-sm leading-relaxed text-industrial-700/85"
          >
            连接用友 ERP、钉钉与蚂蚁分工，把经营数据、组织协同与制造现场的真实执行连成一条链路。
          </motion.p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                // 逐条错开 80ms，形成自上而下的展开感
                transition={{ duration: 0.45, delay: 0.35 + i * 0.08, ease: 'easeOut' }}
                className="flex items-start gap-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/70 text-industrial-600 shadow-sm backdrop-blur-sm">
                  {f.icon}
                </span>
                <div>
                  <div className="text-sm font-medium text-industrial-800">{f.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-industrial-600/80">
                    {f.desc}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* 底部：真实系统状态 + 时钟 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex items-end justify-between gap-6"
        >
          <div className="space-y-3">
            <SystemStatus />
            <div className="flex items-center gap-1.5 text-[11px] text-industrial-600/70">
              <SafetyCertificateOutlined />
              内部系统 · 数据不出内网
            </div>
          </div>
          <Clock />
        </motion.div>
      </div>
    </div>
  );
}

/** 六边形晶圆意象的品牌标记。内联 SVG 而非图片文件，省一次请求且能跟随文字色。 */
function BrandMark() {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-industrial-500 to-industrial-700 shadow-lg shadow-industrial-500/25">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
        <path
          d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7L12 2.5Z"
          stroke="white"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.4" />
        <path d="M12 8.8V5.2M12 18.8v-3.6M15.2 12h3.4M5.4 12h3.4" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
