import { Module } from '@nestjs/common';
import { InspectionController } from './inspection.controller';
import { IssueController } from './issue.controller';
import { InspectionService } from './services/inspection.service';
import { IssueService } from './services/issue.service';
import { QcPhotoService } from './services/qc-photo.service';

/**
 * M8 质量管理：检验单（五类检验 + 检验项明细）/ 质量问题单（8D 闭环 + 动作日志）。
 *
 * 检验不合格在 judge 事务内自动生成问题单（InspectionService → IssueService）。
 * PrismaService、CodeGeneratorService、StorageService 由全局模块提供。
 * QcPhotoService 导出给 M9 调试域复用（同一张通用附件表）。
 */
@Module({
  controllers: [InspectionController, IssueController],
  providers: [InspectionService, IssueService, QcPhotoService],
  exports: [QcPhotoService],
})
export class QualityModule {}
