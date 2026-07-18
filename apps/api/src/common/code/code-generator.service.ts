import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 单据编号生成器（建设方案 §10.2）。
 *
 * 编号由「前缀 scope」+「零填充流水号」拼成，例如：
 *   - 项目   PJ-2026-ABC-001   scope=PJ-2026-ABC
 *   - 设备   EQ-PJ2026ABC001-01 scope=EQ-PJ2026ABC001
 *   - 单据   QC-20260709-001    scope=QC-20260709
 *
 * 并发安全性：流水号自增用**单条** SQL 完成——
 *   INSERT ... ON CONFLICT (scope) DO UPDATE SET current = current + 1 RETURNING current
 * 一条语句即「不存在则插入 1、已存在则原子自增并返回新值」。Postgres 会对冲突行加行锁，
 * 并发请求被串行化，因此绝不会拿到重复的 current。无需显式事务或应用层加锁。
 */
@Injectable()
export class CodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生成下一个编号。
   *
   * @param scope   序列作用域（编号前缀）。同一 scope 共享一个自增计数器。
   * @param options.width  流水号零填充宽度，默认 3（001）。设备等场景可传 2。
   * @param options.join   scope 与流水号之间的连接符，默认 `-`。
   */
  async next(
    scope: string,
    options: { width?: number; join?: string } = {},
  ): Promise<string> {
    const { width = 3, join = '-' } = options;
    const seq = await this.nextSeq(scope);
    return `${scope}${join}${String(seq).padStart(width, '0')}`;
  }

  /**
   * 只取下一个流水号（不拼前缀）。需要自定义拼接格式时用。
   */
  async nextSeq(scope: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ current: number }[]>`
      INSERT INTO "sys_code_sequence" ("id", "scope", "current", "updated_at")
      VALUES (gen_random_uuid()::text, ${scope}, 1, now())
      ON CONFLICT ("scope")
      DO UPDATE SET "current" = "sys_code_sequence"."current" + 1, "updated_at" = now()
      RETURNING "current"
    `;
    return rows[0].current;
  }
}
