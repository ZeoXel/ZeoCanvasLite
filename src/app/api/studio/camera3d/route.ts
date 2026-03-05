/**
 * 3D 运镜 API
 *
 * POST: 提交任务 → 立即返回 task_id（<10秒）
 * GET:  查询任务状态 → 返回 status + result（<3秒）
 *
 * 前端负责轮询，避免 Cloudflare 504 超时
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FAL_MODEL = 'fal-ai/qwen-image-edit-2511-multiple-angles';

// ==================== POST: 提交任务 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, horizontal_angle, vertical_angle, zoom } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '缺少图片URL' }, { status: 400 });
    }

    console.log('[Camera3D] Submit:', { imageUrl: imageUrl.slice(0, 80), horizontal_angle, vertical_angle, zoom });

    const { userId, apiKey } = await getAssignedGatewayKey('camera3d');
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

    const response = await fetch(`${gatewayBaseUrl}/v1/video/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(submitBody),
    });

    const rawText = await response.text();
    console.log(`[Camera3D] Submit response (${response.status}): ${rawText.slice(0, 500)}`);

    if (!response.ok) {
      throw new Error(`提交任务失败: ${response.status} - ${rawText.slice(0, 200)}`);
    }

    // 网关可能拼接多个JSON: {"task_id":"xxx"}{"code":"error",...}
    const firstJsonEnd = rawText.indexOf('}{');
    const jsonStr = firstJsonEnd > 0 ? rawText.slice(0, firstJsonEnd + 1) : rawText;
    const data = JSON.parse(jsonStr);

    if (firstJsonEnd > 0) {
      try {
        const secondJson = JSON.parse(rawText.slice(firstJsonEnd + 1));
        if (secondJson.code && secondJson.code !== 'success') {
          console.warn(`[Camera3D] Gateway secondary: ${JSON.stringify(secondJson)}`);
        }
      } catch { /* ignore */ }
    }

    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error(`未返回任务ID: ${rawText.slice(0, 200)}`);
    }

    return NextResponse.json({ success: true, taskId });

  } catch (error: any) {
    console.error('[Camera3D] Submit error:', error.message);
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

    const { userId, apiKey } = await getAssignedGatewayKey('camera3d');
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!apiKey) return NextResponse.json({ error: '未分配API Key' }, { status: 401 });

    const gatewayBaseUrl = process.env.GATEWAY_BASE_URL || 'https://api.lsaigc.com';

    const response = await fetch(`${gatewayBaseUrl}/v1/video/generations/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const rawText = await response.text();
    console.log(`[Camera3D] Status (${response.status}): ${rawText.slice(0, 500)}`);

    if (!response.ok) {
      throw new Error(`查询失败: ${response.status} - ${rawText.slice(0, 200)}`);
    }

    const data = JSON.parse(rawText);
    // 网关格式: {"code":"success","data":{"task_id":"...","status":"...","fail_reason":"...",...}}
    const taskData = data.data || data;
    const status = (taskData.status || '').toLowerCase();

    if (status === 'success') {
      const resultUrl = taskData.fail_reason || taskData.url || taskData.output_url;
      if (!resultUrl) {
        return NextResponse.json({ status: 'success', error: '任务完成但无结果URL' });
      }

      // 直接返回原始 URL，COS 上传由前端异步完成（避免服务端超时）
      return NextResponse.json({ status: 'success', image: resultUrl });
    }

    if (status === 'failed' || status === 'failure') {
      return NextResponse.json({ status: 'failed', error: taskData.fail_reason || '任务失败' });
    }

    // 进行中
    return NextResponse.json({ status: 'processing', progress: taskData.progress || '' });

  } catch (error: any) {
    console.error('[Camera3D] Status error:', error.message);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}
