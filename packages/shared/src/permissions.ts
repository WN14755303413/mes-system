/**
 * 权限点定义。
 *
 * 命名约定：`<资源>:<动作>`
 *
 * 重要：前端依据这些权限点隐藏菜单与按钮，但那**只是体验优化**。
 * 真正的访问控制发生在后端 @RequirePermission() Guard 中。
 * 前端改 DOM、直接构造请求，都会被后端拒绝。
 */
export const Permission = {
  // 系统管理
  SYS_USER_READ: 'sys:user:read',
  SYS_USER_WRITE: 'sys:user:write',
  SYS_ROLE_READ: 'sys:role:read',
  SYS_ROLE_WRITE: 'sys:role:write',
  SYS_DEPT_READ: 'sys:dept:read',
  SYS_DEPT_WRITE: 'sys:dept:write',
  SYS_AUDIT_READ: 'sys:audit:read',
  SYS_INTEGRATION_READ: 'sys:integration:read',

  // 项目管理
  PROJECT_READ: 'project:read',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_TASK_WRITE: 'project:task:write',
  PROJECT_RISK_WRITE: 'project:risk:write',

  // BOM 与图纸
  BOM_READ: 'bom:read',
  BOM_WRITE: 'bom:write',
  BOM_RELEASE: 'bom:release', // 发布/冻结版本
  DRAWING_READ: 'drawing:read',
  DRAWING_WRITE: 'drawing:write',
  DRAWING_DOWNLOAD: 'drawing:download', // 单独控权，下载必留审计

  // 物料齐套
  MATERIAL_READ: 'material:read',
  MATERIAL_WRITE: 'material:write', // 物料主数据维护与导入
  SUPPLY_WRITE: 'supply:write', // 采购/到货/库存数据导入与交期备注
  REQUISITION_WRITE: 'requisition:write', // 发起领料/退料
  REQUISITION_CONFIRM: 'requisition:confirm', // 仓库确认
  SHORTAGE_READ: 'shortage:read',

  // 生产执行
  PLAN_READ: 'plan:read',
  PLAN_WRITE: 'plan:write',
  TASK_DISPATCH: 'task:dispatch', // 派工
  TASK_REPORT: 'task:report', // 报工
  TASK_EXCEPTION: 'task:exception', // 异常上报

  // 质量
  INSPECTION_READ: 'inspection:read',
  INSPECTION_WRITE: 'inspection:write',
  QUALITY_ISSUE_READ: 'quality:issue:read',
  QUALITY_ISSUE_WRITE: 'quality:issue:write',
  QUALITY_ISSUE_CLOSE: 'quality:issue:close',

  // 调试与验收
  DEBUG_READ: 'debug:read',
  DEBUG_WRITE: 'debug:write',
  ACCEPTANCE_WRITE: 'acceptance:write',

  // 看板
  DASHBOARD_COMPANY: 'dashboard:company',
  DASHBOARD_PROJECT: 'dashboard:project',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission);

/** 权限点的中文名与所属模块，seed 时写入 sys_permission，M3 的权限树直接读它。 */
export const PERMISSION_META: Record<Permission, { name: string; module: string }> = {
  'sys:user:read': { name: '查看用户', module: '系统管理' },
  'sys:user:write': { name: '维护用户', module: '系统管理' },
  'sys:role:read': { name: '查看角色', module: '系统管理' },
  'sys:role:write': { name: '维护角色', module: '系统管理' },
  'sys:dept:read': { name: '查看部门', module: '系统管理' },
  'sys:dept:write': { name: '维护部门', module: '系统管理' },
  'sys:audit:read': { name: '查看审计日志', module: '系统管理' },
  'sys:integration:read': { name: '查看接口日志', module: '系统管理' },

  'project:read': { name: '查看项目', module: '项目管理' },
  'project:create': { name: '新建项目', module: '项目管理' },
  'project:update': { name: '编辑项目', module: '项目管理' },
  'project:delete': { name: '删除项目', module: '项目管理' },
  'project:task:write': { name: '维护 WBS 任务', module: '项目管理' },
  'project:risk:write': { name: '维护项目风险', module: '项目管理' },

  'bom:read': { name: '查看 BOM', module: 'BOM 与图纸' },
  'bom:write': { name: '维护 BOM', module: 'BOM 与图纸' },
  'bom:release': { name: '发布/冻结 BOM 版本', module: 'BOM 与图纸' },
  'drawing:read': { name: '查看图纸', module: 'BOM 与图纸' },
  'drawing:write': { name: '维护图纸', module: 'BOM 与图纸' },
  'drawing:download': { name: '下载图纸', module: 'BOM 与图纸' },

  'material:read': { name: '查看物料', module: '物料齐套' },
  'material:write': { name: '维护物料主数据', module: '物料齐套' },
  'supply:write': { name: '维护供应数据', module: '物料齐套' },
  'requisition:write': { name: '发起领料/退料', module: '物料齐套' },
  'requisition:confirm': { name: '确认领料/退料', module: '物料齐套' },
  'shortage:read': { name: '查看缺料与齐套', module: '物料齐套' },

  'plan:read': { name: '查看生产计划', module: '生产执行' },
  'plan:write': { name: '维护生产计划', module: '生产执行' },
  'task:dispatch': { name: '派工', module: '生产执行' },
  'task:report': { name: '报工', module: '生产执行' },
  'task:exception': { name: '异常上报', module: '生产执行' },

  'inspection:read': { name: '查看检验单', module: '质量管理' },
  'inspection:write': { name: '维护检验单', module: '质量管理' },
  'quality:issue:read': { name: '查看质量问题', module: '质量管理' },
  'quality:issue:write': { name: '维护质量问题', module: '质量管理' },
  'quality:issue:close': { name: '关闭质量问题', module: '质量管理' },

  'debug:read': { name: '查看调试记录', module: '调试与验收' },
  'debug:write': { name: '维护调试记录', module: '调试与验收' },
  'acceptance:write': { name: '维护验收记录', module: '调试与验收' },

  'dashboard:company': { name: '公司级看板', module: '数据看板' },
  'dashboard:project': { name: '项目看板', module: '数据看板' },
};

