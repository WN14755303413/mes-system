import { Module } from '@nestjs/common';
import { AssemblyTaskController } from './assembly-task.controller';
import { ExceptionController } from './exception.controller';
import { MyTaskController } from './my-task.controller';
import { WorkOrderController } from './work-order.controller';
import { ExceptionService } from './services/exception.service';
import { MyTaskService } from './services/my-task.service';
import { WorkOrderService } from './services/work-order.service';

/**
 * M7 生产计划与装配执行：装配工单（计划单元）/ 任务派工 / 现场报工 / 异常单。
 *
 * PrismaService、CodeGeneratorService、StateMachineService、StorageService
 * 均由全局模块提供。
 */
@Module({
  controllers: [
    WorkOrderController,
    AssemblyTaskController,
    MyTaskController,
    ExceptionController,
  ],
  providers: [WorkOrderService, MyTaskService, ExceptionService],
})
export class ProductionModule {}
