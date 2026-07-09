import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  // 不缓冲日志：启动阶段的数据库连接问题需要立刻可见
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // 安全响应头。CSP 在 M1 接入前端后按需放宽。
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  // access/refresh token 走 httpOnly Cookie，需要解析器
  app.use(cookieParser());

  app.setGlobalPrefix('api');

  // credentials: true 是 Cookie 跨域下发的前提；origin 必须是具体域名，不能用 *
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥离 DTO 未声明的字段
      forbidNonWhitelisted: true, // 出现额外字段直接拒绝，防止参数注入
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  logger.log(`MES API 已启动 → http://localhost:${port}/api`);
}

void bootstrap();
