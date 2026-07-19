import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  DispositionType,
  InspectionStatus,
  InspectionType,
  IssueSeverity,
  IssueSource,
  QualityIssueStatus,
} from '@mes/shared';

const INSPECTION_TYPES = Object.values(InspectionType);
const INSPECTION_STATUSES = Object.values(InspectionStatus);
const ISSUE_STATUSES = Object.values(QualityIssueStatus);
const ISSUE_SEVERITIES = Object.values(IssueSeverity);
const ISSUE_SOURCES = Object.values(IssueSource);
const DISPOSITION_TYPES = Object.values(DispositionType);

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
//  检验单
// ============================================================

export class InspectionItemDto {
  @IsString()
  @Length(1, 128, { message: '检验项目名称长度应为 1-128 位' })
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

export class CreateInspectionDto {
  @IsIn(INSPECTION_TYPES)
  type!: InspectionType;

  @IsString()
  @Length(1, 128, { message: '检验对象说明长度应为 1-128 位' })
  title!: string;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  workOrderId?: string | null;

  @IsOptional()
  @IsString()
  taskId?: string | null;

  @IsOptional()
  @IsString()
  arrivalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  batchNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items?: InspectionItemDto[];
}

export class UpdateInspectionDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  batchNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items?: InspectionItemDto[];
}

export class JudgeInspectionDto {
  @IsIn([InspectionStatus.PASSED, InspectionStatus.REJECTED])
  result!: 'PASSED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;
}

export class InspectionListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(INSPECTION_TYPES)
  type?: InspectionType;

  @IsOptional()
  @IsIn(INSPECTION_STATUSES)
  status?: InspectionStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

// ============================================================
//  质量问题单
// ============================================================

export class CreateQualityIssueDto {
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
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  workOrderId?: string | null;

  @IsOptional()
  @IsString()
  taskId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  batchNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierName?: string | null;
}

export class UpdateQualityIssueDto {
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
  @IsString()
  @MaxLength(4000)
  containmentAction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rootCause?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  correctiveAction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  preventiveAction?: string | null;

  @IsOptional()
  @IsIn(DISPOSITION_TYPES)
  disposition?: DispositionType | null;
}

export class AssignQualityIssueDto {
  @IsString()
  handlerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SubmitQualityIssueDto {
  @IsString()
  @Length(1, 2000, { message: '整改说明长度应为 1-2000 位' })
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  containmentAction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rootCause?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  correctiveAction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  preventiveAction?: string | null;

  @IsOptional()
  @IsIn(DISPOSITION_TYPES)
  disposition?: DispositionType | null;
}

export class RecheckQualityIssueDto {
  @IsBoolean()
  pass!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class VoidQualityIssueDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class QualityIssueListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(ISSUE_STATUSES)
  status?: QualityIssueStatus;

  @IsOptional()
  @IsIn(ISSUE_SEVERITIES)
  severity?: IssueSeverity;

  @IsOptional()
  @IsIn(ISSUE_SOURCES)
  source?: IssueSource;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  onlyMine?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}
