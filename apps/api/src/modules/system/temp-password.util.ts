import { randomInt } from 'node:crypto';

/**
 * 生成满足密码强度下限（evaluatePassword score ≥ 2）的随机临时密码。
 *
 * 用途：管理员新建用户或重置密码时，由系统生成、明文只回显一次，
 * 用户首次登录被强制改密。因此这个密码不需要好记，只需要够强、够随机。
 *
 * 刻意排除易混字符（0/O、1/l/I），管理员口头或书面转达时不易出错。
 */
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*-_=+';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

export function generateTempPassword(length = 14): string {
  // 先各放一个，保证四类字符齐全（大小写、数字、符号），其余随机填充
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];

  // Fisher-Yates 洗牌，用 crypto 的 randomInt，避免必需字符固定落在前四位
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
