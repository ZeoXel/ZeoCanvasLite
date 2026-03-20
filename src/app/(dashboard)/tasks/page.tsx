"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { TaskLogsTable, TaskLogsFilters, TaskDetailModal } from '@/components/taskLogs';
import { useTaskLogs } from '@/contexts/TaskLogContext';
import type { TaskLog, TaskLogFilter } from '@/types/taskLog';

export default function TasksPage() {
  const { logs, stats, refreshLogs, deleteTask, isLoading } = useTaskLogs();

  const [filter, setFilter] = useState<TaskLogFilter>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<TaskLog | null>(null);

  // 过滤后的日志
  const filteredLogs = React.useMemo(() => {
    let result = logs;

    if (filter.type) {
      result = result.filter((log) => log.type === filter.type);
    }
    if (filter.platform) {
      result = result.filter((log) => log.platform === filter.platform);
    }
    if (filter.status) {
      result = result.filter((log) => log.status === filter.status);
    }
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      result = result.filter(
        (log) =>
          log.name.toLowerCase().includes(keyword) ||
          log.description?.toLowerCase().includes(keyword) ||
          log.externalId?.toLowerCase().includes(keyword)
      );
    }

    return result;
  }, [logs, filter]);

  // 分页后的日志
  const paginatedLogs = React.useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredLogs.slice(startIndex, startIndex + pageSize);
  }, [filteredLogs, page, pageSize]);

  // 自动刷新运行中的任务
  useEffect(() => {
    const hasRunningTasks = logs.some(
      (log) =>
        log.status === 'running' ||
        log.status === 'submitted' ||
        log.status === 'queued'
    );

    if (hasRunningTasks) {
      const interval = setInterval(refreshLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [logs, refreshLogs]);

  // 处理页码变化
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // 处理每页数量变化
  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  // 处理删除
  const handleDelete = useCallback(
    (id: string) => {
      if (confirm('确定要删除这条任务记录吗？')) {
        deleteTask(id);
      }
    },
    [deleteTask]
  );

  // 处理查看详情
  const handleViewDetail = useCallback((log: TaskLog) => {
    setSelectedLog(log);
  }, []);

  // 关闭详情
  const handleCloseDetail = useCallback(() => {
    setSelectedLog(null);
  }, []);

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">任务日志</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            查看工作流和生成任务的运行状态与结果
          </p>
        </div>
      </div>

      {/* 过滤器 */}
      <TaskLogsFilters
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={refreshLogs}
        isLoading={isLoading}
        stats={stats}
      />

      {/* 表格 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <TaskLogsTable
          logs={paginatedLogs}
          total={filteredLogs.length}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refreshLogs}
          onDelete={handleDelete}
          onViewDetail={handleViewDetail}
          isLoading={isLoading}
        />
      </div>

      {/* 详情模态框 */}
      {selectedLog && (
        <TaskDetailModal log={selectedLog} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
