import { useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  INSPECTION_TYPE_LABEL,
  INSPECTION_TYPE_META,
  InspectionType,
  type InspectionDetail,
  type InspectionItemInput,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { useWorkOrderDetail, useWorkOrders } from '@/api/production';
import { useProjects } from '@/api/project';
import { useCreateInspection, useUpdateInspection } from '@/api/quality';

interface HeaderFormValues {
  type: InspectionType;
  title: string;
  projectId?: string;
  workOrderId?: string;
  taskId?: string;
  materialCode?: string;
  batchNo?: string;
  supplierName?: string;
  remark?: string;
}

/** 明细行的本地编辑态（带临时 key）。 */
interface EditableItem extends InspectionItemInput {
  key: string;
}

let itemKeySeed = 0;
const nextItemKey = () => `item-${++itemKeySeed}`;

const EMPTY_ITEM = (): EditableItem => ({
  key: nextItemKey(),
  name: '',
  standard: null,
  actual: null,
  passed: null,
  remark: null,
});

/**
 * 创建/编辑检验单（编辑仅限待检态，由入口控制）。
 * 类型决定必填关联维度（shared INSPECTION_TYPE_META，与后端同一张表）；
 * 检验项明细行在本地编辑，提交时整体上送（后端全量替换）。
 */
export function InspectionFormModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  /** 编辑模式传入详情；创建传 null。 */
  editing: InspectionDetail | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<HeaderFormValues>();
  const [items, setItems] = useState<EditableItem[]>([]);
  const create = useCreateInspection();
  const update = useUpdateInspection();

  const type = Form.useWatch('type', form) ?? InspectionType.IQC;
  const projectId = Form.useWatch('projectId', form);
  const workOrderId = Form.useWatch('workOrderId', form);
  const requires = INSPECTION_TYPE_META[type].requires;

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const needWorkOrder = requires.includes('workOrderId');
  const { data: workOrderPage } = useWorkOrders(
    needWorkOrder ? { projectId, page: 1, pageSize: 100 } : { page: 1, pageSize: 1 },
  );
  const workOrderOptions = useMemo(
    () => (workOrderPage?.items ?? []).map((w) => ({ value: w.id, label: `${w.code} ${w.name}` })),
    [workOrderPage],
  );

  const { data: workOrderDetail } = useWorkOrderDetail(needWorkOrder ? workOrderId : undefined);
  const taskOptions = useMemo(
    () => (workOrderDetail?.tasks ?? []).map((t) => ({ value: t.id, label: `${t.seq}. ${t.name}` })),
    [workOrderDetail],
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        type: editing.type,
        title: editing.title,
        projectId: editing.projectId ?? undefined,
        workOrderId: editing.workOrderId ?? undefined,
        taskId: editing.taskId ?? undefined,
        materialCode: editing.materialCode ?? undefined,
        batchNo: editing.batchNo ?? undefined,
        supplierName: editing.supplierName ?? undefined,
        remark: editing.remark ?? undefined,
      });
      setItems(
        editing.items.map((it) => ({
          key: nextItemKey(),
          name: it.name,
          standard: it.standard,
          actual: it.actual,
          passed: it.passed,
          remark: it.remark,
        })),
      );
    } else {
      form.resetFields();
      setItems([EMPTY_ITEM()]);
    }
  }, [open, editing, form]);

  const patchItem = (key: string, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const itemColumns: ColumnsType<EditableItem> = [
    {
      title: '检验项目',
      dataIndex: 'name',
      width: 180,
      render: (_, r) => (
        <Input
          size="small"
          value={r.name}
          maxLength={128}
          placeholder="如：外观 / 尺寸 φ50±0.02"
          onChange={(e) => patchItem(r.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: '标准要求',
      dataIndex: 'standard',
      width: 160,
      render: (_, r) => (
        <Input
          size="small"
          value={r.standard ?? ''}
          maxLength={512}
          onChange={(e) => patchItem(r.key, { standard: e.target.value || null })}
        />
      ),
    },
    {
      title: '实测 / 实况',
      dataIndex: 'actual',
      width: 160,
      render: (_, r) => (
        <Input
          size="small"
          value={r.actual ?? ''}
          maxLength={512}
          onChange={(e) => patchItem(r.key, { actual: e.target.value || null })}
        />
      ),
    },
    {
      title: '判定',
      dataIndex: 'passed',
      width: 100,
      render: (_, r) => (
        <Select
          size="small"
          className="w-full"
          value={r.passed === null || r.passed === undefined ? 'NA' : r.passed ? 'PASS' : 'FAIL'}
          onChange={(v) => patchItem(r.key, { passed: v === 'NA' ? null : v === 'PASS' })}
          options={[
            { value: 'NA', label: '未判定' },
            { value: 'PASS', label: '合格' },
            { value: 'FAIL', label: '不合格' },
          ]}
        />
      ),
    },
    {
      title: '',
      key: 'op',
      width: 40,
      render: (_, r) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setItems((prev) => prev.filter((it) => it.key !== r.key))}
        />
      ),
    },
  ];

  const handleOk = async () => {
    const v = await form.validateFields();
    const validItems = items.filter((it) => it.name.trim());
    if (items.some((it) => !it.name.trim() && (it.standard || it.actual))) {
      message.warning('存在未填写「检验项目」名称的明细行');
      return;
    }
    const payloadItems: InspectionItemInput[] = validItems.map((it) => ({
      name: it.name.trim(),
      standard: it.standard?.trim() || null,
      actual: it.actual?.trim() || null,
      passed: it.passed ?? null,
      remark: it.remark?.trim() || null,
    }));

    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: {
            title: v.title,
            materialCode: v.materialCode || null,
            batchNo: v.batchNo || null,
            supplierName: v.supplierName || null,
            remark: v.remark || null,
            items: payloadItems,
          },
        });
        message.success('检验单已更新');
      } else {
        const created = await create.mutateAsync({
          type: v.type,
          title: v.title,
          projectId: v.projectId || null,
          workOrderId: v.workOrderId || null,
          taskId: v.taskId || null,
          materialCode: v.materialCode || null,
          batchNo: v.batchNo || null,
          supplierName: v.supplierName || null,
          remark: v.remark || null,
          items: payloadItems,
        });
        message.success(`检验单 ${created.code} 已创建`);
      }
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '保存失败');
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      width={860}
      title={editing ? `编辑检验单 ${editing.code}` : '新建检验单'}
      okText={editing ? '保存' : '创建'}
      confirmLoading={create.isPending || update.isPending}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" className="mt-2">
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="type" label="检验类型" initialValue={InspectionType.IQC}>
            <Select
              disabled={!!editing}
              options={Object.entries(INSPECTION_TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="检验对象说明"
            rules={[{ required: true, message: '请填写检验对象' }]}
          >
            <Input maxLength={128} placeholder="如：气动隔膜阀 XX 型来料检验" />
          </Form.Item>

          {/* 关联维度按类型显示必填；编辑模式关联不可改（追溯锚点） */}
          {!editing && (
            <>
              <Form.Item
                name="projectId"
                label="所属项目"
                rules={
                  requires.includes('projectId')
                    ? [{ required: true, message: '该检验类型必须关联项目' }]
                    : undefined
                }
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={projectOptions}
                  placeholder={requires.includes('projectId') ? '必选' : '可选（IQC 通用物料可不选）'}
                />
              </Form.Item>
              {needWorkOrder && (
                <>
                  <Form.Item
                    name="workOrderId"
                    label="关联工单"
                    rules={[{ required: true, message: '该检验类型必须关联工单' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={workOrderOptions}
                      placeholder="选择工单（项目自动归属）"
                      onChange={() => form.setFieldValue('taskId', undefined)}
                    />
                  </Form.Item>
                  <Form.Item name="taskId" label="关联装配任务">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={taskOptions}
                      placeholder="可选，精确到工序任务"
                      disabled={!workOrderId}
                    />
                  </Form.Item>
                </>
              )}
            </>
          )}

          <Form.Item
            name="materialCode"
            label="物料编码"
            rules={
              requires.includes('materialCode')
                ? [{ required: true, message: '来料检验必须填写物料编码' }]
                : undefined
            }
          >
            <Input maxLength={64} placeholder={requires.includes('materialCode') ? '必填' : '可选'} />
          </Form.Item>
          <Form.Item name="batchNo" label="批次 / 序列号">
            <Input maxLength={128} placeholder="可选，质量追溯用；FQC 可记设备号" />
          </Form.Item>
          <Form.Item name="supplierName" label="供应商">
            <Input maxLength={128} placeholder="可选，来料检验追溯用" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input maxLength={2000} placeholder="可选" />
          </Form.Item>
        </div>
      </Form>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">检验项明细（{items.length}）</span>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setItems((prev) => [...prev, EMPTY_ITEM()])}
        >
          添加检验项
        </Button>
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={itemColumns}
        dataSource={items}
        pagination={false}
        scroll={{ y: 260 }}
        locale={{ emptyText: '暂无检验项，可直接创建后再补充' }}
      />
    </Modal>
  );
}
