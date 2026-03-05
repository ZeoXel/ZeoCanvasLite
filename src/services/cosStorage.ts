/**
 * 腾讯云 COS 存储服务
 * 提供媒体文件上传、URL 生成等功能
 *
 * 存储路径结构：
 * zeocanvas/{userId}/canvas/{canvasId}/{timestamp}-{random}.jpg
 * zeocanvas/{userId}/subject/{subjectId}/{timestamp}-{random}.png
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const COS = require('cos-js-sdk-v5') as any;

// COS 配置
const COS_CONFIG = {
  bucket: process.env.NEXT_PUBLIC_COS_BUCKET || 'lsjx-1354453097',
  region: process.env.NEXT_PUBLIC_COS_REGION || 'ap-beijing',
  domain: process.env.NEXT_PUBLIC_COS_DOMAIN || 'https://cos.lsaigc.com',
};

// 存储路径配置
const STORAGE_CONFIG = {
  project: 'zeocanvas',           // 项目名称
  defaultUser: 'anonymous',       // 默认用户 ID
};

// 当前用户 ID（可通过 setCurrentUserId 更新）
let currentUserId: string = STORAGE_CONFIG.defaultUser;

/**
 * 设置当前用户 ID（登录后调用）
 */
export function setCurrentUserId(userId: string): void {
  currentUserId = userId || STORAGE_CONFIG.defaultUser;
  console.log(`[COS] User ID set to: ${currentUserId}`);
}

/**
 * 获取当前用户 ID
 */
export function getCurrentUserId(): string {
  return currentUserId;
}

// ==================== 路径构建工具 ====================

/**
 * 构建画布资源路径
 * @param canvasId 画布 ID
 * @param userId 用户 ID（可选，默认使用当前用户）
 */
export function buildCanvasPath(canvasId: string, userId?: string): string {
  const uid = userId || currentUserId;
  return `${STORAGE_CONFIG.project}/${uid}/canvas/${canvasId}`;
}

/**
 * 构建主体库资源路径
 * @param subjectId 主体 ID
 * @param userId 用户 ID（可选，默认使用当前用户）
 */
export function buildSubjectPath(subjectId: string, userId?: string): string {
  const uid = userId || currentUserId;
  return `${STORAGE_CONFIG.project}/${uid}/subject/${subjectId}`;
}

/**
 * 构建通用媒体资源路径
 * @param category 资源类型 (如 'temp', 'shared')
 * @param userId 用户 ID（可选，默认使用当前用户）
 */
export function buildMediaPath(category: string = 'media', userId?: string): string {
  const uid = userId || currentUserId;
  return `${STORAGE_CONFIG.project}/${uid}/${category}`;
}

// COS 实例（延迟初始化）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cosInstance: any = null;

/**
 * 获取 COS 实例（带 STS 临时密钥）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCosInstance(): any {
  if (cosInstance) return cosInstance;

  cosInstance = new COS({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAuthorization: async (_options: any, callback: any) => {
      try {
        const res = await fetch('/api/cos/sts');
        if (!res.ok) {
          throw new Error('Failed to get STS credential');
        }
        const data = await res.json();
        callback({
          TmpSecretId: data.TmpSecretId,
          TmpSecretKey: data.TmpSecretKey,
          SecurityToken: data.SecurityToken,
          StartTime: data.StartTime,
          ExpiredTime: data.ExpiredTime,
        });
      } catch (err) {
        console.error('[COS] Get authorization failed:', err);
        callback({
          TmpSecretId: '',
          TmpSecretKey: '',
          SecurityToken: '',
          StartTime: 0,
          ExpiredTime: 0,
        });
      }
    },
  });

  return cosInstance;
}

/**
 * 上传结果
 */
export interface CosUploadResult {
  url: string;      // CDN 加速 URL
  key: string;      // COS 对象 Key
  etag: string;     // 内容 ETag
}

/**
 * 上传选项
 */
export interface UploadOptions {
  onProgress?: (percent: number) => void;
  contentType?: string;
  prefix?: string;  // 路径前缀，如 'canvas/xxx' 或 'subject/xxx'
}

/**
 * 生成唯一文件名
 */
function generateFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop() || 'jpg';
  return `${timestamp}-${random}.${ext}`;
}

/**
 * Base64 转 Blob
 */
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const data = atob(parts[1]);
  const buffer = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    buffer[i] = data.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

/**
 * 从 MIME 类型获取文件扩展名
 */
function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };
  return map[mime] || 'bin';
}

/**
 * 上传文件到 COS
 * @param input File、Blob 或 Base64 字符串
 * @param options 上传选项
 */
