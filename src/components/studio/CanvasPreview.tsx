"use client";

import React from 'react';
import { Layers } from 'lucide-react';
import type { Canvas } from '@/types';
import { NodeType } from '@/types';

// 节点类型对应的颜色
const getNodeColor = (type: string) => {
  switch (type) {
    case NodeType.PROMPT_INPUT: return '#fbbf24'; // amber (文本-黄色)
    case NodeType.IMAGE_ASSET: return '#60a5fa'; // blue (图片-蓝色)
    case NodeType.VIDEO_ASSET: return '#4ade80'; // green (视频-绿色)
    case NodeType.IMAGE_GENERATOR: return '#60a5fa'; // blue
    case NodeType.VIDEO_GENERATOR: return '#a78bfa'; // violet
    case NodeType.VIDEO_FACTORY: return '#f472b6'; // pink
    case NodeType.AUDIO_GENERATOR: return '#f87171'; // red (Suno 音乐)
    case NodeType.VOICE_GENERATOR: return '#fb7185'; // rose (MiniMax 语音)
    case NodeType.IMAGE_EDITOR: return '#facc15'; // yellow
    case NodeType.MULTI_FRAME_VIDEO: return '#10b981'; // emerald (智能多帧-绿色)
    case NodeType.IMAGE_3D_CAMERA: return '#a855f7'; // purple (3D 运镜-紫色)
    default: return '#cbd5e1';
  }
};

// 画布节点布局预览组件
const CanvasPreview: React.FC<{
  nodes: Canvas['nodes'];
  groups?: Canvas['groups'];
  connections?: Canvas['connections'];
  canvasId?: string;
}> = ({ nodes, groups = [], connections = [], canvasId = '' }) => {
  // 使用唯一 ID 避免 SVG pattern 冲突
  const patternId = `grid-${canvasId || Math.random().toString(36).substr(2, 9)}`;

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
        <Layers size={24} />
      </div>
    );
  }

  // 计算所有节点的边界框
  const padding = 20;
  const nodeWidth = 420;
  const nodeHeight = 320;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  nodes.forEach(node => {
    const w = node.width || nodeWidth;
    const h = node.height || nodeHeight;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
    maxY = Math.max(maxY, node.y + h);
  });

  // 分组也计入边界
  groups.forEach(g => {
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.width);
    maxY = Math.max(maxY, g.y + g.height);
  });

  const contentWidth = maxX - minX + padding * 2;
  const contentHeight = maxY - minY + padding * 2;

  // 预览区域尺寸（aspect-[2/1] 意味着宽高比2:1）
  const previewWidth = 240;
  const previewHeight = 120;

  // 计算缩放比例，保持比例并居中
  const scaleX = previewWidth / contentWidth;
  const scaleY = previewHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY, 1); // 不放大，只缩小

  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;
  const offsetX = (previewWidth - scaledWidth) / 2;
  const offsetY = (previewHeight - scaledHeight) / 2;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${previewWidth} ${previewHeight}`} className="rounded-lg">
      {/* 背景网格 */}
      <defs>
        <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="currentColor" className="text-slate-300 dark:text-slate-700" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />

      {/* 渲染分组 */}
      {groups.map(g => (
        <rect
          key={g.id}
          x={offsetX + (g.x - minX + padding) * scale}
          y={offsetY + (g.y - minY + padding) * scale}
          width={g.width * scale}
          height={g.height * scale}
          rx={4}
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth={1}
          strokeDasharray="3,2"
        />
      ))}

      {/* 渲染连接线 */}
      {connections.map((conn, idx) => {
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        if (!fromNode || !toNode) return null;

        const fromW = (fromNode.width || nodeWidth) * scale;
        const fromH = (fromNode.height || nodeHeight) * scale;
        const fromX = offsetX + (fromNode.x - minX + padding) * scale;
        const fromY = offsetY + (fromNode.y - minY + padding) * scale;

        const toW = (toNode.width || nodeWidth) * scale;
        const toH = (toNode.height || nodeHeight) * scale;
        const toX = offsetX + (toNode.x - minX + padding) * scale;
        const toY = offsetY + (toNode.y - minY + padding) * scale;

        // 从右侧中点连到左侧中点
        const x1 = fromX + fromW;
        const y1 = fromY + fromH / 2;
        const x2 = toX;
        const y2 = toY + toH / 2;

        // 简单贝塞尔曲线
        const dx = Math.abs(x2 - x1) * 0.5;
        const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        return (
          <path
            key={`${conn.from}-${conn.to}-${idx}`}
            d={path}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1.5}
            opacity={0.6}
          />
        );
      })}

      {/* 渲染节点 */}
      {nodes.map(node => {
        const w = (node.width || nodeWidth) * scale;
        const h = (node.height || nodeHeight) * scale;
        const x = offsetX + (node.x - minX + padding) * scale;
        const y = offsetY + (node.y - minY + padding) * scale;

        return (
          <rect
            key={node.id}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={3}
            fill={getNodeColor(node.type)}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
};

export default CanvasPreview;
