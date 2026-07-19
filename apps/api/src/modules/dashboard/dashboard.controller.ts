import { Controller, Get, Param } from '@nestjs/common';
import type { CompanyDashboard, ProjectDashboard, WorkbenchSummary } from '@mes/shared';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { DashboardService } from './dashboard.service';

/**
 * 数据看板（M10，业务方案 §8.12）。三个端点各一次响应返回整板数据。
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * 工作台指标。刻意不挂看板权限点——工作台是所有登录用户的首页（M2），
   * 返回的只有汇总计数与项目进度概览，不含可下钻明细。
   */
  @Get('workbench')
  workbench(): Promise<WorkbenchSummary> {
    return this.dashboard.workbench();
  }

  @Get('company')
  @RequirePermission('dashboard:company')
  company(): Promise<CompanyDashboard> {
    return this.dashboard.company();
  }

  @Get('projects/:id')
  @RequirePermission('dashboard:project')
  project(@Param('id') id: string): Promise<ProjectDashboard> {
    return this.dashboard.project(id);
  }
}
