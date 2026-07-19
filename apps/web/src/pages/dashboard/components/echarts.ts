import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * ECharts 按需注册：看板只用柱状/折线两类图 + 网格/图例/提示框。
 * 配合看板路由的 React.lazy，整套 ECharts 不进主包。
 */
echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export { echarts };
export type EChartsOption = echarts.EChartsCoreOption;
