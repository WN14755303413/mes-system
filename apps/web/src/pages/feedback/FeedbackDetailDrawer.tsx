import { useState } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  PaperClipOutlined,
  RedoOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Avatar, Button, Drawer, Empty, Input, Modal, Popconfirm, Spin, Tooltip, Upload } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
  FEEDBACK_ACTION_LABEL,
  FEEDBACK_ACTION_RULES,
  type FeedbackActionItem,
  type FeedbackDetail,
  type FeedbackStatus,
} from '@mes/shared';
import { isApiError } from '@/api/client';
import {
  uploadFeedbackAttachment,
  useFeedbackDetail,
  useReplyFeedback,
  useTransitionFeedback,
} from '@/api/feedback';
import { useAuthStore } from '@/stores/auth';
import {
  AttachmentGallery,
  FEEDBACK_ACCEPT,
  FeedbackSeverityTag,
  FeedbackStatusTag,
  FeedbackTypeTag,
  PendingFileList,
  extractPastedImages,
  fmtTime,
  timeAgo,
  usePendingFiles,
} from './shared';

type NoteAction = 'RESOLVE' | 'REJECT' | 'REOPEN';

const NOTE_ACTION_META: Record<NoteAction, { title: string; placeholder: string; okText: string }> = {
  RESOLVE: { title: '标记为已解决', placeholder: '处理说明：改了什么 / 结论是什么（提交人会收到通知）', okText: '确认解决' },
  REJECT: { title: '驳回反馈', placeholder: '驳回原因：无法复现 / 与预期一致 / 重复反馈…', okText: '确认驳回' },
  REOPEN: { title: '重新打开', placeholder: '说明未解决的情况，处理人会收到通知', okText: '重新打开' },
};

const allow = (action: keyof typeof FEEDBACK_ACTION_RULES, status: FeedbackStatus): boolean =>
  FEEDBACK_ACTION_RULES[action].from.includes(status);

/** 状态动作行：居中细字 + 可选的说明块（解决说明/驳回原因/重开原因）。 */
function ActionDivider({ action }: { action: FeedbackActionItem }) {
  return (
    <div className="my-3 text-center">
      <span className="text-xs text-slate-400">
        {action.operatorName ?? '系统'} {FEEDBACK_ACTION_LABEL[action.type]} · {timeAgo(action.createdAt)}
      </span>
      {action.note && (
        <div className="mx-auto mt-1.5 max-w-md rounded-lg bg-slate-100/80 px-3 py-1.5 text-xs leading-5 text-slate-500">
          {action.note}
        </div>
      )}
    </div>
  );
}

