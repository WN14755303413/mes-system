import { Tag } from 'antd';
import dayjs from 'dayjs';
import {
  ACCEPTANCE_STATUS_LABEL,
  ACCEPTANCE_TYPE_LABEL,
  DEBUG_ISSUE_STATUS_LABEL,
  DEBUG_RECORD_STATUS_LABEL,
  DEBUG_STAGE_LABEL,
  DEBUG_TYPE_LABEL,
  ISSUE_SEVERITY_LABEL,
  type AcceptanceStatus,
  type AcceptanceType,
  type DebugIssueStatus,
  type DebugRecordStatus,
  type DebugStage,
  type DebugType,
  type IssueSeverity,
} from '@mes/shared';

export const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('MM-DD HH:mm') : '—');
export const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');

const DEBUG_TYPE_COLOR: Record<DebugType, string> = {
  ELEC: 'gold',
  SOFT: 'geekblue',
  PROC: 'cyan',
};

export function DebugTypeTag({ type }: { type: DebugType }) {
  return <Tag color={DEBUG_TYPE_COLOR[type]}>{DEBUG_TYPE_LABEL[type]}</Tag>;
}

const RECORD_STATUS_COLOR: Record<DebugRecordStatus, string> = {
  IN_PROGRESS: 'processing',
  COMPLETED: 'success',
  VOIDED: 'default',
};

export function DebugRecordStatusTag({ status }: { status: DebugRecordStatus }) {
  return <Tag color={RECORD_STATUS_COLOR[status]}>{DEBUG_RECORD_STATUS_LABEL[status]}</Tag>;
}

const ISSUE_STATUS_COLOR: Record<DebugIssueStatus, string> = {
  OPEN: 'error',
  HANDLING: 'processing',
  RECHECKING: 'warning',
  CLOSED: 'success',
  VOIDED: 'default',
};

export function DebugIssueStatusTag({ status }: { status: DebugIssueStatus }) {
  return <Tag color={ISSUE_STATUS_COLOR[status]}>{DEBUG_ISSUE_STATUS_LABEL[status]}</Tag>;
}

const STAGE_COLOR: Record<DebugStage, string> = {
  DEBUG: 'blue',
  FAT: 'purple',
  SAT: 'magenta',
};

export function StageTag({ stage }: { stage: DebugStage }) {
  return <Tag color={STAGE_COLOR[stage]}>{DEBUG_STAGE_LABEL[stage]}</Tag>;
}

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

export function SeverityTag({ severity }: { severity: IssueSeverity }) {
  return <Tag color={SEVERITY_COLOR[severity]}>{ISSUE_SEVERITY_LABEL[severity]}</Tag>;
}

export function AcceptanceTypeTag({ type }: { type: AcceptanceType }) {
  return <Tag color={type === 'FAT' ? 'purple' : 'magenta'}>{ACCEPTANCE_TYPE_LABEL[type]}</Tag>;
}

const ACCEPTANCE_STATUS_COLOR: Record<AcceptanceStatus, string> = {
  PENDING: 'processing',
  PASSED: 'success',
  CONDITIONAL: 'warning',
  FAILED: 'error',
  VOIDED: 'default',
};

export function AcceptanceStatusTag({ status }: { status: AcceptanceStatus }) {
  return <Tag color={ACCEPTANCE_STATUS_COLOR[status]}>{ACCEPTANCE_STATUS_LABEL[status]}</Tag>;
}

/** 单项判定：true 达标 / false 未达标 / null 未判定。 */
export function ItemPassedTag({ passed }: { passed: boolean | null | undefined }) {
  if (passed === null || passed === undefined) return <Tag>未判定</Tag>;
  return passed ? <Tag color="success">达标</Tag> : <Tag color="error">未达标</Tag>;
}
