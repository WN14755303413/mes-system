#!/usr/bin/env node
/**
 * 把仓库根目录的 .env 注入子进程后再执行命令。
 *
 * 存在的理由：Prisma CLI 只会在 schema 所在目录和 cwd 里找 .env，
 * 而本仓库把环境变量集中在根目录供前后端共用。与其为 Prisma 单独复制一份
 * （两份 .env 迟早不同步），不如在调用处补上这一步。
 *
 * 用法：node scripts/with-root-env.mjs prisma migrate dev
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../../.env');

if (!existsSync(envPath)) {
  console.error(`找不到 ${envPath}。请先执行 cp .env.example .env 并填入真实值。`);
  process.exit(1);
}

/**
 * 极简 .env 解析。只支持 KEY=VALUE 与可选的成对引号——
 * 刻意不支持变量插值和多行值：本仓库的 .env 里没有，
 * 而一个能正确处理它们的解析器不该由这个脚本承担。
 */
const parsed = {};
for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;

  const eq = line.indexOf('=');
  if (eq === -1) continue;

  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();

  const quoted =
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
  if (quoted) value = value.slice(1, -1);

  parsed[key] = value;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法：node scripts/with-root-env.mjs <命令> [参数...]');
  process.exit(1);
}

// 真实环境变量优先于 .env，便于 CI 覆盖
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...parsed, ...process.env },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
