/**
 * Veo (Google) 视频生成服务
 *
 * 支持模型:
 * - veo3.1: 支持视频自动配套音频生成
 * - veo3.1-pro: 超高质量版本
 * - veo3.1-components: 多图参考模式 (1-3张图)
 */

import { handleApiError, wait, type VideoGenerationResult } from './shared';

// ==================== 类型定义 ====================

export interface VeoGenerateOptions {
  prompt: string;
  model?: 'veo3.1' | 'veo3.1-pro' | 'veo3.1-components';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  duration?: number;       // 5-8 秒
  enhancePrompt?: boolean;
  enableUpsample?: boolean;
  images?: string[];       // 首尾帧或多图参考
}

export interface VeoTaskResult {
  task_id: string;
  status: 'NOT_START' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress?: string;
  fail_reason?: string;
  data?: {
    output?: string;  // Video URL
  };
}

type GatewayConfig = { baseUrl?: string; apiKey?: string };

const getGatewayConfig = (gateway?: GatewayConfig) => {
  const baseUrl = gateway?.baseUrl || process.env.OPENAI_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || 'https://api.lsaigc.com';
  const apiKey = gateway?.apiKey || process.env.OPENAI_API_KEY;
  return { baseUrl, apiKey };
};

const normalizeTaskResult = (taskId: string, payload: any): VeoTaskResult => {
  // 根据文档，返回格式为顶层字段，不在data中嵌套
  const rawStatus = (payload.status || payload.state || payload.task_status || '').toString();
  const errorMsg = payload.fail_reason || payload.error || payload.message;

  let status: VeoTaskResult['status'] = 'IN_PROGRESS';
  if (['SUCCESS', 'SUCCEEDED', 'DONE'].includes(rawStatus.toUpperCase()))
    status = 'SUCCESS';
  else if (['FAILURE', 'FAILED', 'ERROR'].includes(rawStatus.toUpperCase()) || errorMsg)
    status = 'FAILURE';
  else if (['NOT_START', 'QUEUED', 'SUBMITTED'].includes(rawStatus.toUpperCase()))
    status = 'NOT_START';

  // 输出URL在 data.output 字段中
  const output = payload.data?.output || payload.output;

  return {
    task_id: payload.task_id || taskId,
    status,
    progress: payload.progress,
    fail_reason: errorMsg,
    data: output ? { output } : undefined,
  };
};

// ==================== API 函数 ====================

/**
 * 创建 Veo 视频生成任务
 */
export const createTask = async (
  options: VeoGenerateOptions,
  gateway?: GatewayConfig
): Promise<string> => {
  const { baseUrl, apiKey } = getGatewayConfig(gateway);

  if (!apiKey) {
    throw new Error('API Key未配置，请在设置中配置');
  }

  // 根据文档，应该使用 JSON 格式和 /v2/videos/generations 端点
  // 但网关可能还在使用旧的配置，所以我们尝试多个端点
  const body: any = {
    prompt: options.prompt,
    model: options.model || 'veo3.1',
  };

  // images 字段是必需的（根据文档），即使是文生视频也要传空数组
  body.images = options.images && options.images.length > 0 ? options.images : [];

  if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;
  if (options.duration) body.duration = options.duration;
  if (options.enhancePrompt !== undefined) body.enhance_prompt = options.enhancePrompt;
  if (options.enableUpsample !== undefined) body.enable_upsample = options.enableUpsample;

  // 尝试 v2 端点（根据文档）
  let endpoint = `${baseUrl}/v2/videos/generations`;
  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  // 如果 v2 端点返回 HTML 或 404，回退到 v1 端点
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    console.warn('[Veo] v2 endpoint failed, trying v1...');
    endpoint = `${baseUrl}/v1/video/generations`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Veo API错误: ${response.status} - ${handleApiError(errorData)}`);
  }

  const result = await response.json();
  const taskId = result?.task_id || result?.data?.task_id;
  if (!taskId) {
    throw new Error('Veo 未返回任务ID');
  }
  return taskId;
};

/**
 * 查询 Veo 任务状态
 */
export const queryTask = async (
  taskId: string,
  gateway?: GatewayConfig,
  model?: string
): Promise<VeoTaskResult> => {
  const { baseUrl, apiKey } = getGatewayConfig(gateway);

  if (!apiKey) {
    throw new Error('API Key未配置');
  }

  const query = model ? `?model=${encodeURIComponent(model)}` : '';
  const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}${query}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    if (text.includes('cloudflare') && text.length > 1000) {
      throw new Error(`Veo查询错误: 网关超时 (HTTP ${response.status})，请稍后重试`);
    }
    const errorData = (() => { try { return JSON.parse(text); } catch { return { message: text.slice(0, 200) }; } })();
    throw new Error(`Veo查询错误: ${response.status} - ${handleApiError(errorData)}`);
  }

  const payload = await response.json();
  return normalizeTaskResult(taskId, payload);
};

/**
 * 生成 Veo 视频 (包含轮询等待)
 */
export const generateVideo = async (
  options: VeoGenerateOptions,
  onProgress?: (progress: string) => void,
  gateway?: GatewayConfig
): Promise<VideoGenerationResult> => {
  const taskId = await createTask(options, gateway);

  // 轮询等待结果
  const maxAttempts = 120;  // 最多等待10分钟 (120 * 5秒)
  let attempts = 0;

  while (attempts < maxAttempts) {
    await wait(5000);
    attempts++;

    const result = await queryTask(taskId, gateway);

    if (result.progress) {
      onProgress?.(result.progress);
    }

    if (result.status === 'SUCCESS') {
      if (result.data?.output) {
        return { url: result.data.output, taskId };
      }
      throw new Error('视频生成成功但未返回URL');
    }

    if (result.status === 'FAILURE') {
      throw new Error(`视频生成失败: ${result.fail_reason || '未知错误'}`);
    }
  }

  throw new Error('视频生成超时');
};

// ==================== 厂商信息 ====================

export const PROVIDER_INFO = {
  id: 'veo',
  name: 'Veo',
  category: 'video' as const,
  models: [
    { id: 'veo3.1', name: 'Veo 3.1', isDefault: true },
    { id: 'veo3.1-pro', name: 'Veo 3.1 Pro' },
    { id: 'veo3.1-components', name: 'Veo 多图参考' },
  ],
  capabilities: {
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: [5, 6, 7, 8],
    firstLastFrame: true,
    multiOutput: true,
    maxOutputCount: 4,
  },
};
