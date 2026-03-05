/**
 * 任务日志存储服务
 * 使用 localStorage 持久化任务日志
 */

import type {
  TaskLog,
  TaskLogFilter,
  TaskLogPage,
  TaskStatus,
  TaskType,
  TaskPlatform,
} from '@/types/taskLog';
import { generateTaskId } from '@/types/taskLog';
import { getScopedKey } from './storageScope';

const STORAGE_KEY = 'zeocanvas_task_logs';
const MAX_LOGS = 200;           // 最多存储 200 条记录
const RETENTION_DAYS = 30;      // 保留 30 天

const getStorageKey = () => getScopedKey(STORAGE_KEY);

/**
 * 从 localStorage 读取所有任务日志
 */
export function loadTaskLogs(): TaskLog[] {
  if (typeof window === 'undefined') return [];

  try {
    const storageKey = getStorageKey();
    let stored = localStorage.getItem(storageKey);
    if (!stored) {
      const legacyStored = localStorage.getItem(STORAGE_KEY);
      if (legacyStored) {
        localStorage.setItem(storageKey, legacyStored);
        localStorage.removeItem(STORAGE_KEY);
        stored = legacyStored;
      }
    }
    if (!stored) return [];
    const logs: TaskLog[] = JSON.parse(stored);
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    console.error('加载任务日志失败:', error);
    return [];
  }
}

/**
 * 保存任务日志到 localStorage
 */
function saveTaskLogs(logs: TaskLog[]): void {
  if (typeof window === 'undefined') return;

  try {
    // 清理过期日志
    const cutoffTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const filteredLogs = logs.filter((log) => log.createdAt > cutoffTime);

    // 限制数量
    const trimmedLogs = filteredLogs.slice(0, MAX_LOGS);

    localStorage.setItem(getStorageKey(), JSON.stringify(trimmedLogs));
  } catch (error) {
    console.error('保存任务日志失败:', error);
  }
}

/**
 * 替换全部任务日志（用于同步）
 */
export function replaceTaskLogs(logs: TaskLog[]): void {
  saveTaskLogs(logs);
  dispatchTaskLogEvent('clear', null);
}

/**
 * 获取当前任务日志存储 Key
 */
export function getTaskLogStorageKey(): string {
  return getStorageKey();
}

/**
 * 添加新任务日志
 */
export function addTaskLog(
  task: Omit<TaskLog, 'id' | 'createdAt'>
): TaskLog {
  const newLog: TaskLog = {
    ...task,
    id: generateTaskId(),
    createdAt: Date.now(),
  };

  const logs = loadTaskLogs();
  logs.unshift(newLog); // 新任务放在最前面
  saveTaskLogs(logs);

  // 发送事件通知
  dispatchTaskLogEvent('add', newLog);

  return newLog;
}

/**
 * 更新任务日志
 */
export function updateTaskLog(
  id: string,
  updates: Partial<Omit<TaskLog, 'id' | 'createdAt'>>
): TaskLog | null {
  const logs = loadTaskLogs();
  const index = logs.findIndex((log) => log.id === id);

  if (index === -1) return null;

  const updatedLog = {
    ...logs[index],
    ...updates,
  };

  logs[index] = updatedLog;
  saveTaskLogs(logs);

  // 发送事件通知
  dispatchTaskLogEvent('update', updatedLog);

  return updatedLog;
}

/**
 * 通过外部 ID 更新任务日志
 */
export function updateTaskLogByExternalId(
  externalId: string,
  updates: Partial<Omit<TaskLog, 'id' | 'createdAt'>>
): TaskLog | null {
  const logs = loadTaskLogs();
  const index = logs.findIndex((log) => log.externalId === externalId);

  if (index === -1) return null;

  const updatedLog = {
    ...logs[index],
    ...updates,
  };

  logs[index] = updatedLog;
  saveTaskLogs(logs);

  // 发送事件通知
  dispatchTaskLogEvent('update', updatedLog);

  return updatedLog;
}

/**
 * 删除任务日志
 */
export function deleteTaskLog(id: string): boolean {
  const logs = loadTaskLogs();
  const index = logs.findIndex((log) => log.id === id);

  if (index === -1) return false;

  const deletedLog = logs[index];
  logs.splice(index, 1);
  saveTaskLogs(logs);

  // 发送事件通知
  dispatchTaskLogEvent('delete', deletedLog);

  return true;
}

/**
 * 批量删除任务日志
 */
export function deleteTaskLogs(ids: string[]): number {
  const logs = loadTaskLogs();
  const idsSet = new Set(ids);
  const filtered = logs.filter((log) => !idsSet.has(log.id));
  const deletedCount = logs.length - filtered.length;

  if (deletedCount > 0) {
    saveTaskLogs(filtered);
    dispatchTaskLogEvent('batch-delete', { count: deletedCount });
  }

  return deletedCount;
}

/**
 * 清空所有任务日志
 */
export function clearTaskLogs(): void {
  saveTaskLogs([]);
  dispatchTaskLogEvent('clear', null);
}

/**
 * 获取单个任务日志
 */
export function getTaskLog(id: string): TaskLog | null {
  const logs = loadTaskLogs();
  return logs.find((log) => log.id === id) || null;
}

/**
 * 通过外部 ID 获取任务日志
 */
export function getTaskLogByExternalId(externalId: string): TaskLog | null {
  const logs = loadTaskLogs();
  return logs.find((log) => log.externalId === externalId) || null;
}

/**
 * 查询任务日志（支持过滤和分页）
 */
