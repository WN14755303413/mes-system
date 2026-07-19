import type { DataScope, UserStatus } from './enums';
import type {
  AcceptanceStatus,
  AcceptanceType,
  ACCEPTANCE_CONCLUSIONS,
  ArrivalType,
  AssemblyTaskStatus,
  BomStatus,
  CraftType,
  DebugIssueActionType,
  DebugIssueStatus,
  DebugRecordStatus,
  DebugStage,
  DebugType,
  DispositionType,
  DrawingStatus,
  ExceptionStatus,
  InspectionStatus,
  InspectionType,
  IssuePriority,
  IssueSeverity,
  IssueSource,
  IssueStatus,
  KittingRowStatus,
  PoStatus,
  QualityIssueActionType,
  QualityIssueStatus,
  RecordStatus,
  RequisitionStatus,
  RequisitionType,
  RiskLevel,
  RiskStatus,
  SyncSource,
  TaskStatus,
  WorkReportType,
} from './enums';
import type { Permission } from './permissions';

/** 统一响应包裹。后端 TransformInterceptor 自动套上。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/** 统一错误码。前端据此决定跳转/提示，不依赖 message 文案。 */
export const ErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  CAPTCHA_INVALID: 'CAPTCHA_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  CSRF_INVALID: 'CSRF_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface PageQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 登录请求。注意：密码明文经 HTTPS 传输，前端不做预哈希（预哈希只会让哈希值本身变成密码）。 */
export interface LoginRequest {
  username: string;
  password: string;
  captchaId?: string;
  captchaCode?: string;
}

/**
 * 登录响应。
 * 刻意不包含任何 token —— access/refresh token 均通过 httpOnly Cookie 下发，
 * JavaScript 读不到，因此 F12 也无法从中窃取凭据。
 */
export interface LoginResponse {
  user: CurrentUser;
  mustChangePassword: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  deptId: string | null;
  deptName: string | null;
  roles: string[];
  permissions: Permission[];
  dataScope: DataScope;
}

/**
 * 登录失败时随错误一并返回的提示信息。
 *
 * 这里只暴露「本次登录尝试」维度的状态，不暴露账号是否存在——
 * captchaRequired 由 IP+账号的失败计数决定，对不存在的账号同样会触发，
 * 因此不能用它来枚举用户名。
 */
export interface LoginFailureDetail {
  captchaRequired: boolean;
  /** 账号锁定的剩余秒数；未锁定时为 0 */
  lockedForSeconds: number;
}

export interface CaptchaResponse {
  captchaId: string;
  /** SVG 源码，前端直接内联渲染，避免再发一次图片请求 */
  svg: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * 忘记密码。本系统没有邮件服务，重置走「提交申请 → 管理员核实身份 → 后台重置」，
 * 因此这里提交的是可供人工核对的身份信息，而非收件邮箱。
 */
export interface PasswordResetRequestPayload {
  username: string;
  displayName: string;
  phone: string;
  reason?: string;
  captchaId: string;
  captchaCode: string;
}

/** 密码强度下限，前后端共用一套规则，避免前端放行、后端拒绝的割裂体验。 */
export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
}

// ============================================================
//  M3 系统管理：用户 / 角色 / 部门 / 审计 / 接口日志
//
//  这些类型是前后端的契约：后端 controller 的返回值与 DTO、前端 api/system.ts
//  的 hooks 都引用它们，避免各写一份导致字段漂移。
// ============================================================

// ---- 用户 ----

