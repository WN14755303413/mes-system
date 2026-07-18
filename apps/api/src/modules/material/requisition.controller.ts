import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { CurrentUser as CurrentUserDto, PageResult, RequisitionRow } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { CreateRequisitionDto, RequisitionListQueryDto } from './dto/material.dto';
import { RequisitionService } from './services/requisition.service';

@Controller('requisitions')
export class RequisitionController {
  constructor(private readonly requisitions: RequisitionService) {}

  @Get()
  @RequirePermission('material:read')
  list(@Query() query: RequisitionListQueryDto): Promise<PageResult<RequisitionRow>> {
    return this.requisitions.list(query);
  }

  @Post()
  @RequirePermission('requisition:write')
  @Audit('requisition.create', { targetType: 'requisition', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateRequisitionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.requisitions.create(dto, user.id);
  }

  /** 仓库确认；确认后计入齐套「已领料」（业务方案 §7.7）。 */
  @Post(':id/confirm')
  @RequirePermission('requisition:confirm')
  @Audit('requisition.confirm', { targetType: 'requisition' })
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<{ ok: true }> {
    await this.requisitions.confirm(id, user.id);
    return { ok: true };
  }

  @Post(':id/cancel')
  @RequirePermission('requisition:write')
  @Audit('requisition.cancel', { targetType: 'requisition' })
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<{ ok: true }> {
    await this.requisitions.cancel(id);
    return { ok: true };
  }
}
