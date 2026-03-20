"use client";

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Circle,
  Ban,
  ExternalLink,
  Trash2,
  RefreshCw,
  Eye,
  Video,
  Music,
  Image,
  Workflow,
  MoreVertical,
} from 'lucide-react';
import type { TaskLog, TaskType, TaskStatus, TaskPlatform } from '@/types/taskLog';
import {
  getTaskStatusLabel,
  getTaskStatusColor,
  getTaskTypeLabel,
  getPlatformLabel,
  getTaskDuration,
  formatDuration,
} from '@/types/taskLog';

interface TaskLogsTableProps {
  logs: TaskLog[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
  onDelete?: (id: string) => void;
  onViewDetail?: (log: TaskLog) => void;
  isLoading?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function TaskLogsTable({
  logs,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onDelete,
  onViewDetail,
  isLoading,
}: TaskLogsTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalPages = Math.ceil(total / pageSize);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取任务类型图标
  const getTypeIcon = (type: TaskType) => {
    const icons: Record<TaskType, React.ReactNode> = {
      workflow: <Workflow size={16} />,
      video: <Video size={16} />,
      audio: <Music size={16} />,
      image: <Image size={16} />,
    };
    return icons[type] || <Circle size={16} />;
  };

  // 获取状态图标
  const getStatusIcon = (status: TaskStatus) => {
    const icons: Record<TaskStatus, React.ReactNode> = {
      queued: <Clock size={14} className="text-gray-400" />,
      submitted: <Circle size={14} className="text-yellow-500" />,
      running: <Play size={14} className="text-blue-500 animate-pulse" />,
      success: <CheckCircle2 size={14} className="text-green-500" />,
      failed: <XCircle size={14} className="text-red-500" />,
      cancelled: <Ban size={14} className="text-gray-400" />,
    };
    return icons[status] || <Circle size={14} />;
  };

  // 渲染进度条
  const renderProgress = (log: TaskLog) => {
    if (log.status !== 'running' && log.status !== 'submitted') return null;

    const progress = log.progress ?? 0;

    return (
      <div className="w-full">
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  // 渲染耗时
  const renderDuration = (log: TaskLog) => {
    const duration = getTaskDuration(log);
    if (duration === null) return '-';

    const color =
      log.status === 'success'
        ? 'text-green-600 dark:text-green-400'
        : log.status === 'failed'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-600 dark:text-gray-400';

    return (
      <span className={`${color} tabular-nums`}>
        {formatDuration(duration)}
      </span>
    );
  };

  // 空状态
  if (!isLoading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-24 h-24 mb-4 text-gray-300 dark:text-gray-600">
          <Workflow size={96} strokeWidth={1} />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-4">暂无任务记录</p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="w-[140px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                提交时间
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                任务名称
              </th>
              <th className="w-[120px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                类型
              </th>
              <th className="w-[120px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                平台
              </th>
              <th className="w-[110px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                状态
              </th>
              <th className="w-[160px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                进度
              </th>
              <th className="w-[90px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                耗时
              </th>
              <th className="w-[110px] text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-4 px-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* 提交时间 */}
                    <td className="py-4 px-4 text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">
                      {formatTime(log.createdAt)}
                    </td>

                    {/* 任务名称 */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <span
                          className="font-medium text-gray-900 dark:text-white truncate"
                          title={log.name}
                        >
                          {log.name}
                        </span>
                      </div>
                      {log.externalId && (
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate"
                          title={log.externalId}
                        >
                          ID: {log.externalId.slice(0, 16)}...
                        </p>
                      )}
                    </td>

                    {/* 类型 */}
                    <td className="py-4 px-4">
                      <span
                        className="group relative inline-flex items-center justify-center"
                        title={getTaskTypeLabel(log.type)}
                        aria-label={getTaskTypeLabel(log.type)}
                      >
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {getTypeIcon(log.type)}
                        </span>
                        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                          {getTaskTypeLabel(log.type)}
                        </span>
                      </span>
                    </td>

                    {/* 平台 */}
                    <td className="py-4 px-4 text-gray-600 dark:text-gray-400">
                      {getPlatformLabel(log.platform)}
                    </td>

                    {/* 状态 */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
                          getTaskStatusColor(log.status).bg
                        } ${getTaskStatusColor(log.status).text}`}
                      >
                        {getStatusIcon(log.status)}
                        {getTaskStatusLabel(log.status)}
                      </span>
                    </td>

                    {/* 进度 */}
                    <td className="py-4 px-4">
                      {renderProgress(log) || (
                        <span className="text-gray-400 dark:text-gray-500">
                          -
                        </span>
                      )}
                    </td>

                    {/* 耗时 */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {renderDuration(log)}
                    </td>

                    {/* 操作 */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onViewDetail?.(log)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye size={16} />
                        </button>
                        {log.debugUrl && (
                          <a
                            href={log.debugUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="调试链接"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(log.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>条，共 {total} 条</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
