import { NextResponse } from 'next/server';

/**
 * 文件类型配置
 */
const FILE_TYPE_CONFIG = {
  image: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    dir: 'images'
  },
  video: {
    maxSize: 200 * 1024 * 1024, // 200MB
    allowedTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    dir: 'videos'
  },
  audio: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg'],
    dir: 'audios'
  },
  file: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['application/pdf', 'text/plain', 'application/msword'],
    dir: 'files'
  }
};

/**
 * 获取文件类型
 */
function getFileCategory(mimeType: string): keyof typeof FILE_TYPE_CONFIG {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * POST /api/coze/upload
 * 文件上传处理
 *
 * 由于 ZeoCanvas 已有 COS STS 服务，推荐前端直接使用 COS 上传
 * 此 API 仅作为备用方案或本地开发使用
 */
export async function POST(request: Request) {
  try {
    const userId = 'local-user';

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_FILE',
            message: '请选择要上传的文件'
          }
        },
        { status: 400 }
      );
    }

    // 确定文件类型
    const fileCategory = type as keyof typeof FILE_TYPE_CONFIG || getFileCategory(file.type);
    const config = FILE_TYPE_CONFIG[fileCategory];

    // 验证文件大小
    if (file.size > config.maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `文件大小超过限制 (最大 ${config.maxSize / 1024 / 1024}MB)`
          }
        },
        { status: 400 }
      );
    }

    // 生成文件信息
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || '';
    const fileName = `${timestamp}_${randomStr}.${ext}`;

    // 返回文件信息，让前端使用 COS 直传
    // 这里返回的是文件元信息，实际上传由前端完成
    return NextResponse.json({
      success: true,
      data: {
        fileName,
        originalName: file.name,
        size: file.size,
        type: file.type,
        category: fileCategory,
        dir: config.dir,
        // 提示前端使用 COS STS 上传
        uploadMethod: 'cos',
        cosPath: `zeocanvas/${userId}/workflow/${config.dir}/${fileName}`
      }
    });
  } catch (error) {
    console.error('文件上传处理失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: '文件上传处理失败'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/coze/upload
 * 获取上传配置
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      config: FILE_TYPE_CONFIG,
      supportedTypes: {
        image: FILE_TYPE_CONFIG.image.allowedTypes,
        video: FILE_TYPE_CONFIG.video.allowedTypes,
        audio: FILE_TYPE_CONFIG.audio.allowedTypes,
        file: FILE_TYPE_CONFIG.file.allowedTypes
      }
    }
  });
}
