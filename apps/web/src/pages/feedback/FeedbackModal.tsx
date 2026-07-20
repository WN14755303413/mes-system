import { useMemo, useState } from 'react';
import {
  BugOutlined,
  BulbOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  LayoutOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { App, Checkbox, Form, Input, Modal, Segmented, Upload } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  FEEDBACK_SEVERITY_LABEL,
  type FeedbackSeverity,
  type FeedbackType,
} from '@mes/shared';
import { uploadFeedbackAttachment, useCreateFeedback } from '@/api/feedback';
import { isApiError } from '@/api/client';
import { findNavPath } from '@/layout/nav';
import {
  FEEDBACK_ACCEPT,
  PendingFileList,
  extractPastedImages,
  usePendingFiles,
} from './shared';

interface FormValues {
  type: FeedbackType;
  severity: FeedbackSeverity;
  title: string;
  description?: string;
}

const TYPE_OPTIONS = [
  { value: 'BUG', label: '功能缺陷', icon: <BugOutlined /> },
  { value: 'UI', label: '界面体验', icon: <LayoutOutlined /> },
  { value: 'SUGGESTION', label: '功能建议', icon: <BulbOutlined /> },
  { value: 'OTHER', label: '其他', icon: <MoreOutlined /> },
];

const SEVERITY_OPTIONS = (Object.entries(FEEDBACK_SEVERITY_LABEL) as [FeedbackSeverity, string][])
  .map(([value, label]) => ({ value, label }));

/**
 * 全局快速反馈（M12）：挂在 AppLayout，任何页面从顶栏一键打开。
 * 截图 Ctrl+V 直接进附件；提交自动附带当前页面与浏览器环境（可取消）。
 * 建单成功后并发上传附件——个别附件失败不影响反馈本身，详情页可再补。
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const location = useLocation();
  const [form] = Form.useForm<FormValues>();
  const create = useCreateFeedback();
  const queryClient = useQueryClient();
  const pending = usePendingFiles(12);
  const [submitting, setSubmitting] = useState(false);
  const [withEnv, setWithEnv] = useState(true);

  const pageTitle = useMemo(
    () => findNavPath(location.pathname).at(-1)?.title ?? '工作台',
    [location.pathname],
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const images = extractPastedImages(e);
    if (images.length) {
      pending.add(images);
      message.success(images.length > 1 ? `已添加 ${images.length} 张截图` : '已添加截图');
    }
  };

  const reset = () => {
    form.resetFields();
    pending.clear();
    setWithEnv(true);
  };

  const handleOk = async () => {
    const v = await form.validateFields();
    setSubmitting(true);
    try {
      const created = await create.mutateAsync({
        title: v.title,
        type: v.type,
        severity: v.severity,
        description: v.description || null,
        pagePath: withEnv ? location.pathname : null,
        pageTitle: withEnv ? pageTitle : null,
        clientInfo: withEnv
          ? `${navigator.userAgent} · ${window.screen.width}×${window.screen.height} · dpr ${window.devicePixelRatio}`
          : null,
      });
      const results = await Promise.allSettled(
        pending.files.map((f) => uploadFeedbackAttachment(created.id, f.file)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      // create 的 invalidate 发生在附件上传前，补一次让列表附件数立即准确
      if (pending.files.length) void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      if (failed) {
        message.warning(`反馈 ${created.code} 已提交，但 ${failed} 个附件上传失败，可在反馈中心补充`);
      } else {
        message.success(`反馈 ${created.code} 已提交，感谢！可在反馈中心查看进展`);
      }
      reset();
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      title="问题反馈"
      okText="提交反馈"
      width={560}
      confirmLoading={submitting}
      afterOpenChange={(visible) => visible && reset()}
      onOk={() => void handleOk()}
      onCancel={onClose}
      destroyOnHidden
    >
      <div onPaste={handlePaste}>
        <Form form={form} layout="vertical" className="[&_.ant-form-item]:mb-3.5">
          <Form.Item name="type" label="反馈类型" initialValue="BUG" className="!mb-2.5">
            <Segmented options={TYPE_OPTIONS} block />
          </Form.Item>
          <Form.Item name="severity" label="影响程度" initialValue="MINOR">
            <Segmented options={SEVERITY_OPTIONS} block />
          </Form.Item>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请用一句话概括问题' }]}
          >
            <Input maxLength={128} placeholder="一句话概括，如：齐套看板导出的 Excel 缺列" />
          </Form.Item>
          <Form.Item name="description" label="详细描述">
            <Input.TextArea
              rows={4}
              maxLength={4000}
              placeholder={'现象是什么？做了哪些操作？期望结果是什么？\n提示：截图可直接 Ctrl+V 粘贴到本窗口'}
            />
          </Form.Item>
          <Form.Item label="截图与附件" className="!mb-2">
            <Upload.Dragger
              multiple
              accept={FEEDBACK_ACCEPT}
              showUploadList={false}
              beforeUpload={(_file, fileList) => {
                // 多选一次性进来：只在首个文件时统一入列，避免逐个触发 N 次
                if (fileList[0] === _file) pending.add(fileList);
                return false;
              }}
              className="[&_.ant-upload-drag]:!py-1"
            >
              <div className="flex items-center justify-center gap-2 py-1.5 text-[13px] text-slate-500">
                <InboxOutlined className="text-lg text-industrial-400" />
                点击或拖入文件，截图可直接 <kbd className="rounded border border-slate-300 bg-slate-50 px-1 text-[11px]">Ctrl+V</kbd> 粘贴
              </div>
            </Upload.Dragger>
          </Form.Item>
          {pending.files.length > 0 && (
            <div className="mb-3">
              <PendingFileList files={pending.files} onRemove={pending.remove} />
            </div>
          )}
        </Form>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <EnvironmentOutlined className="text-industrial-400" />
            提交自「{pageTitle}」
          </span>
          <Checkbox
            checked={withEnv}
            onChange={(e) => setWithEnv(e.target.checked)}
            className="text-xs [&_span]:text-xs [&_span]:text-slate-500"
          >
            附带页面与环境信息，便于定位
          </Checkbox>
        </div>
      </div>
    </Modal>
  );
}
