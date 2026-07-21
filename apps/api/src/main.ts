import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  // 不缓冲日志：启动阶段的数据库连接问题需要立刻可见
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // 反代信任按「地址段」而非「跳数」：部署链路是 宿主机 nginx → web 容器 nginx → api，
  // 共两跳；若只信任 1 跳，req.ip 会停在 docker 网桥网关（172.x.0.1），审计与登录限流
  // 拿到的全是同一个网关地址。
  //
  // 信任 loopback + 172.16.0.0/12（docker 默认网桥地址池）意味着：解析 X-Forwarded-For
  // 时跳过我方代理，停在第一个非代理地址——即客户端真实 IP。
  //
  // 刻意不信任 192.168/16 与 10/8：局域网客户端就在这些网段里，一旦信任，攻击者
  // 可伪造 X-Forwarded-For 顶替自己的真实 IP，绕过按 IP 的登录限流。
  // 若部署环境的反代不在默认网段（如 compose 网络落到 192.168.x），用 TRUST_PROXY 覆盖。
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback,172.16.0.0/12');

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
