import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  FeedbackDetail,
  FeedbackRow,
  FeedbackStats,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import {
  CreateFeedbackDto,
  FeedbackListQueryDto,
  FeedbackReplyDto,
  FeedbackTransitionDto,
} from './dto/feedback.dto';
import { FeedbackService } from './services/feedback.service';

/** multer 兜底上限；业务上限（15MB/白名单/数量）在 FeedbackAttachmentService 内校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 问题反馈（M12）。全部端点不挂 @RequirePermission——反馈面向所有登录用户，
 * 强制权限点会把「提意见」变成需要授权的事（同 M8 问题单先例）。
 * 真正的访问控制在 service 内：无 feedback:manage 者只见自己提交的
 * （404 不暴露存在性），状态动作按角色（manage / 提交人）在 service 校验。
 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(
    @Query() query: FeedbackListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<FeedbackRow>> {
    return this.feedback.list(query, user);
  }

  @Get('stats')
  stats(@CurrentUser() user: CurrentUserDto): Promise<FeedbackStats> {
    return this.feedback.stats(user);
  }

  /** 附件预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('attachments/:attachmentId')
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.feedback.downloadAttachment(
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
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<FeedbackDetail> {
    return this.feedback.detail(id, user);
  }

  @Post()
  @Audit('feedback.create', { targetType: 'feedback', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.feedback.create(dto, user);
  }

  /** 回复（提交人/处理人/manage，双向对话）。返回 actionId 供补传回复附件。 */
  @Post(':id/reply')
  @Audit('feedback.reply', { targetType: 'feedback' })
  @HttpCode(HttpStatus.OK)
  reply(
    @Param('id') id: string,
    @Body() dto: FeedbackReplyDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ actionId: string }> {
    return this.feedback.reply(id, dto, user);
  }

  /** 状态动作：接单/解决/驳回（manage）、重开（提交人）。 */
  @Post(':id/transition')
  @Audit('feedback.transition', { targetType: 'feedback' })
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id') id: string,
    @Body() dto: FeedbackTransitionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    return this.feedback.transition(id, dto, user);
  }

  /** 上传附件：不带 actionId 挂主单，带 actionId 挂回复。 */
  @Post(':id/attachments')
  @Audit('feedback.attachment.upload', { targetType: 'feedback' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadAttachment(
    @Param('id') id: string,
    @Query('actionId') actionId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.feedback.uploadAttachment(id, actionId || undefined, file, user);
  }
}
