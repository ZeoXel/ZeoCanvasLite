"use client";

import React, { useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { CHART_CONFIG } from './VChartWrapper';

interface DataPoint {
  date: string;
  value: number;
}

interface VTrendChartProps {
  data: DataPoint[];
  color?: string;
}

export const VTrendChart: React.FC<VTrendChartProps> = ({
  data,
  color = '#3b82f6',
}) => {
  const spec = useMemo(() => {
    const chartData = data.map(d => ({
      date: d.date.slice(5).replace('-', '/'),
      value: d.value,
    }));

    return {
      type: 'area',
      data: [{ id: 'trendData', values: chartData }],
      xField: 'date',
      yField: 'value',
      point: {
        visible: true,
        style: {
          size: 5,
          fill: '#fff',
          stroke: color,
          lineWidth: 2,
        },
      },
      line: {
        style: {
          stroke: color,
          lineWidth: 2,
        },
      },
      area: {
        style: {
          fill: {
            gradient: 'linear',
            x0: 0, y0: 0, x1: 0, y1: 1,
            stops: [
              { offset: 0, color: color + '30' },
              { offset: 1, color: color + '05' },
            ],
          },
        },
      },
      title: { visible: false },
      legends: { visible: false },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: '#94a3b8', fontSize: 10 },
          },
          tick: { visible: false },
          domainLine: { visible: false },
        },
        {
          orient: 'left',
          label: {
            style: { fill: '#94a3b8', fontSize: 10 },
            formatMethod: (v: number) => v.toFixed(1),
          },
          tick: { visible: false },
          domainLine: { visible: false },
          grid: {
            style: { stroke: '#e2e8f0', lineDash: [4, 4] },
          },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: any) => datum.date,
              value: (datum: any) => datum.value.toFixed(2),
            },
          ],
        },
      },
      crosshair: {
        xField: { visible: true, line: { style: { stroke: '#94a3b8', lineWidth: 1, lineDash: [4, 4] } } },
      },
      padding: { top: 15, right: 15, bottom: 25, left: 35 },
      background: 'transparent',
      animation: false,
    };
  }, [data, color]);

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

export default VTrendChart;