async function uploadToCosDirect(
  input: File | Blob | string,
  options: UploadOptions = {}
): Promise<CosUploadResult> {
  const cos = getCosInstance();
  const { onProgress, prefix = 'media' } = options;

  // 处理输入
  let body: Blob;
  let fileName: string;

  if (typeof input === 'string') {
    // Base64 字符串
    body = base64ToBlob(input);
    const mimeMatch = input.match(/data:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    fileName = generateFileName(`upload.${getExtFromMime(mime)}`);
  } else if (input instanceof File) {
    body = input;
    fileName = generateFileName(input.name);
  } else {
    body = input;
    fileName = generateFileName(`upload.${getExtFromMime(input.type)}`);
  }

  const key = `${prefix}/${fileName}`;

  return new Promise((resolve, reject) => {
    cos.uploadFile(
      {
        Bucket: COS_CONFIG.bucket,
        Region: COS_CONFIG.region,
        Key: key,
        Body: body,
        SliceSize: 1024 * 1024 * 5, // 大于 5MB 使用分片上传
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onProgress: (info: any) => {
          onProgress?.(Math.round(info.percent * 100));
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any, data: any) => {
        if (err) {
          console.error('[COS] Upload failed:', err);
          reject(err);
        } else {
          const url = `${COS_CONFIG.domain}/${key}`;
          resolve({
            url,
            key,
            etag: data.ETag,
          });
        }
      }
    );
  });
}

async function uploadToCosViaServer(
  input: File | Blob | string,
  options: UploadOptions = {}
): Promise<CosUploadResult> {
  const { prefix = 'media', contentType } = options;

  if (typeof input === 'string') {
    if (!input.startsWith('data:')) {
      throw new Error('Server upload expects base64 data URL');
    }
    const res = await fetch('/api/studio/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: input, prefix, contentType }),
    });
    if (!res.ok) {
      throw new Error('Server upload failed');
    }
    const json = await res.json();
    return json?.record;
  }

  const file = input instanceof File ? input : new File([input], 'upload.bin', { type: (input as Blob).type || contentType || 'application/octet-stream' });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('prefix', prefix);
  if (contentType) formData.append('contentType', contentType);

  const res = await fetch('/api/studio/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error('Server upload failed');
  }
  const json = await res.json();
  return json?.record;
}

export async function uploadToCos(
  input: File | Blob | string,
  options: UploadOptions = {}
): Promise<CosUploadResult> {
  try {
    return await uploadToCosDirect(input, options);
  } catch (error) {
    console.warn('[COS] Direct upload failed, falling back to server:', error);
    return await uploadToCosViaServer(input, options);
  }
}

/**
 * 上传到指定 Key（用于可覆盖的数据文件）
 */
export async function uploadToCosWithKey(
  input: File | Blob | string,
  key: string,
  options: UploadOptions = {}
): Promise<CosUploadResult> {
  const cos = getCosInstance();
  const { onProgress, contentType } = options;

  let body: Blob;
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      body = base64ToBlob(input);
    } else {
      body = new Blob([input], { type: contentType || 'text/plain' });
    }
  } else if (input instanceof File) {
    body = input;
  } else {
    body = input;
  }

  const finalContentType = contentType || (body as any).type || 'application/octet-stream';

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: COS_CONFIG.bucket,
        Region: COS_CONFIG.region,
        Key: key,
        Body: body,
        ContentType: finalContentType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onProgress: (info: any) => {
          onProgress?.(Math.round(info.percent * 100));
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any, data: any) => {
        if (err) {
          console.error('[COS] Upload failed:', err);
          reject(err);
        } else {
          const url = `${COS_CONFIG.domain}/${key}`;
          resolve({
            url,
            key,
            etag: data.ETag,
          });
        }
      }
    );
  });
}

/**
 * 批量上传文件
 */
export async function uploadBatchToCos(
  inputs: (File | Blob | string)[],
  options: UploadOptions & { onTotalProgress?: (current: number, total: number) => void } = {}
): Promise<CosUploadResult[]> {
  const { onTotalProgress, ...uploadOptions } = options;
  const results: CosUploadResult[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const result = await uploadToCos(inputs[i], uploadOptions);
    results.push(result);
    onTotalProgress?.(i + 1, inputs.length);
  }

  return results;
}

/**
 * 构建 COS URL（用于已知 key 的情况）
 */
export function buildCosUrl(key: string): string {
  return `${COS_CONFIG.domain}/${key}`;
}

/**
 * 从 URL 提取 key
 */
export function extractKeyFromUrl(url: string): string | null {
  if (url.startsWith(COS_CONFIG.domain)) {
    return url.replace(`${COS_CONFIG.domain}/`, '');
  }
  // 兼容原始 COS 域名
  const match = url.match(/\.cos\.[^/]+\.myqcloud\.com\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * 检查是否为 COS URL
 */
export function isCosUrl(url: string): boolean {
  return url.startsWith(COS_CONFIG.domain) || url.includes('.cos.') && url.includes('.myqcloud.com');
}

/**
 * 检查是否为 Base64 数据
 */
export function isBase64(str: string): boolean {
  return str.startsWith('data:');
}

/**
 * 智能上传：如果是 Base64 则上传，如果已是 URL 则直接返回
 */
export async function smartUpload(
  input: string,
  options: UploadOptions = {}
): Promise<string> {
  if (!input) return '';

  // 已经是 URL
  if (input.startsWith('http')) {
    return input;
  }

  // Base64，需要上传
  if (isBase64(input)) {
    const result = await uploadToCos(input, options);
    return result.url;
  }

  // 其他情况原样返回
  return input;
}

// ==================== 图片源获取工具 ====================

/**
 * 获取图片源（优先 URL，回退 Base64）
 */
export function getImageSrc(url?: string, base64?: string): string {
  return url || base64 || '';
}

/**
 * 获取节点主图源
 */
export function getNodeImageSrc(data: { imageUrl?: string; image?: string }): string {
  return data.imageUrl || data.image || '';
}

/**
 * 获取节点多图源数组
 */
export function getNodeImagesSrc(data: { imageUrls?: string[]; images?: string[] }): string[] {
  return data.imageUrls || data.images || [];
}

/**
 * 获取主体缩略图源
 */
export function getSubjectThumbnailSrc(subject: { thumbnailUrl?: string; thumbnail?: string }): string {
  return subject.thumbnailUrl || subject.thumbnail || '';
}

/**
 * 获取主体图片源
 */
export function getSubjectImageSrc(image: { url?: string; base64?: string }): string {
  return image.url || image.base64 || '';
}

/**
 * 批量智能上传并返回 URL 数组
 */
export async function smartUploadBatch(
  inputs: string[],
  options: UploadOptions = {}
): Promise<string[]> {
  return Promise.all(inputs.map((input) => smartUpload(input, options)));
}
