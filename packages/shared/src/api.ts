import type { DataScope, UserStatus } from './enums';
import type {
  ArrivalType,
  BomStatus,
  DrawingStatus,
  IssuePriority,
  IssueStatus,
  KittingRowStatus,
  PoStatus,
  RequisitionStatus,
  RequisitionType,
  RiskLevel,
  RiskStatus,
  SyncSource,
  TaskStatus,
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
