import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tree,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import {
  DataScope,
  type Permission,
  type PermissionItem,
  type RoleListItem,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  useCreateRole,
  useDeleteRole,
  usePermissions,
  useRoleDetail,
  useRoles,
  useSetRolePermissions,
} from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../PageContainer';

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部数据',
  DEPT_AND_BELOW: '本部门及下级',
  DEPT_ONLY: '仅本部门',
  OWNED_PROJECT: '仅负责/参与项目',
  SELF_ONLY: '仅本人数据',
};

/** 权限点按 module 分组，构造 antd Tree 的数据；父节点 key 用 `mod:模块名` 前缀避免与权限码冲突。 */
function buildPermTree(perms: PermissionItem[]): { nodes: DataNode[]; groupKeys: string[] } {
  const byModule = new Map<string, PermissionItem[]>();
  for (const p of perms) {
    if (!byModule.has(p.module)) byModule.set(p.module, []);
    byModule.get(p.module)!.push(p);
  }
  const nodes: DataNode[] = [];
  const groupKeys: string[] = [];
  for (const [mod, list] of byModule) {
    const key = `mod:${mod}`;
    groupKeys.push(key);
    nodes.push({
      key,
      title: mod,
      children: list.map((p) => ({ key: p.code, title: p.name })),
    });
  }
  return { nodes, groupKeys };
}

export default function RolePage() {
  const { message, modal } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('sys:role:write'));

  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: permissions } = usePermissions();

  const [selectedId, setSelectedId] = useState<string>();
  const selectedRole = useMemo(
    () => roles?.find((r) => r.id === selectedId),
    [roles, selectedId],
  );

  // 默认选中第一个角色
  useEffect(() => {
    if (!selectedId && roles?.length) setSelectedId(roles[0].id);
  }, [roles, selectedId]);

  const { data: roleDetail, isFetching: detailLoading } = useRoleDetail(selectedId);
  const setPermissions = useSetRolePermissions();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();

  const { nodes: permTree, groupKeys } = useMemo(
    () => buildPermTree(permissions ?? []),
    [permissions],
  );

  // 权限树勾选态。加载角色详情后同步；用户勾选后本地维护，保存时提交。
  const [checked, setChecked] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (roleDetail) {
      setChecked(roleDetail.permissions);
      setDirty(false);
    }
  }, [roleDetail]);

  const onCheck = (keys: string[]) => {
    // 过滤掉分组父节点（mod: 前缀），只保留真正的权限码
    setChecked(keys.filter((k) => !k.startsWith('mod:')));
    setDirty(true);
  };

  const onSavePermissions = async () => {
    if (!selectedId) return;
    try {
      await setPermissions.mutateAsync({
        id: selectedId,
        body: { permissions: checked as Permission[] },
      });
      message.success('权限已保存，相关用户重新登录后生效');
      setDirty(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '保存失败');
    }
  };

  // 新建角色
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const submitCreate = async () => {
    const values = await form.validateFields();
    try {
      const res = await createRole.mutateAsync(values);
      message.success('角色已创建');
      setCreateOpen(false);
      form.resetFields();
      setSelectedId(res.id);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '创建失败');
    }
  };

  const onDeleteRole = (role: RoleListItem) => {
    modal.confirm({
      title: `删除角色「${role.name}」？`,
      content: role.userCount > 0 ? `仍有 ${role.userCount} 个用户属于该角色，需先改派。` : '此操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRole.mutateAsync(role.id);
          message.success('已删除');
          if (selectedId === role.id) setSelectedId(undefined);
        } catch (err) {
          message.error(isApiError(err) ? err.message : '删除失败');
        }
      },
    });
  };

  return (
    <PageContainer
      title="角色权限"
      subtitle="维护角色及其功能权限点。权限变更后，相关用户重新登录即生效。"
      extra={
        canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建角色
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* 左：角色列表 */}
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-2">
          {rolesLoading ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : (
            <div className="space-y-1">
              {roles?.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                    selectedId === role.id
                      ? 'bg-industrial-600 text-white shadow-sm'
                      : 'hover:bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{role.name}</span>
                      {role.builtin && (
                        <Tag
                          className="!m-0 !px-1 !text-[10px] !leading-4"
                          color={selectedId === role.id ? 'blue' : 'default'}
                        >
                          内置
                        </Tag>
                      )}
                    </div>
                    <div
                      className={`truncate text-xs ${
                        selectedId === role.id ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {role.code} · {role.userCount} 用户 · {role.permissionCount} 权限
                    </div>
                  </div>
                  {canWrite && !role.builtin && (
                    <DeleteOutlined
                      className={selectedId === role.id ? 'text-blue-100' : 'text-slate-300'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRole(role);
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右：权限树 */}
        <div className="min-w-0">
          {!selectedRole ? (
            <Empty description="请选择一个角色" className="py-16" />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Space>
                  <span className="font-medium text-slate-700">{selectedRole.name}</span>
                  <Tag color="geekblue">{DATA_SCOPE_LABEL[selectedRole.dataScope]}</Tag>
                  <span className="text-xs text-slate-400">已选 {checked.length} 项权限</span>
                </Space>
                {canWrite && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<SaveOutlined />}
                    disabled={!dirty}
                    loading={setPermissions.isPending}
                    onClick={onSavePermissions}
                  >
                    保存权限
                  </Button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200/70 p-3">
                {detailLoading ? (
                  <div className="flex justify-center py-8">
                    <Spin />
                  </div>
                ) : (
                  <Tree
                    checkable
                    selectable={false}
                    disabled={!canWrite}
                    checkedKeys={checked}
                    onCheck={(keys) => onCheck(keys as string[])}
                    treeData={permTree}
                    defaultExpandedKeys={groupKeys}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 新建角色 */}
      <Modal
        maskClosable={false}
        keyboard={false}
        title="新建角色"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        confirmLoading={createRole.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item
            name="code"
            label="角色编码"
            rules={[
              { required: true, message: '请输入角色编码' },
              { pattern: /^[A-Z][A-Z0-9_]*$/, message: '大写字母、数字、下划线，以字母开头' },
            ]}
          >
            <Input placeholder="如 QA_LEAD" />
          </Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="如 质量组长" />
          </Form.Item>
          <Form.Item
            name="dataScope"
            label="数据范围"
            initialValue={DataScope.DEPT_ONLY}
            rules={[{ required: true }]}
          >
            <Select
              options={Object.values(DataScope).map((s) => ({
                value: s,
                label: DATA_SCOPE_LABEL[s],
              }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" maxLength={200} />
          </Form.Item>
        </Form>
        <p className="text-xs text-slate-400">创建后在右侧勾选该角色的权限点并保存。</p>
      </Modal>
    </PageContainer>
  );
}
