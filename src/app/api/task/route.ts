import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getVideoProviderId } from '@/services/providers';
import { createTaskRecord, type TaskRecord, type TaskStatus, type TaskType } from '@/lib/server/taskStore';

interface TaskCreateRequestBody {
  type?: TaskType;
  provider?: string;
  payload?: Record<string, unknown>;
}

const normalizeVideoStatus = (status?: string): TaskStatus => {
  const value = (status || '').toUpperCase();
  if (value === 'SUCCESS' || value === 'SUCCEEDED' || value === 'COMPLETED') return 'succeeded';
  if (value === 'FAILURE' || value === 'FAILED' || value === 'ERROR') return 'failed';
  return 'running';
};

const parseJsonSafe = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const forwardPost = async (request: NextRequest, pathname: string, payload: unknown, search?: URLSearchParams) => {
  const url = new URL(pathname, request.url);
  if (search) {
    for (const [key, value] of search.entries()) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(response);
  return { response, data };
};

const buildResponse = (task: TaskRecord) => {
  return NextResponse.json(task);
};

export async function POST(request: NextRequest) {
  let body: TaskCreateRequestBody;
  try {
    body = (await request.json()) as TaskCreateRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = body?.type;
  const payload = body?.payload;
  if (!type || !payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'Invalid task payload. Expected: { type: image|video|audio, payload: {...} }' },
      { status: 400 }
    );
  }

  if (type === 'image') {
    const { response, data } = await forwardPost(request, '/api/generate/image', payload);
    if (!response.ok) {
      return NextResponse.json(data || { error: 'Image task submission failed' }, { status: response.status });
    }
    const task = createTaskRecord({
      taskId: `img_${randomUUID()}`,
      type: 'image',
      provider: String((payload as any).provider || 'openai'),
      status: 'succeeded',
      result: { images: data?.images || [], raw: data },
    });
    return buildResponse(task);
  }

  if (type === 'video') {
    const { response, data } = await forwardPost(request, '/api/generate/video', payload);
    if (!response.ok) {
      return NextResponse.json(data || { error: 'Video task submission failed' }, { status: response.status });
    }

    const taskId = String(data?.taskId || randomUUID());
    const provider = String(data?.provider || getVideoProviderId(String((payload as any).model || '')) || 'video');
    const task = createTaskRecord({
      taskId,
      type: 'video',
      provider,
      status: normalizeVideoStatus(data?.status || 'PENDING'),
      result: data?.videoUrl ? { videoUrl: data.videoUrl } : undefined,
      meta: {
        model: (payload as any).model,
        source: 'generate/video',
      },
    });
    return buildResponse(task);
  }

  if (type === 'audio') {
    const provider = String(body.provider || (payload as any).provider || '').toLowerCase();
    if (provider !== 'minimax' && provider !== 'suno') {
      return NextResponse.json(
        { error: 'Audio task requires provider=minimax|suno' },
        { status: 400 }
      );
    }

    const query = new URLSearchParams({ provider });
    if (provider === 'minimax' && typeof (payload as any).mode === 'string') {
      query.set('mode', String((payload as any).mode));
    }

    const { response, data } = await forwardPost(request, '/api/generate/audio', payload, query);
    if (!response.ok) {
      return NextResponse.json(data || { error: 'Audio task submission failed' }, { status: response.status });
    }

    if (provider === 'minimax') {
      const taskId = data?.task_id ? String(data.task_id) : `tts_${randomUUID()}`;
      const status: TaskStatus = data?.task_id ? 'queued' : 'succeeded';
      const task = createTaskRecord({
        taskId,
        type: 'audio',
        provider,
        status,
        result: status === 'succeeded' ? data : undefined,
        meta: { source: 'generate/audio:minimax' },
      });
      return buildResponse(task);
    }

    const sunoTaskId = String(data?.data?.song_id || randomUUID());
    const task = createTaskRecord({
      taskId: sunoTaskId,
      type: 'audio',
      provider: 'suno',
      status: 'queued',
      meta: {
        source: 'generate/audio:suno',
        songId2: data?.data?.song_id_2 || null,
      },
    });
    return buildResponse(task);
  }

  return NextResponse.json({ error: `Unsupported task type: ${type}` }, { status: 400 });
}
