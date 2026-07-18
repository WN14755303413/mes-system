import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { ArrivalType, RequisitionStatus, RequisitionType } from '@mes/shared';

const ARRIVAL_TYPES = Object.values(ArrivalType);
const REQUISITION_TYPES = Object.values(RequisitionType);
const REQUISITION_STATUSES = Object.values(RequisitionStatus);

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

// ---- 物料主数据 ----

export class MaterialListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isLongLead?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  enabled?: boolean;
}

export class SaveMaterialDto {
  @IsString()
  @Length(1, 64, { message: '物料编码长度应为 1-64 位' })
  code!: string;

  @IsString()
  @Length(1, 128, { message: '物料名称长度应为 1-128 位' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  spec?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  isStandard?: boolean;

  @IsOptional()
  @IsBoolean()
  isLongLead?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  leadTimeDays?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string | null;
}

/** 一次最多 1000 行，防止误粘整表把请求撑爆。 */
export class ImportMaterialsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SaveMaterialDto)
  items!: SaveMaterialDto[];
}

// ---- 采购订单 ----

export class PoItemListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inTransitOnly?: boolean;
}

export class ImportPoRowDto {
  @IsString()
  @Length(1, 64)
  orderNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  supplierName?: string;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsString()
  @Length(1, 64)
  materialCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  materialName?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999_999_999)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999_999_999)
  arrivedQuantity?: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;
}

export class ImportPoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportPoRowDto)
  items!: ImportPoRowDto[];
}

export class UpdatePoItemDto {
  @IsOptional()
  @IsDateString()
  expectedDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  riskNote?: string | null;
}

// ---- 到货记录 ----

export class ArrivalListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string;

  @IsOptional()
  @IsIn(ARRIVAL_TYPES)
  type?: ArrivalType;
}

export class ImportArrivalRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderNo?: string;

  @IsString()
  @Length(1, 64)
  materialCode!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999_999_999)
  quantity!: number;

  @IsOptional()
  @IsIn(ARRIVAL_TYPES)
  type?: ArrivalType;

  @IsDateString()
  arrivedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class ImportArrivalsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportArrivalRowDto)
  items!: ImportArrivalRowDto[];
}

// ---- 库存快照 ----

export class StockListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

export class ImportStockRowDto {
  @IsString()
  @Length(1, 64)
  materialCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999_999_999)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999_999_999)
  availableQuantity?: number;
}

export class ImportStocksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportStockRowDto)
  items!: ImportStockRowDto[];
}

// ---- 领料/退料 ----

export class RequisitionListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(REQUISITION_STATUSES)
  status?: RequisitionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  materialCode?: string;
}

export class CreateRequisitionDto {
  @IsString()
  projectId!: string;

  @IsString()
  @Length(1, 64)
  materialCode!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999_999_999)
  quantity!: number;

  @IsOptional()
  @IsIn(REQUISITION_TYPES)
  type?: RequisitionType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string | null;
}
