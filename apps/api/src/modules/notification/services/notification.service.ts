import { Injectable, Logger } from '@nestjs/common';
import type { CurrentUser, NotificationItem, PageResult } from '@mes/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IntegrationNotifyService } from '../../integration/services/notify.service';

interface PushOptions {
  /** 不通知这个人（通常是操作人自己——自己的动作不给自己发通知）。 */
  excludeUserId?: string;
  /** 同步发一份钉钉工作通知（mock 适配器，失败进异常池）。默认 true。 */
  dingtalk?: boolean;
}

/**
 * 站内通知（M12）。顶栏铃铛的数据源。
 *
 * push 是 fire-and-forget：写库失败只记日志不抛错——通知是业务的副产物，
 * 绝不让反馈提交、状态流转这类主流程因通知失败而失败（同 IntegrationNotifyService 哲学）。
 * 钉钉侧仍走 mock 适配器留契约，站内是当前唯一真实触达渠道。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notification');

  constructor(
    private readonly prisma: PrismaService,
    private readonly dingtalk: IntegrationNotifyService,
  ) {}

  push(
    users: { id: string; name: string }[],
    title: string,
    content: string,
    link?: string,
    options?: PushOptions,
  ): void {
    const seen = new Set<string>();
    const targets = users.filter((u) => {
      if (!u.id || u.id === options?.excludeUserId || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
    if (!targets.length) return;

    void this.prisma.notification
      .createMany({
        data: targets.map((u) => ({ userId: u.id, title, content, link: link ?? null })),
      })
      .catch((err: unknown) => {
        this.logger.error(
          `站内通知写入失败（不影响业务）：${err instanceof Error ? err.message : String(err)}`,
        );
      });

    if (options?.dingtalk !== false) {
      this.dingtalk.sendWorkMessage(targets, title, content, link);
    }
  }

  async listMine(
    user: CurrentUser,
    query: { page?: number; pageSize?: number; unread?: string },
  ): Promise<PageResult<NotificationItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      userId: user.id,
      ...(query.unread === '1' ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        link: r.link,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async unreadCount(user: CurrentUser): Promise<number> {
    return this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
  }

  /** 标记已读。where 带 userId——别人的通知 id 传进来也只是空更新。 */
  async markRead(user: CurrentUser, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(user: CurrentUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
