/**
 * 视频任务管理器
 *
 * 功能：
 * - 持久化待处理的视频任务到 localStorage
 * - 页面刷新后恢复轮询
 * - 任务完成后自动清理
 * - 自动压缩图片避免 Vercel 请求体大小限制
 * - 智能错误处理（区分可恢复/不可恢复错误）
 * - 指数退避轮询策略
 * - 任务日志记录
 */

import { compressImages } from '@/services/providers/shared';
import {
  createVideoTaskLog,
  markTaskRunning,
} from '@/services/taskLogService';
import type { TaskPlatform } from '@/types/taskLog';
import { getScopedKey } from '@/services/storageScope';

const STORAGE_KEY = 'zeocanvas_video_tasks';
const COMPLETED_STORAGE_KEY = 'zeocanvas_video_task_results';

const getPendingStorageKey = () => getScopedKey(STORAGE_KEY);
const getCompletedStorageKey = () => getScopedKey(COMPLETED_STORAGE_KEY);

// 任务过期时间：60分钟（支持长视频生成）
const TASK_EXPIRY_MS = 60 * 60 * 1000;
// 完成结果保留时间：2小时（用于页面刷新/切页恢复）
const COMPLETED_EXPIRY_MS = 2 * 60 * 60 * 1000;

// 轮询配置
const POLL_CONFIG = {
  maxAttempts: 240,           // 20分钟超时 (240 × 5s = 1200s)
  baseInterval: 5000,         // 基础间隔 5秒
  maxInterval: 30000,         // 最大间隔 30秒
  backoffMultiplier: 1.5,     // 退避倍数
};

// 不可恢复的错误码
const FATAL_ERROR_CODES = [400, 401, 403, 404, 410, 422];

// 判断是否为不可恢复错误
const isFatalError = (error: any): boolean => {
  const message = error?.message || '';
  // HTTP 状态码错误
  for (const code of FATAL_ERROR_CODES) {
    if (message.includes(`${code}`)) return true;
  }
  // 特定错误消息
  if (message.includes('API Key') || message.includes('未配置')) return true;
  if (message.includes('不存在') || message.includes('not found')) return true;
  if (message.includes('认证') || message.includes('auth')) return true;
  return false;
};

export interface VideoTask {
  taskId: string;
  provider: 'veo' | 'seedance' | 'vidu';
  nodeId: string;
  model: string;
  aspectRatio: string;
  createdAt: number;
}

// 映射 provider 到 TaskPlatform
const mapProviderToPlatform = (provider: string): TaskPlatform => {
  const map: Record<string, TaskPlatform> = {
    vidu: 'vidu',
    seedance: 'seedream',
    veo: 'veo',
  };
  return map[provider] || 'other';
};

export interface VideoTaskResult {
  taskId: string;
  status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';
  videoUrl?: string;
  error?: string;
}

export interface VideoTaskCompletion {
  taskId: string;
  nodeId?: string;
  provider?: string;
  model?: string;
  aspectRatio?: string;
  status: 'SUCCESS' | 'FAILURE';
  videoUrl?: string;
  error?: string;
  completedAt: number;
}

// 获取所有待处理任务
export const getPendingTasks = (): VideoTask[] => {
  try {
    const scopedKey = getPendingStorageKey();
    let data = localStorage.getItem(scopedKey);
    if (!data) {
      const legacyData = localStorage.getItem(STORAGE_KEY);
      if (legacyData) {
        localStorage.setItem(scopedKey, legacyData);
        localStorage.removeItem(STORAGE_KEY);
        data = legacyData;
      }
    }
    if (!data) return [];
    const tasks = JSON.parse(data) as VideoTask[];
    // 过滤掉已过期的任务
    const now = Date.now();
    const validTasks = tasks.filter(t => now - t.createdAt < TASK_EXPIRY_MS);
    // 如果有过期任务被过滤，更新存储
    if (validTasks.length !== tasks.length) {
      console.log(`[VideoTaskManager] Cleaned ${tasks.length - validTasks.length} expired tasks`);
      localStorage.setItem(getPendingStorageKey(), JSON.stringify(validTasks));
    }
    return validTasks;
  } catch {
    return [];
  }
};

// 添加任务
export const addTask = (task: VideoTask): void => {
  try {
    const tasks = getPendingTasks();
    // 避免重复添加
    if (!tasks.find(t => t.taskId === task.taskId)) {
      tasks.push(task);
      localStorage.setItem(getPendingStorageKey(), JSON.stringify(tasks));
    }
  } catch (e) {
    console.warn('[VideoTaskManager] Failed to add task:', e);
  }
};

