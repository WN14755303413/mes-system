import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './services/project.service';
import { ProjectSubService } from './services/project-sub.service';
import { ProjectTaskService } from './services/project-task.service';

/**
 * M4 项目管理：台账 / 里程碑 / WBS 任务 / 风险 / 问题 / 成员。
 *
 * PrismaService、CodeGeneratorService、StateMachineService 均由全局模块提供，
 * 无需在此 import。
 */
@Module({
  controllers: [ProjectController],
  providers: [ProjectService, ProjectTaskService, ProjectSubService],
})
export class ProjectModule {}
