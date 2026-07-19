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

// ============================================================
//  生产执行域枚举（M7）
// ============================================================

/** 装配专业（业务方案 §9.5「按机械、电气、管路等专业生成任务」）。 */
export const CraftType = {
  MECH: 'MECH', // 机械装配
  ELEC: 'ELEC', // 电气装配
  PIPE: 'PIPE', // 管路装配
  OTHER: 'OTHER', // 其它（软件预装、包装等）
} as const;
export type CraftType = (typeof CraftType)[keyof typeof CraftType];

export const CRAFT_TYPE_LABEL: Record<CraftType, string> = {
  MECH: '机械装配',
  ELEC: '电气装配',
  PIPE: '管路装配',
  OTHER: '其它',
};

/**
 * 装配任务状态。任务不走通用状态机——它的状态只由「报工动作」驱动
 * （见 REPORT_ACTION_RULES），装配工不能任意指定目标状态。
 */
export const AssemblyTaskStatus = {
  PENDING: 'PENDING', // 待开工（含未派工）
  IN_PROGRESS: 'IN_PROGRESS', // 进行中
  PAUSED: 'PAUSED', // 暂停
  COMPLETED: 'COMPLETED', // 已完工
} as const;
export type AssemblyTaskStatus = (typeof AssemblyTaskStatus)[keyof typeof AssemblyTaskStatus];

export const ASSEMBLY_TASK_STATUS_LABEL: Record<AssemblyTaskStatus, string> = {
  PENDING: '待开工',
  IN_PROGRESS: '进行中',
  PAUSED: '暂停',
  COMPLETED: '已完工',
};

/** 报工动作。一次报工 = 一个动作 + 本次工时 + 完成进度 + 备注。 */
export const WorkReportType = {
  START: 'START', // 开工
  PROGRESS: 'PROGRESS', // 报进度（中途）
  PAUSE: 'PAUSE', // 暂停
  RESUME: 'RESUME', // 恢复
  COMPLETE: 'COMPLETE', // 完工
  REWORK: 'REWORK', // 返工重开（业务方案 §8.5 返工返修）
} as const;
export type WorkReportType = (typeof WorkReportType)[keyof typeof WorkReportType];

export const WORK_REPORT_TYPE_LABEL: Record<WorkReportType, string> = {
  START: '开工',
  PROGRESS: '报进度',
  PAUSE: '暂停',
  RESUME: '恢复',
  COMPLETE: '完工',
  REWORK: '返工',
};

/**
 * 报工动作规则：动作允许的起始状态 → 动作后的任务状态。
 * 前端据此渲染可用动作按钮，后端据此强校验——两端共享同一张表。
 */
export const REPORT_ACTION_RULES: Record<
  WorkReportType,
  { from: readonly AssemblyTaskStatus[]; to: AssemblyTaskStatus }
> = {
  START: { from: ['PENDING'], to: 'IN_PROGRESS' },
  PROGRESS: { from: ['IN_PROGRESS'], to: 'IN_PROGRESS' },
  PAUSE: { from: ['IN_PROGRESS'], to: 'PAUSED' },
  RESUME: { from: ['PAUSED'], to: 'IN_PROGRESS' },
  COMPLETE: { from: ['IN_PROGRESS'], to: 'COMPLETED' },
  REWORK: { from: ['COMPLETED'], to: 'IN_PROGRESS' },
};

/**
 * 现场异常单状态（业务方案 §9.6 装配异常到问题闭环）。
 * 流转：待处理 →（指派）处理中 →（责任人处理）已处理 →（计划/项目经理确认）已关闭。
 * 复检不通过可从已处理退回处理中；误报可在任意未关闭状态直接关闭。
 */
export const ExceptionStatus = {
  OPEN: 'OPEN', // 待处理（未指派责任人）
  HANDLING: 'HANDLING', // 处理中
  RESOLVED: 'RESOLVED', // 已处理，待确认
  CLOSED: 'CLOSED', // 已关闭
} as const;
export type ExceptionStatus = (typeof ExceptionStatus)[keyof typeof ExceptionStatus];

export const EXCEPTION_STATUS_LABEL: Record<ExceptionStatus, string> = {
  OPEN: '待处理',
  HANDLING: '处理中',
  RESOLVED: '已处理',
  CLOSED: '已关闭',
};

export const EXCEPTION_STATUS_TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  OPEN: ['HANDLING', 'CLOSED'],
  HANDLING: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'HANDLING'],
  CLOSED: [],
};

// ============================================================
//  质量管理域枚举（M8）
// ============================================================

