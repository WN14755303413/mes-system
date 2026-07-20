import { useMemo } from 'react';
import { App, Form, Input, Modal, Select } from 'antd';
import { ISSUE_SEVERITY_LABEL, type IssueSeverity } from '@mes/shared';
import { isApiError } from '@/api/client';
import { useWorkOrders } from '@/api/production';
import { useProjects } from '@/api/project';
import { useCreateQualityIssue } from '@/api/quality';

interface FormValues {
  title: string;
  description?: string;
  severity: IssueSeverity;
  projectId?: string;
  workOrderId?: string;
  materialCode?: string;
  batchNo?: string;
  supplierName?: string;
}

/**
 * 手动发起质量问题单（§8.7 允许工艺/调试/质量直接开单；
 * 检验不合格的问题单由判定动作自动生成，不走这里）。
 */
export function IssueCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const create = useCreateQualityIssue();

  const projectId = Form.useWatch('projectId', form);
  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const { data: workOrderPage } = useWorkOrders(
    projectId ? { projectId, page: 1, pageSize: 100 } : { page: 1, pageSize: 1 },
  );
  const workOrderOptions = useMemo(
    () => (workOrderPage?.items ?? []).map((w) => ({ value: w.id, label: `${w.code} ${w.name}` })),
    [workOrderPage],
  );

  const handleOk = async () => {
    const v = await form.validateFields();
    try {
      const created = await create.mutateAsync({
        title: v.title,
        description: v.description || null,
        severity: v.severity,
        projectId: v.projectId || null,
        workOrderId: v.workOrderId || null,
        materialCode: v.materialCode || null,
        batchNo: v.batchNo || null,
        supplierName: v.supplierName || null,
      });
      message.success(`质量问题单 ${created.code} 已发起`);
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '发起失败');
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      title="发起质量问题"
      okText="发起"
      confirmLoading={create.isPending}
      afterOpenChange={(visible) => visible && form.resetFields()}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="问题标题" rules={[{ required: true, message: '请简述问题' }]}>
          <Input maxLength={128} placeholder="如：腔体焊缝渗漏" />
        </Form.Item>
        <Form.Item name="severity" label="严重度" initialValue="MEDIUM">
          <Select
            options={Object.entries(ISSUE_SEVERITY_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="projectId" label="所属项目">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={projectOptions}
            placeholder="可选；通用物料问题可不选"
            onChange={() => form.setFieldValue('workOrderId', undefined)}
          />
        </Form.Item>
        <Form.Item name="workOrderId" label="关联工单">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={workOrderOptions}
            placeholder="可选"
            disabled={!projectId}
          />
        </Form.Item>
        <Form.Item name="materialCode" label="物料编码">
          <Input maxLength={64} placeholder="可选，追溯用" />
        </Form.Item>
        <Form.Item name="batchNo" label="批次 / 序列号">
          <Input maxLength={128} placeholder="可选" />
        </Form.Item>
        <Form.Item name="supplierName" label="供应商">
          <Input maxLength={128} placeholder="可选，来料类问题追溯用" />
        </Form.Item>
        <Form.Item name="description" label="问题描述">
          <Input.TextArea rows={3} maxLength={4000} placeholder="现象、位置、影响范围…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
