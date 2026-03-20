"use client";

import React, { useRef, useEffect } from 'react';

interface DataPoint {
  date: string;
  value: number;
}

interface TrendChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  height = 120,
  color = '#3b82f6'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);

    const width = rect.width;
    const chartHeight = rect.height;

    const padding = { top: 20, right: 15, bottom: 28, left: 15 };
    const chartWidth = width - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // 清除画布
    ctx.clearRect(0, 0, width, chartHeight);

    // 计算数据范围
    const values = data.map(d => d.value);
    const maxValue = Math.max(...values, 1);
    const minValue = 0; // 从0开始
    const valueRange = maxValue - minValue || 1;

    // 绘制网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (innerHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    // 计算点的位置
    const points = data.map((d, i) => {
      const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * i;
      const normalizedValue = (d.value - minValue) / valueRange;
      const y = padding.top + innerHeight - (normalizedValue * innerHeight);
      return { x, y, value: d.value, date: d.date };
    });

    // 绘制渐变填充区域
    const gradient = ctx.createLinearGradient(0, padding.top, 0, chartHeight - padding.bottom);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '05');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0].x, chartHeight - padding.bottom);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, chartHeight - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // 绘制线条（平滑曲线）
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // 绘制点和数值
    points.forEach((p, i) => {
      // 绘制点
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 绘制数值（在点上方）
      if (p.value > 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.value.toFixed(1), p.x, p.y - 8);
      }
    });

    // 绘制日期标签（底部）
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 只显示首尾和中间的日期，避免重叠
    const labelIndices = data.length <= 3
      ? data.map((_, i) => i)
      : [0, Math.floor(data.length / 2), data.length - 1];

    labelIndices.forEach(i => {
      const p = points[i];
      // 格式化日期：MM/DD
      const dateStr = p.date.slice(5).replace('-', '/');
      ctx.fillText(dateStr, p.x, chartHeight - padding.bottom + 6);
    });

  }, [data, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      className="rounded-lg"
    />
  );
};
