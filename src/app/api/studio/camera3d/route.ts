/**
 * 3D 运镜 API
 *
 * POST: 提交任务 → 立即返回 task_id（<10秒）
 * GET:  查询任务状态 → 返回 status + result
 *       - 任务完成后自动触发后台 COS 转存（海外→国内）
 *       - 首次返回原始 URL + cosReady=false，前端继续轮询
 *       - COS 就绪后返回 COS URL + cosReady=true，前端停止轮询
 *
 * 前端负责轮询，避免 Cloudflare 504 超时
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';
import { queryCamera3DTaskStatus, submitCamera3DTask } from './gateway';
import { smartUploadServer, buildMediaPathServer } from '@/services/cosStorageServer';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FAL_MODEL = 'fal-ai/qwen-image-edit-2511-multiple-angles';

// COS 转存缓存（与 video route 同模式）
const cosUrlCache = new Map<string, string>();
const COS_CACHE_TTL = 30 * 60 * 1000;
const cosUploadInFlight = new Map<string, Promise<string>>();

// ==================== POST: 提交任务 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, horizontal_angle, vertical_angle, zoom } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '缺少图片URL' }, { status: 400 });
    }

    console.log('[Camera3D] Submit:', { imageUrl: imageUrl.slice(0, 80), horizontal_angle, vertical_angle, zoom });

    const { userId, apiKey } = await getAssignedGatewayKey();
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!apiKey) return NextResponse.json({ error: '未分配API Key' }, { status: 401 });

    const gatewayBaseUrl = process.env.GATEWAY_BASE_URL || 'https://api.lsaigc.com';

    const submitBody = {
      model: FAL_MODEL,
      image: imageUrl,
      images: [imageUrl],
      metadata: {
        horizontal_angle: horizontal_angle ?? 0,
        vertical_angle: vertical_angle ?? 0,
        zoom: zoom ?? 5,
      },
    };

    const { taskId, endpoint } = await submitCamera3DTask({
      baseUrl: gatewayBaseUrl,
      apiKey,
      body: submitBody,
    });
    console.log(`[Camera3D] Submit success via ${endpoint}: ${taskId}`);
    return NextResponse.json({ success: true, taskId });

  } catch (error: any) {
    console.error('[Camera3D] Submit error:', error?.message, error?.cause);
    return NextResponse.json({ error: error.message || '提交失败' }, { status: 500 });
  }
}

// ==================== GET: 查询状态 ====================

export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: '缺少taskId' }, { status: 400 });
    }

    const { userId, apiKey } = await getAssignedGatewayKey();
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!apiKey) return NextResponse.json({ error: '未分配API Key' }, { status: 401 });

    const gatewayBaseUrl = process.env.GATEWAY_BASE_URL || 'https://api.lsaigc.com';

    const result = await queryCamera3DTaskStatus({
      baseUrl: gatewayBaseUrl,
      apiKey,
      taskId,
    });
    console.log(`[Camera3D] Status via ${result.endpoint}: ${result.status}`);

    if (result.status === 'success') {
      if (!result.resultUrl) {
        return NextResponse.json({ status: 'success', error: '任务完成但无结果URL' });
      }

      // --- COS 转存（非阻塞模式） ---
      // fal.ai 结果 URL 在海外，不能像视频（国内同区域）那样同步等待
      // 策略：后台触发下载+上传，立即返回原始 URL，前端继续轮询直到 cosReady
      let imageUrl = result.resultUrl;
      let cosReady = false;

      const cachedCosUrl = cosUrlCache.get(taskId);
      if (cachedCosUrl) {
        imageUrl = cachedCosUrl;
        cosReady = true;
      } else {
        // 触发后台转存（去重，多次轮询不会重复下载）
        if (!cosUploadInFlight.has(taskId)) {
          const uploadPath = buildMediaPathServer('images', userId);
          console.log(`[Camera3D] Background COS transfer started for ${taskId}`);
          const promise = smartUploadServer(result.resultUrl, uploadPath)
            .then(cosUrl => {
              cosUrlCache.set(taskId, cosUrl);
              setTimeout(() => cosUrlCache.delete(taskId), COS_CACHE_TTL);
              console.log(`[Camera3D] COS transfer done: ${cosUrl}`);
              return cosUrl;
            })
            .catch(err => {
              console.warn(`[Camera3D] COS transfer failed, using original:`, err?.message);
              // 转存失败也缓存原始 URL，避免无限重试
              cosUrlCache.set(taskId, result.resultUrl!);
              setTimeout(() => cosUrlCache.delete(taskId), COS_CACHE_TTL);
              return result.resultUrl!;
            })
            .finally(() => cosUploadInFlight.delete(taskId));
          cosUploadInFlight.set(taskId, promise);
        }
        // 不 await，立即返回原始 URL
      }

      return NextResponse.json({ status: 'success', image: imageUrl, cosReady });
    }

    if (result.status === 'failed') {
      return NextResponse.json({ status: 'failed', error: result.error || '任务失败' });
    }

    // 进行中
    return NextResponse.json({ status: 'processing', progress: result.progress || '' });

  } catch (error: any) {
    console.error('[Camera3D] Status error:', error?.message, error?.cause);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}
