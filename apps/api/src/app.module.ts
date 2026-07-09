import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 环境变量集中在仓库根目录，前后端共用一份
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
    // 全局兜底限流；登录接口另有更严格的独立策略（M1）
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