/** 用户列表行。不含 passwordHash 等敏感字段——它们永远不出后端。 */
export interface SysUserListItem {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  deptId: string | null;
  deptName: string | null;
  roles: { code: string; name: string }[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SysUserListQuery extends PageQuery {
  deptId?: string;
  status?: UserStatus;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  deptId?: string;
  roleIds: string[];
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  deptId?: string | null;
}

/**
 * 新建用户 / 重置密码后一次性返回的临时密码。
 * 系统生成随机强密码，明文只在这一次响应里出现，之后无法再取回。
 * 用户首次登录被强制改密（mustChangePassword）。
 */
export interface TempPasswordResponse {
  username: string;
  tempPassword: string;
}

export interface AssignRolesRequest {
  roleIds: string[];
}

export interface UpdateUserStatusRequest {
  /** 仅允许在 ACTIVE / DISABLED 间切换；LOCKED 由登录失败自动产生，不在此设置。 */
  status: Extract<UserStatus, 'ACTIVE' | 'DISABLED'>;
}

// ---- 角色与权限 ----

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  remark: string | null;
  dataScope: DataScope;
  builtin: boolean;
  enabled: boolean;
  userCount: number;
  permissionCount: number;
}

export interface RoleDetail extends RoleListItem {
  permissions: Permission[];
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  remark?: string;
  dataScope: DataScope;
}

export interface UpdateRoleRequest {
  name?: string;
  remark?: string | null;
  dataScope?: DataScope;
  enabled?: boolean;
}

export interface UpdateRolePermissionsRequest {
  permissions: Permission[];
}

/** 权限点，供前端权限树按 module 分组渲染。 */
export interface PermissionItem {
  code: Permission;
  name: string;
  module: string;
}

// ---- 部门 ----

/** 部门树节点。后端返回扁平数组，前端按 parentId 建树；或后端直接返回嵌套 children。 */
export interface DeptNode {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  sort: number;
  enabled: boolean;
  userCount: number;
  children: DeptNode[];
}

export interface SaveDeptRequest {
  name: string;
  code: string;
  parentId?: string | null;
  sort?: number;
  enabled?: boolean;
}

// ---- 审计日志 ----

export interface AuditLogItem {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  changes: unknown;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  errorMsg: string | null;
  createdAt: string;
}

export interface AuditLogQuery extends PageQuery {
  username?: string;
  action?: string;
  from?: string;
  to?: string;
}

// ---- 接口日志（M3 只读展示，重试补偿留 M11） ----

export interface IntegrationLogItem {
  id: string;
  interfaceName: string;
  sourceSystem: string;
  targetSystem: string;
  success: boolean;
  errorMsg: string | null;
  retryCount: number;
  needsAttention: boolean;
  resolvedAt: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

export interface IntegrationLogQuery extends PageQuery {
  interfaceName?: string;
  success?: boolean;
  needsAttention?: boolean;
}

// ============================================================
//  M4 项目管理：台账 / 里程碑 / WBS / 风险 / 问题 / 成员
//
//  前后端契约。后端 controller 返回值、DTO 与前端 api/project.ts 共用，
//  避免字段漂移。日期统一用 ISO 字符串在网络上传输。
// ============================================================

/** 项目台账列表行。 */
export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  contractNo: string | null;
  projectType: string | null;
  status: string; // RecordStatus
  riskLevel: RiskLevel;
  equipmentCount: number;
  managerId: string | null;
  managerName: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  actualEndAt: string | null;
  /** 未关闭风险数与未关闭问题数，列表页红点提示用。 */
  openRiskCount: number;
  openIssueCount: number;
  createdAt: string;
}

export interface ProjectListQuery extends PageQuery {
  status?: string;
  riskLevel?: RiskLevel;
  managerId?: string;
}

/** 项目详情：列表行 + 描述 + 里程碑 + 成员。 */
export interface ProjectDetail extends ProjectListItem {
  description: string | null;
  milestones: MilestoneItem[];
  members: ProjectMemberItem[];
}

export interface SaveProjectRequest {
  name: string;
  customerName?: string | null;
  contractNo?: string | null;
  projectType?: string | null;
  equipmentCount?: number;
  managerId?: string | null;
  planStartAt?: string | null;
  planEndAt?: string | null;
  riskLevel?: RiskLevel;
  description?: string | null;
}

/** 变更项目状态（走通用状态机，后端校验合法跃迁）。 */
export interface ChangeProjectStatusRequest {
  status: string; // 目标 RecordStatus
}

// ---- 里程碑 ----

export interface MilestoneItem {
  id: string;
  projectId: string;
  name: string;
  planDate: string | null;
  actualDate: string | null;
  sort: number;
}

export interface SaveMilestoneRequest {
  name: string;
  planDate?: string | null;
  actualDate?: string | null;
  sort?: number;
}

// ---- WBS 任务（甘特图数据源）----

/** WBS 任务节点。后端返回扁平数组（含 parentId），前端按需建树或直接喂甘特图。 */
export interface TaskItem {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  progress: number;
  status: TaskStatus;
  sort: number;
}

export interface SaveTaskRequest {
  name: string;
  parentId?: string | null;
  ownerId?: string | null;
  planStartAt?: string | null;
  planEndAt?: string | null;
  progress?: number;
  status?: TaskStatus;
  sort?: number;
}

// ---- 风险 ----

export interface RiskItem {
  id: string;
  projectId: string;
  title: string;
  level: RiskLevel;
  mitigation: string | null;
  status: RiskStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

export interface SaveRiskRequest {
  title: string;
  level: RiskLevel;
  mitigation?: string | null;
  status?: RiskStatus;
  ownerId?: string | null;
}

// ---- 问题 ----

export interface IssueItem {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SaveIssueRequest {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  ownerId?: string | null;
  dueDate?: string | null;
}

// ---- 成员 ----

export interface ProjectMemberItem {
  userId: string;
  displayName: string;
  roleInProject: string | null;
}

export interface SaveMemberRequest {
  userId: string;
  roleInProject?: string | null;
}

// ============================================================
//  M5 BOM 与图纸：版本 / 明细 / ECO 版本链 / 图纸文件
//
//  前后端契约。BOM 版本走独立的 BomStatus 状态机（见 enums.ts），
//  ECO 采用轻量版本链：新版本从 sourceBomId 派生并记录变更原因。
// ============================================================

// ---- BOM 版本 ----

/** BOM 版本行。列表与「设计变更」版本链共用。 */
export interface BomVersionItem {
  id: string;
  projectId: string;
  /** 形如 V1.0（编码规则 §10.2：V主版本.次版本）。 */
  version: string;
  status: BomStatus;
  remark: string | null;
  /** ECO 变更原因。从旧版本派生时必填（业务方案 §8.2「变更必须记录原因」）。 */
  changeReason: string | null;
  /** 派生自哪个版本。初始版本为 null。 */
  sourceBomId: string | null;
  sourceVersion: string | null;
  itemCount: number;
  releasedAt: string | null;
  releasedByName: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** BOM 明细行。 */
export interface BomItemRow {
  id: string;
  bomId: string;
  /** 行号，展示排序用。 */
  seq: number;
  materialCode: string;
  materialName: string;
  spec: string | null;
  unit: string;
  quantity: number;
  /** 标准件 / 非标件（业务方案 §8.2）。 */
  isStandard: boolean;
  remark: string | null;
  /** 关联图纸（可选）。 */
  drawingId: string | null;
  drawingCode: string | null;
}

export interface BomDetail extends BomVersionItem {
  items: BomItemRow[];
}

/**
 * 新建 BOM 版本。带 sourceBomId 即为「发起变更」（ECO）：
 * 复制旧版明细、旧版置为变更中，changeReason 必填。
 */
export interface CreateBomRequest {
  projectId: string;
  /** 缺省由后端建议：初始 V1.0；派生时次版本 +1。 */
  version?: string;
  sourceBomId?: string;
  changeReason?: string;
  remark?: string | null;
}

export interface UpdateBomRequest {
  remark?: string | null;
  changeReason?: string | null;
}

/** BOM 状态流转（BomStatus 状态机，后端校验合法跃迁）。 */
export interface ChangeBomStatusRequest {
  status: BomStatus;
}

export interface SaveBomItemRequest {
  materialCode: string;
  materialName: string;
  spec?: string | null;
  unit?: string;
  quantity: number;
  isStandard?: boolean;
  remark?: string | null;
  drawingId?: string | null;
}

/** 批量追加明细（Excel 粘贴导入）。行号由后端自动续排。 */
export interface BatchBomItemsRequest {
  items: SaveBomItemRequest[];
}

// ---- 图纸 ----

export interface DrawingItem {
  id: string;
  projectId: string;
  /** 图号。 */
  code: string;
  name: string;
  /** 设计端版本号（如 A、B、V2），MES 不重编。 */
  version: string;
  status: DrawingStatus;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedByName: string | null;
  voidedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface DrawingListQuery {
  projectId: string;
  status?: DrawingStatus;
  keyword?: string;
}

/**
 * 上传图纸的表单字段（multipart，随 file 一起提交）。
 * 同项目同图号的其它有效版本会被自动作废，响应中以 supersededCount 提示。
 */
export interface UploadDrawingFields {
  projectId: string;
  code: string;
  name: string;
  version: string;
  remark?: string;
}

export interface UploadDrawingResponse {
  id: string;
  /** 因本次上传被自动作废的旧版本数。 */
  supersededCount: number;
}

// ============================================================
//  M6 物料与齐套：物料主数据 / 供应数据（采购、到货、库存）/ 领料 / 齐套计算
//
//  一期 ERP 未接入，供应数据经「Excel 粘贴导入」（与 BOM 明细导入同一交互）
//  进入。导入请求都是 JSON 行数组，由前端解析粘贴内容后提交。
// ============================================================

// ---- 物料主数据 ----

export interface MaterialItem {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  category: string | null;
  isStandard: boolean;
  /** 长周期物料（业务方案 §8.3）。缺口且无在途时看板高亮预警。 */
  isLongLead: boolean;
  leadTimeDays: number | null;
  syncSource: SyncSource;
  syncedAt: string;
  enabled: boolean;
  remark: string | null;
}

export interface MaterialListQuery {
  keyword?: string;
  category?: string;
  isLongLead?: boolean;
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SaveMaterialRequest {
  code: string;
  name: string;
  spec?: string | null;
  unit?: string;
  category?: string | null;
  isStandard?: boolean;
  isLongLead?: boolean;
  leadTimeDays?: number | null;
  enabled?: boolean;
  remark?: string | null;
}

/** 批量导入物料（按 code upsert）。 */
export interface ImportMaterialsRequest {
  items: SaveMaterialRequest[];
}

export interface ImportResult {
  created: number;
  updated: number;
}

// ---- 采购订单（ERP 镜像）----

export interface PoItemRow {
  id: string;
  orderId: string;
  orderNo: string;
  supplierName: string | null;
  poStatus: PoStatus;
  materialCode: string;
  materialName: string | null;
  quantity: number;
  arrivedQuantity: number;
  /** 在途 = quantity - arrivedQuantity（不小于 0）。 */
  inTransitQuantity: number;
  expectedDate: string | null;
  /** 预计到货已过期且仍有在途。 */
  delayed: boolean;
  projectId: string | null;
  projectCode: string | null;
  riskNote: string | null;
  syncedAt: string;
}

export interface PoItemListQuery {
  projectId?: string;
  materialCode?: string;
  keyword?: string;
  /** 只看有在途的行。 */
  inTransitOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** 导入采购订单行（同 orderNo 归并为一张单；按 orderNo+materialCode upsert 明细）。 */
export interface ImportPoRow {
  orderNo: string;
  supplierName?: string;
  orderDate?: string;
  materialCode: string;
  materialName?: string;
  quantity: number;
  arrivedQuantity?: number;
  expectedDate?: string;
  /** 项目编号（PJ-…），空为通用采购。 */
  projectCode?: string;
}

export interface ImportPoRequest {
  items: ImportPoRow[];
}

/** 采购员在 MES 侧仅可维护交期与风险备注（业务方案 §7.6）。 */
export interface UpdatePoItemRequest {
  expectedDate?: string | null;
  riskNote?: string | null;
}

// ---- 到货记录 ----

export interface ArrivalRow {
  id: string;
  materialCode: string;
  quantity: number;
  type: ArrivalType;
  arrivedAt: string;
  orderNo: string | null;
  projectId: string | null;
  projectCode: string | null;
  syncSource: SyncSource;
  remark: string | null;
}

export interface ArrivalListQuery {
  projectId?: string;
  materialCode?: string;
  type?: ArrivalType;
  page?: number;
  pageSize?: number;
}

export interface ImportArrivalRow {
  /** 关联采购单号（可选）。匹配到明细行时自动累加其已到货量。 */
  orderNo?: string;
  materialCode: string;
  quantity: number;
  type?: ArrivalType;
  arrivedAt: string;
  projectCode?: string;
  remark?: string;
}

export interface ImportArrivalsRequest {
  items: ImportArrivalRow[];
}

// ---- 库存快照 ----

export interface StockRow {
  id: string;
  materialCode: string;
  materialName: string | null;
  projectId: string | null;
  projectCode: string | null;
  quantity: number;
  availableQuantity: number;
  syncedAt: string;
}

export interface StockListQuery {
  projectId?: string;
  materialCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ImportStockRow {
  materialCode: string;
  /** 项目编号，空为通用库存。 */
  projectCode?: string;
  quantity: number;
  availableQuantity?: number;
}

/** 库存快照导入：整体覆盖现有快照（账务主权在 ERP，MES 不记增减账）。 */
export interface ImportStocksRequest {
  items: ImportStockRow[];
}

// ---- 领料/退料 ----

export interface RequisitionRow {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  materialCode: string;
  materialName: string | null;
  quantity: number;
  type: RequisitionType;
  status: RequisitionStatus;
  requestedByName: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface RequisitionListQuery {
  projectId?: string;
  status?: RequisitionStatus;
  materialCode?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateRequisitionRequest {
  projectId: string;
  materialCode: string;
  quantity: number;
  type?: RequisitionType;
  remark?: string | null;
}

// ---- 齐套计算 ----

/**
 * 齐套明细行（按物料编码聚合 BOM 需求后逐行计算）：
 * 缺口 = 需求 − 已领净额 − 项目可用库存 − 通用可用库存 − 已到货未领 − 在途。
 */
export interface KittingRow {
  materialCode: string;
  materialName: string;
  spec: string | null;
  unit: string;
  /** BOM 需求数量（同编码多行合并）。 */
  required: number;
  /** 已确认领料净额（领料 − 退料）。 */
  issued: number;
  /** 项目专用可用库存。 */
  projectStock: number;
  /** 计入的通用可用库存。 */
  generalStock: number;
  /** 已到货未入库（ARRIVED）。 */
  arrivedNotInbound: number;
  /** 采购在途。 */
  inTransit: number;
  /** 净缺口（不含在途）。>0 表示当前实物不足。 */
  gap: number;
  status: KittingRowStatus;
  /** 在途覆盖时的最晚预计到货日。 */
  latestExpectedDate: string | null;
  /** 该物料在途行上的交期风险备注（汇总）。 */
  riskNotes: string[];
  /** 长周期物料标记；未建档时为 false 且 uncatalogued 为 true。 */
  isLongLead: boolean;
  /** 物料主数据未建档，提示补录。 */
  uncatalogued: boolean;
}

/** 各数据源最后同步时间（业务方案 §5.1「看板必须标识数据同步时间」）。 */
export interface KittingSyncInfo {
  stockSyncedAt: string | null;
  poSyncedAt: string | null;
  arrivalSyncedAt: string | null;
}

export interface KittingResult {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** 需求来源 BOM 版本（最新已发布/冻结）；无可用版本时为 null，rows 为空。 */
  bomId: string | null;
  bomVersion: string | null;
  totalRows: number;
  fulfilledRows: number;
  inTransitRows: number;
  shortageRows: number;
  /** 行齐套率 = 缺口≤0 的行数 / 总行数（0-100）。 */
  kitRate: number;
  /** 数量加权齐套率 = Σmin(可用,需求) / Σ需求（0-100）。 */
  kitRateByQty: number;
  /** 长周期且缺料且无在途的行数（高危预警）。 */
  longLeadAlerts: number;
  sync: KittingSyncInfo;
  rows: KittingRow[];
}

/** 全项目齐套总览行（看板首页）。 */
export interface KittingOverviewItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  bomVersion: string | null;
  kitRate: number;
  shortageRows: number;
  longLeadAlerts: number;
}

// ============================================================
//  M7 生产执行：装配工单 / 任务派工 / 现场报工 / 异常单
//
//  一期不建独立「生产计划」实体（§8.4 设计原则：不做复杂 APS）——
//  工单即计划单元（计划/实际日期在工单上），任务即工序计划。
//  报工回写链路：报工 → 任务进度 → 工单进度 →（可选关联的）WBS 任务进度，
//  最终体现在 M4 甘特图与项目台账上。
// ============================================================

// ---- 装配工单 ----

/** 装配工单行。status 走通用 RecordStatus 状态机（草稿→下达→执行中→…）。 */
export interface WorkOrderRow {
  id: string;
  /** WO-YYYYMMDD-XXX */
  code: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  name: string;
  craft: CraftType;
  status: string; // RecordStatus
  planStartAt: string | null;
  planEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  /** 0-100，由任务按标准工时加权汇总，报工时自动重算。 */
  progress: number;
  taskCount: number;
  doneTaskCount: number;
  /** 未派工任务数，派工页/计划页红点提示。 */
  unassignedCount: number;
  totalStandardHours: number;
  totalActualHours: number;
  /** 关联的项目 WBS 任务；报工进度回写到它（甘特图联动）。 */
  wbsTaskId: string | null;
  wbsTaskName: string | null;
  /** 计划完工日已过而未完工。 */
  delayed: boolean;
  remark: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface WorkOrderListQuery {
  projectId?: string;
  status?: string;
  craft?: CraftType;
  keyword?: string;
  delayedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateWorkOrderRequest {
  projectId: string;
  name: string;
  craft: CraftType;
  planStartAt?: string | null;
  planEndAt?: string | null;
  wbsTaskId?: string | null;
  remark?: string | null;
}

/** 计划调整（§8.4）。craft 仅草稿可改；已进入执行的工单只允许调整计划日期等。 */
export interface UpdateWorkOrderRequest {
  name?: string;
  craft?: CraftType;
  planStartAt?: string | null;
  planEndAt?: string | null;
  wbsTaskId?: string | null;
  remark?: string | null;
}

/** 工单状态流转（通用 RecordStatus 状态机，后端校验合法跃迁）。 */
export interface ChangeWorkOrderStatusRequest {
  status: string;
}

export interface WorkOrderDetail extends WorkOrderRow {
  tasks: AssemblyTaskRow[];
}

/** 生产计划页顶部的项目维度汇总（计划 vs 实际、延期预警）。 */
export interface ProductionOverviewItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** 项目计划交期，来自项目台账。 */
  projectPlanEndAt: string | null;
  workOrderCount: number;
  completedCount: number;
  inProgressCount: number;
  delayedCount: number;
  unassignedCount: number;
  /** 各工单进度按标准工时加权的平均值（0-100）。 */
  avgProgress: number;
  openExceptionCount: number;
}

// ---- 装配任务 ----

export interface AssemblyTaskRow {
  id: string;
  workOrderId: string;
  seq: number;
  name: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: AssemblyTaskStatus;
  planStartAt: string | null;
  planEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  standardHours: number | null;
  /** 累计实际工时，由报工累加。 */
  actualHours: number;
  progress: number;
  drawingId: string | null;
  drawingCode: string | null;
  drawingName: string | null;
  /** 作业要求/指导说明（一期文本；完整作业指导书属工艺模块）。 */
  requirement: string | null;
  remark: string | null;
}

export interface SaveAssemblyTaskRequest {
  name: string;
  planStartAt?: string | null;
  planEndAt?: string | null;
  standardHours?: number | null;
  drawingId?: string | null;
  requirement?: string | null;
  remark?: string | null;
}

/** 派工/改派。assigneeId 传 null 表示取消派工（仅待开工任务可取消）。 */
export interface AssignTaskRequest {
  assigneeId: string | null;
}

/** 带工单与项目上下文的任务行——派工页与「我的任务」页共用。 */
export interface TaskWithContextRow extends AssemblyTaskRow {
  workOrderCode: string;
  workOrderName: string;
  workOrderStatus: string;
  craft: CraftType;
  projectId: string;
  projectCode: string;
  projectName: string;
}

export interface DispatchTaskQuery {
  projectId?: string;
  workOrderId?: string;
  status?: AssemblyTaskStatus;
  assigneeId?: string;
  unassignedOnly?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// ---- 现场报工 ----

export interface MyTaskQuery {
  /** 不传 = 全部未完工任务；COMPLETED = 历史已完工。 */
  status?: AssemblyTaskStatus;
  page?: number;
  pageSize?: number;
}

export interface WorkReportRow {
  id: string;
  taskId: string;
  type: WorkReportType;
  hours: number;
  /** 本次报工后的任务进度。 */
  progress: number;
  note: string | null;
  reporterName: string | null;
  createdAt: string;
}

export interface MyTaskDetail {
  task: TaskWithContextRow;
  reports: WorkReportRow[];
}

/**
 * 报工。动作合法性由 REPORT_ACTION_RULES 决定；
 * hours 为本次投入工时（开工/恢复默认 0），progress 为动作后的完成度
 * （COMPLETE 强制 100，REWORK 缺省归 0）。
 */
export interface CreateWorkReportRequest {
  type: WorkReportType;
  hours?: number;
  progress?: number;
  note?: string | null;
}

// ---- 异常单 ----

export interface ExceptionRow {
  id: string;
  /** EX-YYYYMMDD-XXX */
  code: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  workOrderId: string | null;
  workOrderCode: string | null;
  taskId: string | null;
  taskName: string | null;
  materialCode: string | null;
  title: string;
  description: string | null;
  status: ExceptionStatus;
  reporterId: string | null;
  reporterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  handleNote: string | null;
  resolvedAt: string | null;
  closedByName: string | null;
  closedAt: string | null;
  photoCount: number;
  createdAt: string;
}

export interface ExceptionListQuery {
  projectId?: string;
  status?: ExceptionStatus;
  /** 只看我提交或我负责的（无 plan:read 权限时后端强制生效）。 */
  onlyMine?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 提交异常（§9.6：选择项目/设备/工序/物料 + 照片说明）。带 taskId 时项目与工单自动带出。 */
export interface CreateExceptionRequest {
  projectId?: string;
  workOrderId?: string | null;
  taskId?: string | null;
  materialCode?: string | null;
  title: string;
  description?: string | null;
}

export interface AssignExceptionRequest {
  handlerId: string;
}

export interface ResolveExceptionRequest {
  handleNote: string;
}

/** 关闭（确认通过）或退回（复检不通过 → 处理中）。note 追加到处理记录。 */
export interface CloseExceptionRequest {
  note?: string | null;
}

export interface AttachmentItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface ExceptionDetail extends ExceptionRow {
  photos: AttachmentItem[];
}

// ============================================================
//  M8 质量管理：检验单 / 检验项明细 / 质量问题单 8D 闭环
//
//  检验单 = 单头 + 检验项明细行，判定即终态；不合格在同一事务内
//  强制生成质量问题单（§9.7「不合格则生成质量问题单」）。
//  问题单闭环：分派 → 整改 → 复检 →（通过）关闭 /（不通过）退回，
//  每一步落独立动作日志（qc_issue_action），8D 字段在主表存最新值。
// ============================================================

// ---- 检验单 ----

/** 检验项明细行（创建/编辑时提交）。passed 为 null 表示未判定。 */
export interface InspectionItemInput {
  name: string;
  standard?: string | null;
  actual?: string | null;
  passed?: boolean | null;
  remark?: string | null;
}

export interface InspectionItemRow extends InspectionItemInput {
  id: string;
  seq: number;
}

export interface InspectionRow {
  id: string;
  /** QC-YYYYMMDD-XXX */
  code: string;
  type: InspectionType;
  status: InspectionStatus;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  workOrderId: string | null;
  workOrderCode: string | null;
  taskId: string | null;
  taskName: string | null;
  arrivalId: string | null;
  materialCode: string | null;
  batchNo: string | null;
  supplierName: string | null;
  title: string;
  inspectorId: string | null;
  inspectorName: string | null;
  judgedByName: string | null;
  judgedAt: string | null;
  remark: string | null;
  itemCount: number;
  /** 不合格明细行数（判定后追溯用）。 */
  failedItemCount: number;
  photoCount: number;
  createdAt: string;
}

export interface InspectionDetail extends InspectionRow {
  items: InspectionItemRow[];
  photos: AttachmentItem[];
  /** 由本单不合格生成的质量问题单（追溯入口）。 */
  issues: { id: string; code: string; status: QualityIssueStatus }[];
}

export interface InspectionListQuery {
  type?: InspectionType;
  status?: InspectionStatus;
  projectId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 创建检验单。必填关联维度由 INSPECTION_TYPE_META 决定；关联工单/任务时归属自动反查。 */
export interface CreateInspectionRequest {
  type: InspectionType;
  title: string;
  projectId?: string | null;
  workOrderId?: string | null;
  taskId?: string | null;
  arrivalId?: string | null;
  materialCode?: string | null;
  batchNo?: string | null;
  supplierName?: string | null;
  remark?: string | null;
  items?: InspectionItemInput[];
}

/** 编辑检验单（仅 PENDING）。items 全量替换。 */
export interface UpdateInspectionRequest {
  title?: string;
  batchNo?: string | null;
  supplierName?: string | null;
  materialCode?: string | null;
  remark?: string | null;
  items?: InspectionItemInput[];
}

/** 判定。REJECTED 时后端在同一事务内生成质量问题单并返回其编号。 */
export interface JudgeInspectionRequest {
  result: 'PASSED' | 'REJECTED';
  remark?: string | null;
}

export interface JudgeInspectionResult {
  ok: true;
  /** 不合格时自动生成的问题单。 */
  issueId?: string;
  issueCode?: string;
}

// ---- 质量问题单 ----

export interface QualityIssueRow {
  id: string;
  /** QI-YYYYMMDD-XXX */
  code: string;
  source: IssueSource;
  inspectionId: string | null;
  inspectionCode: string | null;
  status: QualityIssueStatus;
  severity: IssueSeverity;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  workOrderId: string | null;
  workOrderCode: string | null;
  taskId: string | null;
  taskName: string | null;
  materialCode: string | null;
  batchNo: string | null;
  supplierName: string | null;
  title: string;
  description: string | null;
  containmentAction: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  disposition: DispositionType | null;
  reporterId: string | null;
  reporterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  closedByName: string | null;
  closedAt: string | null;
  photoCount: number;
  createdAt: string;
}

export interface QualityIssueActionItem {
  id: string;
  type: QualityIssueActionType;
  note: string | null;
  operatorName: string | null;
  createdAt: string;
}

export interface QualityIssueDetail extends QualityIssueRow {
  /** 动作时间线，按时间正序。 */
  actions: QualityIssueActionItem[];
  photos: AttachmentItem[];
}

export interface QualityIssueListQuery {
  status?: QualityIssueStatus;
  severity?: IssueSeverity;
  source?: IssueSource;
  projectId?: string;
  /** 只看我发起或我负责的（无 quality:issue:read 权限时后端强制生效）。 */
  onlyMine?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 手动发起问题单。关联工单/任务时归属自动反查。 */
export interface CreateQualityIssueRequest {
  title: string;
  description?: string | null;
  severity?: IssueSeverity;
  projectId?: string | null;
  workOrderId?: string | null;
  taskId?: string | null;
  materialCode?: string | null;
  batchNo?: string | null;
  supplierName?: string | null;
}

/** 编辑基础信息与 8D 字段（非终态；quality:issue:write 或责任人本人）。 */
export interface UpdateQualityIssueRequest {
  title?: string;
  description?: string | null;
  severity?: IssueSeverity;
  containmentAction?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  disposition?: DispositionType | null;
}

export interface AssignQualityIssueRequest {
  handlerId: string;
  note?: string | null;
}

/** 责任人提交整改：流转到待复检，可同时更新 8D 字段。 */
export interface SubmitQualityIssueRequest {
  note: string;
  containmentAction?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  disposition?: DispositionType | null;
}

/** 复检：通过即关闭，不通过退回整改中。 */
export interface RecheckQualityIssueRequest {
  pass: boolean;
  note?: string | null;
}

export interface VoidQualityIssueRequest {
  note?: string | null;
}

// ============================================================
//  M9 调试与验收：调试记录 / 调试问题多轮闭环 / FAT-SAT 验收
//
//  调试记录 = 单头 + 参数明细行（DBG-）；调试问题 = 多轮整改复测闭环（DI-），
//  与 M8 质量问题单同构但独立统计；验收单 = 单头 + 检查项（FAT-/SAT-），
//  结论「通过」有门禁：项目存在未关闭调试问题时后端拒绝（§9.8）。
//  一期无设备实体，设备编号以文本快照记录（同 FQC 的 batchNo 思路）。
// ============================================================

// ---- 调试记录 ----

/** 调试参数明细行（创建/编辑时提交）。passed 为 null 表示未判定达标性。 */
export interface DebugParamInput {
  name: string;
  standard?: string | null;
  actual?: string | null;
  unit?: string | null;
  passed?: boolean | null;
  remark?: string | null;
}

export interface DebugParamRow extends DebugParamInput {
  id: string;
  seq: number;
}

export interface DebugRecordRow {
  id: string;
  /** DBG-YYYYMMDD-XXX */
  code: string;
  type: DebugType;
  status: DebugRecordStatus;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  /** 设备编号快照（EQ-…），一期自由文本。 */
  equipmentNo: string | null;
  title: string;
  content: string | null;
  executorId: string | null;
  executorName: string | null;
  debugAt: string;
  completedByName: string | null;
  completedAt: string | null;
  remark: string | null;
  paramCount: number;
  /** 未达标参数行数。 */
  failedParamCount: number;
  /** 挂在本记录下的调试问题数（未关闭）。 */
  openIssueCount: number;
  photoCount: number;
  createdAt: string;
}

export interface DebugRecordDetail extends DebugRecordRow {
  params: DebugParamRow[];
  photos: AttachmentItem[];
  /** 挂在本记录下的调试问题（追溯入口）。 */
  issues: { id: string; code: string; title: string; status: DebugIssueStatus }[];
}

export interface DebugRecordListQuery {
  type?: DebugType;
  status?: DebugRecordStatus;
  projectId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateDebugRecordRequest {
  type: DebugType;
  title: string;
  projectId: string;
  equipmentNo?: string | null;
  content?: string | null;
  /** 调试人，缺省为当前用户。 */
  executorId?: string | null;
  /** 调试日期，缺省为当前时间。 */
  debugAt?: string | null;
  remark?: string | null;
  params?: DebugParamInput[];
}

/** 编辑调试记录（仅调试中）。params 全量替换。 */
export interface UpdateDebugRecordRequest {
  title?: string;
  equipmentNo?: string | null;
  content?: string | null;
  executorId?: string | null;
  debugAt?: string | null;
  remark?: string | null;
  params?: DebugParamInput[];
}

// ---- 调试问题 ----

export interface DebugIssueRow {
  id: string;
  /** DI-YYYYMMDD-XXX */
  code: string;
  status: DebugIssueStatus;
  severity: IssueSeverity;
  stage: DebugStage;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  recordId: string | null;
  recordCode: string | null;
  equipmentNo: string | null;
  title: string;
  description: string | null;
  /** 最新整改措施说明（每轮历史见动作时间线）。 */
  solution: string | null;
  reporterId: string | null;
  reporterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  closedByName: string | null;
  closedAt: string | null;
  photoCount: number;
  createdAt: string;
}

export interface DebugIssueActionItem {
  id: string;
  type: DebugIssueActionType;
  note: string | null;
  operatorName: string | null;
  createdAt: string;
}

export interface DebugIssueDetail extends DebugIssueRow {
  /** 动作时间线，按时间正序。多轮整改复测历史完整可查。 */
  actions: DebugIssueActionItem[];
  photos: AttachmentItem[];
}

export interface DebugIssueListQuery {
  status?: DebugIssueStatus;
  severity?: IssueSeverity;
  stage?: DebugStage;
  projectId?: string;
  recordId?: string;
  /** 只看我发起或我负责的（无 debug:read 权限时后端强制生效）。 */
  onlyMine?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 发起调试问题。关联调试记录时项目/设备号自动反查。 */
export interface CreateDebugIssueRequest {
  title: string;
  description?: string | null;
  severity?: IssueSeverity;
  stage?: DebugStage;
  projectId?: string | null;
  recordId?: string | null;
  equipmentNo?: string | null;
}

/** 编辑基础信息（非终态；debug:write 或责任人本人）。 */
export interface UpdateDebugIssueRequest {
  title?: string;
  description?: string | null;
  severity?: IssueSeverity;
  stage?: DebugStage;
  equipmentNo?: string | null;
  solution?: string | null;
}

export interface AssignDebugIssueRequest {
  handlerId: string;
  note?: string | null;
}

/** 责任人提交整改：流转到待复测，可同时更新整改措施。 */
export interface SubmitDebugIssueRequest {
  note: string;
  solution?: string | null;
}

/** 复测：通过即关闭，不通过退回整改中。 */
export interface RecheckDebugIssueRequest {
  pass: boolean;
  note?: string | null;
}

export interface VoidDebugIssueRequest {
  note?: string | null;
}

// ---- FAT / SAT 验收 ----

/** 验收检查项（创建/编辑时提交）。passed 为 null 表示未核查。 */
export interface AcceptanceItemInput {
  name: string;
  standard?: string | null;
  actual?: string | null;
  passed?: boolean | null;
  remark?: string | null;
}

export interface AcceptanceItemRow extends AcceptanceItemInput {
  id: string;
  seq: number;
}

export interface AcceptanceRow {
  id: string;
  /** FAT-YYYYMMDD-XXX / SAT-YYYYMMDD-XXX */
  code: string;
  type: AcceptanceType;
  status: AcceptanceStatus;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  customerName: string | null;
  equipmentNo: string | null;
  title: string;
  /** 计划验收日期。 */
  plannedAt: string | null;
  /** 验收地点（SAT 为客户现场）。 */
  location: string | null;
  /** 客户代表（签字记录快照）。 */
  customerRep: string | null;
  /** 结论说明；有条件通过时为遗留问题与整改期限说明（必填）。 */
  conclusion: string | null;
  createdByName: string | null;
  concludedByName: string | null;
  concludedAt: string | null;
  remark: string | null;
  itemCount: number;
  failedItemCount: number;
  createdAt: string;
}

export interface AcceptanceDetail extends AcceptanceRow {
  items: AcceptanceItemRow[];
}

export interface AcceptanceListQuery {
  type?: AcceptanceType;
  status?: AcceptanceStatus;
  projectId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateAcceptanceRequest {
  type: AcceptanceType;
  title: string;
  projectId: string;
  equipmentNo?: string | null;
  plannedAt?: string | null;
  location?: string | null;
  customerRep?: string | null;
  remark?: string | null;
  items?: AcceptanceItemInput[];
}

/** 编辑验收单（仅验收中）。items 全量替换。 */
export interface UpdateAcceptanceRequest {
  title?: string;
  equipmentNo?: string | null;
  plannedAt?: string | null;
  location?: string | null;
  customerRep?: string | null;
  remark?: string | null;
  items?: AcceptanceItemInput[];
}

/**
 * 出具验收结论。PASSED 时后端校验项目无未关闭调试问题，否则 409；
 * CONDITIONAL 时 conclusion 必填（遗留问题与整改期限）。
 */
export interface ConcludeAcceptanceRequest {
  result: (typeof ACCEPTANCE_CONCLUSIONS)[number];
  conclusion?: string | null;
}

// ---- 验收报告（打印视图数据源，M9 验收标准「生成 FAT 报告 PDF」）----

/** 报告内的调试记录摘要行。 */
export interface ReportDebugRecordItem {
  code: string;
  type: DebugType;
  title: string;
  status: DebugRecordStatus;
  executorName: string | null;
  debugAt: string;
  paramCount: number;
  failedParamCount: number;
}

/** 报告内的调试问题摘要行。 */
export interface ReportDebugIssueItem {
  code: string;
  title: string;
  stage: DebugStage;
  severity: IssueSeverity;
  status: DebugIssueStatus;
  handlerName: string | null;
  closedAt: string | null;
}

/** 报告内的出厂/调试检验摘要行（M8 联动：FQC 与 DEBUG 类检验）。 */
export interface ReportInspectionItem {
  code: string;
  type: InspectionType;
  title: string;
  status: InspectionStatus;
  judgedAt: string | null;
}

/**
 * 验收报告聚合数据。后端一次拼齐，前端打印视图（A4）渲染，
 * 浏览器「打印 → 另存为 PDF」即报告文件——中文排版由浏览器保证，服务端零重依赖。
 */
export interface AcceptanceReport {
  acceptance: AcceptanceDetail;
  project: {
    code: string;
    name: string;
    customerName: string | null;
    contractNo: string | null;
    projectType: string | null;
    managerName: string | null;
    planEndAt: string | null;
  };
  debugRecords: ReportDebugRecordItem[];
  debugIssues: ReportDebugIssueItem[];
  /** 未关闭调试问题数（报告置顶提示；PASSED 门禁的依据）。 */
  openDebugIssueCount: number;
  inspections: ReportInspectionItem[];
  /** 报告生成时间（服务端时间）。 */
  generatedAt: string;
}

// ============================================================
//  M10 数据看板：公司级看板 / 项目看板 / 工作台指标
//
//  三个端点各一次响应返回整板数据（服务端 Promise.all 并发聚合，
//  对应验收标准「看板加载 < 2s」——前端只发一个请求，不逐图取数）。
//  齐套口径完全复用 M6 KittingService，不另建第二套算法；
//  趋势序列由 PG date_trunc 分桶后在服务端补零，前端拿到即渲染。
// ============================================================

/** 项目状态分布行（排除已作废）。 */
export interface ProjectStatusCount {
  status: RecordStatus;
  count: number;
}

/** 未关闭问题按严重度分布行。 */
export interface SeverityCount {
  severity: IssueSeverity;
  count: number;
}

/** 未关闭调试问题按发现阶段分布行。 */
export interface StageCount {
  stage: DebugStage;
  count: number;
}

/** 报工工时按装配专业汇总行（小时）。 */
export interface CraftHours {
  craft: CraftType;
  hours: number;
}

/** 日报工工时点。date 为 YYYY-MM-DD，区间内无报工的日期补零。 */
export interface DailyHoursPoint {
  date: string;
  hours: number;
}

/** 月度质量问题趋势点。month 为 YYYY-MM，opened/closed 分别按创建与关闭时间归桶。 */
export interface MonthlyIssuePoint {
  month: string;
  opened: number;
  closed: number;
}

/** 检验单按类型的判定汇总（不含已作废）。 */
export interface InspectionTypeSummary {
  type: InspectionType;
  pending: number;
  passed: number;
  rejected: number;
}

/** 延期项目行：超计划交期且未完成的项目。 */
export interface DelayedProjectRow {
  id: string;
  code: string;
  name: string;
  managerName: string | null;
  planEndAt: string;
  /** 已超期天数（向上取整）。 */
  overdueDays: number;
  riskLevel: RiskLevel;
  /** 该项目全部有效工单的平均进度；无工单为 0。 */
  avgProgress: number;
}

export interface CompanyDashboardKpi {
  /** 非作废项目总数。 */
  totalProjects: number;
  /** 在制项目：已发布/执行中/暂停/变更中。 */
  activeProjects: number;
  /** 已完成 + 已关闭。 */
  completedProjects: number;
  delayedProjects: number;
  /** 30 天内到期且未完成。 */
  dueSoonProjects: number;
  /** 平均齐套率（参与齐套统计的项目均值）。 */
  avgKitRate: number;
  /** 参与齐套统计的项目数（avgKitRate 样本量，0 时前端显示「—」）。 */
  kittingProjects: number;
  openQualityIssues: number;
  openDebugIssues: number;
  /** 未关闭现场异常（M7）。 */
  openExceptions: number;
  /** 本自然月累计报工工时（小时）。 */
  monthWorkHours: number;
}

/** 公司级看板（dashboard:company）。 */
export interface CompanyDashboard {
  kpi: CompanyDashboardKpi;
  projectsByStatus: ProjectStatusCount[];
  /** 齐套率升序（最缺的排前），复用 M6 总览行，cap 12。 */
  kittingRanking: KittingOverviewItem[];
  qualityBySeverity: SeverityCount[];
  /** 近 6 个自然月（含当月）。 */
  qualityTrend: MonthlyIssuePoint[];
  debugByStage: StageCount[];
  inspectionByType: InspectionTypeSummary[];
  /** 近 30 天（含今日）。 */
  workHoursTrend: DailyHoursPoint[];
  /** 近 30 天按专业。 */
  workHoursByCraft: CraftHours[];
  /** 超期未完成项目，按超期天数降序，cap 10。 */
  delayedProjects: DelayedProjectRow[];
  generatedAt: string;
}

/** 项目看板头部信息。 */
export interface ProjectDashboardInfo {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  contractNo: string | null;
  projectType: string | null;
  status: RecordStatus;
  riskLevel: RiskLevel;
  managerName: string | null;
  equipmentCount: number;
  planStartAt: string | null;
  planEndAt: string | null;
  actualEndAt: string | null;
}

export interface ProjectDashboardKpi {
  /** null = 无有效 BOM，齐套未纳入统计。 */
  kitRate: number | null;
  shortageRows: number;
  workOrderCount: number;
  /** 有效（非作废）工单平均进度。 */
  avgWorkOrderProgress: number;
  wbsTotal: number;
  wbsCompleted: number;
  wbsCompletionRate: number;
  openQualityIssues: number;
  openDebugIssues: number;
  openExceptions: number;
  openRisks: number;
  /** 项目累计报工工时（小时）。 */
  totalWorkHours: number;
}

/** 项目里程碑时间轴点。actualDate 非空即视为已达成（同 M4 口径）。 */
export interface MilestonePoint {
  id: string;
  name: string;
  planDate: string | null;
  actualDate: string | null;
}

/** 工单进度条行。 */
export interface WorkOrderProgressRow {
  id: string;
  code: string;
  name: string;
  craft: CraftType;
  status: RecordStatus;
  progress: number;
  planEndAt: string | null;
}

/** 项目看板的齐套摘要（明细看 M6 齐套看板）。 */
export interface ProjectKittingSummary {
  bomVersion: string | null;
  kitRate: number;
  kitRateByQty: number;
  fulfilledRows: number;
  inTransitRows: number;
  shortageRows: number;
  longLeadAlerts: number;
}

/** 缺口最大的物料行（看板 Top N 摘要）。 */
export interface ShortageTopRow {
  materialCode: string;
  materialName: string;
  unit: string;
  gap: number;
  latestExpectedDate: string | null;
  isLongLead: boolean;
}

/** 质量问题按状态分布行。 */
export interface QualityStatusCount {
  status: QualityIssueStatus;
  count: number;
}

/** 未闭环问题合并行（质量 + 调试）。 */
export interface OpenIssueRow {
  kind: 'QUALITY' | 'DEBUG';
  id: string;
  code: string;
  title: string;
  severity: IssueSeverity;
  /** QualityIssueStatus 或 DebugIssueStatus，前端按 kind 取对应枚举表。 */
  status: string;
  /** 仅调试问题：发现阶段。 */
  stage: DebugStage | null;
  handlerName: string | null;
  createdAt: string;
}

/** 项目看板（dashboard:project）。 */
export interface ProjectDashboard {
  project: ProjectDashboardInfo;
  kpi: ProjectDashboardKpi;
  /** null = 无有效 BOM。 */
  kitting: ProjectKittingSummary | null;
  /** 缺口降序 cap 5。 */
  shortageTop: ShortageTopRow[];
  milestones: MilestonePoint[];
  workOrders: WorkOrderProgressRow[];
  /** 全状态分布（含已关闭/作废，前端图表自行取舍）。 */
  qualityByStatus: QualityStatusCount[];
  /** 未关闭调试问题按阶段。 */
  debugByStage: StageCount[];
  /** 近 30 天该项目日报工工时。 */
  workHoursTrend: DailyHoursPoint[];
  /** 项目累计按专业。 */
  workHoursByCraft: CraftHours[];
  /** 未闭环问题（质量 + 调试）按严重度/时间排序 cap 10。 */
  openIssues: OpenIssueRow[];
  generatedAt: string;
}

/** 工作台指标（登录即可见，无需看板权限；只含汇总计数，不含明细）。 */
export interface WorkbenchMetrics {
  activeProjects: number;
  newProjectsThisMonth: number;
  avgKitRate: number;
  kittingProjects: number;
  /** 全部项目缺料行合计。 */
  shortageItems: number;
  taskTotal: number;
  taskCompleted: number;
  /** 装配任务完工率（已完工 / 总数）。 */
  assemblyCompletionRate: number;
  /** 执行中工单数。 */
  activeWorkOrders: number;
  openQualityIssues: number;
  openDebugIssues: number;
}

/** 工作台「重点项目交付进度」行：计划交期最近的在制项目。 */
export interface WorkbenchDeliveryRow {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
  riskLevel: RiskLevel;
  planEndAt: string | null;
  /** 有效工单平均进度。 */
  progress: number;
}

/** 工作台动态行：最近未闭环的异常/质量问题/调试问题。 */
export interface WorkbenchTodoItem {
  kind: 'EXCEPTION' | 'QUALITY' | 'DEBUG';
  code: string;
  title: string;
  createdAt: string;
}

export interface WorkbenchSummary {
  metrics: WorkbenchMetrics;
  delivery: WorkbenchDeliveryRow[];
  todos: WorkbenchTodoItem[];
  generatedAt: string;
}

/**
 * 评估密码强度。前端用它渲染强度条，后端用它做准入校验（score < 2 拒绝）。
 * 注意：这只挡住弱密码，真正的防护来自 Argon2id 哈希与登录限流。
 */
export function evaluatePassword(pwd: string): PasswordStrength {
  const issues: string[] = [];
  if (pwd.length < PASSWORD_MIN_LENGTH) issues.push(`长度至少 ${PASSWORD_MIN_LENGTH} 位`);
  if (!/[a-z]/.test(pwd)) issues.push('需包含小写字母');
  if (!/[A-Z]/.test(pwd)) issues.push('需包含大写字母');
  if (!/\d/.test(pwd)) issues.push('需包含数字');
  if (!/[^\w\s]/.test(pwd)) issues.push('需包含符号');

  const passed = 5 - issues.length;
  // 长度是强度的主要来源，够长时额外加一档
  const bonus = pwd.length >= 16 ? 1 : 0;
  const score = Math.max(0, Math.min(4, passed - 1 + bonus)) as PasswordStrength['score'];

  return {
    score,
    label: ['极弱', '弱', '一般', '强', '很强'][score],
    issues,
  };
}
