/**
 * 全局任务轮询服务
 * 在后台持续轮询运行中的任务状态
 */

import type { TaskLog } from '@/types/taskLog';
import {
  updateTaskLog,
  markTaskSuccess,
  markTaskFailed,
  updateTaskProgress,
  loadTaskLogs,
  getTaskLog,
} from '@/services/taskLogService';
import { queryWorkflowHistory, mapAsyncStatus, isAsyncExecutionComplete, parseMediaUrls } from '@/services/coze/workflowClientService';
import {
  recordTaskCompletion,
  removeTask as removeVideoTask,
} from '@/services/videoTaskManager';

// 轮询配置
const POLL_INTERVAL = 10000; // 10秒
const MAX_POLL_ATTEMPTS = 120; // 最多轮询 20 分钟

// 记录每个任务的轮询次数
const pollAttempts = new Map<string, number>();


/**
 * 轮询单个工作流任务
 */
async function pollWorkflowTask(taskId: string): Promise<boolean> {
  // 从 localStorage 读取最新的任务数据（避免使用过时的 React 状态）
  const task = getTaskLog(taskId);
  if (!task) {
    console.warn(`[TaskPolling] 工作流任务 ${taskId} 不存在`);
    return true; // 任务已删除，停止轮询
  }

  // 检查任务是否已完成
  if (task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') {
    console.log(`[TaskPolling] 工作流任务 ${taskId} 已完成，状态: ${task.status}`);
    return true;
  }

  // 检查必要信息
  if (!task.workflowId) {
    console.warn(`[TaskPolling] 工作流任务缺少 workflowId:`, task.id);
    markTaskFailed(task.id, '任务信息不完整，无法继续轮询');
    return true;
  }

  if (!task.externalId) {
    // 任务可能还在提交中（submitted 状态），等待下一次轮询
    if (task.status === 'submitted') {
      // 检查是否提交太久了（超过 2 分钟认为提交失败）
      const submitTimeout = 2 * 60 * 1000;
      if (task.createdAt && Date.now() - task.createdAt > submitTimeout) {
        console.warn(`[TaskPolling] 工作流任务 ${task.id} 提交超时`);
        markTaskFailed(task.id, '任务提交超时，请重试');
        return true;
      }
      console.log(`[TaskPolling] 工作流任务 ${task.id} 正在提交中，等待 executeId...`);
      return false; // 继续等待
    }
    // 如果已经是 running 状态但没有 externalId，说明数据有问题
    console.warn(`[TaskPolling] 工作流任务 ${task.id} 缺少 externalId，状态: ${task.status}`);
    markTaskFailed(task.id, '任务执行ID丢失，无法继续轮询');
    return true;
  }

  const attempts = (pollAttempts.get(task.id) || 0) + 1;
  pollAttempts.set(task.id, attempts);

  if (attempts > MAX_POLL_ATTEMPTS) {
    console.warn(`[TaskPolling] 任务 ${task.id} 轮询超时`);
    markTaskFailed(task.id, '轮询超时，请手动检查执行状态');
    pollAttempts.delete(task.id);
    return true;
  }

  try {
    console.log(`[TaskPolling] 轮询工作流任务 ${task.id} (${attempts}/${MAX_POLL_ATTEMPTS})`);

    const result = await queryWorkflowHistory(task.workflowId, task.externalId);

    if (!result.success || !result.data) {
      console.warn(`[TaskPolling] 查询失败:`, result.error);
      return false; // 继续轮询
    }

    const historyData = result.data as {
      status?: string;
      progress?: string | number;
      output?: string;
      debug_url?: string;
      error_message?: string;
      data?: Array<{ execute_status?: string; output?: string; progress?: string | number }>;
    };

    // 解析状态
    let apiStatus: string | undefined;
    let output: string | undefined;
    let rawProgress: string | number | undefined;

    if (historyData.status) {
      apiStatus = historyData.status;
      output = historyData.output;
      rawProgress = historyData.progress;
    } else if (historyData.data && historyData.data.length > 0) {
      apiStatus = historyData.data[0].execute_status;
      output = historyData.data[0].output;
      rawProgress = historyData.data[0].progress;
    }

    if (!apiStatus) return false;

    const newStatus = mapAsyncStatus(apiStatus);

    // 解析进度
    let progressNum = 0;
    let progressText = '';
    if (rawProgress !== undefined && rawProgress !== null) {
      if (typeof rawProgress === 'number') {
        progressNum = rawProgress;
        progressText = `${rawProgress}%`;
      } else if (typeof rawProgress === 'string') {
        progressText = rawProgress;
        const match = rawProgress.match(/(\d+)/);
        if (match) {
          progressNum = parseInt(match[1], 10);
        }
      }
    }

    // 更新进度
    if (progressNum > 0) {
      updateTaskProgress(task.id, progressNum, progressText);
    }

    // 检查是否完成
    if (isAsyncExecutionComplete(newStatus)) {
      pollAttempts.delete(task.id);

      if (newStatus === 'success') {
        const mediaUrls = output ? parseMediaUrls(output) : { imageUrls: [], videoUrls: [], audioUrls: [] };
        markTaskSuccess(task.id, output, {
          images: mediaUrls.imageUrls,
          videos: mediaUrls.videoUrls,
          audios: mediaUrls.audioUrls,
        });
        console.log(`[TaskPolling] 任务 ${task.id} 完成`);
      } else if (newStatus === 'error') {
        const errorMsg = historyData.error_message || '执行失败';
        markTaskFailed(task.id, errorMsg);
        console.log(`[TaskPolling] 任务 ${task.id} 失败: ${errorMsg}`);
      } else if (newStatus === 'cancelled') {
        updateTaskLog(task.id, { status: 'cancelled', completedAt: Date.now() });
        console.log(`[TaskPolling] 任务 ${task.id} 已取消`);
      }
      return true; // 停止轮询
    }

    return false; // 继续轮询
  } catch (error) {
    console.error(`[TaskPolling] 轮询任务 ${task.id} 出错:`, error);
    return false; // 出错继续轮询
  }
}