/**
 * 检验类型（业务方案 §8.7 五类检验）。
 * DEBUG 一期仅作分类占位——调试记录实体在 M9，届时再做单据级联动。
 */
export const InspectionType = {
  IQC: 'IQC', // 来料检验
  IPQC: 'IPQC', // 过程检验
  ASSY: 'ASSY', // 装配检验
  FQC: 'FQC', // 出厂检验
  DEBUG: 'DEBUG', // 调试检验（M9 联动）
} as const;
export type InspectionType = (typeof InspectionType)[keyof typeof InspectionType];

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  IQC: '来料检验',
  IPQC: '过程检验',
  ASSY: '装配检验',
  FQC: '出厂检验',
  DEBUG: '调试检验',
};

/**
 * 各检验类型的必填关联维度。前端据此动态渲染必填项，后端同表校验——
 * 两端共享一张表（同 REPORT_ACTION_RULES 的哲学）。
 * IPQC/ASSY 关联工单后项目由后端反查，前端无需再传。
 */
export const INSPECTION_TYPE_META: Record<
  InspectionType,
  { requires: readonly ('projectId' | 'workOrderId' | 'materialCode')[] }
> = {
  IQC: { requires: ['materialCode'] },
  IPQC: { requires: ['workOrderId'] },
  ASSY: { requires: ['workOrderId'] },
  FQC: { requires: ['projectId'] },
  DEBUG: { requires: ['projectId'] },
};

/**
 * 检验单状态。生命周期极简：待检（可编辑）→ 判定即终态（锁定）。
 * 复检不新开检验单——复检是质量问题单上的动作（§9.7），避免单据爆炸。
 */
export const InspectionStatus = {
  PENDING: 'PENDING', // 待检（单头与明细可编辑）
  PASSED: 'PASSED', // 判定合格（终态）
  REJECTED: 'REJECTED', // 判定不合格（终态，自动生成质量问题单）
  VOIDED: 'VOIDED', // 已作废
} as const;
export type InspectionStatus = (typeof InspectionStatus)[keyof typeof InspectionStatus];

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  PENDING: '待检',
  PASSED: '合格',
  REJECTED: '不合格',
  VOIDED: '已作废',
};

/** 质量问题单来源。检验不合格强制自动生成（§9.7），也允许有权者手动发起。 */
export const IssueSource = {
  INSPECTION: 'INSPECTION', // 检验不合格自动生成
  MANUAL: 'MANUAL', // 手动发起
} as const;
export type IssueSource = (typeof IssueSource)[keyof typeof IssueSource];

export const ISSUE_SOURCE_LABEL: Record<IssueSource, string> = {
  INSPECTION: '检验生成',
  MANUAL: '手动发起',
};

/** 问题严重度。独立于项目风险 RiskLevel——语义不同，避免跨域耦合。 */
export const IssueSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity];

export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, string> = {
  LOW: '轻微',
  MEDIUM: '一般',
  HIGH: '严重',
  CRITICAL: '致命',
};

/** 不合格品处置方式（业务方案 §8.7 不合格品管理）。 */
export const DispositionType = {
  REWORK: 'REWORK', // 返工
  REPAIR: 'REPAIR', // 返修
  CONCESSION: 'CONCESSION', // 让步接收
  RETURN_GOODS: 'RETURN_GOODS', // 退货
  SCRAP: 'SCRAP', // 报废
} as const;
export type DispositionType = (typeof DispositionType)[keyof typeof DispositionType];

export const DISPOSITION_TYPE_LABEL: Record<DispositionType, string> = {
  REWORK: '返工',
  REPAIR: '返修',
  CONCESSION: '让步接收',
  RETURN_GOODS: '退货',
  SCRAP: '报废',
};

/**
 * 质量问题单状态（§9.7 检验到整改闭环）。
 * 流转：待分派 →（分派）整改中 →（提交整改）待复检 →（复检通过）已关闭；
 * 复检不通过退回整改中；未关闭前可作废（误报，区别于正常关闭）。
 */
export const QualityIssueStatus = {
  OPEN: 'OPEN', // 待分派
  HANDLING: 'HANDLING', // 整改中
  RECHECKING: 'RECHECKING', // 待复检
  CLOSED: 'CLOSED', // 已关闭（复检通过）
  VOIDED: 'VOIDED', // 已作废（误报）
} as const;
export type QualityIssueStatus = (typeof QualityIssueStatus)[keyof typeof QualityIssueStatus];

