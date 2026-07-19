import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AssemblyTaskStatus,
  CraftType,
  ExceptionStatus,
  RecordStatus,
  WorkReportType,
} from '@mes/shared';

const CRAFT_TYPES = Object.values(CraftType);
const RECORD_STATUSES = Object.values(RecordStatus);
const TASK_STATUSES = Object.values(AssemblyTaskStatus);
const REPORT_TYPES = Object.values(WorkReportType);
const EXCEPTION_STATUSES = Object.values(ExceptionStatus);

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
  @Max(200)
  pageSize?: number;
}

// ---- 装配工单 ----

export class WorkOrderListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(RECORD_STATUSES)
  status?: RecordStatus;

  @IsOptional()
  @IsIn(CRAFT_TYPES)
  craft?: CraftType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  delayedOnly?: boolean;
}

export class CreateWorkOrderDto {
  @IsString()
  projectId!: string;

  @IsString()
  @Length(1, 128, { message: '工单名称长度应为 1-128 位' })
  name!: string;

  @IsIn(CRAFT_TYPES)
  craft!: CraftType;

  @IsOptional()
  @IsDateString()
  planStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  planEndAt?: string | null;

  @IsOptional()
  @IsString()
  wbsTaskId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsIn(CRAFT_TYPES)
  craft?: CraftType;

  @IsOptional()
  @IsDateString()
  planStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  planEndAt?: string | null;

  @IsOptional()
  @IsString()
  wbsTaskId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

export class ChangeWorkOrderStatusDto {
  @IsIn(RECORD_STATUSES)
  status!: RecordStatus;
}

// ---- 装配任务 ----

export class SaveAssemblyTaskDto {
  @IsString()
  @Length(1, 128, { message: '任务名称长度应为 1-128 位' })
  name!: string;

  @IsOptional()
  @IsDateString()
  planStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  planEndAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(9999)
  standardHours?: number | null;

  @IsOptional()
  @IsString()
  drawingId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requirement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string | null;
}

/** 派工/改派。assigneeId 传 null = 取消派工（仅待开工任务）。 */
export class AssignTaskDto {
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class DispatchTaskQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workOrderId?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: AssemblyTaskStatus;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unassignedOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

// ---- 现场报工 ----

export class MyTaskQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: AssemblyTaskStatus;
}

export class CreateWorkReportDto {
  @IsIn(REPORT_TYPES)
  type!: WorkReportType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(999)
  hours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

// ---- 异常单 ----

export class ExceptionListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(EXCEPTION_STATUSES)
  status?: ExceptionStatus;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  onlyMine?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

export class CreateExceptionDto {
  @IsOptional()
  @IsString()
  projectId?: string;

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

  @IsString()
  @Length(1, 128, { message: '异常标题长度应为 1-128 位' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class AssignExceptionDto {
  @IsString()
  handlerId!: string;
}

export class ResolveExceptionDto {
  @IsString()
  @Length(1, 500, { message: '请填写处理说明' })
  handleNote!: string;
}

export class CloseExceptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
