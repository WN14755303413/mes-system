import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import {
  BUILTIN_ROLE_LABEL,
  type DeptNode,
  type SysUserListItem,
  UserStatus,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useAssignRoles,
  useCreateUser,
  useDeleteUser,
  useDepts,
  useResetPassword,
  useRoles,
  useSetUserStatus,
  useUpdateUser,
  useUsers,
} from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../PageContainer';

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: '启用' },
  DISABLED: { color: 'default', label: '禁用' },
  LOCKED: { color: 'orange', label: '锁定' },
};

/** 把部门树拍平成 Select 选项，缩进体现层级。 */
function flattenDepts(nodes: DeptNode[], depth = 0): { value: string; label: string }[] {
  return nodes.flatMap((n) => [
    { value: n.id, label: `${'　'.repeat(depth)}${n.name}` },
    ...flattenDepts(n.children, depth + 1),
  ]);
}

export default function UserListPage() {
  const { message, modal } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('sys:user:write'));
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [deptId, setDeptId] = useState<string | undefined>();
  const [status, setStatus] = useState<UserStatus | undefined>();

  const query = useMemo(
    () => ({ page, pageSize, keyword: keyword || undefined, deptId, status }),
    [page, pageSize, keyword, deptId, status],
  );
  const { data, isFetching } = useUsers(query);
  const { data: depts } = useDepts();
  const { data: roles } = useRoles();

  const deptOptions = useMemo(() => (depts ? flattenDepts(depts) : []), [depts]);
  const roleOptions = useMemo(
    () => (roles ?? []).map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const setUserStatus = useSetUserStatus();
  const resetPassword = useResetPassword();
  const assignRoles = useAssignRoles();
  const deleteUser = useDeleteUser();

  // 新建/编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SysUserListItem | null>(null);
  const [form] = Form.useForm();

  // 分配角色弹窗
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<SysUserListItem | null>(null);
  const [roleForm] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setEditOpen(true);
  };

  const openEdit = (user: SysUserListItem) => {
    setEditing(user);
    form.setFieldsValue({
      displayName: user.displayName,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      deptId: user.deptId ?? undefined,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateUser.mutateAsync({ id: editing.id, body: values });
        message.success('已保存');
        setEditOpen(false);
      } else {
        const res = await createUser.mutateAsync(values);
        setEditOpen(false);
        showTempPassword('用户已创建', res.username, res.tempPassword);
      }
    } catch (err) {
      message.error(isApiError(err) ? err.message : '操作失败');
    }
  };

  const showTempPassword = (title: string, username: string, tempPassword: string) => {
    modal.success({
      title,
      width: 460,
      content: (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-500">
            请将以下临时密码转告 <b>{username}</b>。此密码<b>仅显示这一次</b>，
            用户首次登录时须立即修改。
          </p>
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
            <Typography.Text copyable className="!font-mono !text-base">
              {tempPassword}
            </Typography.Text>
          </div>
        </div>
      ),
    });
  };

  const onResetPassword = (user: SysUserListItem) => {
    modal.confirm({
      title: `重置「${user.displayName}」的密码？`,
      content: '将生成新的临时密码，该用户的所有登录会话会被强制退出。',
      okText: '重置',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await resetPassword.mutateAsync(user.id);
          showTempPassword('密码已重置', res.username, res.tempPassword);
        } catch (err) {
          message.error(isApiError(err) ? err.message : '重置失败');
        }
      },
    });
  };

  const onToggleStatus = (user: SysUserListItem) => {
    const next = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setUserStatus
      .mutateAsync({ id: user.id, body: { status: next } })
      .then(() => message.success(next === 'DISABLED' ? '已禁用' : '已启用'))
      .catch((err: unknown) => message.error(isApiError(err) ? err.message : '操作失败'));
  };

  const onDelete = (user: SysUserListItem) => {
    modal.confirm({
      title: `删除用户「${user.displayName}」？`,
      content: '用户将被停用并从列表移除（软删除，历史审计记录保留）。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteUser.mutateAsync(user.id);
          message.success('已删除');
        } catch (err) {
          message.error(isApiError(err) ? err.message : '删除失败');
        }
      },
    });
  };

  const openAssignRoles = (user: SysUserListItem) => {
    setRoleTarget(user);
    roleForm.setFieldsValue({
      roleIds: user.roles.map((r) => roles?.find((x) => x.code === r.code)?.id).filter(Boolean),
    });
    setRoleOpen(true);
  };

  const submitRoles = async () => {
    const values = await roleForm.validateFields();
    if (!roleTarget) return;
    try {
      await assignRoles.mutateAsync({ id: roleTarget.id, body: { roleIds: values.roleIds } });
      message.success('角色已更新');
      setRoleOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '操作失败');
    }
  };

  const columns: ColumnsType<SysUserListItem> = [
    {
      title: '账号',
      dataIndex: 'username',
      width: 160,
      render: (v: string, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-800">{v}</span>
          <span className="text-xs text-slate-400">{row.displayName}</span>
        </div>
      ),
    },
    { title: '部门', dataIndex: 'deptName', width: 130, render: (v) => v ?? '—' },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (roleList: SysUserListItem['roles']) =>
        roleList.length ? (
          <Space size={[4, 4]} wrap>
            {roleList.map((r) => (
              <Tag key={r.code} color="blue" className="!m-0">
                {BUILTIN_ROLE_LABEL[r.code as keyof typeof BUILTIN_ROLE_LABEL] ?? r.name}
              </Tag>
            ))}
          </Space>
        ) : (
          <span className="text-slate-400">未分配</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string, row) => {
        const s = STATUS_TAG[v] ?? { color: 'default', label: v };
        return (
          <Space size={4}>
            <Tag color={s.color} className="!m-0">
              {s.label}
            </Tag>
            {row.mustChangePassword && (
              <Tooltip title="首次登录须改密">
                <KeyOutlined className="text-amber-500" />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      width: 160,
      render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    },
    ...(canWrite
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 260,
            fixed: 'right' as const,
            render: (_: unknown, row: SysUserListItem) => {
              const isSelf = row.id === currentUserId;
              return (
                <Space size={2} wrap>
                  <Button type="link" size="small" onClick={() => openEdit(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<SafetyOutlined />}
                    onClick={() => openAssignRoles(row)}
                  >
                    角色
                  </Button>
                  <Button type="link" size="small" onClick={() => onResetPassword(row)}>
                    重置密码
                  </Button>
                  <Tooltip title={isSelf ? '不能停用自己' : ''}>
                    <Button
                      type="link"
                      size="small"
                      disabled={isSelf}
                      onClick={() => onToggleStatus(row)}
                    >
                      {row.status === 'ACTIVE' ? '禁用' : '启用'}
                    </Button>
                  </Tooltip>
                  <Button
                    type="link"
                    size="small"
                    danger
                    disabled={isSelf}
                    icon={<DeleteOutlined />}
                    onClick={() => onDelete(row)}
                  />
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <PageContainer
      title="用户管理"
      subtitle="维护系统账号、部门归属与角色分配"
      extra={
        canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建用户
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索账号 / 姓名 / 邮箱"
          className="!w-64"
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="部门"
          className="!w-40"
          options={deptOptions}
          value={deptId}
          onChange={(v) => {
            setDeptId(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="状态"
          className="!w-32"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.values(UserStatus).map((s) => ({
            value: s,
            label: STATUS_TAG[s]?.label ?? s,
          }))}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeyword('');
            setDeptId(undefined);
            setStatus(undefined);
            setPage(1);
          }}
        >
          重置
        </Button>
      </div>

      <Table<SysUserListItem>
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 新建 / 编辑 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title={editing ? '编辑用户' : '新建用户'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={createUser.isPending || updateUser.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          {!editing && (
            <>
              <Form.Item
                name="username"
                label="账号"
                rules={[
                  { required: true, message: '请输入账号' },
                  { pattern: /^[\w.@-]+$/, message: '仅允许字母、数字与 @ . _ -' },
                  { min: 3, max: 64, message: '长度 3-64 位' },
                ]}
              >
                <Input placeholder="如 zhangsan 或 zhang.san@company" autoComplete="off" />
              </Form.Item>
              <Form.Item name="roleIds" label="角色" rules={[{ required: true, message: '请至少选择一个角色' }]}>
                <Select mode="multiple" placeholder="选择角色" options={roleOptions} />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="displayName"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }, { min: 2, max: 32 }]}
          >
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="deptId" label="部门">
            <Select allowClear placeholder="选择部门" options={deptOptions} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="选填" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}
          >
            <Input placeholder="选填" autoComplete="off" />
          </Form.Item>
        </Form>
        {!editing && (
          <p className="text-xs text-slate-400">
            创建后系统将生成一次性临时密码，请转告用户；其首次登录须改密。
          </p>
        )}
      </Modal>

      {/* 分配角色 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title={`分配角色 · ${roleTarget?.displayName ?? ''}`}
        open={roleOpen}
        onCancel={() => setRoleOpen(false)}
        onOk={submitRoles}
        confirmLoading={assignRoles.isPending}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item
            name="roleIds"
            label="角色"
            rules={[{ required: true, message: '请至少选择一个角色' }]}
          >
            <Select mode="multiple" placeholder="选择角色" options={roleOptions} />
          </Form.Item>
        </Form>
        <p className="text-xs text-slate-400">保存后该用户会被强制重新登录，以应用新的权限。</p>
      </Modal>
    </PageContainer>
  );
}
