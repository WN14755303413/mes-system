import { Injectable, Logger } from '@nestjs/common';
import type { NotifyTarget } from '../adapters/adapter.types';
import { IntegrationService } from './integration.service';

export type { NotifyTarget } from '../adapters/adapter.types';

/**
 * 业务侧通知门面（业务方案 §5.2「MES 将任务、超期、缺料、质量问题推送到钉钉」）。
 *
 * fire-and-forget：不 await、不抛错。通知失败只进异常池等待重试/补偿，
 * 绝不让派工、异常上报这类主流程因为钉钉不可用而失败。
 */
@Injectable()
export class IntegrationNotifyService {
  private readonly logger = new Logger('IntegrationNotify');

  constructor(private readonly integration: IntegrationService) {}

  /** 发送钉钉工作通知。接收人的名字由挂点解析好传入，payload 自包含才可独立重放。 */
  sendWorkMessage(users: NotifyTarget[], title: string, content: string, link?: string): void {
    if (!users.length) return;
    // execute 内部已把执行失败落进异常池；这里兜的是日志写库本身失败的极端情况
    void this.integration
      .execute(
        'dingtalk.sendWorkMessage',
        { users, title, content, ...(link ? { link } : {}) },
        'SYSTEM',
      )
      .catch((err: unknown) => {
        this.logger.error(
          `通知落日志失败（不影响业务）：${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
