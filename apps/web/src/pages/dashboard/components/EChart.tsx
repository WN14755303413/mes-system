import ReactEChartsCore from 'echarts-for-react/lib/core';
import { echarts, type EChartsOption } from './echarts';

/**
 * ECharts 薄封装：统一实例注入与尺寸。
 * option 由页面用 theme.ts 的构造器拼装，这里不做样式决策。
 */
export function EChart({ option, height = 260 }: { option: EChartsOption; height?: number }) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
    />
  );
}