/**
 * 内置角色的默认权限与数据范围（业务方案 §7、技术方案 §3.6）。
 *
 * `'*'` 表示全部权限。这只是 seed 的初始值，上线后由管理员在 M3 的界面上调整，
 * 不再回读本表。
 */
export const ROLE_PRESET: Record<
  string,
  { permissions: readonly Permission[] | '*'; dataScope: string }
> = {
  SYS_ADMIN: { permissions: '*', dataScope: 'ALL' },

  EXECUTIVE: {
    permissions: [
      'project:read',
      'bom:read',
      'drawing:read',
      'material:read',
      'shortage:read',
      'plan:read',
      'inspection:read',
      'quality:issue:read',
      'debug:read',
      'dashboard:company',
      'dashboard:project',
    ],
    dataScope: 'ALL',
  },

  PROJECT_MANAGER: {
    permissions: [
      'project:read',
      'project:create',
      'project:update',
      'project:task:write',
      'project:risk:write',
      'bom:read',
      'drawing:read',
      'drawing:download',
      'material:read',
      'shortage:read',
      'plan:read',
      'plan:write',
      'inspection:read',
      'quality:issue:read',
      'quality:issue:write',
      'quality:issue:close',
      'debug:read',
      'dashboard:project',
    ],
    dataScope: 'OWNED_PROJECT',
  },

  SALES: {
    permissions: ['project:read', 'project:create', 'dashboard:project'],
    dataScope: 'DEPT_ONLY',
  },

  DESIGNER: {
    permissions: [
      'project:read',
      'bom:read',
      'bom:write',
      'bom:release',
      'drawing:read',
      'drawing:write',
      'drawing:download',
      'material:read',
      'quality:issue:read',
    ],
    dataScope: 'DEPT_AND_BELOW',
  },

  PROCESS_ENGINEER: {
    permissions: [
      'project:read',
      'bom:read',
      'drawing:read',
      'drawing:download',
      'plan:read',
      'inspection:read',
      'quality:issue:read',
      'quality:issue:write',
    ],
    dataScope: 'DEPT_AND_BELOW',
  },

  BUYER: {
    permissions: [
      'project:read',
      'bom:read',
      'material:read',
      'material:write',
      'supply:write',
      'shortage:read',
    ],
    dataScope: 'DEPT_ONLY',
  },

  WAREHOUSE: {
    permissions: [
      'project:read',
      'material:read',
      'requisition:write',
      'requisition:confirm',
      'shortage:read',
    ],
    dataScope: 'DEPT_ONLY',
  },

  PLANNER: {
    permissions: [
      'project:read',
      'bom:read',
      'material:read',
      'shortage:read',
      'requisition:write',
      'plan:read',
      'plan:write',
      'task:dispatch',
      'dashboard:project',
    ],
    dataScope: 'DEPT_AND_BELOW',
  },

  // 装配工只看得到派给自己的任务，以及任务关联的图纸与工艺。
  // drawing:download 是「查看图纸内容」的必要权限（下载/预览同一接口，均留审计）——
  // 现场按图作业是刚需（业务方案 §7.9），单独的 download 权限点是为了强制审计，不是为了拦住现场。
  ASSEMBLER: {
    permissions: ['drawing:read', 'drawing:download', 'task:report', 'task:exception'],
    dataScope: 'SELF_ONLY',
  },

  COMMISSIONER: {
    permissions: [
      'drawing:read',
      'drawing:download',
      'debug:read',
      'debug:write',
      'task:report',
      'task:exception',
      'quality:issue:write',
    ],
    dataScope: 'SELF_ONLY',
  },

  INSPECTOR: {
    permissions: [
      'project:read',
      'bom:read',
      'drawing:read',
      'inspection:read',
      'inspection:write',
      'quality:issue:read',
      'quality:issue:write',
      'quality:issue:close',
    ],
    dataScope: 'DEPT_AND_BELOW',
  },

  SERVICE: {
    permissions: ['project:read', 'bom:read', 'drawing:read', 'debug:read', 'quality:issue:read'],
    dataScope: 'DEPT_ONLY',
  },
};
