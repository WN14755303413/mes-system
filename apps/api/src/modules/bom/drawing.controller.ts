import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type {
  CurrentUser as CurrentUserDto,
  DrawingItem,
  UploadDrawingResponse,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { DrawingListQueryDto, UploadDrawingDto } from './dto/bom.dto';
import { DrawingService } from './services/drawing.service';

/**
 * multer 层的兜底大小上限。业务上限由 MAX_UPLOAD_MB 在 service 里校验
 * （装饰器求值早于 ConfigModule 读 .env，这里只能取一个宽松的静态值）。
 */
const HARD_UPLOAD_CAP = 200 * 1024 * 1024;

@Controller('drawings')
export class DrawingController {
  constructor(private readonly drawings: DrawingService) {}

  /** 图纸列表。现场（无 drawing:write）只返回有效版本——过滤在 service 内强制。 */
  @Get()
  @RequirePermission('drawing:read')
  list(
    @Query() query: DrawingListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<DrawingItem[]> {
    return this.drawings.list(query, user);
  }

  /** 上传新图纸。同图号的其它有效版本自动作废。 */
  @Post()
  @RequirePermission('drawing:write')
  @Audit('drawing.upload', { targetType: 'drawing', targetIdFrom: 'result' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  upload(
    @Body() dto: UploadDrawingDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<UploadDrawingResponse> {
    return this.drawings.upload(dto, file, user.id);
  }

  @Patch(':id/void')
  @RequirePermission('drawing:write')
  @Audit('drawing.void', { targetType: 'drawing' })
  @HttpCode(HttpStatus.OK)
  async void(@Param('id') id: string): Promise<{ ok: true }> {
    await this.drawings.void(id);
    return { ok: true };
  }

  /**
   * 下载/预览。M5 验收标准：下载图纸必须产生审计记录——@Audit 在文件流
   * 建立成功或抛错时都会留痕（AuditInterceptor 的 tap 两个分支）。
   */
  @Get(':id/download')
  @RequirePermission('drawing:download')
  @Audit('drawing.download', { targetType: 'drawing' })
  async download(
    @Param('id') id: string,
    @Query('inline') inline: string | undefined,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.drawings.download(id, user);

    // filename* 按 RFC 5987 编码，中文文件名在各浏览器下都能正确落地
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(fileSize));
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(stream);
  }
}
