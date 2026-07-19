import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type {
  CurrentUser as CurrentUserDto,
  MyTaskDetail,
  PageResult,
  TaskWithContextRow,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { CreateWorkReportDto, MyTaskQueryDto } from './dto/production.dto';
import { MyTaskService } from './services/my-task.service';

/**
 * 装配工的「我的任务」与报工（M7 验收标准：装配工只看到自己的任务）。
 * 行级过滤（assigneeId = 当前用户）在 service 内强制，接口不接受任何人员参数。
 */
@Controller('my-tasks')
export class MyTaskController {
  constructor(private readonly myTasks: MyTaskService) {}

  @Get()
  @RequirePermission('task:report')
  list(
    @Query() query: MyTaskQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<TaskWithContextRow>> {
    return this.myTasks.list(user.id, query);
  }

  @Get(':id')
  @RequirePermission('task:report')
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<MyTaskDetail> {
    return this.myTasks.detail(id, user.id);
  }

  /** 报工：开工/报进度/暂停/恢复/完工/返工。任务状态只能由此驱动。 */
  @Post(':id/reports')
  @RequirePermission('task:report')
  @Audit('workreport.create', { targetType: 'assemblyTask' })
  @HttpCode(HttpStatus.OK)
  report(
    @Param('id') id: string,
    @Body() dto: CreateWorkReportDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    return this.myTasks.report(id, user.id, dto);
  }
}
