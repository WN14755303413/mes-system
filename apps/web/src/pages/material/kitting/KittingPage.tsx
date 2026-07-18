import { useMemo, useState } from 'react';
import { Button, Empty, Progress, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  KITTING_ROW_STATUS_LABEL,
  KittingRowStatus,
  type KittingOverviewItem,
  type KittingRow,
} from '@mes/shared';
import { useKittingOverview, useProjectKitting } from '@/api/material';
import { PageContainer } from '../../system/PageContainer';

const ROW_STATUS_COLOR: Record<KittingRowStatus, string> = {
  FULFILLED: 'green',
  IN_TRANSIT: 'gold',
  SHORTAGE: 'red',
};

const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');
const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('MM-DD HH:mm') : '未同步');

/** 导出缺料清单 CSV（一期替代向 ERP 推送采购需求，业务方案 §8.3）。 */
function exportShortageCsv(projectCode: string, rows: KittingRow[]) {
  const shortage = rows.filter((r) => r.status !== KittingRowStatus.FULFILLED);
  const header = ['物料编码', '名称', '规格', '单位', '需求', '已领', '项目库存', '通用库存', '已到未领', '在途', '缺口', '状态', '最晚预计到货', '长周期'];
  const lines = shortage.map((r) =>
    [
      r.materialCode, r.materialName, r.spec ?? '', r.unit,
      r.required, r.issued, r.projectStock, r.generalStock,
      r.arrivedNotInbound, r.inTransit, r.gap,
      KITTING_ROW_STATUS_LABEL[r.status],
      r.latestExpectedDate ? dayjs(r.latestExpectedDate).format('YYYY-MM-DD') : '',
      r.isLongLead ? '是' : '',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
  );
  // ﻿ BOM 让 Excel 正确识别 UTF-8 中文
  const blob = new Blob([`﻿${[header.join(','), ...lines].join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `缺料清单_${projectCode}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 齐套看板（M6，业务方案 §8.3 / §9.4）。实时计算，标注各数据源同步时间。 */
export default function KittingPage() {
  const { data: overview, isLoading: overviewLoading } = useKittingOverview();
  const [projectId, setProjectId] = useState<string>();
  const effectiveProjectId = projectId ?? overview?.[0]?.projectId;
  const { data: detail, isLoading: detailLoading } = useProjectKitting(effectiveProjectId);

  const projectOptions = useMemo(
    () => (overview ?? []).map((p) => ({ value: p.projectId, label: `${p.projectCode} ${p.projectName}` })),
    [overview],
  );

  const overviewColumns: ColumnsType<KittingOverviewItem> = [
    { title: '项目编号', dataIndex: 'projectCode', width: 150 },
    { title: '项目名称', dataIndex: 'projectName', ellipsis: true },
    { title: 'BOM 版本', dataIndex: 'bomVersion', width: 100, render: (v) => v ?? '—' },
    {
      title: '齐套率',
      dataIndex: 'kitRate',
      width: 180,
      render: (v: number) => (
        <Progress percent={v} size="small" status={v >= 100 ? 'success' : v < 60 ? 'exception' : 'active'} />
      ),
    },
    {
      title: '缺料行',
      dataIndex: 'shortageRows',
      width: 90,
      render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : <Tag color="green">0</Tag>),
    },
    {
      title: '长周期预警',
      dataIndex: 'longLeadAlerts',
      width: 110,
      render: (v: number) =>
        v > 0 ? (
          <Tag color="red" icon={<WarningOutlined />}>
            {v}
          </Tag>
        ) : (
          '—'
        ),
    },
  ];

  const rowColumns: ColumnsType<KittingRow> = [
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 140,
      render: (v: string, row) => (
        <Space size={4}>
          {v}
          {row.uncatalogued && (
            <Tooltip title="物料主数据未建档，请在「物料主数据」补录">
              <Tag color="orange">未建档</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: '名称', dataIndex: 'materialName', width: 150, ellipsis: true },
    { title: '规格', dataIndex: 'spec', width: 120, ellipsis: true, render: (v) => v ?? '—' },
    { title: '需求', dataIndex: 'required', width: 80, align: 'right' },
    { title: '已领', dataIndex: 'issued', width: 80, align: 'right' },
    { title: '项目库存', dataIndex: 'projectStock', width: 90, align: 'right' },
    {
      title: '通用库存',
      dataIndex: 'generalStock',
      width: 90,
      align: 'right',
      render: (v: number) => (v > 0 ? <Tooltip title="含通用库存，未做跨项目锁定"><span className="text-blue-500">{v}</span></Tooltip> : 0),
    },
    { title: '已到未领', dataIndex: 'arrivedNotInbound', width: 90, align: 'right' },
    { title: '在途', dataIndex: 'inTransit', width: 80, align: 'right' },
    {
      title: '缺口',
      dataIndex: 'gap',
      width: 90,
      align: 'right',
      render: (v: number) => (v > 0 ? <span className="font-semibold text-red-500">{v}</span> : 0),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: KittingRowStatus, row) => (
        <Space size={4}>
          <Tag color={ROW_STATUS_COLOR[v]}>{KITTING_ROW_STATUS_LABEL[v]}</Tag>
          {row.isLongLead && v === KittingRowStatus.SHORTAGE && (
            <Tooltip title={`长周期物料缺料且无在途覆盖${row.riskNotes.length ? `；风险：${row.riskNotes.join('；')}` : ''}`}>
              <WarningOutlined className="text-red-500" />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '最晚预计到货',
      dataIndex: 'latestExpectedDate',
      width: 120,
      render: (v: string | null, row) => (
        <Tooltip title={row.riskNotes.join('；') || undefined}>
          <span className={row.riskNotes.length ? 'text-amber-600' : ''}>{fmtDate(v)}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <PageContainer
      title="项目齐套看板"
      subtitle="需求取项目最新已发布/冻结 BOM；缺口 = 需求 − 已领 − 库存 − 已到未领（在途单列）。实时计算。"
    >
      <h2 className="mb-3 text-base font-medium text-slate-700">全项目总览</h2>
      <Table
        rowKey="projectId"
        size="middle"
        loading={overviewLoading}
        columns={overviewColumns}
        dataSource={overview}
        pagination={false}
        onRow={(row) => ({ onClick: () => setProjectId(row.projectId), className: 'cursor-pointer' })}
        rowClassName={(row) => (row.projectId === effectiveProjectId ? 'ant-table-row-selected' : '')}
        locale={{ emptyText: <Empty description="暂无有有效 BOM 的进行中项目" /> }}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Space>
          <h2 className="text-base font-medium text-slate-700">项目明细</h2>
          <Select
            style={{ width: 280 }}
            options={projectOptions}
            value={effectiveProjectId}
            onChange={setProjectId}
            placeholder="选择项目"
            showSearch
            optionFilterProp="label"
          />
        </Space>
        {detail && (
          <Space size="large" wrap>
            <span className="text-sm text-slate-500">
              BOM {detail.bomVersion ?? '—'} · 行齐套率 <b className="text-slate-800">{detail.kitRate}%</b> · 数量齐套率{' '}
              <b className="text-slate-800">{detail.kitRateByQty}%</b> · 缺料 <b className="text-red-500">{detail.shortageRows}</b> 行
            </span>
            <Tooltip
              title={`库存同步：${fmtTime(detail.sync.stockSyncedAt)} / 采购同步：${fmtTime(detail.sync.poSyncedAt)} / 到货同步：${fmtTime(detail.sync.arrivalSyncedAt)}`}
            >
              <span className="cursor-help text-sm text-slate-400 underline decoration-dotted">数据同步时间</span>
            </Tooltip>
            <Button
              icon={<DownloadOutlined />}
              disabled={!detail.rows.some((r) => r.status !== KittingRowStatus.FULFILLED)}
              onClick={() => exportShortageCsv(detail.projectCode, detail.rows)}
            >
              导出缺料清单
            </Button>
          </Space>
        )}
      </div>

      <Table
        className="mt-3"
        rowKey="materialCode"
        size="middle"
        loading={detailLoading}
        columns={rowColumns}
        dataSource={detail?.rows}
        scroll={{ x: 1250 }}
        pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 项物料`, hideOnSinglePage: true }}
        locale={{
          emptyText: <Empty description={detail && !detail.bomId ? '该项目暂无已发布/冻结的 BOM 版本' : '暂无数据'} />,
        }}
      />
    </PageContainer>
  );
}
