import { NextResponse } from 'next/server';
import { getWorkflowById } from '@/config/coze/workflows';
import {
  buildWorkflowParameters,
  validateWorkflowParameters,
  callGatewayStream
} from '@/services/coze/cozeApiService';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';

/**
 * POST /api/coze/workflows/[id]/run
 * 流式执行工作流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params;

    // 获取用户分配的 API Key
    const { apiKey } = await getAssignedGatewayKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '未分配可用的API Key，请先登录'
          }
        },
        { status: 401 }
      );
    }

    // 验证工作流是否存在
    const workflow = getWorkflowById(workflowId);
    if (!workflow) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: '工作流不存在'
          }
        },
        { status: 404 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const formData = body.parameters || body;

    // 验证必填参数
    const validation = validateWorkflowParameters(workflowId, formData);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '参数验证失败',
            details: validation.errors
          }
        },
        { status: 400 }
      );
    }

    // 构建工作流参数
    const parameters = buildWorkflowParameters(workflowId, formData);

    console.log(`🚀 开始执行工作流: ${workflow.name} (${workflowId})`);
    console.log('📋 处理后的参数:', JSON.stringify(parameters, null, 2));

    // 调用网关获取流式响应（使用用户分配的 API Key）
    const stream = await callGatewayStream(workflowId, parameters, apiKey);

    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    console.error('工作流执行失败:', error);

    const errorMessage = error instanceof Error ? error.message : '工作流执行失败';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage
        }
      },
      { status: 500 }
    );
  }
}
