import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  AcceptanceDetail,
  AcceptanceReport,
  AcceptanceRow,
  CurrentUser as CurrentUserDto,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  AcceptanceListQueryDto,
  ConcludeAcceptanceDto,
  CreateAcceptanceDto,
  UpdateAcceptanceDto,
} from './dto/debug.dto';
import { AcceptanceService } from './services/acceptance.service';

/**
 * FAT/SAT 验收单（M9，§8.8 / §9.8 / §9.9）。
 *
 * 读挂 debug:read（调试与验收同域可见），写与结论挂 acceptance:write
 * （PM/质检主导验收，调试人员只读）。报告接口是打印视图的数据源，
 * 出结论前也可预览——报告实时聚合，不落表。
 */
@Controller('acceptances')
export class AcceptanceController {
  constructor(private readonly acceptances: AcceptanceService) {}

  @Get()
  @RequirePermission('debug:read')
  list(@Query() query: AcceptanceListQueryDto): Promise<PageResult<AcceptanceRow>> {
    return this.acceptances.list(query);
  }

  @Get(':id')
  @RequirePermission('debug:read')
  detail(@Param('id') id: string): Promise<AcceptanceDetail> {
    return this.acceptances.detail(id);
  }

  /** 验收报告聚合数据（打印视图数据源）。下载留审计——报告含项目全链路信息。 */
  @Get(':id/report')
  @RequirePermission('debug:read')
  @Audit('acceptance.report', { targetType: 'acceptance' })
  report(@Param('id') id: string): Promise<AcceptanceReport> {
    return this.acceptances.report(id);
  }

  @Post()
  @RequirePermission('acceptance:write')
  @Audit('acceptance.create', { targetType: 'acceptance', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateAcceptanceDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.acceptances.create(dto, user);
  }

  @Put(':id')
  @RequirePermission('acceptance:write')
  @Audit('acceptance.update', { targetType: 'acceptance' })
  async update(@Param('id') id: string, @Body() dto: UpdateAcceptanceDto): Promise<{ ok: true }> {
    await this.acceptances.update(id, dto);
    return { ok: true };
  }

  /** 出具结论（终态）。PASSED 有未关闭调试问题门禁，service 内校验。 */
  @Post(':id/conclude')
  @RequirePermission('acceptance:write')
  @Audit('acceptance.conclude', { targetType: 'acceptance' })
  @HttpCode(HttpStatus.OK)
  async conclude(
    @Param('id') id: string,
    @Body() dto: ConcludeAcceptanceDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.acceptances.conclude(id, dto, user);
    return { ok: true };
  }

  @Post(':id/void')
  @RequirePermission('acceptance:write')
  @Audit('acceptance.void', { targetType: 'acceptance' })
  @HttpCode(HttpStatus.OK)
  async void(@Param('id') id: string): Promise<{ ok: true }> {
    await this.acceptances.void(id);
    return { ok: true };
  }
}
