import { NextRequest, NextResponse } from 'next/server';
import { getTaskRecord, type TaskRecord, type TaskStatus, updateTaskRecord } from '@/lib/server/taskStore';

const parseJsonSafe = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const forwardGet = async (request: NextRequest, pathname: string, search?: URLSearchParams) => {
  const url = new URL(pathname, request.url);
  if (search) {
    for (const [key, value] of search.entries()) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  });
  const data = await parseJsonSafe(response);
  return { response, data };
};

const normalizeVideoStatus = (status?: string): TaskStatus => {
  const value = (status || '').toUpperCase();
  if (value === 'SUCCESS' || value === 'SUCCEEDED' || value === 'COMPLETED') return 'succeeded';
  if (value === 'FAILURE' || value === 'FAILED' || value === 'ERROR') return 'failed';
  if (value === 'PENDING' || value === 'IN_PROGRESS' || value === 'RUNNING') return 'running';
  return 'queued';
};

const normalizeMinimaxStatus = (status?: number): TaskStatus => {
  if (status === 2) return 'succeeded';
  if (status === 3) return 'failed';
  if (status === 1) return 'running';
  return 'queued';
};

const inferSunoStatus = (songs: any[]): TaskStatus => {
  if (!songs.length) return 'queued';
  const hasFailed = songs.some((song) => {
    const state = String(song?.status || song?.state || '').toLowerCase();
    return state.includes('fail') || state.includes('error');
  });
  if (hasFailed) return 'failed';
  const allReady = songs.every((song) => song?.audio_url || song?.audioUrl || song?.url);
  return allReady ? 'succeeded' : 'running';
};

const withTerminalResult = (task: TaskRecord, status: TaskStatus, result?: unknown, error?: string) => {
  return updateTaskRecord(task.taskId, {
    status,
    result: result !== undefined ? result : task.result,
    error: error || task.error,
  }) || {
    ...task,
    status,
    result: result !== undefined ? result : task.result,
    error: error || task.error,
    updatedAt: Date.now(),
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const type = (searchParams.get('type') || '').toLowerCase();
  const record = getTaskRecord(taskId);
  const provider = (searchParams.get('provider') || record?.provider || '').toLowerCase();

  if (record && (record.status === 'succeeded' || record.status === 'failed')) {
    return NextResponse.json(record);
  }

  const taskType = type || record?.type;
  if (!taskType) {
    return NextResponse.json(
      { error: 'Task type is required for uncached task lookup. Use ?type=image|video|audio.' },
      { status: 400 }
    );
  }

  if (taskType === 'image') {
    if (!record) {
      return NextResponse.json({ error: 'Image task not found in local task cache' }, { status: 404 });
    }
    return NextResponse.json(record);
  }

  if (taskType === 'video') {
    const videoProvider = provider || 'vidu';
    const query = new URLSearchParams({
      taskId,
      provider: videoProvider,
    });
    if (searchParams.get('model')) {
      query.set('model', String(searchParams.get('model')));
    }

    const { response, data } = await forwardGet(request, '/api/generate/video', query);
    if (!response.ok) {
      return NextResponse.json(data || { error: 'Video task query failed' }, { status: response.status });
    }

    const status = normalizeVideoStatus(data?.status);
    const updated = withTerminalResult(
      record || {
        taskId,
        type: 'video',
        provider: videoProvider,
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      status,
      data?.videoUrl ? { videoUrl: data.videoUrl, raw: data } : undefined,
      data?.error
    );
    return NextResponse.json(updated);
  }

  if (taskType === 'audio') {
    if (provider !== 'minimax' && provider !== 'suno') {
      return NextResponse.json({ error: 'Audio task requires provider=minimax|suno' }, { status: 400 });
    }

    if (provider === 'minimax') {
      const query = new URLSearchParams({ provider: 'minimax', task_id: taskId });
      const { response, data } = await forwardGet(request, '/api/generate/audio', query);
      if (!response.ok) {
        return NextResponse.json(data || { error: 'MiniMax task query failed' }, { status: response.status });
      }

      const status = normalizeMinimaxStatus(Number(data?.status));
      const updated = withTerminalResult(
        record || {
          taskId,
          type: 'audio',
          provider: 'minimax',
          status,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        status,
        status === 'succeeded' ? data : undefined,
        status === 'failed' ? String(data?.base_resp?.status_msg || 'MiniMax task failed') : undefined
      );
      return NextResponse.json(updated);
    }

    const query = new URLSearchParams({ provider: 'suno', ids: taskId });
    const { response, data } = await forwardGet(request, '/api/generate/audio', query);
    if (!response.ok) {
      return NextResponse.json(data || { error: 'Suno task query failed' }, { status: response.status });
    }

    const songs = Array.isArray(data?.data) ? data.data : [];
    const status = inferSunoStatus(songs);
    const updated = withTerminalResult(
      record || {
        taskId,
        type: 'audio',
        provider: 'suno',
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      status,
      status === 'succeeded' ? { songs } : undefined,
      status === 'failed' ? 'Suno task failed' : undefined
    );
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: `Unsupported task type: ${taskType}` }, { status: 400 });
}
