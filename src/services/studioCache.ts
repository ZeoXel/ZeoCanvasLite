/**
 * 模块级内存缓存 —— 组件卸载后数据仍保留
 * 用于 StudioTab 再次进入时跳过 IndexedDB 读取实现秒开
 */

import type { AppNode, Canvas, Connection, Group, Workflow, Subject } from '@/types';
import type { TaskLog } from '@/types/taskLog';

export interface StudioCacheData {
  assets: any[];
  workflows: Workflow[];
  subjects: Subject[];
  canvases: Canvas[];
  currentCanvasId: string | null;
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
  nodeConfigs: Record<string, any>;
  taskLogs: TaskLog[];
  deletedItems?: Record<string, number>;
  timestamp: number;
}

let _cache: StudioCacheData | null = null;

export function getCache(): StudioCacheData | null {
  return _cache;
}

export function setCache(data: StudioCacheData): void {
  _cache = { ...data, timestamp: Date.now() };
}

export function invalidateCache(): void {
  _cache = null;
}

export function getCacheTimestamp(): number {
  return _cache?.timestamp ?? 0;
}

/** 更新缓存中的 currentCanvasId（从画布列表页点击进入时使用） */
export function setCacheCurrentCanvasId(id: string): void {
  if (_cache) {
    _cache = { ..._cache, currentCanvasId: id };
  }
}

/** 新建画布时同步更新缓存，避免进入画布页后命中旧缓存 */
export function appendCanvasToCache(canvas: Canvas): void {
  if (!_cache) return;

  const nextCanvases = [canvas, ..._cache.canvases.filter(c => c.id !== canvas.id)];
  _cache = {
    ..._cache,
    canvases: nextCanvases,
    currentCanvasId: canvas.id,
    nodes: canvas.nodes || [],
    connections: canvas.connections || [],
    groups: canvas.groups || [],
    timestamp: Date.now(),
  };
}

/** 删除画布时同步更新缓存，避免后续命中已删除画布 */
export function removeCanvasFromCache(id: string, nextCurrentCanvasId?: string | null): void {
  if (!_cache) return;

  const nextCanvases = _cache.canvases.filter((c) => c.id !== id);
  const resolvedCurrentId = nextCurrentCanvasId !== undefined
    ? nextCurrentCanvasId
    : (_cache.currentCanvasId === id ? (nextCanvases[0]?.id || null) : _cache.currentCanvasId);

  const currentCanvas = resolvedCurrentId
    ? nextCanvases.find((c) => c.id === resolvedCurrentId) || nextCanvases[0]
    : null;

  _cache = {
    ..._cache,
    canvases: nextCanvases,
    currentCanvasId: currentCanvas?.id || null,
    nodes: currentCanvas?.nodes || [],
    connections: currentCanvas?.connections || [],
    groups: currentCanvas?.groups || [],
    timestamp: Date.now(),
  };
}

/**
 * 从缓存中解析出当前画布的初始数据（同步调用，用于 useState 初始化）
 * 返回 null 表示无缓存
 */
export function resolveCanvasFromCache(): {
  cache: StudioCacheData;
  canvasNodes: AppNode[];
  canvasConnections: Connection[];
  canvasGroups: Group[];
  canvasPan: { x: number; y: number } | null;
  canvasScale: number | null;
} | null {
  if (!_cache) return null;
  const canvases = _cache.canvases;
  if (!canvases || canvases.length === 0) return null;
  const canvas = _cache.currentCanvasId
    ? canvases.find(c => c.id === _cache!.currentCanvasId) || canvases[0]
    : canvases[0];
  return {
    cache: _cache,
    canvasNodes: canvas.nodes || [],
    canvasConnections: canvas.connections || [],
    canvasGroups: canvas.groups || [],
    canvasPan: canvas.pan || null,
    canvasScale: canvas.scale ?? null,
  };
}
