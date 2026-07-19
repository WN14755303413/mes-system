import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { IntegrationRunResult, IntegrationStatusResponse } from '@mes/shared';
import type { CurrentUser as CurrentUserDto } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { TriggerSyncDto } from './dto/integration.dto';
import { IntegrationService } from './services/integration.service';

/**
 * M11 系统集成：适配器状态 / 手动同步 / 异常池重试与人工补偿。
 * 异常池列表复用 M3 的 GET /system/integration-logs（needsAttention 过滤）。
 */
@Controller('integration')
export class IntegrationController {
  constructor(private readonly integration: IntegrationService) {}

  @Get('status')
  @RequirePermission('sys:integration:read')
  status(): Promise<IntegrationStatusResponse> {
    return this.integration.status();
  }

  /** 手动触发一次同步（仅 trigger=manual 的动作）。失败不报 HTTP 错——结果落异常池。 */
  @Post('sync/:action')
  @RequirePermission('sys:integration:write')
  @Audit('integration.sync', { targetType: 'integration', targetIdFrom: 'param:action' })
  @HttpCode(HttpStatus.OK)
  sync(
    @Param('action') action: string,
    @Body() dto: TriggerSyncDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<IntegrationRunResult> {
    return this.integration.executeManual(
      action,
      dto.simulateFail ? { simulateFail: true } : null,
      user.id,
    );
  }

  @Post('logs/:id/retry')
  @RequirePermission('sys:integration:write')
  @Audit('integration.retry', { targetType: 'integrationLog' })
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string): Promise<IntegrationRunResult> {
    return this.integration.retry(id);
  }

  @Post('logs/:id/resolve')
  @RequirePermission('sys:integration:write')
  @Audit('integration.resolve', { targetType: 'integrationLog' })
  @HttpCode(HttpStatus.OK)
  async resolve(@Param('id') id: string): Promise<{ ok: true }> {
    await this.integration.resolve(id);
    return { ok: true };
  }
}