export function queryTaskLogs(
  filter?: TaskLogFilter,
  page: number = 1,
  pageSize: number = 20
): TaskLogPage {
  let logs = loadTaskLogs();

  // 应用过滤条件
  if (filter) {
    if (filter.type) {
      logs = logs.filter((log) => log.type === filter.type);
    }
    if (filter.platform) {
      logs = logs.filter((log) => log.platform === filter.platform);
    }
    if (filter.status) {
      logs = logs.filter((log) => log.status === filter.status);
    }
    if (filter.startDate) {
      logs = logs.filter((log) => log.createdAt >= filter.startDate!);
    }
    if (filter.endDate) {
      logs = logs.filter((log) => log.createdAt <= filter.endDate!);
    }
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      logs = logs.filter(
        (log) =>
          log.name.toLowerCase().includes(keyword) ||
          log.description?.toLowerCase().includes(keyword) ||
          log.externalId?.toLowerCase().includes(keyword)
      );
    }
  }

  // 分页
  const total = logs.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedLogs = logs.slice(startIndex, startIndex + pageSize);

  return {
    logs: paginatedLogs,
    total,
    page,
    pageSize,
  };
}

/**
 * 获取正在运行的任务
 */
export function getRunningTasks(): TaskLog[] {
  const logs = loadTaskLogs();
  return logs.filter(
    (log) => log.status === 'running' || log.status === 'submitted' || log.status === 'queued'
  );
}

/**
 * 获取任务统计
 */
export function getTaskStats(): {
  total: number;
  running: number;
  success: number;
  failed: number;
} {
  const logs = loadTaskLogs();

  return {
    total: logs.length,
    running: logs.filter(
      (log) =>
        log.status === 'running' || log.status === 'submitted' || log.status === 'queued'
    ).length,
    success: logs.filter((log) => log.status === 'success').length,
    failed: logs.filter((log) => log.status === 'failed').length,
  };
}

// ==================== 事件系统 ====================

const TASK_LOG_EVENT = 'taskLogUpdate';

interface TaskLogEventDetail {
  action: 'add' | 'update' | 'delete' | 'batch-delete' | 'clear';
  data: TaskLog | { count: number } | null;
}

/**
 * 发送任务日志更新事件
 */
function dispatchTaskLogEvent(
  action: TaskLogEventDetail['action'],
  data: TaskLogEventDetail['data']
): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<TaskLogEventDetail>(TASK_LOG_EVENT, {
      detail: { action, data },
    })
  );
}

/**
 * 监听任务日志更新事件
 */
export function onTaskLogUpdate(
  callback: (event: TaskLogEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<TaskLogEventDetail>;
    callback(customEvent.detail);
  };

  window.addEventListener(TASK_LOG_EVENT, handler);
  return () => window.removeEventListener(TASK_LOG_EVENT, handler);
}

// ==================== 便捷创建方法 ====================

/**
 * 创建工作流任务日志
 */
export function createWorkflowTaskLog(
  workflowId: string,
  workflowName: string,
  parameters: Record<string, unknown>,
  options?: {
    externalId?: string;
    cost?: number;
    debugUrl?: string;
  }
): TaskLog {
  return addTaskLog({
    type: 'workflow',
    platform: 'coze',
    name: workflowName,
    workflowId,
    parameters,
    status: 'submitted',
    externalId: options?.externalId,
    cost: options?.cost,
    debugUrl: options?.debugUrl,
  });
}

/**
 * 创建视频生成任务日志
 */
export function createVideoTaskLog(
  platform: TaskPlatform,
  name: string,
  parameters: Record<string, unknown>,
  options?: {
    externalId?: string;
    canvasId?: string;
    nodeId?: string;
    cost?: number;
  }
): TaskLog {
  return addTaskLog({
    type: 'video',
    platform,
    name,
    parameters,
    status: 'submitted',
    externalId: options?.externalId,
    canvasId: options?.canvasId,
    nodeId: options?.nodeId,
    cost: options?.cost,
  });
}

/**
 * 创建音频生成任务日志
 */
export function createAudioTaskLog(
  platform: TaskPlatform,
  name: string,
  parameters: Record<string, unknown>,
  options?: {
    externalId?: string;
    canvasId?: string;
    nodeId?: string;
    cost?: number;
  }
): TaskLog {
  return addTaskLog({
    type: 'audio',
    platform,
    name,
    parameters,
    status: 'submitted',
    externalId: options?.externalId,
    canvasId: options?.canvasId,
    nodeId: options?.nodeId,
    cost: options?.cost,
  });
}

/**
 * 标记任务开始运行
 */
export function markTaskRunning(
  id: string,
  externalId?: string
): TaskLog | null {
  return updateTaskLog(id, {
    status: 'running',
    startedAt: Date.now(),
    ...(externalId ? { externalId } : {}),
  });
}

/**
 * 标记任务成功完成
 */
export function markTaskSuccess(
  id: string,
  output?: string,
  outputUrls?: TaskLog['outputUrls']
): TaskLog | null {
  return updateTaskLog(id, {
    status: 'success',
    completedAt: Date.now(),
    output,
    outputUrls,
  });
}

/**
 * 标记任务失败
 */
export function markTaskFailed(
  id: string,
  error: string,
  errorCode?: string
): TaskLog | null {
  return updateTaskLog(id, {
    status: 'failed',
    completedAt: Date.now(),
    error,
    errorCode,
  });
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(
  id: string,
  progress: number,
  progressText?: string
): TaskLog | null {
  return updateTaskLog(id, {
    progress: Math.min(100, Math.max(0, progress)),
    progressText,
  });
}
