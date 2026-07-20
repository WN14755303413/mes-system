import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { FeedbackActionType, FeedbackSeverity, FeedbackStatus, FeedbackType } from '@mes/shared';

const FEEDBACK_TYPES = Object.values(FeedbackType);
const FEEDBACK_SEVERITIES = Object.values(FeedbackSeverity);
const FEEDBACK_STATUSES = Object.values(FeedbackStatus);
/** CREATE 走建单、REPLY 走回复端点，transition 只收状态动作。 */
const TRANSITION_TYPES = Object.values(FeedbackActionType).filter(
  (t) => t !== FeedbackActionType.CREATE && t !== FeedbackActionType.REPLY,
);

export class CreateFeedbackDto {
  @IsString()
  @Length(1, 128, { message: '标题长度应为 1-128 位' })
  title!: string;

  @IsIn(FEEDBACK_TYPES)
  type!: FeedbackType;

  @IsIn(FEEDBACK_SEVERITIES)
  severity!: FeedbackSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  pagePath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  clientInfo?: string | null;
}

export class FeedbackListQueryDto {
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

  @IsOptional()
  @IsIn(FEEDBACK_STATUSES)
  status?: FeedbackStatus;

  @IsOptional()
  @IsIn(FEEDBACK_TYPES)
  type?: FeedbackType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsIn(['1'])
  mine?: '1';
}

export class FeedbackReplyDto {
  @IsString()
  @Length(1, 2000, { message: '回复内容长度应为 1-2000 位' })
  note!: string;
}

export class FeedbackTransitionDto {
  @IsIn(TRANSITION_TYPES)
  type!: Exclude<FeedbackActionType, 'CREATE' | 'REPLY'>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
