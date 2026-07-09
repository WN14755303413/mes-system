import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
    });
  }

  /**
   * 刻意不实现 onModuleInit / 不调用 $connect()。
   *
   * Prisma 是惰性连接的——首次查询时自动建连，所以主动 $connect() 并非必需。
   * 而它的 library engine 走 N-API，在解析不可达主机时会**阻塞 event loop**，
   * 导致 setTimeout 无法触发，任何基于 Promise.race 的超时保护都会失效，
   * 整个进程卡在启动阶段，连端口都监听不上。
   *
   * 因此把建连推迟到第一次实际查询。数据库不可用时，失败会在请求层面
   * 被捕获并转化为 5xx，而不是让服务起不来。
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * 健康检查探针。
   *
   * 注意：这里没有超时保护，理由同上——真正的阻塞发生在 N-API 内部，
   * JS 层的超时定时器根本不会被调度。连接串配置错误时本接口会挂起，
   * 这恰好是一个明确的故障信号。
   */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.warn(`数据库探针失败: ${(err as Error).message}`);
      return false;
    }
  }
}
