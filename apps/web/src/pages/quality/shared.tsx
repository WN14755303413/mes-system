import { Tag } from 'antd';
import dayjs from 'dayjs';
import {
  DISPOSITION_TYPE_LABEL,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  ISSUE_SEVERITY_LABEL,
  ISSUE_SOURCE_LABEL,
  QUALITY_ISSUE_STATUS_LABEL,
  type DispositionType,
  type InspectionStatus,
  type InspectionType,
  type IssueSeverity,
  type IssueSource,
  type QualityIssueStatus,
} from '@mes/shared';

export const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('MM-DD HH:mm') : '—');

const INSPECTION_TYPE_COLOR: Record<InspectionType, string> = {
  IQC: 'blue',
  IPQC: 'geekblue',
  ASSY: 'cyan',
  FQC: 'purple',
  DEBUG: 'default',
};

export function InspectionTypeTag({ type }: { type: InspectionType }) {
  return <Tag color={INSPECTION_TYPE_COLOR[type]}>{INSPECTION_TYPE_LABEL[type]}</Tag>;
}

const INSPECTION_STATUS_COLOR: Record<InspectionStatus, string> = {
  PENDING: 'processing',
  PASSED: 'success',
  REJECTED: 'error',
  VOIDED: 'default',
};

export function InspectionStatusTag({ status }: { status: InspectionStatus }) {
  return <Tag color={INSPECTION_STATUS_COLOR[status]}>{INSPECTION_STATUS_LABEL[status]}</Tag>;
}

const ISSUE_STATUS_COLOR: Record<QualityIssueStatus, string> = {
  OPEN: 'error',
  HANDLING: 'processing',
  RECHECKING: 'warning',
  CLOSED: 'success',
  VOIDED: 'default',
};

export function IssueStatusTag({ status }: { status: QualityIssueStatus }) {
  return <Tag color={ISSUE_STATUS_COLOR[status]}>{QUALITY_ISSUE_STATUS_LABEL[status]}</Tag>;
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

export function SourceTag({ source }: { source: IssueSource }) {
  return (
    <Tag color={source === 'INSPECTION' ? 'volcano' : 'default'}>{ISSUE_SOURCE_LABEL[source]}</Tag>
  );
}

export function DispositionTag({ disposition }: { disposition: DispositionType | null }) {
  if (!disposition) return <span>—</span>;
  return <Tag>{DISPOSITION_TYPE_LABEL[disposition]}</Tag>;
}

/** 单项判定：true 合格 / false 不合格 / null 未判定。 */
export function ItemPassedTag({ passed }: { passed: boolean | null }) {
  if (passed === null || passed === undefined) return <Tag>未判定</Tag>;
  return passed ? <Tag color="success">合格</Tag> : <Tag color="error">不合格</Tag>;
}
