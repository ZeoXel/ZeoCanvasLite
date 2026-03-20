"use client";

import React, { useEffect, useRef } from 'react';
import { VChart } from '@visactor/react-vchart';
import type { IVChartConstructor } from '@visactor/vchart';

// 模型颜色映射
export const modelColorMap: Record<string, string> = {
  // 视频类
  'vidu': '#a855f7',
  'viduq1-pro': '#a855f7',
  'viduq3-pro': '#7c3aed',
  'viduq2-pro': '#c084fc',
  'viduq2-turbo': '#8b5cf6',
  'veo': '#6366f1',
  'veo3': '#6366f1',
  'veo3.1': '#818cf8',
  'seedance': '#d946ef',
  'doubao-seedance-1-5-pro-251215': '#e879f9',
  // 图像类
  'nano-banana': '#eab308',
  'seedream': '#10b981',
  'doubao-seedream-3-0-t2i-250415': '#22c55e',
  'doubao-seededit-3-0-i2i-250628': '#16a34a',
  'doubao-seedream-4-5-251128': '#14b8a6',
  'flux-pro': '#3b82f6',
  // 音频类
  'suno': '#ef4444',
  'minimax': '#f97316',
};

// 根据模型名生成颜色
export function modelToColor(modelName: string): string {
  // 检查是否有匹配的颜色
  for (const [key, color] of Object.entries(modelColorMap)) {
    if (modelName.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }
  // 基于字符串哈希生成颜色
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
  const hash = modelName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// 图表通用配置
export const CHART_CONFIG = {
  mode: 'desktop-browser' as const,
};

interface VChartWrapperProps {
  spec: any;
  className?: string;
  style?: React.CSSProperties;
}

export const VChartWrapper: React.FC<VChartWrapperProps> = ({
  spec,
  className = '',
  style = {},
}) => {
  return (
    <div className={`w-full h-full ${className}`} style={style}>
      <VChart spec={spec} options={CHART_CONFIG} />
    </div>
  );
};

export default VChartWrapper;
