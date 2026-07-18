import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BomStatus, DrawingStatus } from '@mes/shared';

const BOM_STATUSES = Object.values(BomStatus);
const DRAWING_STATUSES = Object.values(DrawingStatus);

// ---- BOM 版本 ----

export class BomListQueryDto {
  @IsString()
  projectId!: string;
}

export class CreateBomDto {
  @IsString()
  projectId!: string;

  /** 缺省由后端建议：初始 V1.0；从 sourceBomId 派生时次版本 +1。 */
  @IsOptional()
  @Matches(/^V\d+\.\d+$/, { message: '版本号格式应为 V主版本.次版本，如 V1.0' })
  version?: string;

  /** 带此字段即「发起变更」（ECO）：复制旧版明细，旧版置为变更中。 */
  @IsOptional()
  @IsString()
  sourceBomId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

export class UpdateBomDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string | null;
}

export class ChangeBomStatusDto {
  @IsIn(BOM_STATUSES, { message: '非法的目标状态' })
  status!: BomStatus;
}

// ---- BOM 明细 ----

export class SaveBomItemDto {
  @IsString()
  @Length(1, 64, { message: '物料编码长度应为 1-64 位' })
  materialCode!: string;

  @IsString()
  @Length(1, 128, { message: '物料名称长度应为 1-128 位' })
  materialName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  spec?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  /** 最多 3 位小数，与 DB Decimal(12,3) 对齐。 */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: '数量最多 3 位小数' })
  @Min(0.001)
  @Max(999_999_999)
  quantity!: number;

  @IsOptional()
  @IsBoolean()
  isStandard?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string | null;

  @IsOptional()
  @IsString()
  drawingId?: string | null;
}

/** 批量追加（Excel 粘贴导入）。一次最多 500 行，防止误粘整表把请求撑爆。 */
export class BatchBomItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveBomItemDto)
  items!: SaveBomItemDto[];
}

// ---- 图纸 ----

export class DrawingListQueryDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsIn(DRAWING_STATUSES)
  status?: DrawingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}

/** 上传图纸的 multipart 文本字段。文件本体由 FileInterceptor 单独接收。 */
export class UploadDrawingDto {
  @IsString()
  projectId!: string;

  @IsString()
  @Length(1, 64, { message: '图号长度应为 1-64 位' })
  code!: string;

  @IsString()
  @Length(1, 128, { message: '图纸名称长度应为 1-128 位' })
  name!: string;

  @IsString()
  @Length(1, 32, { message: '版本号长度应为 1-32 位' })
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