/**
 * 轮询单个视频任务
 */
async function pollVideoTask(taskId: string): Promise<boolean> {
  // 从 localStorage 读取最新的任务数据
  const task = getTaskLog(taskId);
  if (!task) {
    console.warn(`[TaskPolling] 视频任务 ${taskId} 不存在`);
    return true;
  }

  // 检查任务是否已完成
  if (task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') {
    console.log(`[TaskPolling] 视频任务 ${taskId} 已完成，状态: ${task.status}`);
    return true;
  }

  if (!task.externalId) {
    // 任务可能还在提交中
    if (task.status === 'submitted') {
      const submitTimeout = 2 * 60 * 1000;
      if (task.createdAt && Date.now() - task.createdAt > submitTimeout) {
        console.warn(`[TaskPolling] 视频任务 ${task.id} 提交超时`);
        markTaskFailed(task.id, '任务提交超时，请重试');
        return true;
      }
      console.log(`[TaskPolling] 视频任务 ${task.id} 正在提交中，等待 taskId...`);
      return false;
    }
    console.warn(`[TaskPolling] 视频任务 ${task.id} 缺少 externalId`);
    markTaskFailed(task.id, '任务ID丢失，无法继续轮询');
    return true;
  }

  const attempts = (pollAttempts.get(task.id) || 0) + 1;
  pollAttempts.set(task.id, attempts);

  if (attempts > MAX_POLL_ATTEMPTS) {
    console.warn(`[TaskPolling] 视频任务 ${task.id} 轮询超时`);
    markTaskFailed(task.id, '轮询超时');
    pollAttempts.delete(task.id);
    return true;
  }

  try {
    console.log(`[TaskPolling] 轮询视频任务 ${task.id} (${attempts}/${MAX_POLL_ATTEMPTS})`);

    // 根据平台确定 provider
    const providerMap: Record<string, string> = {
      vidu: 'vidu',
      seedream: 'seedance',
      veo: 'veo',
    };
    const provider = providerMap[task.platform] || task.platform;
    const model =
      typeof task.parameters?.model === 'string' ? task.parameters.model : undefined;
    const aspectRatio =
      typeof task.parameters?.aspectRatio === 'string'
        ? task.parameters.aspectRatio
        : undefined;
    const completionTaskId = task.externalId || task.id;

    const params = new URLSearchParams({ taskId: task.externalId, provider });
    const response = await fetch(`/api/studio/video?${params.toString()}`);

    if (!response.ok) {
      console.warn(`[TaskPolling] 视频任务查询失败: ${response.status}`);
      return false;
    }

    const result = await response.json();

    // 更新进度
    const progressPercent = Math.min(90, Math.round((attempts / MAX_POLL_ATTEMPTS) * 100));
    updateTaskProgress(task.id, progressPercent, '生成中...');

    if (result.status === 'SUCCESS') {
      // 等待 COS 上传完成再标记任务成功，避免使用会过期的原始URL
      if (!result.cosReady) {
        console.log(`[TaskPolling] 视频任务 ${task.id} 生成完成，等待 COS 上传...`);
        updateTaskProgress(task.id, 95, 'COS 存储中...');
        return false; // 继续轮询
      }

      pollAttempts.delete(task.id);
      markTaskSuccess(task.id, undefined, {
        videos: result.videoUrl ? [result.videoUrl] : [],
      });
      if (task.nodeId) {
        recordTaskCompletion({
          taskId: completionTaskId,
          nodeId: task.nodeId,
          provider,
          model,
          aspectRatio,
          status: 'SUCCESS',
          videoUrl: result.videoUrl,
          completedAt: Date.now(),
        });
      }
      removeVideoTask(completionTaskId);
      console.log(`[TaskPolling] 视频任务 ${task.id} 完成 (COS URL)`);
      return true;
    }

    if (result.status === 'FAILURE') {
      pollAttempts.delete(task.id);
      markTaskFailed(task.id, result.error || '视频生成失败');
      if (task.nodeId) {
        recordTaskCompletion({
          taskId: completionTaskId,
          nodeId: task.nodeId,
          provider,
          model,
          aspectRatio,
          status: 'FAILURE',
          error: result.error || '视频生成失败',
          completedAt: Date.now(),
        });
      }
      removeVideoTask(completionTaskId);
      console.log(`[TaskPolling] 视频任务 ${task.id} 失败`);
      return true;
    }

    return false; // IN_PROGRESS，继续轮询
  } catch (error) {
    console.error(`[TaskPolling] 轮询视频任务 ${task.id} 出错:`, error);
    return false;
  }
}

/**
 * 轮询所有运行中的任务
 * 注意：这个函数会从 localStorage 读取最新数据，不依赖传入的 tasks 参数
 */
export async function pollRunningTasks(): Promise<void> {
  // 从 localStorage 读取最新的任务列表
  const allTasks = loadTaskLogs();
  const runningTasks = allTasks.filter(
    (t) => t.status === 'running' || t.status === 'submitted' || t.status === 'queued'
  );

  if (runningTasks.length === 0) return;

  console.log(`[TaskPolling] 开始轮询 ${runningTasks.length} 个运行中的任务`);

  for (const task of runningTasks) {
    try {
      if (task.type === 'workflow') {
        await pollWorkflowTask(task.id);
      } else if (task.type === 'video') {
        await pollVideoTask(task.id);
      }
      // 音频任务暂不支持全局轮询
    } catch (error) {
      console.error(`[TaskPolling] 轮询任务 ${task.id} 异常:`, error);
    }
  }
}

/**
 * 清理任务的轮询计数
 */
export function clearPollAttempts(taskId: string): void {
  pollAttempts.delete(taskId);
}

/**
 * 获取轮询间隔
 */
export function getPollInterval(): number {
  return POLL_INTERVAL;
}
