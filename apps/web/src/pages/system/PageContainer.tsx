import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * 系统管理各页的统一外壳：标题 + 副标题 + 右上角操作区，下方内容卡片。
 * 复用工作台/个人中心页的玻璃卡片视觉（圆角、半透明、backdrop-blur）。
 * 满幅撑满内容区，不设 max-width——与 AppLayout 的满幅原则一致，宽屏下不留两侧空白。
 */
export function PageContainer({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {extra}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </div>
  );
}
