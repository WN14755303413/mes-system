import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, Breadcrumb, Dropdown } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, useHealth } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { findNavPath } from './nav';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** 顶栏右侧的服务/数据库健康点，与登录页同一数据源 */
function HealthDots() {
  const { data, isError } = useHealth();
  const online = !isError && data?.status === 'ok';
  const dbUp = !isError && data?.database === 'up';
  const dot = (ok: boolean) =>
    `inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500 animate-pulse-dot' : 'bg-rose-500'}`;
  return (
    <div className="hidden items-center gap-4 text-xs text-slate-500 lg:flex">
      <span className="flex items-center gap-1.5">
        <i className={dot(online)} />服务
      </span>
      <span className="flex items-center gap-1.5">
        <i className={dot(dbUp)} />数据库
      </span>
    </div>
  );
}

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const now = useClock();

  const chain = useMemo(() => findNavPath(location.pathname), [location.pathname]);

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
      message.success('已退出登录');
      navigate('/login', { replace: true });
    }
  };

  const breadcrumbItems = [
    { title: 'MES' },
    ...(chain.length ? chain.map((c) => ({ title: c.title })) : [{ title: '工作台' }]),
  ];

  const time = now.toLocaleTimeString('zh-CN', { hour12: false });
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/70 px-6 backdrop-blur-xl">
      <Breadcrumb items={breadcrumbItems} className="text-sm" />

      <div className="flex items-center gap-5">
        <HealthDots />

        <div className="hidden text-right md:block">
          <div className="font-mono text-sm font-medium tabular-nums text-slate-700">{time}</div>
          <div className="text-[11px] text-slate-400">{date}</div>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'profile',
                icon: <UserOutlined />,
                label: '个人中心',
                onClick: () => navigate('/profile'),
              },
              { type: 'divider' },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                danger: true,
                onClick: () => void logout(),
              },
            ],
          }}
        >
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2.5 rounded-full border-0 bg-transparent py-1 pl-1 pr-3 transition-colors hover:bg-slate-100"
          >
            <Avatar
              size={34}
              className="!bg-gradient-to-br !from-industrial-500 !to-industrial-700 !font-medium"
            >
              {user?.displayName?.[0] ?? 'U'}
            </Avatar>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight text-slate-700">
                {user?.displayName ?? '—'}
              </div>
              <div className="text-[11px] leading-tight text-slate-400">
                {user?.roles?.[0] ?? '无角色'}
              </div>
            </div>
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
