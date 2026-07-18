import { Module } from '@nestjs/common';
import { KittingController } from './kitting.controller';
import { MaterialController } from './material.controller';
import { RequisitionController } from './requisition.controller';
import { SupplyController } from './supply.controller';
import { KittingService } from './services/kitting.service';
import { MaterialService } from './services/material.service';
import { RequisitionService } from './services/requisition.service';
import { SupplyService } from './services/supply.service';

/**
 * M6 物料与齐套：物料主数据 / 供应数据（采购、到货、库存）/ 领料 / 齐套计算。
 *
 * PrismaService、CodeGeneratorService 由全局模块提供。
 */
@Module({
  controllers: [MaterialController, SupplyController, RequisitionController, KittingController],
  providers: [MaterialService, SupplyService, RequisitionService, KittingService],
})
export class MaterialModule {}
