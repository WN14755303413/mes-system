import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { findNavPath } from '@/layout/nav';

/**
 * 尚未开发的模块统一落在这里：标出模块名与所属里程碑，
 * 让试用的人明确「不是坏了，是还没做」。
 */
export default function PlaceholderPage() {
  const location = useLocation();
  const chain = findNavPath(location.pathname);
  const title = chain.at(-1)?.title ?? '功能模块';
  const parent = chain.length > 1 ? chain[0].title : undefined;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white/80 p-10 text-center shadow-sm backdrop-blur-xl"
      >
        {/* 蓝图风格的占位插画：虚线六边形 + 里面一枚正在搭建的方块 */}
        <svg viewBox="0 0 120 120" className="mx-auto h-28 w-28" fill="none" aria-hidden>
          <path
            d="M60 12 101 35v46L60 104 19 81V35L60 12Z"
            stroke="#aecbea"
            strokeWidth="2"
            strokeDasharray="6 5"
            strokeLinejoin="round"
          />
          <rect x="44" y="52" width="14" height="14" rx="2" fill="#2f6cb5" opacity="0.85" />
          <rect x="62" y="52" width="14" height="14" rx="2" stroke="#7fabdb" strokeWidth="2" strokeDasharray="4 3" />
          <rect x="53" y="34" width="14" height="14" rx="2" stroke="#7fabdb" strokeWidth="2" strokeDasharray="4 3" />
          <path d="M36 78h48" stroke="#d7e5f5" strokeWidth="2" strokeLinecap="round" />
        </svg>

        <h2 className="mt-6 text-lg font-semibold text-slate-800">
          {parent ? `${parent} · ${title}` : title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          该模块正在按里程碑计划建设中，导航与权限已就绪，
          <br />
          功能上线后此页面将自动替换。
        </p>
        <span className="mt-5 inline-block rounded-full bg-industrial-50 px-4 py-1.5 text-xs font-medium text-industrial-600">
          Coming Soon · 建设中
        </span>
      </motion.div>
    </div>
  );
}
