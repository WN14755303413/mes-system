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
  AttachmentItem,
  CurrentUser as CurrentUserDto,
  PageResult,
  QualityIssueDetail,
  QualityIssueRow,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  AssignQualityIssueDto,
  CreateQualityIssueDto,
  QualityIssueListQueryDto,
  RecheckQualityIssueDto,
  SubmitQualityIssueDto,
  UpdateQualityIssueDto,
  VoidQualityIssueDto,
} from './dto/quality.dto';
import { IssueService } from './services/issue.service';

/** multer 兜底上限；业务上限在 QcPhotoService 内校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 质量问题单（M8，§9.7 检验到整改闭环）。
 *
 * 读接口与责任人动作不挂权限点——责任人可能是任何角色（装配工/设计/采购…），
 * 强制给权限点会污染角色体系。真正的访问控制在 service 内：
 * 无 quality:issue:read 者只见与自己相关的单（404 不暴露存在性），
 * submit 只允许责任人本人（或有 quality:issue:write 者代提）。
 */
@Controller('quality-issues')
export class IssueController {
  constructor(private readonly issues: IssueService) {}

  @Get()
  list(
    @Query() query: QualityIssueListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<QualityIssueRow>> {
    return this.issues.list(query, user);
  }

  /** 照片预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('photos/:attachmentId')
  async downloadPhoto(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.issues.downloadPhoto(
      attachmentId,
      user,
    );
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(fileSize));
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(stream);
  }

  @Get(':id')
  detail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<QualityIssueDetail> {
    return this.issues.detail(id, user);
  }

  @Post()
  @RequirePermission('quality:issue:write')
  @Audit('quality-issue.create', { targetType: 'quality-issue', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.issues.create(dto, user);
  }

  /** 编辑基础信息与 8D 字段（写权限或责任人本人，service 内校验）。 */
  @Patch(':id')
  @Audit('quality-issue.update', { targetType: 'quality-issue' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.update(id, dto, user);
    return { ok: true };
  }

  @Post(':id/assign')
  @RequirePermission('quality:issue:write')
  @Audit('quality-issue.assign', { targetType: 'quality-issue' })
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.assign(id, dto, user);
    return { ok: true };
  }

  /** 责任人提交整改（跨角色动作，身份在 service 校验）。 */
  @Post(':id/submit')
  @Audit('quality-issue.submit', { targetType: 'quality-issue' })
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @Body() dto: SubmitQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.submit(id, dto, user);
    return { ok: true };
  }

  /** 复检（§9.7 检验员复检）：通过即关闭，不通过退回整改。 */
  @Post(':id/recheck')
  @RequirePermission('quality:issue:close')
  @Audit('quality-issue.recheck', { targetType: 'quality-issue' })
  @HttpCode(HttpStatus.OK)
  async recheck(
    @Param('id') id: string,
    @Body() dto: RecheckQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.recheck(id, dto, user);
    return { ok: true };
  }

  @Post(':id/void')
  @RequirePermission('quality:issue:close')
  @Audit('quality-issue.void', { targetType: 'quality-issue' })
  @HttpCode(HttpStatus.OK)
  async void(
    @Param('id') id: string,
    @Body() dto: VoidQualityIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.void(id, dto, user);
    return { ok: true };
  }

  @Post(':id/photos')
  @Audit('quality-issue.photo.upload', { targetType: 'quality-issue' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.issues.uploadPhoto(id, file, user);
  }
}
