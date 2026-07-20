import { useMemo, useState } from 'react';
import { App, Form, Input, Modal, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { TaskWithContextRow } from '@mes/shared';
import { isApiError } from '@/api/client';
import { uploadExceptionPhoto, useCreateException } from '@/api/production';
import { useProjects } from '@/api/project';

interface FormValues {
  projectId?: string;
  materialCode?: string | null;
  title: string;
  description?: string | null;
}

/**
 * 提交现场异常（§9.6：选择项目/工序/物料 + 照片说明）。
 * 从「现场报工」进入时带任务上下文（prefillTask），项目/工单自动归属；
 * 独立提交时选择项目。照片在异常创建成功后逐张上传。
 */
export function ExceptionCreateModal({
  open,
  prefillTask,
  onClose,
}: {
  open: boolean;
  prefillTask?: TaskWithContextRow | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const create = useCreateException();

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const projectOptions = useMemo(
    () => (projectPage?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );

  const afterOpenChange = (visible: boolean) => {
    if (!visible) return;
    form.resetFields();
    setFiles([]);
  };

  const handleOk = async () => {
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      const created = await create.mutateAsync({
        ...(prefillTask ? { taskId: prefillTask.id } : { projectId: v.projectId }),
        materialCode: v.materialCode || null,
        title: v.title,
        description: v.description || null,
      });

      // 照片逐张上传；个别失败不阻断整单，提示补传即可
      let failed = 0;
      for (const f of files) {
        if (!f.originFileObj) continue;
        try {
          await uploadExceptionPhoto(created.id, f.originFileObj);
        } catch {
          failed += 1;
        }
      }
      message.success(
        `异常单 ${created.code} 已提交${failed ? `，${failed} 张照片上传失败，可稍后在详情中补传` : ''}`,
      );
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      title="上报现场异常"
      okText="提交"
      confirmLoading={submitting}
      afterOpenChange={afterOpenChange}
      onOk={() => void handleOk()}
      onCancel={onClose}
    >
      {prefillTask && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          任务：{prefillTask.name} · 工单 {prefillTask.workOrderCode} · 项目{' '}
          {prefillTask.projectCode} {prefillTask.projectName}
        </div>
      )}
      <Form form={form} layout="vertical">
        {!prefillTask && (
          <Form.Item
            name="projectId"
            label="所属项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select showSearch optionFilterProp="label" options={projectOptions} placeholder="选择项目" />
          </Form.Item>
        )}
        <Form.Item name="title" label="异常标题" rules={[{ required: true, message: '请简述异常' }]}>
          <Input placeholder="如：主轴承座安装孔位偏差" maxLength={128} />
        </Form.Item>
        <Form.Item name="materialCode" label="涉及物料编码">
          <Input placeholder="可选，供质量追溯反查" maxLength={64} />
        </Form.Item>
        <Form.Item name="description" label="详细说明">
          <Input.TextArea rows={3} maxLength={2000} placeholder="现象、位置、影响范围…" />
        </Form.Item>
        <Form.Item label="现场照片" tooltip="最多 9 张，仅图片格式">
          <Upload
            listType="picture-card"
            fileList={files}
            accept="image/*"
            maxCount={9}
            beforeUpload={() => false}
            onChange={({ fileList }) => setFiles(fileList)}
          >
            {files.length < 9 && (
              <div>
                <PlusOutlined />
                <div className="mt-1 text-xs">添加</div>
              </div>
            )}
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}
