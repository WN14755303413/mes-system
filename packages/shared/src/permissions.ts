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
