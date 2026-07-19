import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { CodeModule } from './common/code/code.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { StateModule } from './common/state/state.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { BomModule } from './modules/bom/bom.module';
import { HealthModule } from './modules/health/health.module';
import { MaterialModule } from './modules/material/material.module';
import { ProductionModule } from './modules/production/production.module';
import { ProjectModule } from './modules/project/project.module';
import { QualityModule } from './modules/quality/quality.module';
import { SystemModule } from './modules/system/system.module';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 环境变量集中在仓库根目录，前后端共用一份
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
    // 全局兜底限流；登录、验证码等接口在 controller 上另有更严格的 @Throttle
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CodeModule,
    StateModule,
    StorageModule,
    AuthModule,
    HealthModule,
    SystemModule,
    ProjectModule,
    BomModule,
    MaterialModule,
    ProductionModule,
    QualityModule,
  ],
  providers: [
    // 顺序即执行顺序，逐层收窄：
    //   限流 → 认证（注入 req.user）→ CSRF → 功能权限（读 req.user）
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 审计：只对 @Audit() 标注的写操作生效，成功失败都留痕
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
