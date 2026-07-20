import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DeleteOutlined,
  FileOutlined,
  FileTextOutlined,
  FileZipOutlined,
  PlaySquareOutlined,
} from '@ant-design/icons';
import { App, Image, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  FEEDBACK_SEVERITY_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPE_LABEL,
  type AttachmentItem,
  type FeedbackSeverity,
  type FeedbackStatus,
  type FeedbackType,
} from '@mes/shared';
import { feedbackAttachmentUrl } from '@/api/feedback';

export const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('MM-DD HH:mm') : '—');

/** 相对时间：通知与对话流的时间展示。超过一周退回绝对时间。 */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

const TYPE_COLOR: Record<FeedbackType, string> = {
  BUG: 'volcano',
  UI: 'geekblue',
  SUGGESTION: 'gold',
  OTHER: 'default',
};

export function FeedbackTypeTag({ type }: { type: FeedbackType }) {
  return <Tag color={TYPE_COLOR[type]}>{FEEDBACK_TYPE_LABEL[type]}</Tag>;
}

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  OPEN: 'error',
  PROCESSING: 'processing',
  RESOLVED: 'success',
  REJECTED: 'default',
};

export function FeedbackStatusTag({ status }: { status: FeedbackStatus }) {
  return <Tag color={STATUS_COLOR[status]}>{FEEDBACK_STATUS_LABEL[status]}</Tag>;
}

const SEVERITY_COLOR: Record<FeedbackSeverity, string> = {
  BLOCKER: 'red',
  NORMAL: 'orange',
  MINOR: 'default',
};

export function FeedbackSeverityTag({ severity }: { severity: FeedbackSeverity }) {
  return <Tag color={SEVERITY_COLOR[severity]}>{FEEDBACK_SEVERITY_LABEL[severity]}</Tag>;
}

// ============================================================
//  本地附件收集（提交/回复前的暂存）：校验、预览、粘贴
// ============================================================

/** 与后端 FeedbackAttachmentService 同一张白名单。 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const FILE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'log', 'md',
  'zip', '7z',
  'mp4', 'webm',
]);
const MAX_FILE_MB = 15;

export const FEEDBACK_ACCEPT = [...FILE_EXTENSIONS].map((e) => `.${e}`).join(',');

export interface PendingFile {
  uid: string;
  file: File;
  /** 图片的本地预览 URL（objectURL，由 hook 负责 revoke）。 */
  previewUrl: string | null;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let uidSeq = 0;

/** 暂存附件列表：add 时做白名单/大小/数量校验，卸载与 clear 时回收 objectURL。 */
export function usePendingFiles(maxCount: number) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(
    () => () => {
      for (const f of filesRef.current) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    },
    [],
  );

  const add = useCallback(
    (incoming: File[]) => {
      setFiles((prev) => {
        const next = [...prev];
        for (const file of incoming) {
          if (next.length >= maxCount) {
            message.warning(`最多 ${maxCount} 个附件`);
            break;
          }
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          if (!FILE_EXTENSIONS.has(ext)) {
            message.error(`「${file.name}」类型不支持（图片 / 文档 / 压缩包 / 录屏）`);
            continue;
          }
          if (file.size > MAX_FILE_MB * 1024 * 1024) {
            message.error(`「${file.name}」超出 ${MAX_FILE_MB}MB 上限`);
            continue;
          }
          next.push({
            uid: `pf-${Date.now()}-${uidSeq++}`,
            file,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          });
        }
        return next;
      });
    },
    [maxCount, message],
  );

  const remove = useCallback((uid: string) => {
    setFiles((prev) => {
      const hit = prev.find((f) => f.uid === uid);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((f) => f.uid !== uid);
    });
  }, []);

  const clear = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return [];
    });
  }, []);

  return { files, add, remove, clear };
}

/**
 * 从粘贴事件提取图片文件（截图 Ctrl+V 直接变附件）。
 * 剪贴板同时有文字时不 preventDefault——不干扰正常的文本粘贴。
 */
export function extractPastedImages(e: React.ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  const images = items
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
  if (!images.length) return [];
  const hasText = items.some((i) => i.kind === 'string' && i.type === 'text/plain');
  if (!hasText) e.preventDefault();
  const stamp = dayjs().format('HHmmss');
  return images.map((f, idx) => {
    const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const suffix = images.length > 1 ? `-${idx + 1}` : '';
    return new File([f], `截图-${stamp}${suffix}.${ext}`, { type: f.type });
  });
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'zip' || ext === '7z') return <FileZipOutlined />;
  if (ext === 'mp4' || ext === 'webm') return <PlaySquareOutlined />;
  if (ext === 'txt' || ext === 'log' || ext === 'md' || ext === 'csv') return <FileTextOutlined />;
  return <FileOutlined />;
}

/** 暂存附件的缩略展示：图片方块 + 文件胶囊，紧凑一行 wrap。 */
export function PendingFileList({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (uid: string) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) =>
        f.previewUrl ? (
          <div key={f.uid} className="group relative h-16 w-16 shrink-0">
            <img
              src={f.previewUrl}
              alt={f.file.name}
              className="h-full w-full rounded-lg border border-slate-200 object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(f.uid)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-0 bg-slate-700/80 text-[10px] text-white opacity-0 transition-opacity hover:bg-rose-500 group-hover:opacity-100"
              aria-label="移除"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={f.uid}
            className="flex h-9 max-w-56 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600"
          >
            <span className="text-slate-400">{fileIcon(f.file.name)}</span>
            <span className="truncate" title={f.file.name}>
              {f.file.name}
            </span>
            <span className="shrink-0 text-[11px] text-slate-400">{fmtSize(f.file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(f.uid)}
              className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-slate-400 hover:text-rose-500"
              aria-label="移除"
            >
              <DeleteOutlined />
            </button>
          </div>
        ),
      )}
    </div>
  );
}

/** 已上传附件展示：图片缩略墙（可预览大图）+ 文件胶囊（点击下载）。 */
export function AttachmentGallery({
  attachments,
  size = 64,
}: {
  attachments: AttachmentItem[];
  size?: number;
}) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/'));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {images.length > 0 && (
        <Image.PreviewGroup>
          {images.map((a) => (
            <Image
              key={a.id}
              src={feedbackAttachmentUrl(a.id)}
              alt={a.fileName}
              width={size}
              height={size}
              className="rounded-lg border border-slate-200 object-cover"
            />
          ))}
        </Image.PreviewGroup>
      )}
      {others.map((a) => (
        <Tooltip key={a.id} title={`${a.fileName} · ${fmtSize(a.fileSize)}，点击下载`}>
          <a
            href={feedbackAttachmentUrl(a.id, false)}
            className="flex h-9 max-w-56 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 no-underline transition-colors hover:border-industrial-300 hover:text-industrial-600"
          >
            <span className="text-slate-400">{fileIcon(a.fileName)}</span>
            <span className="truncate">{a.fileName}</span>
          </a>
        </Tooltip>
      ))}
    </div>
  );
}
