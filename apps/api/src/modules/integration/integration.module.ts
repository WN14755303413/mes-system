import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DingTalkAdapter, MockDingTalkAdapter } from './adapters/dingtalk.adapter';
import { ErpAdapter, MockErpAdapter } from './adapters/erp.adapter';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './services/integration.service';
import { IntegrationNotifyService } from './services/notify.service';

/**
 * M11 系统集成：ERP / 钉钉适配器、执行器（接口日志 + 异常池）、业务通知门面。
 *
 * 设为全局：与 CodeModule/StorageModule 同为横切能力——生产、质量等模块
 * 直接注入 IntegrationNotifyService 埋通知挂点，无需逐个 import。
 *
 * 适配器按 ERP_ADAPTER / DINGTALK_ADAPTER 环境变量选择实现。
 * 一期只有 mock；二期新增真实实现类后在此工厂扩展分支即可，其余代码不动。
 */
@Global()
@Module({
  controllers: [IntegrationController],
  providers: [
    {
      provide: ErpAdapter,
      useFactory: (config: ConfigService): ErpAdapter => new MockErpAdapter(config),
      inject: [ConfigService],
    },
    {
      provide: DingTalkAdapter,
      useFactory: (config: ConfigService): DingTalkAdapter => new MockDingTalkAdapter(config),
      inject: [ConfigService],
    },
    IntegrationService,
    IntegrationNotifyService,
  ],
  exports: [IntegrationService, IntegrationNotifyService],
})
export class IntegrationModule {}
