import type { ReactNode } from 'react';

/**
 * 看板 KPI 指标砖（dataviz「stat tile」契约：label + value + 辅注）。
 * 大数字用默认比例数字（不用 tabular-nums——展示尺寸下会显松）。
 */
export function StatTile({
  label,
  value,
  suffix,
  sub,
  icon,
  tint,
  loading,
}: {
  label: string;
  value: number | string | null | undefined;
  /** 值后缀（% / h 等），小一号渲染。 */
  suffix?: string;
  sub?: string;
  icon: ReactNode;
  /** 图标底色渐变（tailwind from-.. to-..）。 */
  tint: string;
  loading?: boolean;
}) {
  const display = loading || value === null || value === undefined ? '—' : value;
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base text-white shadow-md ${tint}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold tracking-tight text-slate-800">
            {display}
            {suffix && display !== '—' && (
              <span className="ml-0.5 text-sm font-medium text-slate-400">{suffix}</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-500">{label}</span>
            {sub && <span className="truncate text-[11px] text-slate-400">{sub}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
