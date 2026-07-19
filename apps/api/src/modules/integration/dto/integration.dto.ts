import { IsBoolean, IsOptional } from 'class-validator';
import type { TriggerSyncRequest } from '@mes/shared';

export class TriggerSyncDto implements TriggerSyncRequest {
  /** 演示补偿闭环：本次调用失败进异常池，重试即成功 */
  @IsOptional()
  @IsBoolean()
  simulateFail?: boolean;
}
