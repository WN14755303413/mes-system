import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { PageResult, TaskWithContextRow } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { AssignTaskDto, DispatchTaskQueryDto, SaveAssemblyTaskDto } from './dto/production.dto';
import { WorkOrderService } from './services/work-order.service';

/** 装配任务的计划员/派工员视角。装配工自己的任务走 /my-tasks。 */
@Controller('assembly-tasks')
export class AssemblyTaskController {
  constructor(private readonly workOrders: WorkOrderService) {}

  /** 派工任务池：跨工单的任务列表，未派工优先处理。 */
  @Get()
  @RequirePermission('task:dispatch')
  list(@Query() query: DispatchTaskQueryDto): Promise<PageResult<TaskWithContextRow>> {
    return this.workOrders.dispatchList(query);
  }

  @Patch(':id')
  @RequirePermission('plan:write')
  @Audit('worktask.update', { targetType: 'assemblyTask' })
  async update(@Param('id') id: string, @Body() dto: SaveAssemblyTaskDto): Promise<{ ok: true }> {
    await this.workOrders.updateTask(id, dto);
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('plan:write')
  @Audit('worktask.delete', { targetType: 'assemblyTask' })
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.workOrders.deleteTask(id);
    return { ok: true };
  }

  /** 派工/改派（§8.5）。装配工由此在「我的任务」里看到该任务。 */
  @Post(':id/assign')
  @RequirePermission('task:dispatch')
  @Audit('worktask.assign', { targetType: 'assemblyTask' })
  @HttpCode(HttpStatus.OK)
  async assign(@Param('id') id: string, @Body() dto: AssignTaskDto): Promise<{ ok: true }> {
    await this.workOrders.assign(id, dto);
    return { ok: true };
  }
}
