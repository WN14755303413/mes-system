import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  ArrivalRow,
  CurrentUser as CurrentUserDto,
  ImportResult,
  PageResult,
  PoItemRow,
  StockRow,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  ArrivalListQueryDto,
  ImportArrivalsDto,
  ImportPoDto,
  ImportStocksDto,
  PoItemListQueryDto,
  StockListQueryDto,
  UpdatePoItemDto,
} from './dto/material.dto';
import { SupplyService } from './services/supply.service';

/**
 * 供应数据（M6）：采购订单镜像 / 到货记录 / 库存快照。
 * 一期数据经导入进入，导入即一次集成动作，service 内写接口日志。
 */
@Controller('supply')
export class SupplyController {
  constructor(private readonly supply: SupplyService) {}

  // ============ 采购订单 ============

  @Get('po-items')
  @RequirePermission('material:read')
  listPoItems(@Query() query: PoItemListQueryDto): Promise<PageResult<PoItemRow>> {
    return this.supply.listPoItems(query);
  }

  @Post('po/import')
  @RequirePermission('supply:write')
  @Audit('supply.po.import', { targetType: 'purchase_order' })
  importPo(@Body() dto: ImportPoDto, @CurrentUser() user: CurrentUserDto): Promise<ImportResult> {
    return this.supply.importPo(dto, user.id);
  }

  /** 采购员仅可维护交期与风险备注（业务方案 §7.6）。 */
  @Patch('po-items/:id')
  @RequirePermission('supply:write')
  @Audit('supply.po-item.update', { targetType: 'purchase_order_item' })
  @HttpCode(HttpStatus.OK)
  async updatePoItem(@Param('id') id: string, @Body() dto: UpdatePoItemDto): Promise<{ ok: true }> {
    await this.supply.updatePoItem(id, dto);
    return { ok: true };
  }

  // ============ 到货记录 ============

  @Get('arrivals')
  @RequirePermission('material:read')
  listArrivals(@Query() query: ArrivalListQueryDto): Promise<PageResult<ArrivalRow>> {
    return this.supply.listArrivals(query);
  }

  @Post('arrivals/import')
  @RequirePermission('supply:write')
  @Audit('supply.arrival.import', { targetType: 'arrival' })
  importArrivals(
    @Body() dto: ImportArrivalsDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<ImportResult> {
    return this.supply.importArrivals(dto, user.id);
  }

  // ============ 库存快照 ============

  @Get('stocks')
  @RequirePermission('material:read')
  listStocks(@Query() query: StockListQueryDto): Promise<PageResult<StockRow>> {
    return this.supply.listStocks(query);
  }

  /** 快照整体覆盖导入（库存账务主权在 ERP）。 */
  @Post('stocks/import')
  @RequirePermission('supply:write')
  @Audit('supply.stock.import', { targetType: 'stock' })
  importStocks(
    @Body() dto: ImportStocksDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<ImportResult> {
    return this.supply.importStocks(dto, user.id);
  }
}