export const QUALITY_ISSUE_STATUS_LABEL: Record<QualityIssueStatus, string> = {
  OPEN: '待分派',
  HANDLING: '整改中',
  RECHECKING: '待复检',
  CLOSED: '已关闭',
  VOIDED: '已作废',
};

/** 问题单动作类型。动作日志只增不改，完整时间线含创建。 */
export const QualityIssueActionType = {
  CREATE: 'CREATE', // 创建（含检验自动生成）
  ASSIGN: 'ASSIGN', // 分派/改派责任人
  SUBMIT: 'SUBMIT', // 责任人提交整改
  RECHECK_PASS: 'RECHECK_PASS', // 复检通过（即关闭）
  RECHECK_FAIL: 'RECHECK_FAIL', // 复检不通过（退回整改）
  VOID: 'VOID', // 作废
} as const;
export type QualityIssueActionType =
  (typeof QualityIssueActionType)[keyof typeof QualityIssueActionType];

export const QUALITY_ISSUE_ACTION_LABEL: Record<QualityIssueActionType, string> = {
  CREATE: '创建',
  ASSIGN: '分派',
  SUBMIT: '提交整改',
  RECHECK_PASS: '复检通过',
  RECHECK_FAIL: '复检退回',
  VOID: '作废',
};

/**
 * 问题单动作规则：动作允许的起始状态 → 动作后的状态。
 * 前端据此渲染可用动作按钮，后端据此强校验——两端共享同一张表
 * （同 M7 REPORT_ACTION_RULES）。CREATE 不在表内：它产生初始态而非流转。
 */
export const ISSUE_ACTION_RULES: Record<
  Exclude<QualityIssueActionType, 'CREATE'>,
  { from: readonly QualityIssueStatus[]; to: QualityIssueStatus }
> = {
  ASSIGN: { from: ['OPEN', 'HANDLING'], to: 'HANDLING' }, // 改派保持整改中
  SUBMIT: { from: ['HANDLING'], to: 'RECHECKING' },
  RECHECK_PASS: { from: ['RECHECKING'], to: 'CLOSED' },
  RECHECK_FAIL: { from: ['RECHECKING'], to: 'HANDLING' },
  VOID: { from: ['OPEN', 'HANDLING', 'RECHECKING'], to: 'VOIDED' },
};

// ============================================================
//  调试与验收域枚举（M9，业务方案 §8.8 / §9.8 / §9.9）
// ============================================================

/** 调试类型（业务方案 §8.8：电气调试记录、软件调试记录、工艺调试记录）。 */
export const DebugType = {
  ELEC: 'ELEC', // 电气调试
  SOFT: 'SOFT', // 软件调试
  PROC: 'PROC', // 工艺调试（湿法工艺）
} as const;
export type DebugType = (typeof DebugType)[keyof typeof DebugType];

export const DEBUG_TYPE_LABEL: Record<DebugType, string> = {
  ELEC: '电气调试',
  SOFT: '软件调试',
  PROC: '工艺调试',
};

/**
 * 调试记录状态。调试是现场动作，创建即开始（无草稿态）；
 * 完成后随参数明细一起锁定，错了作废重录——与检验单同哲学。
 */
export const DebugRecordStatus = {
  IN_PROGRESS: 'IN_PROGRESS', // 调试中（单头与参数可编辑）
  COMPLETED: 'COMPLETED', // 已完成（锁定）
  VOIDED: 'VOIDED', // 已作废
} as const;
export type DebugRecordStatus = (typeof DebugRecordStatus)[keyof typeof DebugRecordStatus];

export const DEBUG_RECORD_STATUS_LABEL: Record<DebugRecordStatus, string> = {
  IN_PROGRESS: '调试中',
  COMPLETED: '已完成',
  VOIDED: '已作废',
};

/**
 * 问题发现阶段。FAT/SAT 现场发现的问题与调试期问题走同一张闭环清单
 * （§9.8「FAT 验收前确认问题状态」、§9.9「记录 SAT 问题」），按阶段区分统计。
 */
export const DebugStage = {
  DEBUG: 'DEBUG', // 厂内调试
  FAT: 'FAT', // FAT 出厂验收
  SAT: 'SAT', // SAT 客户现场验收
} as const;
export type DebugStage = (typeof DebugStage)[keyof typeof DebugStage];

export const DEBUG_STAGE_LABEL: Record<DebugStage, string> = {
  DEBUG: '厂内调试',
  FAT: 'FAT 验收',
  SAT: 'SAT 验收',
};

