import { NextResponse } from 'next/server';
import { mergeSyncData } from '@/services/syncMergeUtils';
import {
  fetchTextServer,
  getStorageProvider,
  isStorageModeNotImplementedError,
  resolveUserStoragePrefix,
  uploadTextServer,
} from '@/services/storage/serverRuntimeStorage';

const STUDIO_SYNC_FILE = 'studio-sync.json';
type TimingEntry = { name: string; dur: number };

const formatServerTiming = (entries: TimingEntry[]) =>
  entries
    .filter((entry) => Number.isFinite(entry.dur))
    .map((entry) => `${entry.name};dur=${entry.dur.toFixed(2)}`)
    .join(', ');

const jsonWithTiming = (
  body: unknown,
  status: number,
  entries: TimingEntry[]
) => NextResponse.json(body, {
  status,
  headers: {
    'Server-Timing': formatServerTiming(entries),
  },
});

const getSyncKey = (userId: string) => {
  const prefix = resolveUserStoragePrefix('sync', userId);
  return `${prefix}/${STUDIO_SYNC_FILE}`;
};

export async function GET() {
  const totalStart = performance.now();
  const timings: TimingEntry[] = [];

  try {
    const userId = 'local-user';
    const storageProvider = getStorageProvider();

    const key = getSyncKey(userId);
    const storageReadStart = performance.now();
    const content = await fetchTextServer(key);
    timings.push({ name: 'storage_read', dur: performance.now() - storageReadStart });

    if (!content) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ record: null }, 404, timings);
    }

    const parseStart = performance.now();
    const parsed = JSON.parse(content);
    timings.push({ name: 'parse', dur: performance.now() - parseStart });

    const record = {
      data: parsed?.data ?? parsed,
      updatedAt: Number(parsed?.updatedAt || 0),
      provider: storageProvider,
    };
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ record }, 200, timings);
  } catch (error) {
    console.error('[Studio Sync Storage] GET error:', error);
    if (isStorageModeNotImplementedError(error)) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: (error as Error).message }, 501, timings);
    }
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ error: 'Failed to load sync data' }, 500, timings);
  }
}

export async function POST(request: Request) {
  const totalStart = performance.now();
  const timings: TimingEntry[] = [];

  try {
    const userId = 'local-user';
    const storageProvider = getStorageProvider();

    const body = await request.json();
    const incomingData = body?.data;
    if (!incomingData) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: 'Invalid payload' }, 400, timings);
    }

    const key = getSyncKey(userId);

    let existingData: typeof incomingData | null = null;
    const readStart = performance.now();
    const existingContent = await fetchTextServer(key).catch(() => null);
    timings.push({ name: 'storage_read', dur: performance.now() - readStart });

    if (existingContent) {
      try {
        const parseStart = performance.now();
        const parsed = JSON.parse(existingContent);
        timings.push({ name: 'parse', dur: performance.now() - parseStart });
        existingData = parsed?.data ?? parsed;
      } catch {
        // 损坏的存档直接忽略，后续以 incoming 覆盖
      }
    }

    const mergedData = existingData ? mergeSyncData(incomingData, existingData) : incomingData;

    const updatedAt = Date.now();
    const payload = JSON.stringify({ updatedAt, data: mergedData });
    const writeStart = performance.now();
    await uploadTextServer(payload, key, 'application/json');
    timings.push({ name: 'storage_write', dur: performance.now() - writeStart });

    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ record: { data: mergedData, updatedAt, provider: storageProvider } }, 200, timings);
  } catch (error) {
    console.error('[Studio Sync Storage] POST error:', error);
    if (isStorageModeNotImplementedError(error)) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: (error as Error).message }, 501, timings);
    }
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ error: 'Failed to save sync data' }, 500, timings);
  }
}
