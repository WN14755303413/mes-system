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

// ============================================================
//  BOM 与图纸域枚举（M5）
// ============================================================

/**
 * BOM 版本状态（业务方案 §8.2）。
 *
 * 独立于通用 RecordStatus——BOM 的生命周期有「冻结」（锁定用于生产，变更须走 ECO），
 * 而没有执行中/暂停等过程语义，硬塞进通用状态机会污染其它模块。
 * 流转：草稿 → 已发布 → (冻结 | 变更中) → 已作废。
 */
export const BomStatus = {
  DRAFT: 'DRAFT', // 草稿：设计维护中，现场不可见
  RELEASED: 'RELEASED', // 已发布：现场可见的有效版本
  FROZEN: 'FROZEN', // 已冻结：锁定用于生产，变更必须走 ECO
  CHANGING: 'CHANGING', // 变更中：已有派生的新版本草稿在途
  VOIDED: 'VOIDED', // 已作废：被新版本取代或人工废弃
} as const;
export type BomStatus = (typeof BomStatus)[keyof typeof BomStatus];

export const BOM_STATUS_LABEL: Record<BomStatus, string> = {
  DRAFT: '草稿',
  RELEASED: '已发布',
  FROZEN: '已冻结',
  CHANGING: '变更中',
  VOIDED: '已作废',
};

/** BOM 允许的状态跃迁。后端强校验，前端据此渲染操作按钮。 */
export const BOM_STATUS_TRANSITIONS: Record<BomStatus, BomStatus[]> = {
  DRAFT: ['RELEASED', 'VOIDED'],
  RELEASED: ['FROZEN', 'CHANGING', 'VOIDED'],
  FROZEN: ['CHANGING', 'VOIDED'],
  CHANGING: ['RELEASED', 'VOIDED'], // 变更完成重新发布，或整版作废
  VOIDED: [],
};

/**
 * 现场（无 bom:write 权限者）可见的 BOM 状态（业务方案 §8.2
 * 「现场装配只能查看已发布或冻结版本」）。列表与详情接口据此过滤。
 */
export const BOM_SHOP_VISIBLE_STATUSES: readonly BomStatus[] = [
  BomStatus.RELEASED,
  BomStatus.FROZEN,
];

/**
 * 图纸状态。版本号沿用设计端，MES 只记录有效性（业务方案 §10.2）——
 * 同图号上传新版本时旧版自动作废，「旧图纸必须标识作废，避免误用」。
 */
export const DrawingStatus = {
  ACTIVE: 'ACTIVE', // 有效
  VOIDED: 'VOIDED', // 已作废
} as const;
export type DrawingStatus = (typeof DrawingStatus)[keyof typeof DrawingStatus];

export const DRAWING_STATUS_LABEL: Record<DrawingStatus, string> = {
  ACTIVE: '有效',
  VOIDED: '已作废',
};

// ============================================================
//  物料与齐套域枚举（M6）
// ============================================================

/**
 * 数据来源。一期 ERP 接口未开通，供应数据经导入/手工进入；
 * 每条数据都标注来源与同步时间（业务方案 §5.1「齐套看板必须标识数据同步时间」）。
 */
export const SyncSource = {
  ERP: 'ERP', // ERP 接口同步（二期）
  IMPORT: 'IMPORT', // Excel/CSV 导入
  MANUAL: 'MANUAL', // 手工录入
} as const;
export type SyncSource = (typeof SyncSource)[keyof typeof SyncSource];

export const SYNC_SOURCE_LABEL: Record<SyncSource, string> = {
  ERP: 'ERP 同步',
  IMPORT: '导入',
  MANUAL: '手工',
};

/** 采购订单状态（ERP 镜像，MES 不驱动流转）。 */
export const PoStatus = {
  OPEN: 'OPEN', // 执行中
  CLOSED: 'CLOSED', // 已完结
  CANCELLED: 'CANCELLED', // 已取消
} as const;
export type PoStatus = (typeof PoStatus)[keyof typeof PoStatus];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  OPEN: '执行中',
  CLOSED: '已完结',
  CANCELLED: '已取消',
};

/** 到货记录类型。ARRIVED 计入齐套「已到货未领」；INBOUND 已入库存快照，不再重复计。 */
export const ArrivalType = {
  ARRIVED: 'ARRIVED', // 到货未入库
  INBOUND: 'INBOUND', // 已入库
} as const;
export type ArrivalType = (typeof ArrivalType)[keyof typeof ArrivalType];

export const ARRIVAL_TYPE_LABEL: Record<ArrivalType, string> = {
  ARRIVED: '到货未入库',
  INBOUND: '已入库',
};

/** 领料/退料。退料在齐套计算中反向抵扣已领量。 */
export const RequisitionType = {
  ISSUE: 'ISSUE', // 领料
  RETURN: 'RETURN', // 退料
} as const;
export type RequisitionType = (typeof RequisitionType)[keyof typeof RequisitionType];

export const REQUISITION_TYPE_LABEL: Record<RequisitionType, string> = {
  ISSUE: '领料',
  RETURN: '退料',
};

/** 领料单状态。仓库确认后才计入齐套（业务方案 §7.7「确认领料以仓库为准」）。 */
export const RequisitionStatus = {
  DRAFT: 'DRAFT', // 待仓库确认
  CONFIRMED: 'CONFIRMED', // 已确认
  CANCELLED: 'CANCELLED', // 已取消
} as const;
export type RequisitionStatus = (typeof RequisitionStatus)[keyof typeof RequisitionStatus];

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: '待确认',
  CONFIRMED: '已确认',
  CANCELLED: '已取消',
};

/** 齐套行状态。FULFILLED 缺口≤0；IN_TRANSIT 缺口可被在途覆盖；SHORTAGE 净缺料。 */
export const KittingRowStatus = {
  FULFILLED: 'FULFILLED',
  IN_TRANSIT: 'IN_TRANSIT',
  SHORTAGE: 'SHORTAGE',
} as const;
export type KittingRowStatus = (typeof KittingRowStatus)[keyof typeof KittingRowStatus];

export const KITTING_ROW_STATUS_LABEL: Record<KittingRowStatus, string> = {
  FULFILLED: '已齐套',
  IN_TRANSIT: '在途覆盖',
  SHORTAGE: '缺料',
};
