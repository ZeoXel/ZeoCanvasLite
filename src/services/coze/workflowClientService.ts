/**
 * Coze 工作流客户端服务
 * 用于前端调用工作流 API
 */

import type {
  CozeWorkflow,
  CozeWorkflowCategory,
  CozeApiResponse,
  CozeStreamEvent,
  CozeWorkflowParameters
} from '@/types/coze';

const API_BASE = '/api/coze';

/**
 * 获取工作流列表
 */
export async function fetchWorkflows(
  category?: string
): Promise<CozeApiResponse<{ workflows: CozeWorkflow[]; categories: CozeWorkflowCategory[]; total: number }>> {
  try {
    const url = category && category !== 'all'
      ? `${API_BASE}/workflows?category=${encodeURIComponent(category)}`
      : `${API_BASE}/workflows`;

    const response = await fetch(url);
    return response.json();
  } catch (error) {
    console.error('获取工作流列表失败:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '网络请求失败'
      }
    };
  }
}

/**
 * 获取单个工作流详情
 */
export async function fetchWorkflowDetail(id: string): Promise<CozeApiResponse<CozeWorkflow>> {
  try {
    const response = await fetch(`${API_BASE}/workflows/${id}`);
    return response.json();
  } catch (error) {
    console.error('获取工作流详情失败:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '网络请求失败'
      }
    };
  }
}

/**
 * 执行工作流（流式）
 * 返回 EventSource 风格的事件处理
 */
export async function executeWorkflowStream(
  workflowId: string,
  parameters: CozeWorkflowParameters,
  handlers: {
    onMessage?: (content: string) => void;
    onError?: (error: { code: string; message: string }) => void;
    onDone?: () => void;
  }
): Promise<void> {
  const { onMessage, onError, onDone } = handlers;

  try {
    const response = await fetch(`${API_BASE}/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parameters })
    });

    if (!response.ok) {
      const errorData = await response.json();
      onError?.({
        code: errorData.error?.code || 'REQUEST_FAILED',
        message: errorData.error?.message || '请求失败'
      });
      return;
    }

    if (!response.body) {
      onError?.({
        code: 'NO_RESPONSE_BODY',
        message: '响应体为空'
      });
      return;
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            onDone?.();
            return;
          }

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            const finishReason = json.choices?.[0]?.finish_reason;

            if (content) {
              onMessage?.(content);
            }

            if (finishReason === 'stop') {
              onDone?.();
              return;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    onDone?.();
  } catch (error) {
    console.error('工作流执行失败:', error);
    onError?.({
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : '执行失败'
    });
  }
}

/**
 * 解析输出内容中的媒体 URL
 */
export function parseMediaUrls(content: string): {
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
} {
  const urlPatterns = {
    image: /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)(\?[^\s"'<>]*)?/gi,
    video: /https?:\/\/[^\s"'<>]+\.(mp4|mov|avi|webm)(\?[^\s"'<>]*)?/gi,
    audio: /https?:\/\/[^\s"'<>]+\.(mp3|wav|m4a|ogg)(\?[^\s"'<>]*)?/gi
  };

  return {
    imageUrls: content.match(urlPatterns.image) || [],
    videoUrls: content.match(urlPatterns.video) || [],
    audioUrls: content.match(urlPatterns.audio) || []
  };
}

/**
 * 格式化消耗积分显示
 */
export function formatBalanceCost(cost: number): string {
  if (cost === 0) return '免费';
  return `${cost} 积分`;
}

/**
 * 格式化预计耗时显示
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 分钟';
  if (minutes === 1) return '约 1 分钟';
  return `约 ${minutes} 分钟`;
}

/**
 * 获取分类的图标颜色
 */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    '功能': 'text-gray-500 bg-gray-500/10',
    '品宣制作': 'text-blue-500 bg-blue-500/10',
    '文案策划': 'text-pink-500 bg-pink-500/10',
    '电商内容': 'text-amber-500 bg-amber-500/10',
    '自媒体运营': 'text-purple-500 bg-purple-500/10'
  };
  return colors[category] || 'text-gray-500 bg-gray-500/10';
}

/**
 * 异步执行状态
 */
export type AsyncExecutionStatus =
  | 'submitted'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'unknown';

/**
 * 异步执行记录
 */
export interface AsyncExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  executeId?: string;
  parameters: CozeWorkflowParameters;
  startTime: number;
  endTime?: number;
  status: AsyncExecutionStatus;
  progress?: string;
  output?: string;
  error?: string;
  debugUrl?: string;
}

/**
 * 异步执行工作流
 */
export async function executeWorkflowAsync(
  workflowId: string,
  parameters: CozeWorkflowParameters
): Promise<CozeApiResponse<{ executeId: string; status: string }>> {
  try {
    const response = await fetch(`${API_BASE}/workflows/${workflowId}/run-async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parameters })
    });

    const result = await response.json();

    // 适配 API 响应格式
    if (result.success && result.executeId) {
      return {
        success: true,
        data: {
          executeId: result.executeId,
          status: result.status || 'submitted'
        }
      };
    }

    return result;
  } catch (error) {
    console.error('异步执行工作流失败:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : '网络请求失败'
      }
    };
  }
}

