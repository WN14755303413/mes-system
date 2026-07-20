import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackAttachmentService } from './services/feedback-attachment.service';
import { FeedbackService } from './services/feedback.service';

/**
 * M12 问题反馈中心。依赖的 NotificationModule / CodeModule / StorageModule
 * 均为全局模块，无需显式 import。
 */
@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackAttachmentService],
})
export class FeedbackModule {}
