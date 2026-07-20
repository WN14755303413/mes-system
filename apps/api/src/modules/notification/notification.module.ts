import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './services/notification.service';

/**
 * M12 站内通知。设为全局（同 IntegrationModule 先例）：通知是横切能力，
 * 反馈中心是第一个挂点，二期可在派工/质量分派等处直接注入 NotificationService
 * 补上站内触达，与钉钉挂点并行。
 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
