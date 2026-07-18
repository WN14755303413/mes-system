import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import type { ImportResult, MaterialItem, PageResult } from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { ImportMaterialsDto, MaterialListQueryDto, SaveMaterialDto } from './dto/material.dto';
import { MaterialService } from './services/material.service';

@Controller('materials')
export class MaterialController {
  constructor(private readonly materials: MaterialService) {}

  @Get()
  @RequirePermission('material:read')
  list(@Query() query: MaterialListQueryDto): Promise<PageResult<MaterialItem>> {
    return this.materials.list(query);
  }

  @Post()
  @RequirePermission('material:write')
  @Audit('material.create', { targetType: 'material', targetIdFrom: 'result' })
  create(@Body() dto: SaveMaterialDto): Promise<{ id: string }> {
    return this.materials.create(dto);
  }

  @Patch(':id')
  @RequirePermission('material:write')
  @Audit('material.update', { targetType: 'material' })
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: SaveMaterialDto): Promise<{ ok: true }> {
    await this.materials.update(id, dto);
    return { ok: true };
  }

  /** 批量导入（Excel 粘贴），按物料编码 upsert。 */
  @Post('import')
  @RequirePermission('material:write')
  @Audit('material.import', { targetType: 'material' })
  import(@Body() dto: ImportMaterialsDto): Promise<ImportResult> {
    return this.materials.import(dto);
  }
}
