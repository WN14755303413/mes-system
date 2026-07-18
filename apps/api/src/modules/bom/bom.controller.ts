import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { BomDetail, BomVersionItem, CurrentUser as CurrentUserDto } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  BatchBomItemsDto,
  BomListQueryDto,
  ChangeBomStatusDto,
  CreateBomDto,
  SaveBomItemDto,
  UpdateBomDto,
} from './dto/bom.dto';
import { BomService } from './services/bom.service';

@Controller('boms')
export class BomController {
  constructor(private readonly boms: BomService) {}

  // ============ 版本 ============

  /** 版本列表。现场（无 bom:write）只返回已发布/已冻结版本——过滤在 service 内强制。 */
  @Get()
  @RequirePermission('bom:read')
  list(
    @Query() query: BomListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<BomVersionItem[]> {
    return this.boms.list(query.projectId, user);
  }

  @Get(':id')
  @RequirePermission('bom:read')
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<BomDetail> {
    return this.boms.detail(id, user);
  }

  /** 新建版本；带 sourceBomId 即发起变更（ECO）。 */
  @Post()
  @RequirePermission('bom:write')
  @Audit('bom.create', { targetType: 'bom', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateBomDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; version: string }> {
    return this.boms.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('bom:write')
  @Audit('bom.update', { targetType: 'bom' })
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateBomDto): Promise<{ ok: true }> {
    await this.boms.update(id, dto);
    return { ok: true };
  }

  /** 状态流转（发布/冻结/变更/作废）。发布与冻结是控制点，单独用 bom:release 控权。 */
  @Patch(':id/status')
  @RequirePermission('bom:release')
  @Audit('bom.change-status', { targetType: 'bom' })
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeBomStatusDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.boms.changeStatus(id, dto.status, user.id);
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('bom:write')
  @Audit('bom.delete', { targetType: 'bom' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.boms.remove(id);
    return { ok: true };
  }

  // ============ 明细 ============

  @Post(':id/items')
  @RequirePermission('bom:write')
  @Audit('bom.item.create', { targetType: 'bom_item', targetIdFrom: 'result' })
  addItem(@Param('id') bomId: string, @Body() dto: SaveBomItemDto): Promise<{ id: string }> {
    return this.boms.addItem(bomId, dto);
  }

  /** 批量追加（Excel 粘贴导入）。 */
  @Post(':id/items/batch')
  @RequirePermission('bom:write')
  @Audit('bom.item.batch-create', { targetType: 'bom' })
  batchAddItems(
    @Param('id') bomId: string,
    @Body() dto: BatchBomItemsDto,
  ): Promise<{ count: number }> {
    return this.boms.batchAddItems(bomId, dto);
  }

  @Put(':id/items/:itemId')
  @RequirePermission('bom:write')
  @Audit('bom.item.update', { targetType: 'bom_item', targetIdFrom: 'param:itemId' })
  @HttpCode(HttpStatus.OK)
  async updateItem(
    @Param('id') bomId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SaveBomItemDto,
  ): Promise<{ ok: true }> {
    await this.boms.updateItem(bomId, itemId, dto);
    return { ok: true };
  }

  @Delete(':id/items/:itemId')
  @RequirePermission('bom:write')
  @Audit('bom.item.delete', { targetType: 'bom_item', targetIdFrom: 'param:itemId' })
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @Param('id') bomId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ ok: true }> {
    await this.boms.removeItem(bomId, itemId);
    return { ok: true };
  }
}
