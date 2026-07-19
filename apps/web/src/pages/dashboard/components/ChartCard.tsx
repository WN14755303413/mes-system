import { useState, type ReactNode } from 'react';
import { BarChartOutlined, TableOutlined } from '@ant-design/icons';
import { Empty, Segmented, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

/**
 * 看板图表卡：标题 + 图/表切换 + 内容。
 *
 * 「表」是每张图的无障碍孪生视图（dataviz 非协商项：任何值都不能只有
 * tooltip 一条通路）——传入 table 即出现切换钮，行数据与图完全同源。
 */
export function ChartCard<T extends object>({
  title,
  subtitle,
  extra,
  table,
  empty,
  height = 260,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  /** 表格孪生视图。rowKey 缺省取行索引（看板行数少且只读）。 */
  table?: { columns: ColumnsType<T>; rows: T[]; rowKey?: keyof T & string };
  /** 为 true 时整卡显示空态（图与表都没有意义）。 */
  empty?: boolean;
  height?: number;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {table && !empty && (
            <Segmented
              size="small"
              value={mode}
              onChange={(v) => setMode(v as 'chart' | 'table')}
              options={[
                { value: 'chart', icon: <BarChartOutlined />, title: '图表' },
                { value: 'table', icon: <TableOutlined />, title: '表格' },
              ]}
            />
          )}
        </div>
      </div>

      {empty ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
        </div>
      ) : mode === 'table' && table ? (
        <div style={{ height }} className="overflow-auto">
          <Table<T>
            size="small"
            columns={table.columns}
            dataSource={table.rows}
            rowKey={table.rowKey ?? ((_, i) => String(i))}
            pagination={false}
          />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