/**
 * 查询工作流执行状态
 */
export async function queryWorkflowHistory(
  workflowId: string,
  executeId: string
): Promise<CozeApiResponse<{
  status: string;
  progress?: string;
  output?: string;
  debug_url?: string;
  error_message?: string;
  data?: Array<{ execute_status?: string; output?: string }>;
}>> {
  try {
    const response = await fetch(`${API_BASE}/workflows/${workflowId}/history/${executeId}`);
    const result = await response.json();

    // 适配 API 响应格式 - history 字段包含实际数据
    if (result.success && result.history) {
      return {
        success: true,
        data: result.history
      };
    }

    return result;
  } catch (error) {
    console.error('查询工作流状态失败:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : '网络请求失败'
      }
    };
  }
}

/**
 * 映射 API 状态到内部状态
 */
export function mapAsyncStatus(apiStatus: string): AsyncExecutionStatus {
  const statusMap: Record<string, AsyncExecutionStatus> = {
    // 网关模式（大写）
    'SUCCESS': 'success',
    'FAILURE': 'error',
    'FAILED': 'error',
    'ERROR': 'error',
    'RUNNING': 'running',
    'IN_PROGRESS': 'running',
    'SUBMITTED': 'running',
    'PENDING': 'running',
    'CANCELLED': 'cancelled',
    'CANCELED': 'cancelled',
    'TIMEOUT': 'unknown',

    // 直连模式（首字母大写）
    'Success': 'success',
    'Failed': 'error',
    'Fail': 'error',
    'Error': 'error',
    'Running': 'running',
    'Pending': 'running',
    'Cancelled': 'cancelled',
    'Canceled': 'cancelled',
    'Timeout': 'unknown'
  };

  return statusMap[apiStatus] || (apiStatus.toLowerCase() as AsyncExecutionStatus);
}

/**
 * 检查异步执行是否完成
 */
export function isAsyncExecutionComplete(status: AsyncExecutionStatus): boolean {
  return ['success', 'error', 'cancelled'].includes(status);
}

/**
 * 获取状态标签
 */
export function getStatusLabel(status: AsyncExecutionStatus): string {
  const labels: Record<AsyncExecutionStatus, string> = {
    'running': '执行中',
    'success': '成功',
    'error': '失败',
    'submitted': '已提交',
    'cancelled': '已取消',
    'unknown': '未知'
  };
  return labels[status] || status;
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status: AsyncExecutionStatus): string {
  const colors: Record<AsyncExecutionStatus, string> = {
    'running': 'text-blue-500',
    'success': 'text-green-500',
    'error': 'text-red-500',
    'submitted': 'text-yellow-500',
    'cancelled': 'text-gray-500',
    'unknown': 'text-gray-400'
  };
  return colors[status] || 'text-gray-500';
}

/**
 * 从执行数据中提取错误信息
 */
export function extractExecutionError(executionData: Record<string, unknown>): string | null {
  if (!executionData) return null;

  const normalizeError = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (obj.message) return String(obj.message);
      if (obj.error) return String(obj.error);
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const candidateErrors = [
    executionData.error,
    executionData.error_message,
    executionData.errorMessage,
    executionData.message,
    executionData.fail_reason,
    executionData.failReason,
    executionData.error_detail,
    (executionData.details as Record<string, unknown>)?.error,
    (executionData.details as Record<string, unknown>)?.message,
    (executionData.progress as Record<string, unknown>)?.error,
  ];

  for (const candidate of candidateErrors) {
    const normalized = normalizeError(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * 生成唯一 ID
 */
export function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
