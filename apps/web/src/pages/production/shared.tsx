import { Tag } from 'antd';
import dayjs from 'dayjs';
import {
  ASSEMBLY_TASK_STATUS_LABEL,
  CRAFT_TYPE_LABEL,
  EXCEPTION_STATUS_LABEL,
  RECORD_STATUS_LABEL,
  type AssemblyTaskStatus,
  type CraftType,
  type ExceptionStatus,
  type RecordStatus,
} from '@mes/shared';

export const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');
export const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('MM-DD HH:mm') : '—');

const CRAFT_COLOR: Record<CraftType, string> = {
  MECH: 'blue',
  ELEC: 'purple',
  PIPE: 'cyan',
  OTHER: 'default',
};

export function CraftTag({ craft }: { craft: CraftType }) {
  return <Tag color={CRAFT_COLOR[craft]}>{CRAFT_TYPE_LABEL[craft]}</Tag>;
}

/** 工单状态（通用 RecordStatus）。 */
const WO_STATUS_COLOR: Partial<Record<RecordStatus, string>> = {
  DRAFT: 'default',
  RELEASED: 'geekblue',
  IN_PROGRESS: 'processing',
  PAUSED: 'warning',
  COMPLETED: 'success',
  CLOSED: 'default',
  VOIDED: 'default',
};

export function WoStatusTag({ status }: { status: string }) {
  const s = status as RecordStatus;
  return <Tag color={WO_STATUS_COLOR[s] ?? 'default'}>{RECORD_STATUS_LABEL[s] ?? status}</Tag>;
}

const TASK_STATUS_COLOR: Record<AssemblyTaskStatus, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  PAUSED: 'warning',
  COMPLETED: 'success',
};

export function TaskStatusTag({ status }: { status: AssemblyTaskStatus }) {
  return <Tag color={TASK_STATUS_COLOR[status]}>{ASSEMBLY_TASK_STATUS_LABEL[status]}</Tag>;
}

const EXCEPTION_STATUS_COLOR: Record<ExceptionStatus, string> = {
  OPEN: 'error',
  HANDLING: 'processing',
  RESOLVED: 'warning',
  CLOSED: 'default',
};

export function ExceptionStatusTag({ status }: { status: ExceptionStatus }) {
  return <Tag color={EXCEPTION_STATUS_COLOR[status]}>{EXCEPTION_STATUS_LABEL[status]}</Tag>;
}

/**
 * 工单状态流转在界面上呈现的动作文案。
 * CHANGING 对工单无业务意义，不提供入口（状态机允许但界面不引导）。
 */
export const WO_STATUS_ACTIONS: { target: RecordStatus; label: string; danger?: boolean }[] = [
  { target: 'RELEASED', label: '下达' },
  { target: 'IN_PROGRESS', label: '开工' },
  { target: 'PAUSED', label: '暂停' },
  { target: 'COMPLETED', label: '完工确认' },
  { target: 'CLOSED', label: '关闭' },
  { target: 'VOIDED', label: '作废', danger: true },
];
