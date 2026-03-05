import { NextResponse } from 'next/server';
import { getAllWorkflows, getWorkflowsByCategory, getAllCategories } from '@/config/coze/workflows';

/**
 * GET /api/coze/workflows
 * 获取工作流列表
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let workflows;
    if (category && category !== 'all') {
      workflows = getWorkflowsByCategory(category);
    } else {
      workflows = getAllWorkflows();
    }

    const categories = getAllCategories();

    return NextResponse.json({
      success: true,
      data: {
        workflows,
        categories,
        total: workflows.length
      }
    });
  } catch (error) {
    console.error('获取工作流列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FETCH_WORKFLOWS_ERROR',
          message: '获取工作流列表失败'
        }
      },
      { status: 500 }
    );
  }
}
