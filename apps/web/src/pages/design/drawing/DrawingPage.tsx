import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  DownloadOutlined,
  EyeOutlined,
  InboxOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  DRAWING_STATUS_LABEL,
  DrawingStatus,
  type DrawingItem,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import { downloadDrawing, useDrawings, useUploadDrawing, useVoidDrawing } from '@/api/bom';
import { useProjects } from '@/api/project';
import { useAuthStore } from '@/stores/auth';
import { PageContainer } from '../../system/PageContainer';

const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—');

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 浏览器能直接渲染的类型才提供预览；CAD/压缩包只能下载。 */
function canPreview(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export default function DrawingPage() {
  const { message, modal } = App.useApp();
  const canWrite = useAuthStore((s) => s.hasPermission('drawing:write'));
  const canDownload = useAuthStore((s) => s.hasPermission('drawing:download'));

  const { data: projectPage } = useProjects({ page: 1, pageSize: 100 });
  const [projectId, setProjectId] = useState<string>();
  const projectOptions = useMemo(
    () =>
      (projectPage?.items ?? [])
        .filter((p) => p.status !== 'VOIDED')
        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projectPage],
  );
  const effectiveProjectId = projectId ?? projectOptions[0]?.value;

  const [status, setStatus] = useState<DrawingStatus>();
  const [keyword, setKeyword] = useState('');

  const { data: drawings, isFetching } = useDrawings(
    effectiveProjectId
      ? { projectId: effectiveProjectId, status, keyword: keyword || undefined }
      : undefined,
  );

  const voidDrawing = useVoidDrawing();
  const [uploadOpen, setUploadOpen] = useState(false);

  const doDownload = async (d: DrawingItem, inline: boolean) => {
    try {
      await downloadDrawing(d, inline);
      if (!inline) message.success('已开始下载');
    } catch (err) {
      message.error(isApiError(err) ? err.message : '下载失败');
    }
  };

  const columns: ColumnsType<DrawingItem> = [
    { title: '图号', dataIndex: 'code', width: 150 },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: '版本', dataIndex: 'version', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: DrawingStatus) => (
        <Tag color={s === DrawingStatus.ACTIVE ? 'green' : 'red'}>{DRAWING_STATUS_LABEL[s]}</Tag>
      ),
    },
    {
      title: '文件',
      dataIndex: 'fileName',
      ellipsis: true,
      render: (v: string, d) => (
        <Typography.Text ellipsis={{ tooltip: v }}>
          {v} <span className="text-xs text-gray-400">({fmtSize(d.fileSize)})</span>
        </Typography.Text>
      ),
    },
    { title: '上传人', dataIndex: 'uploadedByName', width: 100, render: (v) => v ?? '—' },
    { title: '上传时间', dataIndex: 'createdAt', width: 150, render: fmtTime },
    {
      title: '操作',
      width: 150,
      render: (_: unknown, d) => (
        <Space size={0}>
          {canDownload && canPreview(d.mimeType) && (
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              title="预览"
              onClick={() => void doDownload(d, true)}
            />
          )}
          {canDownload && (
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              title="下载"
              onClick={() => void doDownload(d, false)}
            />
          )}
          {canWrite && d.status === DrawingStatus.ACTIVE && (
            <Button
              type="text"
              size="small"
              danger
              icon={<StopOutlined />}
              title="作废"
              onClick={() =>
                modal.confirm({
                  title: `作废图纸 ${d.code} ${d.version}？`,
                  content: '作废后现场不可见、不可下载；文件保留用于历史追溯。',
                  okText: '作废',
                  okButtonProps: { danger: true },
                  onOk: () =>
                    voidDrawing
                      .mutateAsync(d.id)
                      .then(() => message.success('已作废'))
                      .catch((err) =>
                        message.error(isApiError(err) ? err.message : '操作失败'),
                      ),
                })
              }
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="图纸管理"
      subtitle="图纸版本沿用设计端编号。上传同图号新版本时旧版自动作废；下载与预览均记录审计日志。"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="!w-80"
          placeholder="选择项目"
          showSearch
          optionFilterProp="label"
          value={effectiveProjectId}
          onChange={setProjectId}
          options={projectOptions}
        />
        {canWrite && (
          <Select
            className="!w-32"
            allowClear
            placeholder="全部状态"
            value={status}
            onChange={setStatus}
            options={Object.values(DrawingStatus).map((s) => ({
              value: s,
              label: DRAWING_STATUS_LABEL[s],
            }))}
          />
        )}
        <Input.Search
          className="!w-64"
          placeholder="搜索图号 / 名称 / 文件名"
          allowClear
          onSearch={setKeyword}
        />
        <div className="flex-1" />
        {canWrite && effectiveProjectId && (
          <Button
            type="primary"
            size="small"
            icon={<UploadOutlined />}
            onClick={() => setUploadOpen(true)}
          >
            上传图纸
          </Button>
        )}
      </div>

      {!effectiveProjectId ? (
        <Empty description="请先在上方选择项目" />
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={isFetching}
          columns={columns}
          dataSource={drawings ?? []}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无图纸" /> }}
        />
      )}

      {effectiveProjectId && (
        <UploadModal
          projectId={effectiveProjectId}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </PageContainer>
  );
}

// ============================================================
//  上传弹窗
// ============================================================

function UploadModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const upload = useUploadDrawing();
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const submit = async () => {
    const v = await form.validateFields();
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('请选择要上传的文件');
      return;
    }
    try {
      const result = await upload.mutateAsync({
        fields: {
          projectId,
          code: v.code,
          name: v.name,
          version: v.version,
          remark: v.remark || undefined,
        },
        file,
      });
      message.success(
        result.supersededCount > 0
          ? `上传成功，旧版本 ${result.supersededCount} 个已自动作废`
          : '上传成功',
      );
      form.resetFields();
      setFileList([]);
      onClose();
    } catch (err) {
      message.error(isApiError(err) ? err.message : '上传失败');
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      title="上传图纸"
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={upload.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" className="mt-4" preserve={false}>
        <Upload.Dragger
          maxCount={1}
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: fl }) => {
            setFileList(fl);
            // 名称未填时用文件名（去扩展名）代入，少敲一次键盘
            const name = fl[0]?.name?.replace(/\.[^.]+$/, '');
            if (name && !form.getFieldValue('name')) form.setFieldsValue({ name });
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处</p>
          <p className="ant-upload-hint text-xs">
            支持 PDF / DWG / DXF / STEP / 图片 / Office / 压缩包
          </p>
        </Upload.Dragger>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Form.Item
            name="code"
            label="图号"
            rules={[{ required: true, message: '请输入图号' }]}
          >
            <Input placeholder="如 WET-2026-A-001" />
          </Form.Item>
          <Form.Item
            name="version"
            label="版本"
            rules={[{ required: true, message: '请输入设计端版本号' }]}
          >
            <Input placeholder="如 A / B / V2" />
          </Form.Item>
        </div>
        <Form.Item
          name="name"
          label="图纸名称"
          rules={[{ required: true, message: '请输入图纸名称' }]}
        >
          <Input placeholder="如 主槽体装配图" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
