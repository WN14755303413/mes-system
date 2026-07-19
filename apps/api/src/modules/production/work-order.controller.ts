import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CurrentUser as CurrentUserDto,
  PageResult,
  ProductionOverviewItem,
  WorkOrderDetail,
  WorkOrderRow,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  ChangeWorkOrderStatusDto,
  CreateWorkOrderDto,
  SaveAssemblyTaskDto,
  UpdateWorkOrderDto,
  WorkOrderListQueryDto,
} from './dto/production.dto';
import { WorkOrderService } from './services/work-order.service';

@Controller('work-orders')
export class WorkOrderController {
  constructor(private readonly workOrders: WorkOrderService) {}

  @Get()
  @RequirePermission('plan:read')
  list(@Query() query: WorkOrderListQueryDto): Promise<PageResult<WorkOrderRow>> {
    return this.workOrders.list(query);
  }

  /** 生产计划页顶部的项目维度汇总。注意声明在 :id 之前。 */
  @Get('overview')
  @RequirePermission('plan:read')
  overview(): Promise<ProductionOverviewItem[]> {
    return this.workOrders.overview();
  }

  @Get(':id')
  @RequirePermission('plan:read')
  detail(@Param('id') id: string): Promise<WorkOrderDetail> {
    return this.workOrders.detail(id);
  }

  @Post()
  @RequirePermission('plan:write')
  @Audit('workorder.create', { targetType: 'workOrder', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.workOrders.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('plan:write')
  @Audit('workorder.update', { targetType: 'workOrder' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto): Promise<{ ok: true }> {
    await this.workOrders.update(id, dto);
    return { ok: true };
  }

  /** 状态流转：下达 / 暂停 / 恢复 / 完工确认 / 关闭 / 作废（通用状态机强校验）。 */
  @Post(':id/status')
  @RequirePermission('plan:write')
  @Audit('workorder.status', { targetType: 'workOrder' })
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeWorkOrderStatusDto,
  ): Promise<{ ok: true }> {
    await this.workOrders.changeStatus(id, dto);
    return { ok: true };
  }

  @Post(':id/tasks')
  @RequirePermission('plan:write')
  @Audit('worktask.create', { targetType: 'assemblyTask', targetIdFrom: 'result' })
  addTask(@Param('id') id: string, @Body() dto: SaveAssemblyTaskDto): Promise<{ id: string }> {
    return this.workOrders.addTask(id, dto);
  }
}