/**
 * 调试问题状态（§8.8 问题清单 + 多轮整改复测）。
 * 与 M8 质量问题单同构但独立成域——调试问题的责任方多为设计/软件，
 * 统计口径（看板「调试问题数量」）也与质量问题分列，共用枚举会耦合两域。
 */
export const DebugIssueStatus = {
  OPEN: 'OPEN', // 待分派
  HANDLING: 'HANDLING', // 整改中
  RECHECKING: 'RECHECKING', // 待复测
  CLOSED: 'CLOSED', // 已关闭（复测通过）
  VOIDED: 'VOIDED', // 已作废（误报）
} as const;
export type DebugIssueStatus = (typeof DebugIssueStatus)[keyof typeof DebugIssueStatus];

export const DEBUG_ISSUE_STATUS_LABEL: Record<DebugIssueStatus, string> = {
  OPEN: '待分派',
  HANDLING: '整改中',
  RECHECKING: '待复测',
  CLOSED: '已关闭',
  VOIDED: '已作废',
};

/** 调试问题动作类型。动作日志只增不改，多轮整改复测历史由此完整可查。 */
export const DebugIssueActionType = {
  CREATE: 'CREATE', // 创建
  ASSIGN: 'ASSIGN', // 分派/改派责任人
  SUBMIT: 'SUBMIT', // 责任人提交整改
  RECHECK_PASS: 'RECHECK_PASS', // 复测通过（即关闭）
  RECHECK_FAIL: 'RECHECK_FAIL', // 复测不通过（退回整改）
  VOID: 'VOID', // 作废
} as const;
export type DebugIssueActionType = (typeof DebugIssueActionType)[keyof typeof DebugIssueActionType];

export const DEBUG_ISSUE_ACTION_LABEL: Record<DebugIssueActionType, string> = {
  CREATE: '创建',
  ASSIGN: '分派',
  SUBMIT: '提交整改',
  RECHECK_PASS: '复测通过',
  RECHECK_FAIL: '复测退回',
  VOID: '作废',
};

/** 调试问题动作规则（同 ISSUE_ACTION_RULES 的哲学：前后端同一张表）。 */
export const DEBUG_ISSUE_ACTION_RULES: Record<
  Exclude<DebugIssueActionType, 'CREATE'>,
  { from: readonly DebugIssueStatus[]; to: DebugIssueStatus }
> = {
  ASSIGN: { from: ['OPEN', 'HANDLING'], to: 'HANDLING' },
  SUBMIT: { from: ['HANDLING'], to: 'RECHECKING' },
  RECHECK_PASS: { from: ['RECHECKING'], to: 'CLOSED' },
  RECHECK_FAIL: { from: ['RECHECKING'], to: 'HANDLING' },
  VOID: { from: ['OPEN', 'HANDLING', 'RECHECKING'], to: 'VOIDED' },
};

/** 验收类型（§8.8：FAT 出厂验收 / SAT 客户现场验收）。编号前缀直接用类型。 */
export const AcceptanceType = {
  FAT: 'FAT',
  SAT: 'SAT',
} as const;
export type AcceptanceType = (typeof AcceptanceType)[keyof typeof AcceptanceType];

export const ACCEPTANCE_TYPE_LABEL: Record<AcceptanceType, string> = {
  FAT: 'FAT 出厂验收',
  SAT: 'SAT 现场验收',
};

/**
 * 验收单状态。验收中（检查项可编辑）→ 出具结论即终态（锁定），同检验单哲学。
 * 「通过」有门禁：项目存在未关闭调试问题时后端拒绝（§9.8）；
 * 「有条件通过」= 带遗留问题交付，遗留说明必填，报告中明示。
 */
export const AcceptanceStatus = {
  PENDING: 'PENDING', // 验收中
  PASSED: 'PASSED', // 通过
  CONDITIONAL: 'CONDITIONAL', // 有条件通过（有遗留问题）
  FAILED: 'FAILED', // 不通过
  VOIDED: 'VOIDED', // 已作废
} as const;
export type AcceptanceStatus = (typeof AcceptanceStatus)[keyof typeof AcceptanceStatus];

export const ACCEPTANCE_STATUS_LABEL: Record<AcceptanceStatus, string> = {
  PENDING: '验收中',
  PASSED: '通过',
  CONDITIONAL: '有条件通过',
  FAILED: '不通过',
  VOIDED: '已作废',
};

/** conclude 动作允许的结论集合（PENDING → 三种终态之一）。 */
export const ACCEPTANCE_CONCLUSIONS = [
  AcceptanceStatus.PASSED,
  AcceptanceStatus.CONDITIONAL,
  AcceptanceStatus.FAILED,
] as const;
