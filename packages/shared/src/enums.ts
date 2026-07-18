/**
 * 通用状态机（建设方案 §10.3）
 * 流转：草稿 → 已发布 → 执行中 → (暂停 | 变更中) → 已完成 → 已关闭
 * 任意状态均可 → 已作废
 */
export const RecordStatus = {
  DRAFT: 'DRAFT', // 草稿
  RELEASED: 'RELEASED', // 已发布
  IN_PROGRESS: 'IN_PROGRESS', // 执行中
  PAUSED: 'PAUSED', // 暂停
  CHANGING: 'CHANGING', // 变更中
  COMPLETED: 'COMPLETED', // 已完成
  CLOSED: 'CLOSED', // 已关闭
  VOIDED: 'VOIDED', // 已作废
} as const;
export type RecordStatus = (typeof RecordStatus)[keyof typeof RecordStatus];

export const RECORD_STATUS_LABEL: Record<RecordStatus, string> = {
  DRAFT: '草稿',
  RELEASED: '已发布',
  IN_PROGRESS: '执行中',
  PAUSED: '暂停',
  CHANGING: '变更中',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
  VOIDED: '已作废',
};

/** 允许的状态跃迁。后端 StateMachineService 以此为唯一依据，非法跃迁直接拒绝。 */
export const RECORD_STATUS_TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  DRAFT: ['RELEASED', 'VOIDED'],
  RELEASED: ['IN_PROGRESS', 'CHANGING', 'VOIDED'],
  IN_PROGRESS: ['PAUSED', 'CHANGING', 'COMPLETED', 'VOIDED'],
  PAUSED: ['IN_PROGRESS', 'VOIDED'],
  CHANGING: ['RELEASED', 'VOIDED'],
  COMPLETED: ['CLOSED', 'VOIDED'],
  CLOSED: ['VOIDED'],
  VOIDED: [],
};

/** 用户账号状态。离职人员经钉钉组织同步后自动置为 DISABLED（建设方案 §13）。 */
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  LOCKED: 'LOCKED', // 连续登录失败被临时锁定
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** 内置角色（建设方案 §7）。业务上允许再自定义角色。 */
export const BuiltinRole = {
  SYS_ADMIN: 'SYS_ADMIN', // 系统管理员
  EXECUTIVE: 'EXECUTIVE', // 公司管理层
  PROJECT_MANAGER: 'PROJECT_MANAGER', // 项目经理
  SALES: 'SALES', // 销售 / 商务
  DESIGNER: 'DESIGNER', // 研发设计
  PROCESS_ENGINEER: 'PROCESS_ENGINEER', // 工艺工程师
  BUYER: 'BUYER', // 采购
  WAREHOUSE: 'WAREHOUSE', // 仓库
  PLANNER: 'PLANNER', // 生产计划员
  ASSEMBLER: 'ASSEMBLER', // 装配人员
  COMMISSIONER: 'COMMISSIONER', // 调试人员
  INSPECTOR: 'INSPECTOR', // 质量检验
  SERVICE: 'SERVICE', // 售后服务
} as const;
export type BuiltinRole = (typeof BuiltinRole)[keyof typeof BuiltinRole];

export const BUILTIN_ROLE_LABEL: Record<BuiltinRole, string> = {
  SYS_ADMIN: '系统管理员',
  EXECUTIVE: '公司管理层',
  PROJECT_MANAGER: '项目经理',
  SALES: '销售/商务',
  DESIGNER: '研发设计',
  PROCESS_ENGINEER: '工艺工程师',
  BUYER: '采购人员',
  WAREHOUSE: '仓库人员',
  PLANNER: '生产计划员',
  ASSEMBLER: '装配人员',
  COMMISSIONER: '调试人员',
  INSPECTOR: '质量检验人员',
  SERVICE: '售后服务人员',
};

/**
 * 数据权限范围。决定后端拦截器如何改写查询条件。
 */
export const DataScope = {
  ALL: 'ALL', // 全部数据
  DEPT_AND_BELOW: 'DEPT_AND_BELOW', // 本部门及下级
  DEPT_ONLY: 'DEPT_ONLY', // 仅本部门
  OWNED_PROJECT: 'OWNED_PROJECT', // 仅本人负责/参与的项目
  SELF_ONLY: 'SELF_ONLY', // 仅本人的数据（如装配工只看自己的任务）
} as const;
export type DataScope = (typeof DataScope)[keyof typeof DataScope];

// ============================================================
//  项目域枚举（M4）
// ============================================================

/** 风险等级。既用于项目整体 riskLevel，也用于单条风险 level。 */
export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
};

/** 风险状态。 */
export const RiskStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: '未关闭',
  CLOSED: '已关闭',
};

/** 项目问题状态（项目层面的协调问题，区别于质量问题单）。 */
export const IssueStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

/** 问题优先级。 */
export const IssuePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type IssuePriority = (typeof IssuePriority)[keyof typeof IssuePriority];

export const ISSUE_PRIORITY_LABEL: Record<IssuePriority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
};

/**
 * WBS 任务状态。RecordStatus 的实用子集——甘特图上只区分未开始 / 进行中 / 已完成。
 */
export const TaskStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  DRAFT: '未开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
};
