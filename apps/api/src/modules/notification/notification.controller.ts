import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { CurrentUser as CurrentUserDto, NotificationItem, PageResult, UnreadCountResult } from '@mes/shared';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { NotificationService } from './services/notification.service';

class NotificationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsIn(['1'])
  unread?: '1';
}

class MarkReadDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * 站内通知（M12）。不挂权限点——登录即可用，service 内一律 userId 收窄，
 * 只能读写自己的通知。unread-count 是顶栏铃铛 30s 轮询的高频接口，不加 @Audit。
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @Query() query: NotificationListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<NotificationItem>> {
    return this.notifications.listMine(user, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: CurrentUserDto): Promise<UnreadCountResult> {
    return { count: await this.notifications.unreadCount(user) };
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Body() dto: MarkReadDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.notifications.markRead(user, dto.ids);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: CurrentUserDto): Promise<{ ok: true }> {
    await this.notifications.markAllRead(user);
    return { ok: true };
  }
}
