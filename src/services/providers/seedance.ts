/**
 * Seedance (火山引擎) 视频生成服务
 *
 * 支持模型:
 * - doubao-seedance-1-5-pro-251215: Seedance 1.5 Pro
 */

import { handleApiError, wait, type VideoGenerationResult } from './shared';

// ==================== 配置 ====================

type GatewayConfig = { baseUrl?: string; apiKey?: string };
type SeedanceImageRole = 'first_frame' | 'last_frame' | 'reference_image';
type SeedanceResolution = '480p' | '720p' | '1080p';

const ARK_CREATE_PATH = '/api/v3/contents/generations/tasks';
const ARK_QUERY_PATH = '/api/v3/contents/generations/tasks';
const LEGACY_CREATE_PATH = '/v1/video/generations';
const LEGACY_QUERY_PATH = '/v1/video/generations';

const getGatewayConfig = (gateway?: GatewayConfig) => {
  const baseUrl = gateway?.baseUrl || process.env.OPENAI_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || 'https://your-api-gateway.com';
  const apiKey = gateway?.apiKey || process.env.OPENAI_API_KEY;
  return { baseUrl, apiKey };
};

const normalizePrompt = (prompt: string): string => (prompt || '').trim();

const joinUrl = (baseUrl: string, path: string) => `${baseUrl.replace(/\/+$/, '')}${path}`;

const parseResponseAsObject = async (response: Response): Promise<any> => {
  const text = await response.text();
  // 检测 Cloudflare 错误页面（524/520等），避免将巨大 HTML 作为错误信息传递
  if (text.includes('cloudflare') && text.includes('error') && text.length > 1000) {
    return { message: `网关超时 (HTTP ${response.status})，请稍后重试` };
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 200) };
  }
};

const FETCH_TIMEOUT = 55_000; // 55秒超时，留余量给 Cloudflare 100秒和 Next.js 60秒 maxDuration

const fetchWithTimeout = (url: string, init: RequestInit, timeout = FETCH_TIMEOUT): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

const createJsonRequest = async (url: string, apiKey: string, body: Record<string, any>) => {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await parseResponseAsObject(response);
  return { response, payload };
};

const shouldTryLegacyEndpoint = (status: number, message: string): boolean => {
  if ([404, 405, 406, 410, 501].includes(status)) return true;
  const msg = (message || '').toLowerCase();
  return msg.includes('not found')
    || msg.includes('no route')
    || msg.includes('unsupported')
    || msg.includes('invalid url');
};

// 图片直接透传（URL 或前端已有的 Base64 均原样传递）
// 火山引擎 Seedance API 同时支持图片 URL 和 Base64 格式，无需后端转换
const passThroughImages = (images?: string[]): string[] | undefined => {
  if (!images || images.length === 0) return undefined;
  return images.filter(Boolean);
};

const normalizeSeedanceImageRoles = (
  images?: string[],
  imageRoles?: SeedanceImageRole[]
): SeedanceImageRole[] | undefined => {
  if (!images || images.length === 0) return undefined;

  // 文档约束：首帧、首尾帧、参考图三种场景互斥。这里按图片数量强制归一化，避免任何“未指定 role”。
  if (images.length === 1) {
    return ['first_frame'];
  }

  if (images.length === 2) {
    const hasBoth =
      Array.isArray(imageRoles) &&
      imageRoles.length >= 2 &&
      imageRoles.includes('first_frame') &&
      imageRoles.includes('last_frame');

    if (hasBoth) {
      const role0 = imageRoles?.[0];
      const role1 = imageRoles?.[1];
      if (
        role0 && role1 &&
        (role0 === 'first_frame' || role0 === 'last_frame') &&
        (role1 === 'first_frame' || role1 === 'last_frame') &&
        role0 !== role1
      ) {
        return [role0, role1];
      }
    }
    return ['first_frame', 'last_frame'];
  }

  // 3+ 张图统一视为参考图
  return images.map(() => 'reference_image');
};

const buildArkContent = (
  prompt: string,
  images?: string[],
  imageRoles?: SeedanceImageRole[]
) => {
  const content: any[] = [{ type: 'text', text: prompt }];
  if (!images || images.length === 0) return content;

  images.forEach((url, index) => {
    const role = imageRoles?.[index];
    const imagePart: any = {
      type: 'image_url',
      image_url: { url },
    };
    if (role) imagePart.role = role;
    content.push(imagePart);
  });

  return content;
};

