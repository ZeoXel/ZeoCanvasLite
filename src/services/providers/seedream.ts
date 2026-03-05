/**
 * Seedream (即梦) 图像生成服务 - 火山引擎官方接口
 *
 * 支持模型:
 * - doubao-seedream-5-0-lite: 即梦5.0 Lite，联网搜索、自定义输出格式（独有），最高3K分辨率
 * - doubao-seedream-4-5-251128: 即梦4.5，最高4K分辨率
 *
 * API 文档: https://ark.cn-beijing.volces.com/api/v3/images/generations
 */

import { handleApiError, type ImageGenerationResult } from './shared';

// ==================== 配置 ====================

const getVolcengineConfig = () => {
  const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
  const apiKey = process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY;
  return { baseUrl, apiKey };
};

// ==================== 类型定义 ====================

export interface SeedreamGenerateOptions {
  prompt: string;
  model?: string;
  images?: string[];  // 参考图数组 (最多14张)
  n?: number;         // 组图数量 1-15
  size?: string;      // 如 '2048x2048', '2560x1440'
  aspectRatio?: string; // 用于映射到 size
  responseFormat?: 'url' | 'b64_json';
  watermark?: boolean;
  stream?: boolean;
  outputFormat?: 'png' | 'jpeg'; // 仅 5.0-lite 支持
  webSearch?: boolean;           // 仅 5.0-lite 支持，联网搜索
}

interface SeedreamApiResult {
  data: { url: string }[];
  created: number;
  usage: {
    total_tokens: number;
  };
}

// 5.0-lite 专属：3K 高分辨率尺寸（总像素上限 ~10.4MP）
export const SIZE_MAP_3K: Record<string, string> = {
  '1:1': '3072x3072',
  '4:3': '3456x2592',
  '3:4': '2592x3456',
  '16:9': '4096x2304',
  '9:16': '2304x4096',
  '3:2': '3744x2496',
  '2:3': '2496x3744',
  '21:9': '4704x2016',
};

// 默认尺寸映射（4.5 / 5.0-lite 2K 档，总像素下限 3686400）
export const SIZE_MAP: Record<string, string> = {
  '1:1': '2048x2048',
  '4:3': '2304x1728',
  '3:4': '1728x2304',
  '16:9': '2848x1600',
  '9:16': '1600x2848',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3136x1344',
};

// 4.5 专属：4K 推荐尺寸（基于官方文档推荐值）
export const SIZE_MAP_4K: Record<string, string> = {
  '1:1': '4096x4096',
  '4:3': '4704x3520',
  '3:4': '3520x4704',
  '16:9': '5504x3040',
  '9:16': '3040x5504',
  '3:2': '4992x3328',
  '2:3': '3328x4992',
  '21:9': '6240x2656',
};

const MODEL_5_LITE = 'doubao-seedream-5-0-260128';

// ==================== API 函数 ====================

/**
 * 使用 Seedream 生成图像 (火山引擎官方接口)
 */
export const generateImage = async (options: SeedreamGenerateOptions): Promise<ImageGenerationResult> => {
  const { baseUrl, apiKey } = getVolcengineConfig();

  if (!apiKey) {
    throw new Error('火山引擎 API Key 未配置 (VOLCENGINE_API_KEY)');
  }

  const model = options.model || 'doubao-seedream-4-5-251128';
  const is5Lite = model === MODEL_5_LITE;

  // 确定 size：5.0-lite 默认用 2K（3K 档由调用方通过 size 参数显式指定）
  let size = options.size;
  if (!size && options.aspectRatio) {
    size = SIZE_MAP[options.aspectRatio] || '2048x2048';
  }

  const body: Record<string, any> = {
    model,
    prompt: options.prompt,
    watermark: options.watermark ?? false,
  };

  if (options.images && options.images.length > 0) {
    body.image = options.images;
  }
  if (size) {
    body.size = size;
  }
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  // 5.0-lite 专有参数
  if (is5Lite) {
    if (options.outputFormat) {
      body.output_format = options.outputFormat;
    }
    if (options.webSearch) {
      body.tools = [{ type: 'web_search' }];
    }
  }

  // 组图功能
  if (options.n && options.n > 1) {
    body.sequential_image_generation = 'auto';
    body.sequential_image_generation_options = {
      max_images: Math.min(options.n, 15)
    };
    body.prompt = `${options.prompt} ${options.n}张`;
  } else {
    body.sequential_image_generation = 'disabled';
  }

  console.log(`[Seedream] Generating with model: ${model}, size: ${size || 'default'}, webSearch: ${options.webSearch ?? false}`);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Seedream API错误: ${response.status} - ${handleApiError(errorData)}`);
  }

  const result: SeedreamApiResult = await response.json();
  return {
    urls: result.data.map(d => d.url),
    created: result.created,
  };
};

// ==================== 厂商信息 ====================

export const PROVIDER_INFO = {
  id: 'seedream',
  name: 'Seedream',
  category: 'image' as const,
  models: [
    { id: MODEL_5_LITE, name: 'Seedream 5.0 Lite', isDefault: true },
    { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
  ],
  capabilities: {
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    multiImage: true,
    multiOutput: true,
    maxOutputCount: 15,
  },
};
