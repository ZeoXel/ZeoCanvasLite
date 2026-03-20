import { NextResponse } from 'next/server';
import { getWorkflowById } from '@/config/coze/workflows';
import {
  buildWorkflowParameters,
  validateWorkflowParameters,
  runWorkflowAsync
} from '@/services/coze/cozeApiService';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';

/**
 * POST /api/coze/workflows/[id]/run-async
 * 异步执行工作流，立即返回 execute_id，通过轮询获取结果
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

    console.log(`🚀 异步执行工作流: ${workflow.name} (${workflowId})`);
    console.log('📋 处理后的参数:', JSON.stringify(parameters, null, 2));

    // 异步执行工作流
    const result = await runWorkflowAsync(workflowId, parameters, apiKey);

    return NextResponse.json({
      success: true,
      message: '工作流已开始异步执行',
      executeId: result.execute_id,
      workflowId: workflowId,
      status: result.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('异步执行工作流失败:', error);

    const errorMessage = error instanceof Error ? error.message : '异步执行失败';

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
