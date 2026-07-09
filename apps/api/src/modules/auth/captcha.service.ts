import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import svgCaptcha from 'svg-captcha';
import type { CaptchaResponse } from '@mes/shared';

const TTL_MS = 3 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** 单实例内存存储。多副本部署时必须换成 Redis，否则签发与校验可能落在不同进程上。 */
interface Entry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class CaptchaService implements OnModuleDestroy {
  private readonly store = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // 过期条目不会自己消失，不定期清理会让 Map 随签发次数无限增长
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  generate(): CaptchaResponse {
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 3,
      ignoreChars: '0o1ilI', // 去掉视觉上难以区分的字符，减少无谓的失败
      color: true,
      background: '#f1f5fb',
      width: 120,
      height: 40,
      fontSize: 44,
    });

    const captchaId = randomUUID();
    this.store.set(captchaId, {
      code: captcha.text.toLowerCase(),
      expiresAt: Date.now() + TTL_MS,
    });

    return { captchaId, svg: captcha.data };
  }

  /**
   * 校验并**立即消费**：无论对错都删除该 id。
   *
   * 这一点很关键——若校验失败仍保留，攻击者就能拿同一张图的 id 反复穷举 4 个字符，
   * 验证码就退化成了摆设。
   */
  verify(captchaId: string | undefined, code: string | undefined): boolean {
    if (!captchaId || !code) return false;

    const entry = this.store.get(captchaId);
    this.store.delete(captchaId);

    if (!entry) return false;
    if (Date.now() > entry.expiresAt) return false;

    return entry.code === code.trim().toLowerCase();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id);
    }
  }
}
