import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * OWASP 2024 推荐的 Argon2id 参数。
 * 调高 memoryCost 会线性增加 GPU 爆破成本，但也会增加单次登录的内存占用——
 * 19 MiB × 并发登录数，200 人规模下完全够用。
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /**
   * 一个恒定的假哈希，用于账号不存在时消耗与真实校验相当的时间。
   *
   * 没有它，「用户不存在」会立刻返回，而「密码错误」要跑一遍 Argon2（约 50ms）。
   * 攻击者据此就能仅凭响应耗时枚举出哪些账号真实存在，
   * 前面「统一返回用户名或密码错误」的努力也就白费了。
   */
  private dummyHash: string | null = null;

  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain, ARGON2_OPTIONS);
    } catch {
      // 哈希串损坏或格式不被识别：当作校验失败，不要把解析异常抛给调用方
      return false;
    }
  }

  /** 账号不存在时调用，制造与真实校验相当的耗时。返回值恒为 false。 */
  async verifyDummy(plain: string): Promise<false> {
    this.dummyHash ??= await this.hash('__mes_dummy_password_placeholder__');
    await this.verify(this.dummyHash, plain);
    return false;
  }
}
