import { useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  SYNC_SOURCE_LABEL,
  type MaterialItem,
  type SaveMaterialRequest,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { useImportMaterials, useMaterials, useSaveMaterial } from '@/api/material';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';
import { PasteImportModal, splitTsv, toNumber } from '../PasteImportModal';

/** 物料主数据（M6）。主数据以 ERP 为准，一期由采购在 MES 内维护/导入。 */
export default function MaterialPage() {
  const { message } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('material:write'));

  const [keyword, setKeyword] = useState('');
  const [longLeadOnly, setLongLeadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useMaterials({
    keyword: keyword || undefined,
    isLongLead: longLeadOnly || undefined,
    page,
    pageSize,
  });

  const save = useSaveMaterial();
  const importMut = useImportMaterials();

  const [editing, setEditing] = useState<MaterialItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm<SaveMaterialRequest>();

  const openModal = (row: MaterialItem | null) => {
    setEditing(row);
    form.setFieldsValue(
      row ?? {
        code: '',
        name: '',
        spec: null,
        unit: '件',
        category: null,
        isStandard: true,
        isLongLead: false,
        leadTimeDays: null,
        enabled: true,
        remark: null,
      },
    );
    setModalOpen(true);
  };

  const handleSave = async () => {
    const body = await form.validateFields();
    try {
      await save.mutateAsync({ id: editing?.id, body });
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  const columns: ColumnsType<MaterialItem> = [
    { title: '物料编码', dataIndex: 'code', width: 150 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '规格型号', dataIndex: 'spec', width: 160, render: (v) => v ?? '—' },
    { title: '单位', dataIndex: 'unit', width: 70 },
    { title: '类别', dataIndex: 'category', width: 100, render: (v) => v ?? '—' },
    {
      title: '标准件',
      dataIndex: 'isStandard',
      width: 80,
      render: (v: boolean) => (v ? '是' : <Tag color="orange">非标</Tag>),
    },
    {
      title: '长周期',
      dataIndex: 'isLongLead',
      width: 110,
      render: (v: boolean, row) =>
        v ? <Tag color="red">长周期{row.leadTimeDays ? ` ${row.leadTimeDays}天` : ''}</Tag> : '—',
    },
    {
      title: '来源/同步时间',
      dataIndex: 'syncedAt',
      width: 160,
      render: (v: string, row) =>
        `${SYNC_SOURCE_LABEL[row.syncSource]} · ${dayjs(v).format('MM-DD HH:mm')}`,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    ...(canWrite
      ? [
          {
            title: '操作',
            width: 70,
            render: (_: unknown, row: MaterialItem) => (
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(row)} />
            ),
          } satisfies ColumnsType<MaterialItem>[number],
        ]
      : []),
  ];

  return (
    <PageContainer
      title="物料主数据"
      subtitle="主数据以 ERP 为准；一期未接 ERP，由采购在此维护或导入。长周期标记用于齐套预警。"
      extra={
        canWrite && (
          <Space>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              批量导入
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>
              新建物料
            </Button>
          </Space>
        )
      }
    >
      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="编码 / 名称 / 规格"
          style={{ width: 260 }}
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
        />
        <Select
          value={longLeadOnly}
          style={{ width: 140 }}
          onChange={(v) => {
            setLongLeadOnly(v);
            setPage(1);
          }}
          options={[
            { value: false, label: '全部物料' },
            { value: true, label: '仅长周期' },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Modal
        open={modalOpen}
        title={editing ? `编辑物料 ${editing.code}` : '新建物料'}
        okText="保存"
        confirmLoading={save.isPending}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="code" label="物料编码" rules={[{ required: true, message: '请输入编码' }]}>
              <Input placeholder="对齐 ERP 编码规则" />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="spec" label="规格型号">
              <Input />
            </Form.Item>
            <Form.Item name="unit" label="单位">
              <Input />
            </Form.Item>
            <Form.Item name="category" label="类别">
              <Input placeholder="机械件 / 电气件 / 管路件…" />
            </Form.Item>
            <Form.Item name="leadTimeDays" label="采购周期（天）">
              <InputNumber min={0} max={3650} className="w-full" />
            </Form.Item>
            <Form.Item name="isStandard" label="标准件" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isLongLead" label="长周期物料" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <PasteImportModal
        open={importOpen}
        title="批量导入物料"
        hint="列顺序：物料编码、名称、规格型号、单位、类别、是否长周期（是/否）、采购周期天数。前两列必填，按编码覆盖更新。"
        loading={importMut.isPending}
        parse={(text) =>
          splitTsv(text)
            .map(([code, name, spec, unit, category, longLead, leadDays]) => ({
              code: code ?? '',
              name: name ?? '',
              spec: spec || null,
              unit: unit || '件',
              category: category || null,
              isLongLead: !!longLead && /是|长/.test(longLead),
              leadTimeDays: leadDays ? Math.round(toNumber(leadDays, 0)) : null,
            }))
            .filter((r) => r.code && r.name)
        }
        onImport={(rows) => importMut.mutateAsync({ items: rows })}
        onClose={() => setImportOpen(false)}
      />
    </PageContainer>
  );
}
