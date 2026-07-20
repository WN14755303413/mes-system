import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FeedbackModal } from '@/pages/feedback/FeedbackModal';
import { AppHeader } from './AppHeader';
import { AppSider } from './AppSider';
import { findNavPath } from './nav';

const SIDER_COLLAPSED_KEY = 'mes.sider.collapsed';

/**
 * M2 主框架：左侧玻璃质感导航 + 顶部工具栏 + 满幅内容区。
 *
 * 内容区不设 max-width——中后台系统的表格和看板需要吃满宽度，
 * 页面内部如需留白由各页面自行控制。
 */
export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDER_COLLAPSED_KEY) === '1',
  );
  // 全局反馈弹窗：顶栏入口在 AppHeader，状态提升到布局层（M12）
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem(SIDER_COLLAPSED_KEY, c ? '0' : '1');
      return !c;
    });
  };

  // 浏览器标签页标题跟随当前页面
  const chain = useMemo(() => findNavPath(location.pathname), [location.pathname]);
  useEffect(() => {
    const page = chain.at(-1)?.title;
    document.title = page && page !== '工作台' ? `${page} · MES 项目管理系统` : 'MES 项目管理系统';
  }, [chain]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100/80">
      <AppSider collapsed={collapsed} onToggle={toggle} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* 内容区背景：极淡的工业制图网格 + 右上角一团漂移色斑，避免大面积浅灰发闷 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'linear-gradient(#1f54970d 1px, transparent 1px), linear-gradient(90deg, #1f54970d 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 animate-drift rounded-full bg-industrial-200/30 blur-3xl"
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <AppHeader onOpenFeedback={() => setFeedbackOpen(true)} />

          <main className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="min-h-full p-6"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
