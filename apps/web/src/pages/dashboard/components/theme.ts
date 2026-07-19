import type { EChartsOption } from './echarts';

/**
 * 看板图表主题参数（dataviz 方法论的「设计系统参数」实例）。
 *
 * 系列色是经 validate_palette 六项检查的参考调色板（light + 白色卡片底均通过；
 * 3/4/5 号浅色槽位对比度 WARN 的缓解手段：每张图都带表格视图 + 图例/直标）。
 * 图表铬件（网格/轴/文字）取应用自身的 slate 色阶，与页面卡片风格一致。
 *
 * 用色纪律（勿破坏）：
 * - 单系列图一律 SERIES[0] 单色——严禁「越大越深」的名义类目值梯。
 * - 有序类目（严重度）用 ORDINAL_BLUE 单色浅→深。
 * - 状态语义（合格/不合格）用 STATUS，绝不挪作系列色。
 * - 多系列按 SERIES 固定顺序取色，过滤不重排（色随实体走）。
 */
export const SERIES = [
  '#2a78d6', // 1 blue
  '#008300', // 2 green
  '#e87ba4', // 3 magenta
  '#eda100', // 4 yellow
  '#1baf7a', // 5 aqua
  '#eb6834', // 6 orange
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

/** 单色序数梯（蓝 250/350/450/550，浅→深 = 低→高），用于严重度等有序类目。 */
export const ORDINAL_BLUE = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'] as const;

/** 状态色。仅用于「合格/待检/不合格」这类状态语义，配图例文字（不裸靠颜色）。 */
export const STATUS_COLOR = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  neutral: '#94a3b8', // 待检/未判定（slate-400）
} as const;

/** 图表铬件：应用 slate 色阶（卡片为白底）。 */
export const INK = {
  surface: '#ffffff',
  label: '#64748b', // slate-500，轴标签
  muted: '#94a3b8', // slate-400
  grid: '#e2e8f0', // slate-200，网格发丝线
  axis: '#cbd5e1', // slate-300，轴线
  text: '#334155', // slate-700，tooltip 正文
} as const;

const AXIS_LABEL = { color: INK.label, fontSize: 12 };

/** 通用网格：紧凑留白，containLabel 防轴标签溢出（反模式清单第 8 条）。 */
export function baseGrid(overrides?: Record<string, unknown>) {
  return { top: 16, left: 8, right: 20, bottom: 4, containLabel: true, ...overrides };
}

/** 类目轴（x）。 */
export function categoryAxis(data: string[], overrides?: Record<string, unknown>) {
  return {
    type: 'category',
    data,
    axisLine: { lineStyle: { color: INK.axis } },
    axisTick: { show: false },
    axisLabel: AXIS_LABEL,
    ...overrides,
  };
}

/** 数值轴（y）。网格为实线发丝线（不用虚线——虚线读作阈值/预测）。 */
export function valueAxis(overrides?: Record<string, unknown>) {
  return {
    type: 'value',
    axisLabel: AXIS_LABEL,
    splitLine: { lineStyle: { color: INK.grid, width: 1 } },
    ...overrides,
  };
}

/** tooltip 基础样式。trigger 由各图按类型指定（折线 axis 十字线 / 柱 item）。 */
export function tooltipBase(overrides?: Record<string, unknown>) {
  return {
    backgroundColor: '#ffffff',
    borderColor: INK.grid,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: INK.text, fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08); border-radius: 8px;',
    ...overrides,
  };
}

/** 图例（仅 ≥2 系列的图使用；单系列图不放图例——标题即系列名）。 */
export function legendBase(overrides?: Record<string, unknown>) {
  return {
    top: 0,
    right: 0,
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16,
    icon: 'roundRect',
    textStyle: { color: INK.label, fontSize: 12 },
    ...overrides,
  };
}

/** 竖向柱系列：≤24px 粗、数据端 4px 圆角、基线方角。 */
export function barSeries(overrides?: Record<string, unknown>) {
  return {
    type: 'bar',
    barMaxWidth: 24,
    itemStyle: { color: SERIES[0], borderRadius: [4, 4, 0, 0] },
    ...overrides,
  };
}

/** 横向柱系列（数据端在右）。 */
export function hBarSeries(overrides?: Record<string, unknown>) {
  return {
    type: 'bar',
    barMaxWidth: 24,
    itemStyle: { color: SERIES[0], borderRadius: [0, 4, 4, 0] },
    ...overrides,
  };
}

/** 折线系列：2px 圆角连接；密集趋势线不逐点画符号（悬浮十字线取值）。 */
export function lineSeries(color: string, overrides?: Record<string, unknown>) {
  return {
    type: 'line',
    lineStyle: { width: 2, cap: 'round', join: 'round' },
    itemStyle: { color, borderColor: INK.surface, borderWidth: 2 },
    color,
    symbol: 'circle',
    symbolSize: 8,
    showSymbol: false,
    ...overrides,
  };
}

/** 面积折线（单系列趋势）：10% 透明度水洗填充，不用饱和大色块。 */
export function areaLineSeries(color: string, overrides?: Record<string, unknown>) {
  return lineSeries(color, {
    areaStyle: { color, opacity: 0.1 },
    ...overrides,
  });
}

/** 空数据判断：所有系列数据为空或全零时，图表区显示占位。 */
export function isAllZero(values: number[]): boolean {
  return values.length === 0 || values.every((v) => v === 0);
}

export type { EChartsOption };
