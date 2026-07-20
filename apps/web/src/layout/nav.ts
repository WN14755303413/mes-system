import type { Permission } from '@mes/shared';

/**
 * 全站导航配置：路由、标题、图标、所需权限点的唯一来源。
 *
 * 侧边菜单、面包屑、页面标题（document.title）都从这棵树派生，
 * 新增页面只改这里，三处同时生效。
 *
 * `permissions` 为 anyOf 语义：拥有其中任意一个权限点即可见。
 * 不配置则登录即可见。前端隐藏菜单只是体验优化，真正的拦截在后端 Guard。
 */
export interface NavItem {
  path: string;
  title: string;
  /** \@ant-design/icons 组件名，由 AppSider 解析成图标；仅一级菜单需要 */
  icon?: string;
  permissions?: readonly Permission[];
  children?: readonly NavItem[];
}

export const NAV_TREE: readonly NavItem[] = [
  {
    path: '/',
    title: '工作台',
    icon: 'AppstoreOutlined',
  },
  {
    path: '/project',
    title: '项目管理',
    icon: 'ProjectOutlined',
    permissions: ['project:read'],
    children: [
      { path: '/project/list', title: '项目台账', permissions: ['project:read'] },
      { path: '/project/gantt', title: '计划甘特图', permissions: ['project:read'] },
      { path: '/project/risk', title: '风险与问题', permissions: ['project:read'] },
    ],
  },
  {
    path: '/design',
    title: 'BOM 与图纸',
    icon: 'PartitionOutlined',
    permissions: ['bom:read', 'drawing:read'],
    children: [
      { path: '/design/bom', title: '项目 BOM', permissions: ['bom:read'] },
      { path: '/design/drawing', title: '图纸管理', permissions: ['drawing:read'] },
      { path: '/design/change', title: '设计变更', permissions: ['bom:read'] },
    ],
  },
  {
    path: '/material',
    title: '物料齐套',
    icon: 'GoldOutlined',
    permissions: ['material:read', 'shortage:read'],
    children: [
      { path: '/material/kitting', title: '齐套看板', permissions: ['shortage:read'] },
      { path: '/material/supply', title: '供应数据', permissions: ['material:read'] },
      { path: '/material/list', title: '物料主数据', permissions: ['material:read'] },
    ],
  },
  {
    path: '/production',
    title: '生产执行',
    icon: 'ClusterOutlined',
    permissions: ['plan:read', 'task:report', 'task:dispatch'],
    children: [
      { path: '/production/plan', title: '生产计划', permissions: ['plan:read'] },
      { path: '/production/dispatch', title: '装配派工', permissions: ['task:dispatch'] },
      { path: '/production/report', title: '现场报工', permissions: ['task:report'] },
      { path: '/production/exception', title: '异常上报', permissions: ['task:exception'] },
    ],
  },
  {
    path: '/quality',
    title: '质量管理',
    icon: 'FileProtectOutlined',
    permissions: ['inspection:read', 'quality:issue:read'],
    children: [
      { path: '/quality/inspection', title: '检验单', permissions: ['inspection:read'] },
      { path: '/quality/issue', title: '质量问题', permissions: ['quality:issue:read'] },
    ],
  },
  {
    path: '/commissioning',
    title: '调试与验收',
    icon: 'ExperimentOutlined',
    permissions: ['debug:read', 'acceptance:write'],
    children: [
      { path: '/commissioning/record', title: '调试记录', permissions: ['debug:read'] },
      { path: '/commissioning/issue', title: '调试问题', permissions: ['debug:read'] },
      { path: '/commissioning/acceptance', title: 'FAT / SAT 验收', permissions: ['debug:read'] },
    ],
  },
  {
    path: '/dashboard',
    title: '数据看板',
    icon: 'FundOutlined',
    permissions: ['dashboard:company', 'dashboard:project'],
    children: [
      { path: '/dashboard/company', title: '公司级看板', permissions: ['dashboard:company'] },
      { path: '/dashboard/project', title: '项目看板', permissions: ['dashboard:project'] },
    ],
  },
  {
    path: '/feedback',
    title: '反馈中心',
    icon: 'CommentOutlined',
    // 不配权限：反馈面向所有登录用户，试运行期是收集问题的主通道
  },
  {
    path: '/system',
    title: '系统管理',
    icon: 'SettingOutlined',
    permissions: ['sys:user:read', 'sys:role:read', 'sys:dept:read', 'sys:audit:read', 'sys:integration:read'],
    children: [
      { path: '/system/user', title: '用户管理', permissions: ['sys:user:read'] },
      { path: '/system/role', title: '角色权限', permissions: ['sys:role:read'] },
      { path: '/system/dept', title: '部门管理', permissions: ['sys:dept:read'] },
      { path: '/system/audit', title: '审计日志', permissions: ['sys:audit:read'] },
      { path: '/system/integration', title: '系统集成', permissions: ['sys:integration:read'] },
    ],
  },
];

/** 拥有任一权限点即视为可见 */
function visible(item: NavItem, granted: readonly Permission[]): boolean {
  if (!item.permissions?.length) return true;
  return item.permissions.some((p) => granted.includes(p));
}

/** 按用户权限裁剪导航树：父级可见但所有子级被裁掉时，父级一并隐藏 */
export function filterNavTree(
  tree: readonly NavItem[],
  granted: readonly Permission[],
): NavItem[] {
  return tree.flatMap((item) => {
    if (!visible(item, granted)) return [];
    if (!item.children) return [{ ...item }];
    const children = filterNavTree(item.children, granted);
    if (!children.length) return [];
    return [{ ...item, children }];
  });
}

/** 从导航树中找出当前路径的祖先链，供面包屑与菜单高亮使用 */
export function findNavPath(pathname: string, tree: readonly NavItem[] = NAV_TREE): NavItem[] {
  for (const item of tree) {
    if (item.path === pathname) return [item];
    if (item.children) {
      const sub = findNavPath(pathname, item.children);
      if (sub.length) return [item, ...sub];
    }
  }
  return [];
}
