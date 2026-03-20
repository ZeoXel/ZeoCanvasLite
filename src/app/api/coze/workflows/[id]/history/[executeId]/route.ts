import { NextResponse } from 'next/server';
import { getWorkflowHistory } from '@/services/coze/cozeApiService';
import { getAssignedGatewayKey } from '@/lib/server/assignedKey';

/**
 * GET /api/coze/workflows/[id]/history/[executeId]
 * 查询异步工作流执行状态和结果
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; executeId: string }> }
) {
  try {
    const { id: workflowId, executeId } = await params;

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

    console.log(`🔍 查询工作流历史 - 工作流ID: ${workflowId}, 执行ID: ${executeId}`);

    // 查询执行历史
    const history = await getWorkflowHistory(workflowId, executeId, apiKey);

    return NextResponse.json({
      success: true,
      history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('查询工作流历史失败:', error);

    const errorMessage = error instanceof Error ? error.message : '查询历史失败';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'QUERY_ERROR',
          message: errorMessage
        }
      },
      { status: 500 }
    );
  }
}
