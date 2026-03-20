"use client";

import React, { useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { CHART_CONFIG } from './VChartWrapper';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface VDonutChartProps {
  data: DonutSegment[];
}

export const VDonutChart: React.FC<VDonutChartProps> = ({
  data,
}) => {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const spec = useMemo(() => {
    const chartData = data.map(d => ({
      type: d.label,
      value: d.value,
    }));

    // 构建颜色映射
    const colorMap: Record<string, string> = {};
    data.forEach(d => {
      colorMap[d.label] = d.color;
    });

    return {
      type: 'pie',
      data: [{ id: 'pieData', values: chartData }],
      outerRadius: 0.88,
      innerRadius: 0.62,
      padAngle: 1,
      valueField: 'value',
      categoryField: 'type',
      pie: {
        style: {
          cornerRadius: 4,
        },
        state: {
          hover: {
            outerRadius: 0.92,
            stroke: '#fff',
            lineWidth: 2,
          },
        },
      },
      title: { visible: false },
      legends: { visible: false },
      label: { visible: false },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: any) => datum.type,
              value: (datum: any) => {
                const percentage = ((datum.value / total) * 100).toFixed(0);
                return `${datum.value.toFixed(2)} (${percentage}%)`;
              },
            },
          ],
        },
      },
      color: {
        specified: colorMap,
      },
      indicator: {
        visible: true,
        trigger: 'hover',
        title: {
          visible: true,
          style: {
            fontSize: 12,
            fontWeight: 'bold',
            fill: '#64748b',
            text: (datum: any) => datum ? datum.type : '总消耗',
          },
        },
        content: [
          {
            visible: true,
            style: {
              fontSize: 18,
              fontWeight: 'bold',
              fill: '#1e293b',
              text: (datum: any) => datum ? datum.value.toFixed(1) : total.toFixed(1),
            },
          },
        ],
      },
      background: 'transparent',
      padding: 5,
      animation: false,
    };
  }, [data, total]);

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
        暂无数据
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <VChart spec={spec as any} options={CHART_CONFIG} />
    </div>
  );
};

export default VDonutChart;
