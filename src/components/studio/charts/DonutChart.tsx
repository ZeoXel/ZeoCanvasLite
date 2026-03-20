"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  onHover?: (segment: DonutSegment | null) => void;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 160,
  thickness = 28,
  onHover
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const segmentAnglesRef = useRef<{ start: number; end: number }[]>([]);

  // 计算鼠标位置对应的扇区
  const getSegmentAtPosition = useCallback((x: number, y: number) => {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size - thickness) / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 检查是否在环形区域内
    const innerRadius = radius - thickness / 2;
    const outerRadius = radius + thickness / 2;

    if (distance < innerRadius || distance > outerRadius) {
      return null;
    }

    // 计算角度
    let angle = Math.atan2(dy, dx);
    // 转换为从顶部开始的角度
    angle = angle + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    // 查找对应的扇区
    for (let i = 0; i < segmentAnglesRef.current.length; i++) {
      const { start, end } = segmentAnglesRef.current[i];
      let normalizedStart = start + Math.PI / 2;
      let normalizedEnd = end + Math.PI / 2;
      if (normalizedStart < 0) normalizedStart += Math.PI * 2;
      if (normalizedEnd < 0) normalizedEnd += Math.PI * 2;

      if (angle >= normalizedStart && angle <= normalizedEnd) {
        return i;
      }
    }
    return null;
  }, [size, thickness]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const index = getSegmentAtPosition(x, y);
    setHoveredIndex(index);

    if (onHover) {
      onHover(index !== null ? data[index] : null);
    }
  }, [data, getSegmentAtPosition, onHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    if (onHover) {
      onHover(null);
    }
  }, [onHover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size - thickness) / 2;

    // 清除画布
    ctx.clearRect(0, 0, size, size);

    // 计算总值
    const total = data.reduce((sum, item) => sum + item.value, 0);

    // 存储扇区角度
    const angles: { start: number; end: number }[] = [];
    let currentAngle = -Math.PI / 2; // 从顶部开始

    // 绘制环形图
    data.forEach((segment, index) => {
      const segmentAngle = (segment.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + segmentAngle;

      angles.push({ start: startAngle, end: endAngle });

      // 绘制弧段
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);

      // 悬停时增加线宽
      const isHovered = hoveredIndex === index;
      ctx.lineWidth = isHovered ? thickness + 6 : thickness;
      ctx.strokeStyle = segment.color;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // 悬停时添加外发光效果
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.lineWidth = thickness + 12;
        ctx.strokeStyle = segment.color + '30';
        ctx.stroke();
      }

      currentAngle = endAngle;
    });

    segmentAnglesRef.current = angles;

    // 绘制中心信息
    const displaySegment = hoveredIndex !== null ? data[hoveredIndex] : null;

    if (displaySegment) {
      // 显示悬停的扇区信息
      ctx.fillStyle = displaySegment.color;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displaySegment.value.toFixed(1), centerX, centerY - 10);

      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#64748b';
      const percentage = ((displaySegment.value / total) * 100).toFixed(0);
      ctx.fillText(`${percentage}%`, centerX, centerY + 8);
    } else {
      // 显示总消耗
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(total.toFixed(1), centerX, centerY - 10);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('总消耗', centerX, centerY + 8);
    }

  }, [data, size, thickness, hoveredIndex]);

  return (
    <div className="flex items-center justify-center relative">
      <canvas
        ref={canvasRef}
        style={{ width: `${size}px`, height: `${size}px`, cursor: 'pointer' }}
        className="rounded-lg transition-transform"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};
