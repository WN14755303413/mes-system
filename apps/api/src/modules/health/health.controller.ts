import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbOk = await this.prisma.ping();
    return {
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'up' : 'down',
      uptime: Math.round(process.uptime()),
    };
  }
}
