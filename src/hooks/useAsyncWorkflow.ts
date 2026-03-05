/**
 * 异步工作流执行 Hook
 * 参考原项目 app.js 的轮询逻辑实现
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CozeWorkflow, CozeWorkflowParameters } from '@/types/coze';
import {
  executeWorkflowAsync,
  queryWorkflowHistory,
  mapAsyncStatus,
  isAsyncExecutionComplete,
  extractExecutionError,
  generateExecutionId,
  parseMediaUrls,
  type AsyncExecutionStatus,
  type AsyncExecutionRecord
} from '@/services/coze/workflowClientService';
import {
  createWorkflowTaskLog,
  markTaskRunning,
  markTaskSuccess,
  markTaskFailed,
  updateTaskProgress,
  updateTaskLog,
} from '@/services/taskLogService';

interface UseAsyncWorkflowOptions {
  /** 轮询间隔（毫秒），默认 10000ms (10秒) */
  pollingInterval?: number;
  /** 最大轮询次数，默认 60 次 */
  maxPollingAttempts?: number;
  /** 执行完成回调 */
  onComplete?: (record: AsyncExecutionRecord) => void;
  /** 执行失败回调 */
  onError?: (error: string, record: AsyncExecutionRecord) => void;
  /** 进度更新回调 */
  onProgress?: (progress: string, record: AsyncExecutionRecord) => void;
}

interface UseAsyncWorkflowReturn {
  /** 当前执行记录 */
  execution: AsyncExecutionRecord | null;
  /** 是否正在执行 */
  isExecuting: boolean;
  /** 是否正在轮询 */
  isPolling: boolean;
  /** 消息列表 */
  messages: Array<{ type: 'info' | 'success' | 'error' | 'warning'; content: string; timestamp: number }>;
  /** 执行工作流 */
  execute: (workflow: CozeWorkflow, parameters: CozeWorkflowParameters) => Promise<void>;
  /** 停止轮询 */
  stopPolling: () => void;
  /** 手动查询状态 */
  queryStatus: () => Promise<void>;
  /** 清除状态 */
  reset: () => void;
}

