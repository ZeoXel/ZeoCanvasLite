"use client";

/**
 * 任务日志 Context
 * 提供全局任务日志状态管理和后台轮询
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { TaskLog, TaskLogFilter, TaskStatus } from '@/types/taskLog';
import { useAuth } from '@/contexts/AuthContext';
import {
  loadTaskLogs,
  addTaskLog as addLog,
  updateTaskLog as updateLog,
  deleteTaskLog as deleteLog,
  getTaskLogStorageKey,
  getRunningTasks,
  getTaskStats,
  onTaskLogUpdate,
  queryTaskLogs,
} from '@/services/taskLogService';
import { pollRunningTasks, getPollInterval } from '@/services/taskPollingService';

interface TaskLogContextValue {
  // 状态
  logs: TaskLog[];
  runningTasks: TaskLog[];
  stats: {
    total: number;
    running: number;
    success: number;
    failed: number;
  };
  isLoading: boolean;

  // 操作
  addTask: (task: Omit<TaskLog, 'id' | 'createdAt'>) => TaskLog;
  updateTask: (id: string, updates: Partial<Omit<TaskLog, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  refreshLogs: () => void;

  // 查询
  queryLogs: (filter?: TaskLogFilter, page?: number, pageSize?: number) => {
    logs: TaskLog[];
    total: number;
    page: number;
    pageSize: number;
  };
  getTaskById: (id: string) => TaskLog | undefined;
}

const TaskLogContext = createContext<TaskLogContextValue | null>(null);

export function TaskLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const userId = user?.id;

  // 初始加载
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLogs([]);
      setIsLoading(false);
      return;
    }
    setLogs(loadTaskLogs());
    setIsLoading(false);
  }, [authLoading, isAuthenticated, userId]);

  // 监听存储更新事件（包括来自其他标签页的更新）
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = onTaskLogUpdate(() => {
      if (!isAuthenticated) return;
      setLogs(loadTaskLogs());
    });

    // 监听 storage 事件（跨标签页同步）
    const handleStorageChange = (e: StorageEvent) => {
      if (!isAuthenticated) return;
      if (e.key === getTaskLogStorageKey()) {
        setLogs(loadTaskLogs());
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isAuthenticated]);

  // 计算正在运行的任务
  const runningTasks = useMemo(() => {
    return logs.filter(
      (log) =>
        log.status === 'running' ||
        log.status === 'submitted' ||
        log.status === 'queued'
    );
  }, [logs]);

  // 全局后台轮询运行中的任务
  useEffect(() => {
    // 清理之前的定时器
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // 如果没有运行中的任务，不需要轮询
    if (runningTasks.length === 0) {
      console.log('[TaskLogContext] 无运行中任务，停止轮询');
      return;
    }

    console.log(`[TaskLogContext] 检测到 ${runningTasks.length} 个运行中任务，启动全局轮询`);

    // 执行轮询
    const doPoll = async () => {
      if (isPollingRef.current) return; // 防止并发轮询
      isPollingRef.current = true;

      try {
        await pollRunningTasks();
        // 轮询后刷新状态
        setLogs(loadTaskLogs());
      } catch (error) {
        console.error('[TaskLogContext] 轮询出错:', error);
      } finally {
        isPollingRef.current = false;
      }
    };

    // 立即执行一次
    doPoll();

    // 设置定时轮询
    pollingRef.current = setInterval(doPoll, getPollInterval());

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [runningTasks.length]); // 只依赖运行中任务的数量

  // 计算统计数据
  const stats = useMemo(() => {
    return {
      total: logs.length,
      running: runningTasks.length,
      success: logs.filter((log) => log.status === 'success').length,
      failed: logs.filter((log) => log.status === 'failed').length,
    };
  }, [logs, runningTasks]);

  // 添加任务
  const addTask = useCallback((task: Omit<TaskLog, 'id' | 'createdAt'>) => {
    const newLog = addLog(task);
    return newLog;
  }, []);

  // 更新任务
  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<TaskLog, 'id' | 'createdAt'>>) => {
      updateLog(id, updates);
    },
    []
  );

  // 删除任务
  const deleteTask = useCallback((id: string) => {
    deleteLog(id);
  }, []);

  // 刷新日志
  const refreshLogs = useCallback(() => {
    setLogs(loadTaskLogs());
  }, []);

  // 查询日志
  const queryLogsCallback = useCallback(
    (filter?: TaskLogFilter, page: number = 1, pageSize: number = 20) => {
      return queryTaskLogs(filter, page, pageSize);
    },
    []
  );

  // 通过 ID 获取任务
  const getTaskById = useCallback(
    (id: string) => {
      return logs.find((log) => log.id === id);
    },
    [logs]
  );

  const value: TaskLogContextValue = {
    logs,
    runningTasks,
    stats,
    isLoading,
    addTask,
    updateTask,
    deleteTask,
    refreshLogs,
    queryLogs: queryLogsCallback,
    getTaskById,
  };

  return (
    <TaskLogContext.Provider value={value}>{children}</TaskLogContext.Provider>
  );
}

export function useTaskLogs() {
  const context = useContext(TaskLogContext);
  if (!context) {
    throw new Error('useTaskLogs must be used within a TaskLogProvider');
  }
  return context;
}

/**
 * 获取正在运行的任务数量 Hook
 * 用于在侧边栏等位置显示徽章
 */
export function useRunningTaskCount() {
  const { runningTasks } = useTaskLogs();
  return runningTasks.length;
}
