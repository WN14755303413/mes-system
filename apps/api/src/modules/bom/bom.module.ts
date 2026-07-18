import { Module } from '@nestjs/common';
import { BomController } from './bom.controller';
import { DrawingController } from './drawing.controller';
import { BomService } from './services/bom.service';
import { DrawingService } from './services/drawing.service';

/**
 * M5 BOM 与图纸：版本状态机 / ECO 轻量版本链 / 图纸上传下载。
 *
 * PrismaService、StateMachineService、StorageService 均由全局模块提供，
 * 无需在此 import。
 */
@Module({
  controllers: [BomController, DrawingController],
  providers: [BomService, DrawingService],
})
export class BomModule {}
