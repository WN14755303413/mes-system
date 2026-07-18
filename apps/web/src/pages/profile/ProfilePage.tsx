import { IdcardOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { PERMISSION_META, type Permission } from '@mes/shared';
import { Descriptions, Empty, Tag } from 'antd';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth';

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部数据',
  DEPT_AND_BELOW: '本部门及下级',
  DEPT_ONLY: '仅本部门',
  OWNED_PROJECT: '仅负责/参与项目',
  SELF_ONLY: '仅本人数据',
};

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  // 权限点按所属模块分组展示，比一大片扁平标签易读得多
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of user?.permissions ?? []) {
      const mod = PERMISSION_META[p]?.module ?? '其他';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return [...map.entries()];
  }, [user?.permissions]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 身份卡 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-5 rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-industrial-500 to-industrial-700 text-2xl font-semibold text-white shadow-lg shadow-industrial-500/25">
          {user.displayName?.[0] ?? 'U'}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-800">{user.displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{user.username}</span>
            <span className="text-slate-300">·</span>
            <span>{user.deptName ?? '未分配部门'}</span>
            {user.roles.map((r) => (
              <Tag key={r} color="blue" className="!m-0">
                {r}
              </Tag>
            ))}
          </p>
        </div>
      </motion.div>

      {/* 账号信息 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl"
      >
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
          <IdcardOutlined className="text-industrial-500" />
          账号信息
        </h2>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
          <Descriptions.Item label="账号">{user.username}</Descriptions.Item>
          <Descriptions.Item label="姓名">{user.displayName}</Descriptions.Item>
          <Descriptions.Item label="部门">{user.deptName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{user.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="数据范围">
            <Tag color="geekblue">{DATA_SCOPE_LABEL[user.dataScope] ?? user.dataScope}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="角色">{user.roles.join('、') || '无'}</Descriptions.Item>
        </Descriptions>
      </motion.div>

      {/* 权限点 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-xl"
      >
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
          <SafetyCertificateOutlined className="text-industrial-500" />
          我的权限
          <span className="text-xs font-normal text-slate-400">
            共 {user.permissions.length} 项
          </span>
        </h2>
        {grouped.length ? (
          <div className="space-y-4">
            {grouped.map(([mod, perms]) => (
              <div key={mod}>
                <div className="mb-2 text-xs font-medium text-slate-400">{mod}</div>
                <div className="flex flex-wrap gap-2">
                  {perms.map((p) => (
                    <Tag key={p} className="!m-0 !border-industrial-100 !bg-industrial-50 !text-industrial-700">
                      {PERMISSION_META[p]?.name ?? p}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="暂无权限" />
        )}
      </motion.div>
    </div>
  );
}