/** 回复气泡：提交人居左（白底描边），处理侧居右（工业蓝浅底）。 */
function ReplyBubble({ action }: { action: FeedbackActionItem }) {
  const mine = !action.bySubmitter;
  return (
    <div className={`my-2.5 flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <Avatar
        size={28}
        className={`shrink-0 !text-xs ${
          mine
            ? '!bg-gradient-to-br !from-industrial-400 !to-industrial-600'
            : '!bg-slate-300 !text-slate-600'
        }`}
      >
        {action.operatorName?.[0] ?? <UserOutlined />}
      </Avatar>
      <div className={`max-w-[78%] ${mine ? 'text-right' : ''}`}>
        <div className={`mb-1 text-[11px] text-slate-400 ${mine ? 'mr-0.5' : 'ml-0.5'}`}>
          {action.operatorName ?? '—'} · {timeAgo(action.createdAt)}
        </div>
        <div
          className={`inline-block rounded-xl px-3 py-2 text-left text-[13px] leading-5.5 ${
            mine
              ? 'rounded-tr-sm bg-industrial-50 text-slate-700'
              : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
          }`}
        >
          <span className="whitespace-pre-wrap break-words">{action.note}</span>
          {action.attachments.length > 0 && (
            <div className="mt-2">
              <AttachmentGallery attachments={action.attachments} size={56} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedbackDetailDrawer({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const canManage = useAuthStore((s) => s.hasPermission('feedback:manage'));

  const { data, isLoading } = useFeedbackDetail(id);
  const reply = useReplyFeedback();
  const transition = useTransitionFeedback();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const pending = usePendingFiles(4);
  const [sending, setSending] = useState(false);
  const [noteAction, setNoteAction] = useState<NoteAction>();
  const [noteText, setNoteText] = useState('');

  const isSubmitter = !!data && data.submitterId === user?.id;

  const handlePaste = (e: React.ClipboardEvent) => {
    const images = extractPastedImages(e);
    if (images.length) {
      pending.add(images);
      message.success('已添加截图');
    }
  };

  const send = async () => {
    if (!id || !text.trim()) return;
    setSending(true);
    try {
      const { actionId } = await reply.mutateAsync({ id, body: { note: text.trim() } });
      if (pending.files.length) {
        const results = await Promise.allSettled(
          pending.files.map((f) => uploadFeedbackAttachment(id, f.file, actionId)),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed) message.warning(`回复已发送，${failed} 个附件上传失败`);
        // reply 的 invalidate 发生在附件上传前，这里补一次让气泡里的图立即出现
        void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      }
      setText('');
      pending.clear();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const doTransition = async (type: NoteAction | 'START', note?: string) => {
    if (!id) return;
    try {
      await transition.mutateAsync({ id, body: { type, note: note ?? null } });
      message.success(type === 'START' ? '已接单' : NOTE_ACTION_META[type as NoteAction].title.replace(/^标记为/, '已'));
      setNoteAction(undefined);
      setNoteText('');
    } catch (e) {
      message.error(isApiError(e) ? e.message : '操作失败');
    }
  };

  const renderTimeline = (d: FeedbackDetail) => {
    const flow = d.actions.filter((a) => a.type !== 'CREATE');
    if (!flow.length) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无处理动态——回复或状态变化都会显示在这里"
          className="!my-8"
        />
      );
    }
    return flow.map((a) =>
      a.type === 'REPLY' ? <ReplyBubble key={a.id} action={a} /> : <ActionDivider key={a.id} action={a} />,
    );
  };

  return (
    <Drawer
      maskClosable={false}
      keyboard={false}
      open={!!id}
      onClose={onClose}
      width={640}
      destroyOnHidden
      title={
        data ? (
          <span className="flex items-center gap-2.5">
            <span className="font-mono text-[15px]">{data.code}</span>
            <FeedbackStatusTag status={data.status} />
          </span>
        ) : (
          '反馈详情'
        )
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
      {isLoading || !data ? (
        <div className="flex h-48 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {/* 头部信息 */}
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <h2 className="m-0 text-base font-semibold leading-6 text-slate-800">{data.title}</h2>
              <span className="flex shrink-0 gap-1">
                <FeedbackTypeTag type={data.type} />
                <FeedbackSeverityTag severity={data.severity} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                {data.submitterName} 提交于 {fmtTime(data.createdAt)}
              </span>
              {data.handlerName && <span>处理人：{data.handlerName}</span>}
              {data.pageTitle && (
                <Tooltip title={data.clientInfo ? `${data.pagePath}\n${data.clientInfo}` : data.pagePath}>
                  <span className="cursor-default">
                    <EnvironmentOutlined className="mr-0.5" />
                    来自「{data.pageTitle}」
                  </span>
                </Tooltip>
              )}
            </div>

            {/* 描述与主附件 */}
            {(data.description || data.attachments.length > 0) && (
              <div className="mt-4 rounded-xl bg-slate-50/80 px-4 py-3">
                {data.description && (
                  <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-600">
                    {data.description}
                  </p>
                )}
                {data.attachments.length > 0 && (
                  <div className={data.description ? 'mt-3' : ''}>
                    <AttachmentGallery attachments={data.attachments} />
                  </div>
                )}
              </div>
            )}

            {/* 对话与流转时间线 */}
            <div className="mt-5">{renderTimeline(data)}</div>
          </div>

          {/* 底部：回复框 + 动作 */}
          <div className="shrink-0 border-t border-slate-100 px-6 py-4" onPaste={handlePaste}>
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 5 }}
              maxLength={2000}
              placeholder={
                isSubmitter
                  ? '补充说明或回复处理人…（截图可 Ctrl+V 粘贴）'
                  : '回复提交人…（截图可 Ctrl+V 粘贴）'
              }
            />
            {pending.files.length > 0 && (
              <div className="mt-2">
                <PendingFileList files={pending.files} onRemove={pending.remove} />
              </div>
            )}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Upload
                multiple
                accept={FEEDBACK_ACCEPT}
                showUploadList={false}
                beforeUpload={(file, fileList) => {
                  if (fileList[0] === file) pending.add(fileList);
                  return false;
                }}
              >
                <Button size="small" type="text" icon={<PaperClipOutlined />} className="!text-slate-400">
                  附件
                </Button>
              </Upload>

              <div className="flex items-center gap-2">
                {canManage && allow('START', data.status) && (
                  <Popconfirm title="接单后由你跟进这条反馈？" onConfirm={() => void doTransition('START')}>
                    <Button size="small" type="primary" ghost>
                      接单
                    </Button>
                  </Popconfirm>
                )}
                {canManage && allow('RESOLVE', data.status) && (
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    className="!border-emerald-200 !text-emerald-600 hover:!border-emerald-400"
                    onClick={() => setNoteAction('RESOLVE')}
                  >
                    解决
                  </Button>
                )}
                {canManage && allow('REJECT', data.status) && (
                  <Button size="small" icon={<CloseCircleOutlined />} danger ghost onClick={() => setNoteAction('REJECT')}>
                    驳回
                  </Button>
                )}
                {isSubmitter && allow('REOPEN', data.status) && (
                  <Button size="small" icon={<RedoOutlined />} onClick={() => setNoteAction('REOPEN')}>
                    重新打开
                  </Button>
                )}
                <Button
                  size="small"
                  type="primary"
                  icon={<SendOutlined />}
                  loading={sending}
                  disabled={!text.trim()}
                  onClick={() => void send()}
                >
                  发送
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 状态动作的说明弹窗（解决/驳回/重开均必填说明） */}
      <Modal
        maskClosable={false}
        keyboard={false}
        open={!!noteAction}
        title={noteAction ? NOTE_ACTION_META[noteAction].title : ''}
        okText={noteAction ? NOTE_ACTION_META[noteAction].okText : '确定'}
        confirmLoading={transition.isPending}
        onOk={() => {
          if (!noteText.trim()) {
            message.warning('请填写说明');
            return;
          }
          void doTransition(noteAction!, noteText.trim());
        }}
        onCancel={() => {
          setNoteAction(undefined);
          setNoteText('');
        }}
        width={440}
      >
        <Input.TextArea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={noteAction ? NOTE_ACTION_META[noteAction].placeholder : ''}
        />
      </Modal>
    </Drawer>
  );
}