// ==================== 类型定义 ====================

export interface SeedanceGenerateOptions {
  prompt: string;
  model?: string;
  duration?: number;      // 4-12 秒, -1 表示自动
  resolution?: SeedanceResolution;
  aspectRatio?: string;   // 画面比例: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9
  images?: string[];      // 参考图
  imageRoles?: SeedanceImageRole[];  // 图片角色
  // 扩展配置
  return_last_frame?: boolean;  // 返回尾帧
  generate_audio?: boolean;     // 有声视频 (1.5 pro)
  camera_fixed?: boolean;       // 固定摄像头
  watermark?: boolean;          // 水印
  service_tier?: 'default' | 'flex';  // 服务等级
  execution_expires_after?: number;   // 任务过期时间(秒)
  seed?: number;                // 随机种子
  draft?: boolean;              // 样片模式
}

export interface SeedanceTaskResult {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  error?: { message: string };
  content?: {
    video_url?: string;
    last_frame?: string;  // 尾帧图片 (return_last_frame=true 时返回)
  };
}

const normalizeTaskResult = (taskId: string, payload: any): SeedanceTaskResult => {
  const data = payload?.data ?? payload ?? {};
  const rawStatus = (data.status || data.state || data.task_status || payload?.status || '').toString();
  const errorMsg = data.fail_reason
    || data.error?.message
    || data.error
    || payload?.error?.message
    || payload?.error
    || data.message
    || payload?.message;
  const content = data.content || payload?.content || {};

  let status: SeedanceTaskResult['status'] = 'running';
  if (['SUCCESS', 'SUCCEEDED', 'DONE'].includes(rawStatus.toUpperCase()))
    status = 'succeeded';
  else if (['FAILURE', 'FAILED', 'ERROR'].includes(rawStatus.toUpperCase()) || errorMsg)
    status = 'failed';
  else if (['QUEUED', 'QUEUEING', 'RUNNING', 'IN_PROGRESS', 'CREATED', 'SUBMITTED'].includes(rawStatus.toUpperCase()))
    status = 'running';

  const videoUrl = content.video_url
    || content.videoUrl
    || data.video_url
    || payload?.video_url
    || data.data?.creations?.[0]?.url
    || data.data?.output
    || data.output
    || (typeof data.fail_reason === 'string' && data.fail_reason.startsWith('http') ? data.fail_reason : undefined)
    || (typeof payload?.fail_reason === 'string' && payload.fail_reason.startsWith('http') ? payload.fail_reason : undefined);
  const lastFrame = content.last_frame_url || content.last_frame || data.last_frame_url || data.last_frame;

  return {
    id: data.id || payload?.id || data.task_id || taskId,
    status,
    error: errorMsg ? { message: errorMsg } : undefined,
    content: videoUrl || lastFrame ? { video_url: videoUrl, last_frame: lastFrame } : undefined,
  };
};

// ==================== API 函数 ====================

/**
 * 创建 Seedance 视频生成任务
 */
