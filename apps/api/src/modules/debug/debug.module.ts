import { Module } from '@nestjs/common';
import { QualityModule } from '../quality/quality.module';
import { AcceptanceController } from './acceptance.controller';
import { DebugIssueController } from './debug-issue.controller';
import { DebugRecordController } from './debug-record.controller';
import { AcceptanceService } from './services/acceptance.service';
import { DebugIssueService } from './services/debug-issue.service';
import { DebugRecordService } from './services/debug-record.service';

/**
 * M9 调试与验收：调试记录（三类 + 参数明细）/ 调试问题（多轮整改复测闭环）/
 * FAT-SAT 验收单（检查项 + 结论门禁 + 报告聚合）。
 *
 * 照片存取复用 QualityModule 导出的 QcPhotoService（通用附件表 sys_attachment）。
 * PrismaService、CodeGeneratorService、StorageService 由全局模块提供。
 */
@Module({
  imports: [QualityModule],
  controllers: [DebugRecordController, DebugIssueController, AcceptanceController],
  providers: [DebugRecordService, DebugIssueService, AcceptanceService],
})
export class DebugModule {}
