import { Global, Module } from '@nestjs/common';
import { StateMachineService } from './state-machine.service';

/**
 * 通用状态机基础设施。设为全局：项目、BOM、工单等对象的状态流转校验共用一份规则。
 */
@Global()
@Module({
  providers: [StateMachineService],
  exports: [StateMachineService],
})
export class StateModule {}
