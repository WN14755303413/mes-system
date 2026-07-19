import { z } from 'zod';

/**
 * 环境变量 schema。
 *
 * 启动时校验一次，缺失或格式错误直接崩溃退出——宁可起不来，也不要带着
 * 半配置状态跑起来（比如 JWT 密钥为空导致签名可被伪造）。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未配置，请参考 .env.example'),
  DIRECT_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET_DRAWINGS: z.string().default('mes-drawings'),
  SUPABASE_BUCKET_ATTACHMENTS: z.string().default('mes-attachments'),

  // 文件存储驱动（M5）。local：写本地磁盘，开发默认；supabase：Supabase Storage，生产用。
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  // local 驱动的根目录。相对路径以 API 进程工作目录（apps/api）为基准。
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  // 单文件上传上限（MB）。图纸 PDF/DWG 通常几 MB 到几十 MB。
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),

  // 32 字节以上，避免弱密钥被暴力破解。生成：openssl rand -base64 48
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET 至少 32 字符'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET 至少 32 字符'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // ---------- 系统集成（M11） ----------
  // 适配器实现选择。一期只有 mock（集成预留）；二期对接真实系统后新增取值。
  ERP_ADAPTER: z.enum(['mock']).default('mock'),
  DINGTALK_ADAPTER: z.enum(['mock']).default('mock'),
  // 以下凭据 mock 模式不使用，仅在状态页展示「是否已配置」；二期真实适配器读取
  ERP_API_BASE_URL: z.string().optional(),
  ERP_API_TOKEN: z.string().optional(),
  DINGTALK_AGENT_ID: z.string().optional(),
  DINGTALK_APP_KEY: z.string().optional(),
  DINGTALK_APP_SECRET: z.string().optional(),

  // 仅 seed 脚本读取，应用运行时不使用
  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败：\n${issues}\n\n请检查项目根目录的 .env 文件。`);
  }

  // 生产环境必须走 HTTPS，否则 httpOnly Cookie 会以明文在网络上传输
  if (result.data.NODE_ENV === 'production' && !result.data.COOKIE_SECURE) {
    throw new Error('生产环境必须设置 COOKIE_SECURE=true');
  }

  return result.data;
}
