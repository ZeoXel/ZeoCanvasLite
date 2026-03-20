/**
 * 厂商服务共享工具
 */

const DEFAULT_GATEWAY_BASE_URL = 'https://your-api-gateway.com';

export const isGatewayProxyBaseUrl = (baseUrl: string) => baseUrl.startsWith('/api/gateway');

// API 配置获取
export const getApiConfig = () => {
  const useProxy = process.env.NEXT_PUBLIC_USE_GATEWAY_PROXY === 'true';
  const proxyBaseUrl = process.env.NEXT_PUBLIC_GATEWAY_PROXY_BASE || '/api/gateway';

  const isBrowser = typeof window !== 'undefined';
  const baseUrl = isBrowser && useProxy
    ? proxyBaseUrl
    : (process.env.NEXT_PUBLIC_OPENAI_BASE_URL ||
       process.env.OPENAI_BASE_URL ||
       process.env.GATEWAY_BASE_URL ||
       DEFAULT_GATEWAY_BASE_URL);

  const apiKey = isBrowser && useProxy
    ? null
    : (process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
       process.env.OPENAI_API_KEY ||
       (isBrowser ? localStorage.getItem('openai_api_key') : null));

  return { baseUrl, apiKey };
};

// 通用错误处理
export const handleApiError = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  return JSON.stringify(error);
};

// 等待函数
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 通用轮询等待
export interface PollOptions<T> {
  queryFn: () => Promise<T>;
  isComplete: (result: T) => boolean;
  isFailed: (result: T) => boolean;
  getError: (result: T) => string;
  onProgress?: (result: T) => void;
  interval?: number;      // 轮询间隔 ms
  maxAttempts?: number;   // 最大尝试次数
}

export const pollUntilComplete = async <T>(options: PollOptions<T>): Promise<T> => {
  const {
    queryFn,
    isComplete,
    isFailed,
    getError,
    onProgress,
    interval = 5000,
    maxAttempts = 120
  } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    await wait(interval);
    attempts++;

    const result = await queryFn();
    onProgress?.(result);

    if (isComplete(result)) {
      return result;
    }

    if (isFailed(result)) {
      throw new Error(getError(result));
    }
  }

  throw new Error('操作超时');
};

// 通用图片生成结果类型
export interface ImageGenerationResult {
  urls: string[];
  created?: number;
}

// 通用视频生成结果类型
export interface VideoGenerationResult {
  url: string;
  taskId?: string;
}

// ==================== 媒体工具函数 ====================

const shouldProxyUrl = (input: string): boolean => {
  if (!input || !input.startsWith('http')) return false;
  try {
    const hostname = new URL(input).hostname;
    return hostname.includes('tos-cn-beijing.volces.com') ||
           hostname.includes('volccdn.com') ||
           hostname.includes('bytecdn.cn') ||
           hostname.includes('volces.com') ||
           hostname.includes('prod-ss-vidu') ||
           hostname.includes('amazonaws.com.cn') ||
           hostname.includes('aliyuncs.com');
  } catch {
    return false;
  }
};

const getProxiedFetchUrl = (input: string): string => {
  if (typeof window !== 'undefined' && shouldProxyUrl(input)) {
    return `/api/studio/proxy?url=${encodeURIComponent(input)}`;
  }
  return input;
};

/**
 * URL 转 Base64
 */
export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(getProxiedFetchUrl(url));
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to convert URL to Base64", e);
    return "";
  }
};

/**
 * 压缩图片 Base64
 * 用于避免 Vercel 请求体大小限制 (4.5MB)
 */
export const compressImageBase64 = async (
  base64: string,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<string> => {
  const { maxWidth = 1280, maxHeight = 720, quality = 0.8 } = options;

  // 检查是否为 base64 格式
  if (!base64.startsWith('data:image')) {
    return base64; // 如果是 URL 则直接返回
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // 计算缩放比例
      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 使用 JPEG 格式压缩（比 PNG 更小）
      const compressed = canvas.toDataURL('image/jpeg', quality);
      console.log(`[CompressImage] ${Math.round(base64.length / 1024)}KB -> ${Math.round(compressed.length / 1024)}KB`);
      resolve(compressed);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = base64;
  });
};

/**
 * 批量压缩图片
 */
export const compressImages = async (
  images: string[],
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<string[]> => {
  return Promise.all(images.map(img => compressImageBase64(img, options)));
};

/**
 * 从视频提取最后一帧
 */
export const extractLastFrame = (videoSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = "anonymous";
    video.src = getProxiedFetchUrl(videoSrc);
    video.muted = true;
    video.onloadedmetadata = () => { video.currentTime = Math.max(0, video.duration - 0.1); };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error("Canvas context failed"));
        }
      } catch (e) { reject(e); } finally { video.remove(); }
    };
    video.onerror = () => { reject(new Error("Video load failed")); video.remove(); };
  });
};
