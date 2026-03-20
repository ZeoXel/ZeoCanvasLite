/**
 * 主体服务 - 提供主体相关工具函数
 *
 * 核心理念：主体 = 命名的参考图素材库
 * - Vidu: 原生多图主体支持
 * - 其他场景: @主体ID 自动解析为参考图输入
 *
 * 存储策略：
 * - 图片优先使用 COS URL
 * - 兼容 Base64（旧数据）
 */

import type { Subject, SubjectImage } from '@/types';
import { uploadToCos, getSubjectImageSrc, getSubjectThumbnailSrc, buildSubjectPath } from './cosStorage';
import { collectMentionedSubjectIds } from './subjectMentionOrder';

// ==================== 主体引用解析 ====================

/** 主体引用解析结果 */
export interface SubjectReference {
  id: string;           // 主体 ID
  primaryImage: string; // 主要图片 (front 角度或第一张)
  name: string;         // 主体名称
  subject: Subject;     // 完整的主体对象
}

/**
 * 从提示词中解析 @主体名称 引用
 * 支持格式: @小灰 @机器人 等（按名称匹配）
 * @param prompt 提示词
 * @param subjects 主体库
 * @returns 解析出的主体引用列表
 */
export const parseSubjectReferences = (
  prompt: string,
  subjects: Subject[]
): SubjectReference[] => {
  if (!prompt || !subjects || subjects.length === 0) return [];

  const sortedSubjects = [...subjects].sort((a, b) => b.name.length - a.name.length);
  const subjectById = new Map(sortedSubjects.map((subject) => [subject.id, subject]));
  const orderedIds = collectMentionedSubjectIds(
    prompt,
    sortedSubjects.map((subject) => ({
      subjectId: subject.id,
      tokens: [subject.name, subject.id].filter((t, idx, arr) => t && arr.indexOf(t) === idx),
    }))
  );

  const refs: SubjectReference[] = [];
  for (const id of orderedIds) {
    const subject = subjectById.get(id);
    if (!subject || subject.images.length === 0) continue;

    const frontImage = subject.images.find(img => img.angle === 'front');
    const targetImage = frontImage || subject.images[0];
    const primaryImage = getSubjectImageSrc(targetImage);

    refs.push({
      id: subject.id,
      primaryImage,
      name: subject.name,
      subject,
    });
  }

  return refs;
};

/**
 * 清理提示词中的 @主体名称 引用（用于非 Vidu 场景）
 * @param prompt 原始提示词
 * @param subjects 主体库（用于识别名称）
 * @returns 清理后的提示词
 */
export const cleanSubjectReferences = (prompt: string, subjects?: Subject[]): string => {
  if (!prompt) return prompt;

  if (!subjects || subjects.length === 0) {
    return prompt;
  }

  let cleaned = prompt;

  // 按名称长度降序排序，优先清理更长的名称
  const sortedSubjects = [...subjects].sort((a, b) => b.name.length - a.name.length);

  for (const subject of sortedSubjects) {
    const tokens = [subject.name, subject.id].filter((t, idx, arr) => t && arr.indexOf(t) === idx);
    for (const token of tokens) {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 使用与 parseSubjectReferences 相同的匹配规则
      const pattern = new RegExp(`@${escapedToken}(?![a-zA-Z0-9_])`, 'g');
      cleaned = cleaned.replace(pattern, '');
    }
  }

  return cleaned.trim().replace(/\s+/g, ' ');
};

/**
 * 获取主体的主要图片（front 角度或第一张）
 * @param subject 主体
 * @returns 主要图片 URL 或 Base64
 */
export const getPrimaryImage = (subject: Subject): string | null => {
  if (!subject || !subject.images || subject.images.length === 0) return null;
  const frontImage = subject.images.find(img => img.angle === 'front');
  const targetImage = frontImage || subject.images[0];
  return getSubjectImageSrc(targetImage);
};

// ==================== 缩略图生成 ====================

/**
 * 生成缩略图 - 压缩图片用于预览
 * @param imageSource 原始图片 (Base64 或 URL)
 * @param maxSize 最大尺寸（默认 200px）
 * @returns 压缩后的图片 Base64
 */
