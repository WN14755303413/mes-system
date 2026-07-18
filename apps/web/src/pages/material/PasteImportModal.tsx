import { useState } from 'react';
import { App, Input, Modal } from 'antd';
import { isApiError } from '@/api/client';

/**
 * 通用「Excel 粘贴导入」弹窗（与 M5 BOM 明细导入同一交互）：
 * 从 Excel 复制 → 粘贴 TSV 文本 → parse 成行数组 → onImport 提交。
 */
export function PasteImportModal<T>({
  open,
  title,
  hint,
  parse,
  onImport,
  onClose,
  loading,
}: {
  open: boolean;
  title: string;
  /** 列顺序说明文案。 */
  hint: string;
  parse: (text: string) => T[];
  onImport: (rows: T[]) => Promise<{ created: number; updated: number }>;
  onClose: () => void;
  loading?: boolean;
}) {
  const { message } = App.useApp();
  const [text, setText] = useState('');

  const handleOk = async () => {
    const rows = parse(text);
    if (!rows.length) {
      message.warning('没有解析到有效数据行');
      return;
    }
    try {
      const { created, updated } = await onImport(rows);
      message.success(`导入完成：新增 ${created} 条，更新 ${updated} 条`);
      setText('');
      onClose();
    } catch (e) {
      message.error(isApiError(e) ? e.message : '导入失败');
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      width={720}
      okText="导入"
      onOk={() => void handleOk()}
      onCancel={onClose}
      confirmLoading={loading}
    >
      <p className="mb-2 text-sm text-slate-500">{hint}</p>
      <Input.TextArea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="从 Excel 复制数据后在此粘贴（制表符分隔）"
      />
    </Modal>
  );
}

/** 按行/制表符拆分粘贴文本，去空行空格。 */
export function splitTsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t').map((c) => c.trim()));
}

/** 宽松数值解析：失败给默认值。 */
export function toNumber(value: string | undefined, fallback: number): number {
  const n = Number(value?.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