export const createTask = async (
  options: SeedanceGenerateOptions,
  gateway?: GatewayConfig
): Promise<string> => {
  const { baseUrl, apiKey } = getGatewayConfig(gateway);

  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  // 验证并修正 duration（Seedance 1.5 Pro 支持 4-12 秒，或 -1 自动）
  const rawDuration: unknown = (options as any).duration;
  let validDuration: number | undefined = undefined;
  if (typeof rawDuration === 'number') {
    validDuration = rawDuration;
  } else if (typeof rawDuration === 'string' && rawDuration.trim() !== '') {
    const parsed = Number(rawDuration);
    if (Number.isFinite(parsed)) {
      validDuration = parsed;
    }
  }

  if (validDuration !== undefined && validDuration !== -1) {
    if (validDuration < 4) {
      console.warn(`[Seedance] Duration ${validDuration} is too short, using minimum 4s`);
      validDuration = 4;
    } else if (validDuration > 12) {
      console.warn(`[Seedance] Duration ${validDuration} is too long, using maximum 12s`);
      validDuration = 12;
    }
  }

  const resolvedImages = passThroughImages(options.images);
  const normalizedImageRoles = normalizeSeedanceImageRoles(resolvedImages, options.imageRoles);
  const prompt = normalizePrompt(options.prompt);

  if (!prompt) {
    throw new Error('prompt is required');
  }

  const model = options.model || 'doubao-seedance-1-5-pro-251215';

  // ── 构建 metadata（网关从此字段读取 Seedance 特有参数）──
  const metadata: Record<string, any> = {};
  if (normalizedImageRoles && normalizedImageRoles.length > 0) metadata.image_roles = normalizedImageRoles;
  if (options.return_last_frame !== undefined) metadata.return_last_frame = options.return_last_frame;
  if (options.generate_audio !== undefined) metadata.generate_audio = options.generate_audio;
  if (options.camera_fixed !== undefined) metadata.camera_fixed = options.camera_fixed;
  if (options.watermark !== undefined) metadata.watermark = options.watermark;
  if (options.service_tier) metadata.service_tier = options.service_tier;
  if (typeof options.execution_expires_after === 'number') metadata.execution_expires_after = options.execution_expires_after;
  if (options.seed !== undefined) metadata.seed = options.seed;
  if (options.draft !== undefined) metadata.draft = options.draft;
  if (options.resolution) metadata.resolution = options.resolution;
  if (options.aspectRatio) metadata.ratio = options.aspectRatio;

  // ── 网关格式（/v1/video/generations）──
  // 网关 TaskSubmitReq: prompt + images 顶层，seedance 参数放 metadata
  const gatewayBody: Record<string, any> = {
    model,
    prompt,
    ...(resolvedImages && resolvedImages.length > 0 ? { images: resolvedImages } : {}),
    ...(typeof validDuration === 'number' && Number.isFinite(validDuration) ? { duration: validDuration } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  // ── 火山引擎 Ark 格式（/api/v3/contents/generations/tasks）──
  // 直连火山引擎时使用：content 数组包含 text + image_url（带 role）
  const buildArkBody = () => {
    const content = buildArkContent(prompt, resolvedImages, normalizedImageRoles);
    const body: Record<string, any> = { model, content };
    if (typeof validDuration === 'number' && Number.isFinite(validDuration)) body.duration = validDuration;
    if (options.resolution) body.resolution = options.resolution;
    if (options.aspectRatio) body.ratio = options.aspectRatio;
    if (options.return_last_frame !== undefined) body.return_last_frame = options.return_last_frame;
    if (options.generate_audio !== undefined) body.generate_audio = options.generate_audio;
    if (options.camera_fixed !== undefined) body.camera_fixed = options.camera_fixed;
    if (options.watermark !== undefined) body.watermark = options.watermark;
    if (options.service_tier) body.service_tier = options.service_tier;
    if (typeof options.execution_expires_after === 'number') body.execution_expires_after = options.execution_expires_after;
    if (options.seed !== undefined) body.seed = options.seed;
    if (options.draft !== undefined) body.draft = options.draft;
    return body;
  };

  console.log('[Seedance] Create task payload summary:', {
    model,
    imagesCount: resolvedImages?.length || 0,
    imageFormats: resolvedImages?.map((img) => img.startsWith('data:') ? 'base64' : 'url') || [],
    imageRoles: normalizedImageRoles,
    ratio: options.aspectRatio || null,
    resolution: options.resolution || null,
    duration: validDuration ?? null,
  });

  // 优先使用网关端点（/v1/video/generations），回退到 Ark 端点（直连火山引擎）
  const legacyUrl = joinUrl(baseUrl, LEGACY_CREATE_PATH);
  let legacyResp: Response, legacyPayload: any;
  try {
    ({ response: legacyResp, payload: legacyPayload } = await createJsonRequest(legacyUrl, apiKey, gatewayBody));
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Seedance 任务提交超时（网关响应过慢），请稍后重试');
    }
    throw err;
  }
  if (legacyResp.ok) {
    const taskId = legacyPayload?.task_id || legacyPayload?.id || legacyPayload?.data?.task_id || legacyPayload?.data?.id;
    if (!taskId) throw new Error('Seedance 未返回任务ID');
    return taskId;
  }

  const legacyErrMsg = handleApiError(legacyPayload);
  if (!shouldTryLegacyEndpoint(legacyResp.status, legacyErrMsg)) {
    throw new Error(`Seedance API错误: ${legacyResp.status} - ${legacyErrMsg}`);
  }

  // 网关端点不可用，回退到 Ark 端点（可能是直连火山引擎的场景）
  console.warn(`[Seedance] Gateway endpoint unavailable, fallback to Ark endpoint (${legacyResp.status}): ${legacyErrMsg}`);
  const arkUrl = joinUrl(baseUrl, ARK_CREATE_PATH);
  const { response: arkResp, payload: arkPayload } = await createJsonRequest(arkUrl, apiKey, buildArkBody());
  if (!arkResp.ok) {
    throw new Error(`Seedance API错误: ${arkResp.status} - ${handleApiError(arkPayload)}`);
  }

  const taskId = arkPayload?.id || arkPayload?.task_id || arkPayload?.data?.id || arkPayload?.data?.task_id;
  if (!taskId) {
    throw new Error('Seedance 未返回任务ID');
  }
  return taskId;
};

/**
 * 查询 Seedance 任务状态
 */
export const queryTask = async (
  taskId: string,
  gateway?: GatewayConfig,
  model?: string
): Promise<SeedanceTaskResult> => {
  const { baseUrl, apiKey } = getGatewayConfig(gateway);

  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  const commonHeaders = { Authorization: `Bearer ${apiKey}` };

  // 优先使用网关端点（/v1/video/generations），回退到 Ark 端点
  const query = model ? `?model=${encodeURIComponent(model)}` : '';
  const legacyUrl = joinUrl(baseUrl, `${LEGACY_QUERY_PATH}/${encodeURIComponent(taskId)}${query}`);
  const legacyResp = await fetchWithTimeout(legacyUrl, { method: 'GET', headers: commonHeaders });
  const legacyPayload = await parseResponseAsObject(legacyResp);
  if (legacyResp.ok) {
    return normalizeTaskResult(taskId, legacyPayload);
  }

  const legacyErrMsg = handleApiError(legacyPayload);
  if (!shouldTryLegacyEndpoint(legacyResp.status, legacyErrMsg)) {
    throw new Error(`Seedance查询错误: ${legacyResp.status} - ${legacyErrMsg}`);
  }

  const arkUrl = joinUrl(baseUrl, `${ARK_QUERY_PATH}/${encodeURIComponent(taskId)}`);
  const arkResp = await fetchWithTimeout(arkUrl, { method: 'GET', headers: commonHeaders });
  const arkPayload = await parseResponseAsObject(arkResp);
  if (!arkResp.ok) {
    throw new Error(`Seedance查询错误: ${arkResp.status} - ${handleApiError(arkPayload)}`);
  }
  return normalizeTaskResult(taskId, arkPayload);
};

/**
 * 生成 Seedance 视频 (包含轮询等待)
 */
export const generateVideo = async (
  options: SeedanceGenerateOptions,
  onProgress?: (status: string) => void,
  gateway?: GatewayConfig
): Promise<VideoGenerationResult> => {
  const taskId = await createTask(options, gateway);

  // 轮询等待结果
  const maxAttempts = 120;  // 最多等待10分钟
  let attempts = 0;

  while (attempts < maxAttempts) {
    await wait(5000);
    attempts++;

    const result = await queryTask(taskId, gateway);
    onProgress?.(result.status);

    if (result.status === 'succeeded') {
      if (result.content?.video_url) {
        return { url: result.content.video_url, taskId };
      }
      throw new Error('视频生成成功但未返回URL');
    }

    if (result.status === 'failed') {
      throw new Error(`视频生成失败: ${result.error?.message || '未知错误'}`);
    }
  }

  throw new Error('视频生成超时');
};

// ==================== 厂商信息 ====================

export const PROVIDER_INFO = {
  id: 'seedance',
  name: 'Seedance',
  category: 'video' as const,
  models: [
    { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5', isDefault: true },
  ],
  capabilities: {
    aspectRatios: ['16:9', '9:16', '1:1'],
    durations: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    firstLastFrame: true,
    multiOutput: true,
    maxOutputCount: 4,
  },
};
