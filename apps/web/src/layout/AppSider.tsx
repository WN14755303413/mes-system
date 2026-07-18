import {
  AppstoreOutlined,
  ClusterOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  FundOutlined,
  GoldOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PartitionOutlined,
  ProjectOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Menu, Tooltip } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { BrandMark } from './BrandMark';
import { filterNavTree, findNavPath, NAV_TREE, type NavItem } from './nav';

/** 图标名 → 组件。集中在此，nav 配置里只写字符串，避免配置文件依赖 React。 */
const ICONS: Record<string, React.ReactNode> = {
  AppstoreOutlined: <AppstoreOutlined />,
  ProjectOutlined: <ProjectOutlined />,
  PartitionOutlined: <PartitionOutlined />,
  GoldOutlined: <GoldOutlined />,
  ClusterOutlined: <ClusterOutlined />,
  FileProtectOutlined: <FileProtectOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  FundOutlined: <FundOutlined />,
  SettingOutlined: <SettingOutlined />,
};

function toMenuItems(items: NavItem[]): ItemType[] {
  return items.map((item) => ({
    key: item.path,
    icon: item.icon ? ICONS[item.icon] : undefined,
    label: item.title,
    children: item.children ? toMenuItems(item.children as NavItem[]) : undefined,
  }));
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSider({ collapsed, onToggle }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);

  const menuItems = useMemo(
    () => toMenuItems(filterNavTree(NAV_TREE, permissions)),
    [permissions],
  );

  // 当前路径的祖先链：末项高亮，父项展开
  const chain = useMemo(() => findNavPath(location.pathname), [location.pathname]);
  const selectedKey = chain.at(-1)?.path ?? location.pathname;
  const openKey = chain.length > 1 ? chain[0].path : undefined;

  return (
    <aside
      className="relative flex h-full flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-xl transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? 80 : 236 }}
    >
      {/* 品牌区 */}
      <div className="flex h-16 items-center gap-3 px-4">
        <BrandMark size={collapsed ? 40 : 38} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-wide text-industrial-800">
              MES 系统
            </div>
            <div className="truncate text-[11px] tracking-wide text-slate-400">
              湿法装备制造执行
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

      {/* 菜单：占满剩余高度并可滚动 */}
      <nav className="mes-sider-menu min-h-0 flex-1 overflow-y-auto py-2">
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKey ? [openKey] : []}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="!border-e-0 !bg-transparent"
        />
      </nav>

      {/* 折叠开关 */}
      <div className="border-t border-slate-200/70 p-2">
        <Tooltip title={collapsed ? '展开' : '收起'} placement="right">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-slate-400 transition-colors hover:bg-industrial-50 hover:text-industrial-600"
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
