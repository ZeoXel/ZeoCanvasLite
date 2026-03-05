import { NextResponse } from 'next/server';
import {
  getStorageProvider,
  isStorageModeNotImplementedError,
  resolveUserStoragePrefix,
  uploadBufferServer,
  uploadDataUrlServer,
} from '@/services/storage/serverRuntimeStorage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB

function getSafePrefix(userId: string, input?: string | null): string {
  const base = `zeocanvas/${userId}/`;
  if (input && input.startsWith(base)) {
    return input;
  }
  return resolveUserStoragePrefix('media', userId);
}

function getMaxSizeByType(contentType: string): number {
  if (contentType.startsWith('video/')) return MAX_VIDEO_BYTES;
  if (contentType.startsWith('image/')) return MAX_IMAGE_BYTES;
  return MAX_IMAGE_BYTES;
}

export async function POST(request: Request) {
  try {
    const userId = 'local-user';
    const storageProvider = getStorageProvider();

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const dataUrl = body?.dataUrl as string | undefined;
      const prefix = getSafePrefix(userId, body?.prefix);

      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
      }

      const result = await uploadDataUrlServer(dataUrl, prefix);
      return NextResponse.json({ record: result, provider: storageProvider });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const prefix = getSafePrefix(userId, formData.get('prefix') as string | null);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const sizeLimit = getMaxSizeByType(file.type || 'application/octet-stream');
    if (file.size > sizeLimit) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.name?.split('.').pop();
    const result = await uploadBufferServer(buffer, file.type || 'application/octet-stream', prefix, ext);
    return NextResponse.json({ record: result, provider: storageProvider });
  } catch (error) {
    console.error('[Studio Upload] Error:', error);
    if (isStorageModeNotImplementedError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 501 });
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
