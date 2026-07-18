import { useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { PlusOutlined } from '@ant-design/icons';
import type { DeptNode } from '@mes/shared';
import { isApiError } from '@/api/client';
import { useDeleteDept, useDepts, useSaveDept } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../PageContainer';

/** DeptNode 树 → antd Tree 数据，标题带上编码、成员数与停用标记。 */
function toTreeData(nodes: DeptNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: (
      <span className="inline-flex items-center gap-2">
        <span className={n.enabled ? '' : 'text-slate-400 line-through'}>{n.name}</span>
        <span className="text-xs text-slate-400">{n.code}</span>
        {n.userCount > 0 && (
          <Tag className="!m-0 !px-1 !text-[10px] !leading-4" color="blue">
            {n.userCount}
          </Tag>
        )}
        {!n.enabled && (
          <Tag className="!m-0 !px-1 !text-[10px] !leading-4" color="default">
            停用
          </Tag>
        )}
      </span>
    ),
    children: n.children.length ? toTreeData(n.children) : undefined,
  }));
}

/** 拍平成 Select 选项，供「上级部门」选择。 */
function flatten(nodes: DeptNode[], depth = 0): { value: string; label: string }[] {
  return nodes.flatMap((n) => [
    { value: n.id, label: `${'　'.repeat(depth)}${n.name}` },
    ...flatten(n.children, depth + 1),
  ]);
}

function findNode(nodes: DeptNode[], id: string): DeptNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

export default function DeptPage() {
  const { message, modal } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('sys:dept:write'));

  const { data: depts } = useDepts();
  const saveDept = useSaveDept();
  const deleteDept = useDeleteDept();

  const treeData = useMemo(() => toTreeData(depts ?? []), [depts]);
  const deptOptions = useMemo(() => (depts ? flatten(depts) : []), [depts]);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = useMemo(
    () => (depts && selectedId ? findNode(depts, selectedId) : undefined),
    [depts, selectedId],
  );

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form] = Form.useForm();

  const openCreate = (parentId?: string) => {
    setEditingId(undefined);
    form.resetFields();
    form.setFieldsValue({ parentId: parentId ?? undefined, enabled: true, sort: 0 });
    setOpen(true);
  };

  const openEdit = (node: DeptNode) => {
    setEditingId(node.id);
    form.setFieldsValue({
      name: node.name,
      code: node.code,
      parentId: node.parentId ?? undefined,
      sort: node.sort,
      enabled: node.enabled,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await saveDept.mutateAsync({ id: editingId, body: values });
      message.success(editingId ? '已保存' : '部门已创建');
      setOpen(false);
    } catch (err) {
      message.error(isApiError(err) ? err.message : '操作失败');
    }
  };

  const onDelete = (node: DeptNode) => {
    modal.confirm({
      title: `删除部门「${node.name}」？`,
      content:
        node.children.length > 0
          ? '该部门下有子部门，需先处理子部门。'
          : node.userCount > 0
            ? `该部门下有 ${node.userCount} 名成员，需先改派。`
            : '此操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDept.mutateAsync(node.id);
          message.success('已删除');
          if (selectedId === node.id) setSelectedId(undefined);
        } catch (err) {
          message.error(isApiError(err) ? err.message : '删除失败');
        }
      },
    });
  };

  return (
    <PageContainer
      title="部门管理"
      subtitle="维护公司组织架构树。部门用于数据权限的「本部门及下级」范围划分。"
      extra={
        canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            新建部门
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-200/70 p-3">
          <Tree
            treeData={treeData}
            selectedKeys={selectedId ? [selectedId] : []}
            onSelect={(keys) => setSelectedId(keys[0] as string | undefined)}
            defaultExpandAll
            blockNode
          />
        </div>

        {/* 右侧详情/操作 */}
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-semibold text-slate-800">{selected.name}</div>
                <div className="text-xs text-slate-400">编码 {selected.code}</div>
              </div>
              <Space size={6} wrap>
                <Tag color={selected.enabled ? 'green' : 'default'}>
                  {selected.enabled ? '启用' : '停用'}
                </Tag>
                <Tag color="blue">{selected.userCount} 名成员</Tag>
                <Tag>{selected.children.length} 个子部门</Tag>
              </Space>
              {canWrite && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="small" onClick={() => openCreate(selected.id)}>
                    添加子部门
                  </Button>
                  <Button size="small" onClick={() => openEdit(selected)}>
                    编辑
                  </Button>
                  <Button size="small" danger onClick={() => onDelete(selected)}>
                    删除
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-400">
              选择左侧部门查看详情
              <br />
              或点击右上角新建
            </div>
          )}
        </div>
      </div>

      <Modal
        title={editingId ? '编辑部门' : '新建部门'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saveDept.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4" preserve={false}>
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input placeholder="如 机械装配组" />
          </Form.Item>
          <Form.Item
            name="code"
            label="部门编码"
            rules={[
              { required: true, message: '请输入部门编码' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: '字母、数字、下划线或连字符' },
            ]}
          >
            <Input placeholder="如 MECH_ASM" />
          </Form.Item>
          <Form.Item name="parentId" label="上级部门">
            <Select
              allowClear
              placeholder="不选则为顶级部门"
              options={editingId ? deptOptions.filter((o) => o.value !== editingId) : deptOptions}
            />
          </Form.Item>
          <div className="flex gap-4">
            <Form.Item name="sort" label="排序" className="flex-1">
              <InputNumber min={0} className="!w-full" placeholder="数字越小越靠前" />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </PageContainer>
  );
}