// 移除任务
export const removeTask = (taskId: string): void => {
  try {
    const tasks = getPendingTasks();
    const filtered = tasks.filter(t => t.taskId !== taskId);
    localStorage.setItem(getPendingStorageKey(), JSON.stringify(filtered));
  } catch (e) {
    console.warn('[VideoTaskManager] Failed to remove task:', e);
  }
};

const getCompletedTasksInternal = (): VideoTaskCompletion[] => {
  try {
    const scopedKey = getCompletedStorageKey();
    let data = localStorage.getItem(scopedKey);
    if (!data) {
      const legacyData = localStorage.getItem(COMPLETED_STORAGE_KEY);
      if (legacyData) {
        localStorage.setItem(scopedKey, legacyData);
        localStorage.removeItem(COMPLETED_STORAGE_KEY);
        data = legacyData;
      }
    }
    if (!data) return [];
    const tasks = JSON.parse(data) as VideoTaskCompletion[];
    const now = Date.now();
    const validTasks = tasks.filter(t => now - t.completedAt < COMPLETED_EXPIRY_MS);
    if (validTasks.length !== tasks.length) {
      localStorage.setItem(getCompletedStorageKey(), JSON.stringify(validTasks));
    }
    return validTasks;
  } catch {
    return [];
  }
};

export const getCompletedTasks = (): VideoTaskCompletion[] => {
  return getCompletedTasksInternal();
};

export const recordTaskCompletion = (completion: VideoTaskCompletion): void => {
  try {
    const tasks = getCompletedTasksInternal();
    const index = tasks.findIndex(t => t.taskId === completion.taskId);
    const next = {
      ...completion,
      completedAt: completion.completedAt || Date.now(),
    };
    if (index >= 0) {
      tasks[index] = { ...tasks[index], ...next };
    } else {
      tasks.unshift(next);
    }
    localStorage.setItem(getCompletedStorageKey(), JSON.stringify(tasks));
  } catch (e) {
    console.warn('[VideoTaskManager] Failed to record completion:', e);
  }
};

export const removeCompletedTask = (taskId: string): void => {
  try {
    const tasks = getCompletedTasksInternal();
    const filtered = tasks.filter(t => t.taskId !== taskId);
    localStorage.setItem(getCompletedStorageKey(), JSON.stringify(filtered));
  } catch (e) {
    console.warn('[VideoTaskManager] Failed to remove completed task:', e);
  }
};

// 查询任务状态
export const queryTaskStatus = async (
  taskId: string,
  provider: string,
  model?: string
): Promise<VideoTaskResult> => {
  const params = new URLSearchParams({ taskId, provider });
  if (model) params.set('model', model);
  const response = await fetch(`/api/studio/video?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Query failed: ${response.status}`);
  }
  return response.json();
};