export const generateThumbnail = (imageSource: string, maxSize: number = 200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    // 设置 crossOrigin 以避免 canvas 被污染（需要在 src 之前设置）
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          // 回退：返回原图
          resolve(imageSource);
          return;
        }

        // 计算缩放比例
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 绘制缩略图
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 转换为 Base64
        const thumbnail = canvas.toDataURL('image/png');
        resolve(thumbnail);
      } catch (err) {
        // 如果 toDataURL 失败（跨域问题），回退返回原图
        console.warn('[SubjectService] 缩略图生成失败，使用原图:', err);
        resolve(imageSource);
      }
    };

    img.onerror = () => {
      // 加载失败时回退返回原图
      console.warn('[SubjectService] 图片加载失败，使用原图');
      resolve(imageSource);
    };

    img.src = imageSource;
  });
};

/**
 * 生成唯一的主体 ID
 * @param prefix 前缀（默认 'subj'）
 * @returns 唯一 ID
 */
export const generateSubjectId = (prefix: string = 'subj'): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * 生成唯一的主体图片 ID
 * @returns 唯一 ID
 */
export const generateSubjectImageId = (): string => {
  return generateSubjectId('simg');
};

// ==================== COS 上传 ====================

/**
 * 上传主体图片到 COS
 * @param subjectId 主体 ID
 * @param image 图片数据（Base64 或 File）
 * @param angle 角度标签
 * @returns 更新后的 SubjectImage
 */
export const uploadSubjectImage = async (
  subjectId: string,
  image: string | File,
  angle?: SubjectImage['angle']
): Promise<SubjectImage> => {
  const imageId = generateSubjectImageId();
  // 使用统一路径结构: zeocanvas/{userId}/subject/{subjectId}/{filename}
  const prefix = buildSubjectPath(subjectId);

  const resultUrl = typeof image === 'string' && image.startsWith('http')
    ? image
    : (await uploadToCos(image, { prefix })).url;

  return {
    id: imageId,
    url: resultUrl,
    angle,
    createdAt: Date.now(),
  };
};

/**
 * 上传主体缩略图到 COS
 * @param subjectId 主体 ID
 * @param thumbnail 缩略图（Base64 或 File）
 * @returns COS URL
 */
export const uploadSubjectThumbnail = async (
  subjectId: string,
  thumbnail: string | File
): Promise<string> => {
  // 使用统一路径结构: zeocanvas/{userId}/subject/{subjectId}/{filename}
  const prefix = buildSubjectPath(subjectId);
  if (typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
    return thumbnail;
  }
  const result = await uploadToCos(thumbnail, { prefix });
  return result.url;
};

/**
 * 创建新主体并上传图片到 COS
 * @param name 主体名称
 * @param images 图片数据数组
 * @param options 可选配置
 * @returns 新创建的主体
 */
export const createSubjectWithUpload = async (
  name: string,
  images: Array<{ data: string | File; angle?: SubjectImage['angle'] }>,
  options?: { category?: string; description?: string; voiceId?: string; tags?: string[] }
): Promise<Subject> => {
  const subjectId = generateSubjectId();
  const now = Date.now();

  // 上传所有图片
  const uploadedImages = await Promise.all(
    images.map((img) => uploadSubjectImage(subjectId, img.data, img.angle))
  );

  // 生成并上传缩略图
  const firstImageUrl = uploadedImages[0]?.url;
  let thumbnailUrl = firstImageUrl;
  if (firstImageUrl) {
    try {
      const thumbnailBase64 = await generateThumbnail(firstImageUrl);
      thumbnailUrl = await uploadSubjectThumbnail(subjectId, thumbnailBase64);
    } catch {
      // 缩略图生成失败时使用原图
      thumbnailUrl = firstImageUrl;
    }
  }

  return {
    id: subjectId,
    name,
    category: options?.category,
    description: options?.description,
    thumbnailUrl,
    images: uploadedImages,
    voiceId: options?.voiceId,
    tags: options?.tags,
    createdAt: now,
    updatedAt: now,
  };
};