export function useAsyncWorkflow(options: UseAsyncWorkflowOptions = {}): UseAsyncWorkflowReturn {
  const {
    pollingInterval = 10000,
    maxPollingAttempts = 60,
    onComplete,
    onError,
    onProgress
  } = options;

  const [execution, setExecution] = useState<AsyncExecutionRecord | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'info' | 'success' | 'error' | 'warning'; content: string; timestamp: number }>>([]);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingAttemptsRef = useRef(0);
  const executionRef = useRef<AsyncExecutionRecord | null>(null);
  const taskLogIdRef = useRef<string | null>(null);

  // 同步 ref
  useEffect(() => {
    executionRef.current = execution;
  }, [execution]);

  // 添加消息
  const addMessage = useCallback((type: 'info' | 'success' | 'error' | 'warning', content: string) => {
    setMessages(prev => [...prev, { type, content, timestamp: Date.now() }]);
  }, []);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    pollingAttemptsRef.current = 0;
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // 查询状态
  const queryStatus = useCallback(async () => {
    const currentExecution = executionRef.current;
    if (!currentExecution?.executeId) return;

    try {
      pollingAttemptsRef.current++;
      console.log(`🔍 轮询执行状态 (${pollingAttemptsRef.current}/${maxPollingAttempts})`);

      const result = await queryWorkflowHistory(currentExecution.workflowId, currentExecution.executeId);

      if (!result.success || !result.data) {
        console.warn('查询状态失败:', result.error);
        return;
      }

      const historyData = result.data as {
        status?: string;
        progress?: string | number;
        output?: string;
        debug_url?: string;
        error_message?: string;
        data?: Array<{ execute_status?: string; output?: string; progress?: string | number }>;
      };

      // 解析状态（兼容网关模式和直连模式）
      let apiStatus: string | undefined;
      let output: string | undefined;
      let rawProgress: string | number | undefined;

      if (historyData.status) {
        // 网关模式
        apiStatus = historyData.status;
        output = historyData.output;
        rawProgress = historyData.progress;
        console.log('🌐 网关模式响应:', { status: apiStatus, progress: rawProgress, historyData });
      } else if (historyData.data && historyData.data.length > 0) {
        // 直连模式
        apiStatus = historyData.data[0].execute_status;
        output = historyData.data[0].output;
        rawProgress = historyData.data[0].progress;
        console.log('🔗 直连模式响应:', { execute_status: apiStatus, progress: rawProgress });
      }

      if (!apiStatus) return;

      const newStatus = mapAsyncStatus(apiStatus);

      // 解析进度（兼容数字和字符串格式）
      let progressNum = 0;
      let progressText = '';
      if (rawProgress !== undefined && rawProgress !== null) {
        if (typeof rawProgress === 'number') {
          progressNum = rawProgress;
          progressText = `${rawProgress}%`;
        } else if (typeof rawProgress === 'string') {
          progressText = rawProgress;
          // 尝试提取数字
          const match = rawProgress.match(/(\d+)/);
          if (match) {
            progressNum = parseInt(match[1], 10);
          }
        }
      }

      // 如果任务正在运行但没有进度信息，根据状态模拟进度
      if (newStatus === 'running' && progressNum === 0) {
        progressNum = 10; // 运行中至少显示 10%
      }

      console.log('📊 进度解析:', { rawProgress, progressNum, progressText, newStatus });

      // 更新执行记录
      setExecution(prev => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          status: newStatus,
          progress: progressText,
          output,
          debugUrl: historyData.debug_url
        };

        // 触发进度回调
        if (progressText && onProgress) {
          onProgress(progressText, updated);
        }

        return updated;
      });

      // 更新任务日志进度
      if (taskLogIdRef.current) {
        updateTaskProgress(taskLogIdRef.current, progressNum, progressText || undefined);
      }

      // 检查是否完成
      if (isAsyncExecutionComplete(newStatus)) {
        stopPolling();

        setExecution(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            endTime: Date.now(),
            status: newStatus,
            output
          };

          if (newStatus === 'success') {
            addMessage('success', '✅ 工作流执行完成');
            onComplete?.(updated);
            // 更新任务日志为成功
            if (taskLogIdRef.current) {
              const mediaUrls = output ? parseMediaUrls(output) : { imageUrls: [], videoUrls: [], audioUrls: [] };
              markTaskSuccess(taskLogIdRef.current, output, {
                images: mediaUrls.imageUrls,
                videos: mediaUrls.videoUrls,
                audios: mediaUrls.audioUrls,
              });
            }
          } else if (newStatus === 'error') {
            const errorMsg = extractExecutionError(historyData as Record<string, unknown>) || '执行失败';
            updated.error = errorMsg;
            addMessage('error', `❌ 执行失败: ${errorMsg}`);
            onError?.(errorMsg, updated);
            // 更新任务日志为失败
            if (taskLogIdRef.current) {
              markTaskFailed(taskLogIdRef.current, errorMsg);
            }
          } else if (newStatus === 'cancelled') {
            updated.error = '任务已取消';
            addMessage('warning', '⚠️ 任务已被取消');
            // 更新任务日志为取消
            if (taskLogIdRef.current) {
              updateTaskLog(taskLogIdRef.current, { status: 'cancelled', completedAt: Date.now() });
            }
          }

          return updated;
        });

        setIsExecuting(false);
        return;
      }

      // 检查是否超过最大轮询次数
      if (pollingAttemptsRef.current >= maxPollingAttempts) {
        stopPolling();
        setExecution(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'unknown',
            error: '轮询次数达到上限，请手动查看执行状态'
          };
        });
        addMessage('warning', '⏰ 轮询次数达到上限，请在历史记录中手动查询执行状态');
        setIsExecuting(false);
      }

    } catch (error) {
      console.error('轮询状态失败:', error);
      const errorMsg = error instanceof Error ? error.message : '查询失败';

      // 检查是否为致命错误
      const isFatalError = errorMsg.includes('认证失败') ||
        errorMsg.includes('权限不足') ||
        errorMsg.includes('401') ||
        errorMsg.includes('403');

      if (isFatalError) {
        stopPolling();
        setExecution(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'error',
            error: errorMsg,
            endTime: Date.now()
          };
        });
        addMessage('error', `❌ 致命错误: ${errorMsg}`);
        setIsExecuting(false);
      } else {
        addMessage('warning', `查询状态超时，将继续重试: ${errorMsg}`);
      }
    }
  }, [maxPollingAttempts, stopPolling, addMessage, onComplete, onError, onProgress]);

  // 开始轮询
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    setIsPolling(true);
    pollingAttemptsRef.current = 0;

    // 立即执行一次
    queryStatus();

    // 设置定时轮询
    pollingIntervalRef.current = setInterval(queryStatus, pollingInterval);
  }, [queryStatus, pollingInterval]);

  // 执行工作流
  const execute = useCallback(async (workflow: CozeWorkflow, parameters: CozeWorkflowParameters) => {
    // 重置状态
    stopPolling();
    setMessages([]);
    setIsExecuting(true);
    taskLogIdRef.current = null;

    const record: AsyncExecutionRecord = {
      id: generateExecutionId(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      parameters,
      startTime: Date.now(),
      status: 'submitted'
    };

    setExecution(record);
    addMessage('info', '📤 提交异步执行请求...');

    // 创建任务日志
    const taskLog = createWorkflowTaskLog(
      workflow.id,
      workflow.name,
      parameters as Record<string, unknown>,
      { cost: workflow.balanceCost }
    );
    taskLogIdRef.current = taskLog.id;

    try {
      const result = await executeWorkflowAsync(workflow.id, parameters);

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || '提交失败');
      }

      const { executeId } = result.data;

      setExecution(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          executeId,
          status: 'running'
        };
      });

      // 更新任务日志：标记为运行中，添加外部ID
      if (taskLogIdRef.current) {
        markTaskRunning(taskLogIdRef.current, executeId);
      }

      addMessage('success', `✅ 异步任务已提交，执行ID: ${executeId}`);
      addMessage('info', '提示：工作流运行时间不固定，将自动周期性查询结果');

      // 开始轮询
      startPolling();

    } catch (error) {
      console.error('异步执行失败:', error);
      const errorMsg = error instanceof Error ? error.message : '执行失败';

      setExecution(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'error',
          error: errorMsg,
          endTime: Date.now()
        };
      });

      // 更新任务日志为失败
      if (taskLogIdRef.current) {
        markTaskFailed(taskLogIdRef.current, errorMsg);
      }

      addMessage('error', `❌ 异步执行失败: ${errorMsg}`);
      setIsExecuting(false);
      onError?.(errorMsg, record);
    }
  }, [stopPolling, addMessage, startPolling, onError]);

  // 重置
  const reset = useCallback(() => {
    stopPolling();
    setExecution(null);
    setMessages([]);
    setIsExecuting(false);
  }, [stopPolling]);

  return {
    execution,
    isExecuting,
    isPolling,
    messages,
    execute,
    stopPolling,
    queryStatus,
    reset
  };
}

export default useAsyncWorkflow;
