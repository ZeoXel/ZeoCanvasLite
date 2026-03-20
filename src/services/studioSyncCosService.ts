import type { StudioSyncData } from '@/services/studioSyncService';

export interface StudioCosSyncRecord {
  data: StudioSyncData;
  updatedAt: number;
}

export interface PushSyncResult extends StudioCosSyncRecord {
}

const FETCH_DEDUPE_WINDOW_MS = 1500;
let inFlightFetch: Promise<StudioCosSyncRecord | null> | null = null;
let lastFetchAt = 0;
let lastFetchResult: StudioCosSyncRecord | null = null;

const updateFetchCache = (record: StudioCosSyncRecord | null) => {
  lastFetchAt = Date.now();
  lastFetchResult = record;
};

/**
 * 使用 fetch with keepalive 发送同步数据（页面关闭时使用）
 * keepalive: true 保证在页面卸载后仍能完成请求，同时支持 credentials
 */
export function pushStudioSyncBeacon(data: StudioSyncData): boolean {
  try {
    const payload = JSON.stringify({ data, updatedAt: Date.now() });

    // 使用 fetch with keepalive，比 sendBeacon 更可靠
    // keepalive 允许请求在页面卸载后继续，同时支持 credentials
    fetch('/api/studio/sync-cos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 静默处理，页面可能已关闭
    });

    console.log('[Studio Sync] Beacon sent on leave');
    return true;
  } catch (error) {
    console.warn('[Studio Sync] Beacon failed:', error);
    return false;
  }
}

export async function pushStudioSyncToCos(
  data: StudioSyncData,
  clientUpdatedAt?: number
): Promise<PushSyncResult> {
  const res = await fetch('/api/studio/sync-cos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data, updatedAt: clientUpdatedAt }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error('Failed to push studio sync data to COS');
  }

  const updatedAt = json?.record?.updatedAt || Date.now();
  const record = { data, updatedAt };
  updateFetchCache(record);
  return record;
}

export async function fetchStudioSyncFromCos(options?: { force?: boolean }): Promise<StudioCosSyncRecord | null> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (!force) {
    if (inFlightFetch) return inFlightFetch;
    if (lastFetchAt > 0 && now - lastFetchAt <= FETCH_DEDUPE_WINDOW_MS) {
      return lastFetchResult;
    }
  }

  inFlightFetch = (async () => {
    const res = await fetch('/api/studio/sync-cos', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 404) {
      updateFetchCache(null);
      return null;
    }
    if (!res.ok) {
      throw new Error('Failed to fetch studio sync data from COS');
    }
    const json = await res.json();
    const record = json?.record || null;
    updateFetchCache(record);
    return record;
  })();

  try {
    return await inFlightFetch;
  } finally {
    inFlightFetch = null;
  }
}
