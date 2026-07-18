import { useMemo, useState } from 'react';
import { Empty, Select, Spin, Tag, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  BOM_STATUS_LABEL,
  BomStatus,
  type BomVersionItem,
} from '@mes/shared';
import { useBoms } from '@/api/bom';
import { useProjects } from '@/api/project';
import { PageContainer } from '../../system/PageContainer';
import { BOM_STATUS_COLOR } from '../bom/BomPage';

/** Timeline 圆点颜色按状态映射。 */
const DOT_COLOR: Record<BomStatus, string> = {
  DRAFT: 'gray',
  RELEASED: 'green',
  FROZEN: 'blue',
  CHANGING: 'gold',
  VOIDED: 'red',
};

export default function EcoPage() {
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

  const { data: boms, isFetching } = useBoms(effectiveProjectId);

  // 版本演进按创建时间正序：最早的初始版本在最上，逐次变更向下
  const ordered = useMemo(
    () => [...(boms ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [boms],
  );

  return (
    <PageContainer
      title="设计变更"
      subtitle="BOM 版本演进史（轻量 ECO）。每次变更从旧版本派生新版本并记录原因；新版发布时旧版自动作废。"
    >
      <div className="mb-4">
        <Select
          className="!w-80"
          placeholder="选择项目"
          showSearch
          optionFilterProp="label"
          value={effectiveProjectId}
          onChange={setProjectId}
          options={projectOptions}
        />
      </div>

      {!effectiveProjectId ? (
        <Empty description="请先在上方选择项目" />
      ) : isFetching ? (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      ) : !ordered.length ? (
        <Empty description="该项目暂无 BOM 版本" />
      ) : (
        <Timeline
          className="mt-2"
          items={ordered.map((b) => ({
            color: DOT_COLOR[b.status],
            children: <VersionEntry bom={b} />,
          }))}
        />
      )}
    </PageContainer>
  );
}

function VersionEntry({ bom }: { bom: BomVersionItem }) {
  return (
    <div className="pb-2">
      <div className="flex items-center gap-2">
        <Typography.Text strong className="text-base">
          {bom.version}
        </Typography.Text>
        <Tag color={BOM_STATUS_COLOR[bom.status]}>{BOM_STATUS_LABEL[bom.status]}</Tag>
        <Typography.Text type="secondary" className="text-xs">
          {bom.itemCount} 行明细 · {bom.createdByName ?? '—'} 创建于{' '}
          {dayjs(bom.createdAt).format('YYYY-MM-DD HH:mm')}
        </Typography.Text>
      </div>
      {bom.sourceVersion ? (
        <div className="mt-1 text-sm">
          <Typography.Text type="secondary">由 {bom.sourceVersion} 变更而来：</Typography.Text>
          <Typography.Text>{bom.changeReason ?? '—'}</Typography.Text>
        </div>
      ) : (
        <div className="mt-1 text-sm">
          <Typography.Text type="secondary">初始版本</Typography.Text>
        </div>
      )}
      {bom.releasedAt && (
        <div className="mt-0.5 text-xs text-gray-400">
          {bom.releasedByName ?? '—'} 发布于 {dayjs(bom.releasedAt).format('YYYY-MM-DD HH:mm')}
        </div>
      )}
    </div>
  );
}
