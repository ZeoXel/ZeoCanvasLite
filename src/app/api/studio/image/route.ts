/**
 * Studio 图像生成 API
 *
 * 统一图像生成入口，根据模型路由到不同服务：
 * - Seedream: 火山引擎官方接口
 * - 其他: OpenAI 兼容网关
 *
 * 生成结果自动上传到 COS 存储
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/services/providers/image';
import { SEEDREAM_SIZE_MAP, SEEDREAM_SIZE_MAP_4K, SEEDREAM_SIZE_MAP_3_0 } from '@/services/providers';
import { smartUploadBatchServer, smartUploadServer, buildMediaPathServer } from '@/services/cosStorageServer';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';

// Route Segment Config
export const maxDuration = 300; // Seedream 高峰期生成耗时较长
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB (gateway input limit)
const REQUEST_DEADLINE_BUFFER_MS = 8_000; // 给平台和序列化预留缓冲
const MIN_COS_UPLOAD_BUDGET_MS = 18_000;  // 少于该预算时跳过结果转存，避免函数硬超时
const MIN_GATEWAY_TIMEOUT_MS = 15_000;
const SEEDREAM_45_MODEL = 'doubao-seedream-4-5-251128';
const SEEDREAM_30_T2I_MODEL = 'doubao-seedream-3-0-t2i-250415';
const SEEDEDIT_30_I2I_MODEL = 'doubao-seededit-3-0-i2i-250628';
const NANO_BANANA_2_MODEL = 'nano-banana-2';

function isSeedreamFamilyModel(model: string): boolean {
    return model.includes('seedream') || model.includes('seededit');
}

function estimateBase64Bytes(dataUrl: string): number {
    if (!dataUrl) return 0;
    const commaIndex = dataUrl.indexOf(',');
    const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    const length = base64.length;
    if (!length) return 0;
    let padding = 0;
    if (base64.endsWith('==')) padding = 2;
    else if (base64.endsWith('=')) padding = 1;
    return Math.max(0, Math.floor((length * 3) / 4) - padding);
}

function isOversizedBase64Image(input: string): boolean {
    return input.startsWith('data:image') && estimateBase64Bytes(input) > MAX_INPUT_IMAGE_BYTES;
}

function getRemainingBudgetMs(requestStartedAt: number): number {
    return Math.max(0, maxDuration * 1000 - (Date.now() - requestStartedAt));
}

function normalizeResolution(resolution?: string): '1k' | '2k' | '4k' | undefined {
    if (!resolution) return undefined;
    const normalized = resolution.trim().toLowerCase();
    if (normalized === '1k' || normalized === '2k' || normalized === '4k') {
        return normalized;
    }
    return undefined;
}

function toNanoImageSize(resolution?: '1k' | '2k' | '4k'): '1K' | '2K' | '4K' {
    if (resolution === '1k') return '1K';
    if (resolution === '4k') return '4K';
    return '2K';
}

export async function POST(request: NextRequest) {
    const requestStartedAt = Date.now();
    try {
        const body = await request.json();
        const { prompt, model, images, aspectRatio, resolution, n, size, imageSize } = body;

        console.log(`[Studio Image API] Request received:`, {
            prompt: prompt?.slice(0, 50),
            model,
            hasImages: !!images,
            aspectRatio,
            resolution,
            n,
            size,
            imageSize,
        });

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        const usedModel = model || 'nano-banana';
        console.log(`[Studio Image API] Using model: ${usedModel}, count: ${n || 1}`);

        let urls: string[];

        console.log('[Studio Image API] Getting assigned gateway key...');
        const { userId, apiKey } = await getAssignedGatewayKey();
        console.log('[Studio Image API] Gateway key result:', { userId, hasApiKey: !!apiKey });

        if (!userId) {
            return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
        }
        if (!apiKey) {
            return NextResponse.json({ error: '未分配可用的API Key' }, { status: 401 });
        }
        const gatewayBaseUrl = process.env.GATEWAY_BASE_URL || 'https://api.lsaigc.com';
        console.log('[Studio Image API] Gateway base URL:', gatewayBaseUrl);

        let resolvedImages = images;
        const isSeedreamModel = isSeedreamFamilyModel(usedModel);
        const shouldUploadAllInputs = Array.isArray(images) && images.length > 0 && isSeedreamModel;
        const hasOversizedInputs = Array.isArray(images) && images.some(img => isOversizedBase64Image(img));

        if (shouldUploadAllInputs || hasOversizedInputs) {
            const inputPath = buildMediaPathServer('inputs', userId);
            if (shouldUploadAllInputs) {
                console.log(`[Studio Image API] Uploading ${images.length} input images to COS (${inputPath})...`);
                resolvedImages = await smartUploadBatchServer(images, inputPath);
                console.log('[Studio Image API] Input images uploaded to COS.');
            } else {
                console.log(`[Studio Image API] Uploading oversized input images to COS (${inputPath})...`);
                resolvedImages = await Promise.all(
                    images.map(async (img) => (isOversizedBase64Image(img) ? smartUploadServer(img, inputPath) : img))
                );
                console.log('[Studio Image API] Oversized input images uploaded to COS.');
            }
        }

        const normalizedResolution = normalizeResolution(resolution);
        const resolvedImageSize =
            usedModel === NANO_BANANA_2_MODEL
                ? toNanoImageSize(normalizedResolution) // nano-banana-2 默认显式使用 2K
                : imageSize;
        const isSeedream30Series =
            usedModel === SEEDREAM_30_T2I_MODEL || usedModel === SEEDEDIT_30_I2I_MODEL;
        const resolvedSize = size
            || (
                isSeedreamModel && aspectRatio
                    ? (
                        usedModel === SEEDREAM_45_MODEL && normalizedResolution === '4k'
                            ? SEEDREAM_SIZE_MAP_4K[aspectRatio]
                            : isSeedream30Series
                                ? SEEDREAM_SIZE_MAP_3_0[aspectRatio]
                            : SEEDREAM_SIZE_MAP[aspectRatio]
                    )
                    : undefined
            );
        const resolvedAspectRatio = isSeedreamModel ? undefined : aspectRatio;
        const remainingBeforeGenerateMs = getRemainingBudgetMs(requestStartedAt);
        const preferredGenerationTimeoutMs = Math.max(
            MIN_GATEWAY_TIMEOUT_MS,
            remainingBeforeGenerateMs - MIN_COS_UPLOAD_BUDGET_MS - REQUEST_DEADLINE_BUFFER_MS
        );
        const maxSafeGenerationTimeoutMs = Math.max(1_000, remainingBeforeGenerateMs - REQUEST_DEADLINE_BUFFER_MS);
        const generationTimeoutMs = Math.min(preferredGenerationTimeoutMs, maxSafeGenerationTimeoutMs);

        console.log('[Studio Image API] Calling generateImage...', {
            remainingBeforeGenerateMs,
            preferredGenerationTimeoutMs,
            maxSafeGenerationTimeoutMs,
            generationTimeoutMs,
        });
        const result = await generateImage({
            prompt,
            model: usedModel,
            images: resolvedImages,
            aspectRatio: resolvedAspectRatio,
            size: resolvedSize,
            count: n,
            imageSize: resolvedImageSize,
            watermark: isSeedreamModel ? false : undefined,
            timeoutMs: generationTimeoutMs,
            apiKey,
            baseUrl: gatewayBaseUrl,
        });
        urls = result.urls;
        console.log('[Studio Image API] Image generation successful, URLs:', urls.length);

        // 上传到 COS 存储（将临时 URL 转为永久存储）
        // 使用统一路径结构: zeocanvas/{userId}/images/{filename}
        const remainingBeforeUploadMs = getRemainingBudgetMs(requestStartedAt);
        if (remainingBeforeUploadMs <= MIN_COS_UPLOAD_BUDGET_MS) {
            console.warn('[Studio Image API] Skip COS upload due to tight budget, returning provider URLs directly.', {
                remainingBeforeUploadMs,
            });
            return NextResponse.json({
                success: true,
                images: urls,
                uploadedToCos: false,
            });
        }

        const uploadPath = buildMediaPathServer('images', userId);
        console.log(`[Studio Image API] Uploading ${urls.length} images to COS (${uploadPath})...`, {
            remainingBeforeUploadMs,
        });

        try {
            const cosUrls = await smartUploadBatchServer(urls, uploadPath);
            console.log(`[Studio Image API] Uploaded to COS:`, cosUrls);

            return NextResponse.json({
                success: true,
                images: cosUrls,
                uploadedToCos: true,
            });
        } catch (uploadError: any) {
            console.error('[Studio Image API] COS upload failed, fallback to provider URLs:', uploadError);
            return NextResponse.json({
                success: true,
                images: urls,
                uploadedToCos: false,
            });
        }

    } catch (error: any) {
        console.error('[Studio Image API] Error:', error);
        console.error('[Studio Image API] Error message:', error.message);
        console.error('[Studio Image API] Error stack:', error.stack);
        console.error('[Studio Image API] Error cause:', error.cause);

        let errorMessage: string;
        if (error.cause?.code === 'ENOTFOUND') {
            errorMessage = `无法连接到API服务器: ${error.cause?.hostname}`;
        } else if (error?.name === 'AbortError') {
            errorMessage = '图像生成超时，请重试或减少输入图数量';
        } else if (error.cause?.code === 'ECONNREFUSED') {
            errorMessage = `API服务器拒绝连接`;
        } else if (error.cause?.code) {
            errorMessage = `网络错误: ${error.cause.code}`;
        } else {
            errorMessage = error.message || 'Internal server error';
        }

        return NextResponse.json(
            {
                error: errorMessage,
                details: error.cause?.code,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            },
            { status: error?.name === 'AbortError' ? 504 : 500 }
        );
    }
}
