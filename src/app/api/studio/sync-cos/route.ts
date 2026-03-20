import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { buildMediaPathServer, fetchTextFromCosServer, uploadTextToCosServer } from '@/services/cosStorageServer';
import { mergeSyncData } from '@/services/syncMergeUtils';
import { createHash } from 'crypto';

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
  const prefix = buildMediaPathServer('sync', userId);
  return `${prefix}/${STUDIO_SYNC_FILE}`;
};

export async function GET() {
  const totalStart = performance.now();
  const timings: TimingEntry[] = [];

  try {
    const sessionStart = performance.now();
    const session = await getServerSession(authOptions);
    timings.push({ name: 'session', dur: performance.now() - sessionStart });

    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: 'Unauthorized' }, 401, timings);
    }

    const key = getSyncKey(userId);
    const cosStart = performance.now();
    const content = await fetchTextFromCosServer(key);
    timings.push({ name: 'cos', dur: performance.now() - cosStart });

    if (!content) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ record: null }, 404, timings);
    }

    const parseStart = performance.now();
    const parsed = JSON.parse(content);
    timings.push({ name: 'parse', dur: performance.now() - parseStart });

    const rawData = parsed?.data ?? parsed;
    // 清理 assets 中内嵌的 data URL（历史脏数据）
    if (Array.isArray(rawData?.assets)) {
      rawData.assets = rawData.assets.filter((a: any) => {
        const src = typeof a === 'string' ? a : a?.src;
        return !src || !src.startsWith('data:');
      });
    }
    const record = {
      data: rawData,
      updatedAt: Number(parsed?.updatedAt || 0),
    };
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ record }, 200, timings);
  } catch (error) {
    console.error('[Studio Sync COS] GET error:', error);
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ error: 'Failed to load sync data' }, 500, timings);
  }
}

export async function POST(request: Request) {
  const totalStart = performance.now();
  const timings: TimingEntry[] = [];

  try {
    const sessionStart = performance.now();
    const session = await getServerSession(authOptions);
    timings.push({ name: 'session', dur: performance.now() - sessionStart });

    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: 'Unauthorized' }, 401, timings);
    }

    const body = await request.json();
    const incomingData = body?.data;
    if (!incomingData) {
      timings.push({ name: 'total', dur: performance.now() - totalStart });
      return jsonWithTiming({ error: 'Invalid payload' }, 400, timings);
    }

    const key = getSyncKey(userId);

    let existingData: typeof incomingData | null = null;
    let existingUpdatedAt = 0;
    const readStart = performance.now();
    const existingContent = await fetchTextFromCosServer(key).catch(() => null);
    timings.push({ name: 'cos_read', dur: performance.now() - readStart });

    if (existingContent) {
      try {
        const parseStart = performance.now();
        const parsed = JSON.parse(existingContent);
        timings.push({ name: 'parse', dur: performance.now() - parseStart });
        existingData = parsed?.data ?? parsed;
        existingUpdatedAt = Number(parsed?.updatedAt || 0);
      } catch {
        // 损坏的存档直接忽略，后续以 incoming 覆盖
      }
    }

    const mergedData = existingData ? mergeSyncData(incomingData, existingData) : incomingData;

    // 快速指纹比较，跳过无变更写入
    if (existingData) {
      const mergedJson = JSON.stringify(mergedData);
      const existingJson = JSON.stringify(existingData);
      if (createHash('md5').update(mergedJson).digest('hex') === createHash('md5').update(existingJson).digest('hex')) {
        timings.push({ name: 'cos_write', dur: 0 });
        timings.push({ name: 'total', dur: performance.now() - totalStart });
        return jsonWithTiming({ record: { updatedAt: existingUpdatedAt }, skipped: true }, 200, timings);
      }
    }

    const updatedAt = Date.now();
    const payload = JSON.stringify({ updatedAt, data: mergedData });
    const writeStart = performance.now();
    await uploadTextToCosServer(payload, key, 'application/json');
    timings.push({ name: 'cos_write', dur: performance.now() - writeStart });

    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ record: { updatedAt } }, 200, timings);
  } catch (error) {
    console.error('[Studio Sync COS] POST error:', error);
    timings.push({ name: 'total', dur: performance.now() - totalStart });
    return jsonWithTiming({ error: 'Failed to save sync data' }, 500, timings);
  }
}
