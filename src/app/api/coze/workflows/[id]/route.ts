import { NextResponse } from 'next/server';
import { getWorkflowById } from '@/config/coze/workflows';

/**
 * GET /api/coze/workflows/[id]
 * 获取单个工作流详情
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = getWorkflowById(id);

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

    return NextResponse.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    console.error('获取工作流详情失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FETCH_WORKFLOW_ERROR',
          message: '获取工作流详情失败'
        }
      },
      { status: 500 }
    );
  }
}
