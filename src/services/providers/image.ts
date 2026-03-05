/**
 * 统一图像生成服务 (OpenAI 兼容网关)
 *
 * 通过 model 参数区分厂商：
 * - nano-banana / nano-banana-2: Nano Banana
 * - gemini-*: Gemini
 *
 * 注意: 所有模型统一走网关（由网关负责厂商路由）
 */

import { getApiConfig, handleApiError, isGatewayProxyBaseUrl, type ImageGenerationResult } from './shared';

// ==================== 类型定义 ====================

export interface ImageGenerateOptions {
  prompt: string;
  model: string;
  images?: string[];
  aspectRatio?: string;
  size?: string;
  count?: number;
  imageSize?: '1K' | '2K' | '4K';  // NanoBanana
  watermark?: boolean; // Seedream
  responseFormat?: 'url' | 'b64_json';
  timeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
}

// ==================== 内部工具 ====================

const getProviderFromModel = (model: string): 'nano-banana' | 'seedream' | 'gemini' => {
  if (model.includes('nano-banana')) return 'nano-banana';
  if (model.includes('seedream') || model.includes('doubao-seedream')) return 'seedream';
  return 'gemini';
};

const DEFAULT_GATEWAY_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==================== API 函数 ====================

/**
 * 统一图像生成
 */
export const generateImage = async (options: ImageGenerateOptions): Promise<ImageGenerationResult> => {
  console.log('[generateImage] Starting with options:', {
    model: options.model,
    hasPrompt: !!options.prompt,
    hasApiKey: !!options.apiKey,
    baseUrl: options.baseUrl,
    count: options.count,
  });

  const { baseUrl, apiKey } = getApiConfig();
  const resolvedBaseUrl = options.baseUrl || baseUrl;
  const resolvedApiKey = options.apiKey ?? apiKey;

  console.log('[generateImage] Resolved config:', {
    resolvedBaseUrl,
    hasResolvedApiKey: !!resolvedApiKey,
    isGatewayProxy: isGatewayProxyBaseUrl(resolvedBaseUrl),
  });

  if (!resolvedApiKey && !isGatewayProxyBaseUrl(resolvedBaseUrl)) {
    throw new Error('API Key未配置');
  }

  const provider = getProviderFromModel(options.model);
  const count = options.count || 1;

  console.log('[generateImage] Provider:', provider, 'Count:', count);

  // nano-banana / seedream 通过批量请求实现组图生成
  if ((provider === 'nano-banana' || provider === 'seedream') && count > 1) {
    console.log(`[Image] Batch generating ${count} images with ${options.model}`);

    const requests = Array.from({ length: count }, () =>
      generateSingleImage(resolvedBaseUrl, resolvedApiKey || '', options, provider)
    );

    const results = await Promise.all(requests);
    const allUrls = results.flatMap(r => r.urls);

    return {
      urls: allUrls,
      created: results[0]?.created || Date.now(),
    };
  }

  // 单图生成或 Gemini 模型
  console.log('[generateImage] Calling generateSingleImage...');
  return generateSingleImage(resolvedBaseUrl, resolvedApiKey || '', options, provider);
};

/**
 * 生成单张图像（内部函数）
 */
const generateSingleImage = async (
  baseUrl: string,
  apiKey: string,
  options: ImageGenerateOptions,
  provider: 'nano-banana' | 'seedream' | 'gemini'
): Promise<ImageGenerationResult> => {
  console.log('[generateSingleImage] Starting with:', {
    baseUrl,
    hasApiKey: !!apiKey,
    provider,
    model: options.model,
  });

  const body: Record<string, any> = {
    model: options.model,
    prompt: options.prompt,
    response_format: options.responseFormat || (provider === 'gemini' ? 'b64_json' : 'url'),
  };

  // 通用参数
  if (options.images && options.images.length > 0) {
    body.image = options.images;
  }
  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }
  if (options.size) {
    body.size = options.size;
  }
  if (typeof options.watermark === 'boolean') {
    body.watermark = options.watermark;
  }

  // 厂商特定参数
  if (provider === 'nano-banana' && options.imageSize) {
    body.image_size = options.imageSize;
  }

  console.log('[generateSingleImage] Request body:', JSON.stringify(body, null, 2));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const url = `${baseUrl}/v1/images/generations`;
  console.log('[generateSingleImage] Fetching:', url);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_GATEWAY_TIMEOUT_MS
  );

  console.log('[generateSingleImage] Response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[generateSingleImage] Error response:', errorData);
    throw new Error(`图像生成失败: ${response.status} - ${handleApiError(errorData)}`);
  }

  const result = await response.json();
  console.log('[generateSingleImage] Success, data items:', result.data?.length);

  const urls = result.data
    .map((d: any) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
    .filter(Boolean) as string[];

  if (urls.length === 0) {
    throw new Error('未返回图像结果');
  }

  console.log('[generateSingleImage] Returning', urls.length, 'URLs');
  return { urls, created: result.created };
};

/**
 * 图像编辑（通过图生图实现）
 */
export const editImage = async (
  imageBase64: string,
  prompt: string,
  model?: string
): Promise<string> => {
  const result = await generateImage({
    prompt,
    model: model || 'gemini-2.5-flash-image',
    images: [imageBase64],
  });
  return result.urls[0];
};

// ==================== 模型配置 ====================

export const IMAGE_MODELS = [
  // Nano Banana
  { id: 'nano-banana', name: 'Nano Banana', provider: 'nano-banana' },
  { id: 'nano-banana-2', name: 'Nano Banana Pro', provider: 'nano-banana' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', provider: 'nano-banana' },
  // Gemini
  { id: 'gemini-2.5-flash-image', name: 'Gemini Flash Image', provider: 'gemini' },
  { id: 'gemini-2.5-flash-image-generation', name: 'Gemini Flash Image Gen', provider: 'gemini' },
];

export const DEFAULT_IMAGE_MODEL = 'nano-banana';
