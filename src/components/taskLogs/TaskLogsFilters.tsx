"use client";

import React from 'react';
import {
  Search,
  RefreshCw,
  X,
  Filter,
  Calendar,
} from 'lucide-react';
import type { TaskType, TaskStatus, TaskPlatform, TaskLogFilter } from '@/types/taskLog';

interface TaskLogsFiltersProps {
  filter: TaskLogFilter;
  onFilterChange: (filter: TaskLogFilter) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  stats?: {
    total: number;
    running: number;
    success: number;
    failed: number;
  };
}

export default function TaskLogsFilters({
  filter,
  onFilterChange,
  onRefresh,
  isLoading,
  stats,
}: TaskLogsFiltersProps) {
  // 更新单个过滤项
  const updateFilter = (key: keyof TaskLogFilter, value: string | number | undefined) => {
    onFilterChange({
      ...filter,
      [key]: value === '' ? undefined : value,
    });
  };

  // 重置过滤器
  const resetFilters = () => {
    onFilterChange({});
  };

  // 检查是否有活动的过滤条件
  const hasActiveFilters = Object.values(filter).some((v) => v !== undefined);

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="全部" value={stats.total} color="gray" />
          <StatCard
            label="运行中"
            value={stats.running}
            color="blue"
            pulse={stats.running > 0}
          />
          <StatCard label="成功" value={stats.success} color="green" />
          <StatCard label="失败" value={stats.failed} color="red" />
        </div>
      )}

      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="搜索任务名称或 ID..."
            value={filter.keyword || ''}
            onChange={(e) => updateFilter('keyword', e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 类型过滤 */}
        <select
          value={filter.type || ''}
          onChange={(e) => updateFilter('type', e.target.value as TaskType)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部类型</option>
          <option value="workflow">工作流</option>
          <option value="video">视频生成</option>
          <option value="audio">音频生成</option>
          <option value="image">图片生成</option>
        </select>

        {/* 平台过滤 */}
        <select
          value={filter.platform || ''}
          onChange={(e) => updateFilter('platform', e.target.value as TaskPlatform)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部平台</option>
          <option value="coze">Coze</option>
          <option value="vidu">Vidu</option>
          <option value="seedream">Seedream</option>
          <option value="veo">Veo</option>
          <option value="suno">Suno</option>
          <option value="minimax">MiniMax</option>
        </select>

        {/* 状态过滤 */}
        <select
          value={filter.status || ''}
          onChange={(e) => updateFilter('status', e.target.value as TaskStatus)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="queued">排队中</option>
          <option value="submitted">已提交</option>
          <option value="running">运行中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 ml-auto">
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X size={16} />
              清除筛选
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color: 'gray' | 'blue' | 'green' | 'red';
  pulse?: boolean;
}) {
  const colorClasses = {
    gray: 'bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
  };

  const dotColors = {
    gray: 'bg-gray-400',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div className={`p-4 rounded-xl ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full ${dotColors[color]} ${
            pulse ? 'animate-pulse' : ''
          }`}
        />
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
