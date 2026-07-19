import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ACCEPTANCE_CONCLUSIONS,
  AcceptanceStatus,
  AcceptanceType,
  DebugIssueStatus,
  DebugRecordStatus,
  DebugStage,
  DebugType,
  IssueSeverity,
} from '@mes/shared';

const DEBUG_TYPES = Object.values(DebugType);
const DEBUG_RECORD_STATUSES = Object.values(DebugRecordStatus);
const DEBUG_ISSUE_STATUSES = Object.values(DebugIssueStatus);
const DEBUG_STAGES = Object.values(DebugStage);
const ISSUE_SEVERITIES = Object.values(IssueSeverity);
const ACCEPTANCE_TYPES = Object.values(AcceptanceType);
const ACCEPTANCE_STATUSES = Object.values(AcceptanceStatus);

/** query 参数里的 'true'/'false' 字符串转布尔。 */
const ToBoolean = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));

class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// ============================================================
//  调试记录
// ============================================================

export class DebugParamDto {
  @IsString()
  @Length(1, 128, { message: '参数项名称长度应为 1-128 位' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  standard?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  actual?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string | null;

  @IsOptional()
  @IsBoolean()
  passed?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string | null;
}

export class CreateDebugRecordDto {
  @IsIn(DEBUG_TYPES)
  type!: DebugType;

  @IsString()
  @Length(1, 128, { message: '调试对象说明长度应为 1-128 位' })
  title!: string;

  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string | null;

  @IsOptional()
  @IsString()
  executorId?: string | null;

  @IsOptional()
  @IsDateString()
  debugAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebugParamDto)
  params?: DebugParamDto[];
}

export class UpdateDebugRecordDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string | null;

  @IsOptional()
  @IsString()
  executorId?: string | null;

  @IsOptional()
  @IsDateString()
  debugAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebugParamDto)
  params?: DebugParamDto[];
}

export class DebugRecordListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(DEBUG_TYPES)
  type?: DebugType;

  @IsOptional()
  @IsIn(DEBUG_RECORD_STATUSES)
  status?: DebugRecordStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

// ============================================================
//  调试问题
// ============================================================

export class CreateDebugIssueDto {
  @IsString()
  @Length(1, 128, { message: '问题标题长度应为 1-128 位' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: IssueSeverity;

  @IsOptional()
  @IsIn(DEBUG_STAGES)
  stage?: DebugStage;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  recordId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;
}

export class UpdateDebugIssueDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: IssueSeverity;

  @IsOptional()
  @IsIn(DEBUG_STAGES)
  stage?: DebugStage;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  solution?: string | null;
}

export class AssignDebugIssueDto {
  @IsString()
  handlerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SubmitDebugIssueDto {
  @IsString()
  @Length(1, 2000, { message: '整改说明长度应为 1-2000 位' })
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  solution?: string | null;
}

export class RecheckDebugIssueDto {
  @IsBoolean()
  pass!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class VoidDebugIssueDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class DebugIssueListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(DEBUG_ISSUE_STATUSES)
  status?: DebugIssueStatus;

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: IssueSeverity;

  @IsOptional()
  @IsIn(DEBUG_STAGES)
  stage?: DebugStage;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  onlyMine?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

// ============================================================
//  FAT / SAT 验收
// ============================================================

export class AcceptanceItemDto {
  @IsString()
  @Length(1, 128, { message: '检查项名称长度应为 1-128 位' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  standard?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  actual?: string | null;

  @IsOptional()
  @IsBoolean()
  passed?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string | null;
}

export class CreateAcceptanceDto {
  @IsIn(ACCEPTANCE_TYPES)
  type!: AcceptanceType;

  @IsString()
  @Length(1, 128, { message: '验收对象说明长度应为 1-128 位' })
  title!: string;

  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;

  @IsOptional()
  @IsDateString()
  plannedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerRep?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceItemDto)
  items?: AcceptanceItemDto[];
}

export class UpdateAcceptanceDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  equipmentNo?: string | null;

  @IsOptional()
  @IsDateString()
  plannedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerRep?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceItemDto)
  items?: AcceptanceItemDto[];
}

export class ConcludeAcceptanceDto {
  @IsIn(ACCEPTANCE_CONCLUSIONS)
  result!: (typeof ACCEPTANCE_CONCLUSIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conclusion?: string | null;
}

export class AcceptanceListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(ACCEPTANCE_TYPES)
  type?: AcceptanceType;

  @IsOptional()
  @IsIn(ACCEPTANCE_STATUSES)
  status?: AcceptanceStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}
