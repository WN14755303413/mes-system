import { Module } from '@nestjs/common';
import { MaterialModule } from '../material/material.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * M10 数据看板：公司级看板 / 项目看板 / 工作台指标。
 *
 * 只读跨域聚合模块——直接查各域表做计数分组，不 import 各域业务模块；
 * 唯一例外是齐套率：实时算法在 M6 KittingService（不落表），必须复用
 * 同一份口径，故 import MaterialModule（同 M9 复用 QcPhotoService 的先例）。
 * PrismaService 由全局模块提供。
 */
@Module({
  imports: [MaterialModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
