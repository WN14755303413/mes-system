import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@mes/shared';
import { AppException } from '../exceptions/app.exception';

/**
 * 文件存储抽象（M5，技术方案 §11.2）。
 *
 * 两种驱动，STORAGE_DRIVER 切换：
 * - local：写本地磁盘（开发默认）。零外部依赖，key 即根目录内的相对路径。
 * - supabase：Supabase Storage。用 Node 原生 fetch 直调 Storage REST，
 *   刻意不引入 @supabase/* SDK——依赖面越小越好，且这里只用到 3 个端点。
 *
 * 无论哪种驱动，文件的上传与下载都只经过后端：前端拿不到存储凭据，
 * 也不存在可绕过鉴权与审计的直链（技术方案「浏览器零密钥」原则）。
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  private readonly driver: 'local' | 'supabase';
  private readonly localRoot: string;
  private readonly supabaseUrl: string | undefined;
  private readonly serviceKey: string | undefined;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.driver = config.get('STORAGE_DRIVER') === 'supabase' ? 'supabase' : 'local';
    this.localRoot = path.resolve(config.get('STORAGE_LOCAL_DIR') ?? './storage');
    this.supabaseUrl = config.get('SUPABASE_URL');
    this.serviceKey = config.get('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = config.get('SUPABASE_BUCKET_DRAWINGS') ?? 'mes-drawings';
  }

  /** 启动时做一次驱动自检：local 建目录，supabase 确保 bucket 存在（私有）。 */
  async onModuleInit(): Promise<void> {
    if (this.driver === 'local') {
      await mkdir(this.localRoot, { recursive: true });
      this.logger.log(`文件存储：local → ${this.localRoot}`);
      return;
    }

    if (!this.supabaseUrl || !this.serviceKey) {
      throw new Error('STORAGE_DRIVER=supabase 但 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置');
    }
    await this.ensureBucket();
    this.logger.log(`文件存储：supabase → ${this.supabaseUrl} bucket=${this.bucket}`);
  }

  /** 写入文件。key 由调用方生成（见 DrawingService），全局唯一。 */
  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    if (this.driver === 'local') {
      const target = this.resolveLocal(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
      return;
    }

    const res = await this.supabaseFetch(
      `/storage/v1/object/${this.bucket}/${encodeKey(key)}`,
      { method: 'POST', headers: { 'Content-Type': mimeType }, body: new Uint8Array(buffer) },
    );
    if (!res.ok) {
      throw new Error(`Supabase 上传失败 [${res.status}]: ${await safeText(res)}`);
    }
  }

  /** 读出文件流。不存在时抛 NOT_FOUND——数据库有记录而存储缺文件属于需人工介入的异常。 */
  async getStream(key: string): Promise<Readable> {
    if (this.driver === 'local') {
      const target = this.resolveLocal(key);
      const stream = createReadStream(target);
      // createReadStream 是惰性打开的，这里主动等待 open/error，把「文件不存在」
      // 转成带错误码的业务异常，而不是让 socket 在响应中途断掉。
      await new Promise<void>((resolve, reject) => {
        stream.once('open', () => resolve());
        stream.once('error', (err) => reject(err));
      }).catch(() => {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          '文件在存储中不存在，请联系管理员核查',
          HttpStatus.NOT_FOUND,
        );
      });
      return stream;
    }

    const res = await this.supabaseFetch(
      `/storage/v1/object/${this.bucket}/${encodeKey(key)}`,
      { method: 'GET' },
    );
    if (res.status === 404 || res.status === 400) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        '文件在存储中不存在，请联系管理员核查',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!res.ok || !res.body) {
      throw new Error(`Supabase 下载失败 [${res.status}]: ${await safeText(res)}`);
    }
    return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  }

  /** 删除文件。仅用于「上传后写库失败」的回滚清理；业务作废不删文件，保留追溯。 */
  async remove(key: string): Promise<void> {
    try {
      if (this.driver === 'local') {
        await rm(this.resolveLocal(key), { force: true });
        return;
      }
      await this.supabaseFetch(`/storage/v1/object/${this.bucket}/${encodeKey(key)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      // 回滚清理是尽力而为：残留孤儿文件只浪费空间，不影响正确性
      this.logger.warn(`存储清理失败 key=${key}: ${(err as Error).message}`);
    }
  }

  // ---- 私有辅助 ----

  /** local 驱动：把 key 解析到根目录内，拒绝任何形式的路径穿越。 */
  private resolveLocal(key: string): string {
    const target = path.resolve(this.localRoot, key);
    if (target !== this.localRoot && !target.startsWith(this.localRoot + path.sep)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '非法的存储路径',
        HttpStatus.BAD_REQUEST,
      );
    }
    return target;
  }

  private supabaseFetch(pathname: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.supabaseUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        ...(init.headers ?? {}),
      },
    });
  }

  /** 幂等创建私有 bucket。409 = 已存在，视为成功。 */
  private async ensureBucket(): Promise<void> {
    const res = await this.supabaseFetch('/storage/v1/bucket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    });
    if (!res.ok && res.status !== 409 && res.status !== 400) {
      throw new Error(`创建 bucket ${this.bucket} 失败 [${res.status}]: ${await safeText(res)}`);
    }
  }
}

/** key 按路径段做 URL 编码：段内的中文/空格要编码，`/` 分隔符要保留。 */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
