import { Controller, Get, Param } from '@nestjs/common';
import type { KittingOverviewItem, KittingResult } from '@mes/shared';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { KittingService } from './services/kitting.service';

/** 齐套看板（M6，业务方案 §8.3）。全部只读，实时计算。 */
@Controller('kitting')
export class KittingController {
  constructor(private readonly kitting: KittingService) {}

  /** 全项目齐套总览。 */
  @Get('overview')
  @RequirePermission('shortage:read')
  overview(): Promise<KittingOverviewItem[]> {
    return this.kitting.overview();
  }

  /** 项目齐套明细。 */
  @Get('projects/:projectId')
  @RequirePermission('shortage:read')
  forProject(@Param('projectId') projectId: string): Promise<KittingResult> {
    return this.kitting.forProject(projectId);
  }

  /** 缺料清单（仅缺料/在途行；前端据此导出 CSV，一期替代向 ERP 推送采购需求）。 */
  @Get('projects/:projectId/shortages')
  @RequirePermission('shortage:read')
  shortages(@Param('projectId') projectId: string): Promise<KittingResult> {
    return this.kitting.shortages(projectId);
  }
}