// 轮询单个任务直到完成
export const pollTask = async (
  task: VideoTask,
  onProgress?: (status: string) => void,
  onComplete?: (result: VideoTaskResult) => void,
  onError?: (error: string) => void
): Promise<VideoTaskResult | null> => {
  const { maxAttempts, baseInterval, maxInterval, backoffMultiplier } = POLL_CONFIG;
  let currentInterval = baseInterval;
  let consecutiveErrors = 0;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await queryTaskStatus(task.taskId, task.provider, task.model);

      // 成功查询，重置错误计数和间隔
      consecutiveErrors = 0;
      currentInterval = baseInterval;

      onProgress?.(result.status);

      if (result.status === 'SUCCESS') {
        recordTaskCompletion({
          taskId: task.taskId,
          nodeId: task.nodeId,
          provider: task.provider,
          model: task.model,
          aspectRatio: task.aspectRatio,
          status: 'SUCCESS',
          videoUrl: result.videoUrl,
          completedAt: Date.now(),
        });
        removeTask(task.taskId);
        console.log(`[VideoTaskManager] Task ${task.taskId} completed successfully`);
        onComplete?.(result);
        return result;
      }

      if (result.status === 'FAILURE') {
        recordTaskCompletion({
          taskId: task.taskId,
          nodeId: task.nodeId,
          provider: task.provider,
          model: task.model,
          aspectRatio: task.aspectRatio,
          status: 'FAILURE',
          error: result.error,
          completedAt: Date.now(),
        });
        removeTask(task.taskId);
        const errorMsg = result.error || '视频生成失败';
        console.error(`[VideoTaskManager] Task ${task.taskId} failed:`, errorMsg);
        onError?.(errorMsg);
        return result;
      }

      // IN_PROGRESS - 继续等待
      if (i > 0 && i % 12 === 0) {
        // 每分钟输出一次进度日志
        console.log(`[VideoTaskManager] Task ${task.taskId} still processing... (${Math.round(i * baseInterval / 60000)} min)`);
      }
    } catch (err: any) {
      consecutiveErrors++;

      // 检查是否为不可恢复错误
      if (isFatalError(err)) {
        recordTaskCompletion({
          taskId: task.taskId,
          nodeId: task.nodeId,
          provider: task.provider,
          model: task.model,
          aspectRatio: task.aspectRatio,
          status: 'FAILURE',
          error: `任务失败: ${err.message}`,
          completedAt: Date.now(),
        });
        removeTask(task.taskId);
        const errorMsg = `任务失败: ${err.message}`;
        console.error(`[VideoTaskManager] Fatal error for task ${task.taskId}:`, err.message);
        onError?.(errorMsg);
        return { taskId: task.taskId, status: 'FAILURE', error: errorMsg };
      }

      // 可恢复错误：使用指数退避
      console.warn(`[VideoTaskManager] Poll error (attempt ${i + 1}, consecutive: ${consecutiveErrors}):`, err.message);

      // 连续错误超过10次，认为服务不可用
      if (consecutiveErrors >= 10) {
        recordTaskCompletion({
          taskId: task.taskId,
          nodeId: task.nodeId,
          provider: task.provider,
          model: task.model,
          aspectRatio: task.aspectRatio,
          status: 'FAILURE',
          error: '服务暂时不可用，请稍后重试',
          completedAt: Date.now(),
        });
        removeTask(task.taskId);
        const errorMsg = '服务暂时不可用，请稍后重试';
        console.error(`[VideoTaskManager] Too many consecutive errors for task ${task.taskId}`);
        onError?.(errorMsg);
        return { taskId: task.taskId, status: 'FAILURE', error: errorMsg };
      }

      // 增加等待间隔（指数退避）
      currentInterval = Math.min(currentInterval * backoffMultiplier, maxInterval);
    }

    await new Promise(resolve => setTimeout(resolve, currentInterval));
  }

  // 超时
  recordTaskCompletion({
    taskId: task.taskId,
    nodeId: task.nodeId,
    provider: task.provider,
    model: task.model,
    aspectRatio: task.aspectRatio,
    status: 'FAILURE',
    error: `视频生成超时（${Math.round(maxAttempts * baseInterval / 60000)}分钟）`,
    completedAt: Date.now(),
  });
  removeTask(task.taskId);
  const timeoutMsg = `视频生成超时（${Math.round(maxAttempts * baseInterval / 60000)}分钟）`;
  console.error(`[VideoTaskManager] Task ${task.taskId} timed out`);
  onError?.(timeoutMsg);
  return null;
};

// 创建视频任务（只创建，不轮询）
export const createVideoTask = async (
  nodeId: string,
  requestBody: {
    prompt: string;
    model: string;
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
    images?: string[];
    imageRoles?: string[];
    videoConfig?: any;
    viduSubjects?: any[];
  }
): Promise<VideoTask> => {
  // 压缩 Base64 图片减小传输体积（URL 格式会自动跳过）
  const compressedBody = { ...requestBody };

  if (requestBody.images && requestBody.images.length > 0) {
    console.log(`[VideoTaskManager] Compressing ${requestBody.images.length} images...`);
    compressedBody.images = await compressImages(requestBody.images, {
      maxWidth: 1280,
      maxHeight: 720,
      quality: 0.85,
    });
  }

  if (requestBody.viduSubjects && requestBody.viduSubjects.length > 0) {
    console.log(`[VideoTaskManager] Compressing Vidu subject images...`);
    compressedBody.viduSubjects = await Promise.all(
      requestBody.viduSubjects.map(async (subject: any) => ({
        ...subject,
        images: await compressImages(subject.images || [], {
          maxWidth: 1280,
          maxHeight: 720,
          quality: 0.85,
        }),
      }))
    );
  }

  const response = await fetch('/api/studio/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(compressedBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API错误: ${response.status}`);
  }

  const result = await response.json();

  // 创建任务日志
  const platform = mapProviderToPlatform(result.provider);
  const providerNames: Record<string, string> = {
    vidu: 'Vidu',
    seedance: 'Seedance',
    veo: 'Veo',
  };
  const taskLog = createVideoTaskLog(
    platform,
    `${providerNames[result.provider] || result.provider} 视频生成`,
    {
      prompt: requestBody.prompt,
      model: requestBody.model,
      aspectRatio: requestBody.aspectRatio,
      duration: requestBody.duration,
    },
    {
      externalId: result.taskId,
      nodeId,
    }
  );

  // 标记为运行中
  markTaskRunning(taskLog.id, result.taskId);

  const task: VideoTask = {
    taskId: result.taskId,
    provider: result.provider,
    nodeId,
    model: requestBody.model,
    aspectRatio: requestBody.aspectRatio || '16:9',
    createdAt: Date.now(),
  };

  addTask(task);
  console.log(`[VideoTaskManager] 创建视频任务并记录日志: ${task.taskId}`);
  return task;
};
