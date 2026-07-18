import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IssuePriority,
  IssueStatus,
  RecordStatus,
  RiskLevel,
  RiskStatus,
  TaskStatus,
} from '@mes/shared';

const RISK_LEVELS = Object.values(RiskLevel);
const RISK_STATUSES = Object.values(RiskStatus);
const ISSUE_STATUSES = Object.values(IssueStatus);
const ISSUE_PRIORITIES = Object.values(IssuePriority);
const TASK_STATUSES = Object.values(TaskStatus);
const RECORD_STATUSES = Object.values(RecordStatus);

/** 分页查询基类（与 system 模块保持一致的约定）。 */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

// ---- 项目 ----

export class ProjectListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(RECORD_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(RISK_LEVELS)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsString()
  managerId?: string;
}

export class SaveProjectDto {
  @IsString()
  @Length(2, 128, { message: '项目名称长度应为 2-128 位' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contractNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  equipmentCount?: number;

  @IsOptional()
  @IsString()
  managerId?: string | null;

  @IsOptional()
  @IsISO8601()
  planStartAt?: string | null;

  @IsOptional()
  @IsISO8601()
  planEndAt?: string | null;

  @IsOptional()
  @IsIn(RISK_LEVELS)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class ChangeProjectStatusDto {
  @IsIn(RECORD_STATUSES, { message: '非法的目标状态' })
  status!: string;
}

// ---- 里程碑 ----

export class SaveMilestoneDto {
  @IsString()
  @Length(1, 64, { message: '里程碑名称长度应为 1-64 位' })
  name!: string;

  @IsOptional()
  @IsISO8601()
  planDate?: string | null;

  @IsOptional()
  @IsISO8601()
  actualDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

// ---- WBS 任务 ----

export class SaveTaskDto {
  @IsString()
  @Length(1, 128, { message: '任务名称长度应为 1-128 位' })
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @IsOptional()
  @IsISO8601()
  planStartAt?: string | null;

  @IsOptional()
  @IsISO8601()
  planEndAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

// ---- 风险 ----

export class SaveRiskDto {
  @IsString()
  @Length(2, 128, { message: '风险标题长度应为 2-128 位' })
  title!: string;

  @IsIn(RISK_LEVELS)
  level!: RiskLevel;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mitigation?: string | null;

  @IsOptional()
  @IsIn(RISK_STATUSES)
  status?: RiskStatus;

  @IsOptional()
  @IsString()
  ownerId?: string | null;
}

// ---- 问题 ----

export class SaveIssueDto {
  @IsString()
  @Length(2, 128, { message: '问题标题长度应为 2-128 位' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsIn(ISSUE_STATUSES)
  status?: IssueStatus;

  @IsOptional()
  @IsIn(ISSUE_PRIORITIES)
  priority?: IssuePriority;

  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;
}

// ---- 成员 ----

export class SaveMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleInProject?: string | null;
}
