/**
 * 幂等 seed：写入权限点、内置角色、根部门与初始管理员。
 *
 * 可以反复执行。已存在的记录只更新名称等展示字段，绝不覆盖密码与角色分配——
 * 否则每次部署都会把管理员的密码重置回环境变量里的那个值。
 *
 * 执行：npm run db:seed（会自动加载仓库根目录的 .env）
 */
import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  BUILTIN_ROLE_LABEL,
  type BuiltinRole,
  PERMISSION_META,
  ROLE_PRESET,
  evaluatePassword,
} from '@mes/shared';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function seedPermissions(): Promise<Map<string, string>> {
  for (const code of ALL_PERMISSIONS) {
    const meta = PERMISSION_META[code];
    await prisma.permission.upsert({
      where: { code },
      create: { code, name: meta.name, module: meta.module },
      update: { name: meta.name, module: meta.module },
    });
  }

  const rows = await prisma.permission.findMany({ select: { id: true, code: true } });
  console.log(`✓ 权限点 ${rows.length} 个`);
  return new Map(rows.map((p) => [p.code, p.id]));
}

async function seedRoles(permissionIds: Map<string, string>): Promise<void> {
  for (const [code, preset] of Object.entries(ROLE_PRESET)) {
    const name = BUILTIN_ROLE_LABEL[code as BuiltinRole] ?? code;

    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name, dataScope: preset.dataScope, builtin: true },
      // 不回写 dataScope：管理员可能已在界面上按实际情况调整过，seed 不该把它抹掉
      update: { name },
    });

    const codes = preset.permissions === '*' ? ALL_PERMISSIONS : preset.permissions;

    // 只补齐缺失的授权，不删除管理员额外授予的权限
    await prisma.rolePermission.createMany({
      data: codes
        .map((c) => permissionIds.get(c))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  console.log(`✓ 内置角色 ${Object.keys(ROLE_PRESET).length} 个`);
}

async function seedRootDept(): Promise<string> {
  const dept = await prisma.dept.upsert({
    where: { code: 'ROOT' },
    create: { code: 'ROOT', name: '公司', path: '/', sort: 0 },
    update: {},
  });
  return dept.id;
}

async function seedAdmin(deptId: string): Promise<void> {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || !password) {
    console.log('· 跳过管理员创建：BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD 未设置');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`· 管理员 ${username} 已存在，不覆盖其密码`);
    return;
  }

  const strength = evaluatePassword(password);
  if (strength.score < 2) {
    // 初始管理员是整个系统权限最高的账号，弱口令在这里的代价最大
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD 强度不足（${strength.issues.join('、')}），拒绝创建`);
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SYS_ADMIN' } });

  await prisma.user.create({
    data: {
      username,
      displayName: '系统管理员',
      passwordHash: await hash(password, ARGON2_OPTIONS),
      deptId,
      status: 'ACTIVE',
      // 首次登录强制改密：这个密码曾以明文形式存在于 .env 和部署脚本里
      mustChangePassword: true,
      roles: { create: { roleId: adminRole.id } },
    },
  });

  console.log(`✓ 管理员 ${username} 已创建，首次登录须修改密码`);
}

async function main(): Promise<void> {
  const permissionIds = await seedPermissions();
  await seedRoles(permissionIds);
  const deptId = await seedRootDept();
  await seedAdmin(deptId);
  console.log('\nseed 完成。请从 .env 中删除 BOOTSTRAP_ADMIN_PASSWORD。');
}

main()
  .catch((err) => {
    console.error('seed 失败：', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
