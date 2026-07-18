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
  Put,
  Query,
} from '@nestjs/common';
import type {
  IssueItem,
  MilestoneItem,
  PageResult,
  ProjectDetail,
  ProjectListItem,
  ProjectMemberItem,
  RiskItem,
  TaskItem,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import {
  ChangeProjectStatusDto,
  ProjectListQueryDto,
  SaveIssueDto,
  SaveMemberDto,
  SaveMilestoneDto,
  SaveProjectDto,
  SaveRiskDto,
  SaveTaskDto,
} from './dto/project.dto';
import { ProjectService } from './services/project.service';
import { ProjectSubService } from './services/project-sub.service';
import { ProjectTaskService } from './services/project-task.service';

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly tasks: ProjectTaskService,
    private readonly sub: ProjectSubService,
  ) {}

  // ============ 项目台账 ============

  @Get()
  @RequirePermission('project:read')
  list(@Query() query: ProjectListQueryDto): Promise<PageResult<ProjectListItem>> {
    return this.projects.list(query);
  }

  /** 轻量用户选项（选项目经理/负责人用）。注意声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('options/users')
  @RequirePermission('project:read')
  userOptions(): Promise<{ id: string; displayName: string }[]> {
    return this.projects.userOptions();
  }

  @Get(':id')
  @RequirePermission('project:read')
  detail(@Param('id') id: string): Promise<ProjectDetail> {
    return this.projects.detail(id);
  }

  @Post()
  @RequirePermission('project:create')
  @Audit('project.create', { targetType: 'project', targetIdFrom: 'result' })
  create(@Body() dto: SaveProjectDto): Promise<{ id: string; code: string }> {
    return this.projects.create(dto);
  }

  @Put(':id')
  @RequirePermission('project:update')
  @Audit('project.update', { targetType: 'project' })
  update(@Param('id') id: string, @Body() dto: SaveProjectDto): Promise<ProjectDetail> {
    return this.projects.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('project:update')
  @Audit('project.change-status', { targetType: 'project' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeProjectStatusDto,
  ): Promise<ProjectDetail> {
    return this.projects.changeStatus(id, dto.status);
  }

  @Delete(':id')
  @RequirePermission('project:delete')
  @Audit('project.delete', { targetType: 'project' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.projects.remove(id);
    return { ok: true };
  }

  // ============ WBS 任务 ============

  @Get(':id/tasks')
  @RequirePermission('project:read')
  listTasks(@Param('id') projectId: string): Promise<TaskItem[]> {
    return this.tasks.list(projectId);
  }

  @Post(':id/tasks')
  @RequirePermission('project:task:write')
  @Audit('project.task.create', { targetType: 'project_task', targetIdFrom: 'result' })
  createTask(@Param('id') projectId: string, @Body() dto: SaveTaskDto): Promise<{ id: string }> {
    return this.tasks.create(projectId, dto);
  }

  @Put(':id/tasks/:taskId')
  @RequirePermission('project:task:write')
  @Audit('project.task.update', { targetType: 'project_task', targetIdFrom: 'param:taskId' })
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: SaveTaskDto,
  ): Promise<{ ok: true }> {
    await this.tasks.update(projectId, taskId, dto);
    return { ok: true };
  }

  @Delete(':id/tasks/:taskId')
  @RequirePermission('project:task:write')
  @Audit('project.task.delete', { targetType: 'project_task', targetIdFrom: 'param:taskId' })
  @HttpCode(HttpStatus.OK)
  async removeTask(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<{ ok: true }> {
    await this.tasks.remove(projectId, taskId);
    return { ok: true };
  }

  // ============ 里程碑 ============

  @Get(':id/milestones')
  @RequirePermission('project:read')
  listMilestones(@Param('id') projectId: string): Promise<MilestoneItem[]> {
    return this.sub.listMilestones(projectId);
  }

  @Post(':id/milestones')
  @RequirePermission('project:update')
  @Audit('project.milestone.create', { targetType: 'project_milestone', targetIdFrom: 'result' })
  createMilestone(
    @Param('id') projectId: string,
    @Body() dto: SaveMilestoneDto,
  ): Promise<{ id: string }> {
    return this.sub.createMilestone(projectId, dto);
  }

  @Put(':id/milestones/:mid')
  @RequirePermission('project:update')
  @Audit('project.milestone.update', { targetType: 'project_milestone', targetIdFrom: 'param:mid' })
  @HttpCode(HttpStatus.OK)
  async updateMilestone(
    @Param('id') projectId: string,
    @Param('mid') mid: string,
    @Body() dto: SaveMilestoneDto,
  ): Promise<{ ok: true }> {
    await this.sub.updateMilestone(projectId, mid, dto);
    return { ok: true };
  }

  @Delete(':id/milestones/:mid')
  @RequirePermission('project:update')
  @Audit('project.milestone.delete', { targetType: 'project_milestone', targetIdFrom: 'param:mid' })
  @HttpCode(HttpStatus.OK)
  async removeMilestone(
    @Param('id') projectId: string,
    @Param('mid') mid: string,
  ): Promise<{ ok: true }> {
    await this.sub.removeMilestone(projectId, mid);
    return { ok: true };
  }

  // ============ 风险 ============

  @Get(':id/risks')
  @RequirePermission('project:read')
  listRisks(@Param('id') projectId: string): Promise<RiskItem[]> {
    return this.sub.listRisks(projectId);
  }

  @Post(':id/risks')
  @RequirePermission('project:risk:write')
  @Audit('project.risk.create', { targetType: 'project_risk', targetIdFrom: 'result' })
  createRisk(@Param('id') projectId: string, @Body() dto: SaveRiskDto): Promise<{ id: string }> {
    return this.sub.createRisk(projectId, dto);
  }

  @Put(':id/risks/:rid')
  @RequirePermission('project:risk:write')
  @Audit('project.risk.update', { targetType: 'project_risk', targetIdFrom: 'param:rid' })
  @HttpCode(HttpStatus.OK)
  async updateRisk(
    @Param('id') projectId: string,
    @Param('rid') rid: string,
    @Body() dto: SaveRiskDto,
  ): Promise<{ ok: true }> {
    await this.sub.updateRisk(projectId, rid, dto);
    return { ok: true };
  }

  @Delete(':id/risks/:rid')
  @RequirePermission('project:risk:write')
  @Audit('project.risk.delete', { targetType: 'project_risk', targetIdFrom: 'param:rid' })
  @HttpCode(HttpStatus.OK)
  async removeRisk(
    @Param('id') projectId: string,
    @Param('rid') rid: string,
  ): Promise<{ ok: true }> {
    await this.sub.removeRisk(projectId, rid);
    return { ok: true };
  }

  // ============ 问题 ============

  @Get(':id/issues')
  @RequirePermission('project:read')
  listIssues(@Param('id') projectId: string): Promise<IssueItem[]> {
    return this.sub.listIssues(projectId);
  }

  @Post(':id/issues')
  @RequirePermission('project:risk:write')
  @Audit('project.issue.create', { targetType: 'project_issue', targetIdFrom: 'result' })
  createIssue(@Param('id') projectId: string, @Body() dto: SaveIssueDto): Promise<{ id: string }> {
    return this.sub.createIssue(projectId, dto);
  }

  @Put(':id/issues/:iid')
  @RequirePermission('project:risk:write')
  @Audit('project.issue.update', { targetType: 'project_issue', targetIdFrom: 'param:iid' })
  @HttpCode(HttpStatus.OK)
  async updateIssue(
    @Param('id') projectId: string,
    @Param('iid') iid: string,
    @Body() dto: SaveIssueDto,
  ): Promise<{ ok: true }> {
    await this.sub.updateIssue(projectId, iid, dto);
    return { ok: true };
  }

  @Delete(':id/issues/:iid')
  @RequirePermission('project:risk:write')
  @Audit('project.issue.delete', { targetType: 'project_issue', targetIdFrom: 'param:iid' })
  @HttpCode(HttpStatus.OK)
  async removeIssue(
    @Param('id') projectId: string,
    @Param('iid') iid: string,
  ): Promise<{ ok: true }> {
    await this.sub.removeIssue(projectId, iid);
    return { ok: true };
  }

  // ============ 成员 ============

  @Get(':id/members')
  @RequirePermission('project:read')
  listMembers(@Param('id') projectId: string): Promise<ProjectMemberItem[]> {
    return this.sub.listMembers(projectId);
  }

  @Post(':id/members')
  @RequirePermission('project:update')
  @Audit('project.member.add', { targetType: 'project_member' })
  @HttpCode(HttpStatus.OK)
  async addMember(
    @Param('id') projectId: string,
    @Body() dto: SaveMemberDto,
  ): Promise<{ ok: true }> {
    await this.sub.addMember(projectId, dto);
    return { ok: true };
  }

  @Delete(':id/members/:userId')
  @RequirePermission('project:update')
  @Audit('project.member.remove', { targetType: 'project_member', targetIdFrom: 'param:userId' })
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
  ): Promise<{ ok: true }> {
    await this.sub.removeMember(projectId, userId);
    return { ok: true };
  }
}
