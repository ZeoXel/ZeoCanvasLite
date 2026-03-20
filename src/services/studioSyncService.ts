import type { AppNode, Canvas, Connection, Group, Subject, Workflow } from '@/types';
import type { TaskLog } from '@/types/taskLog';

export interface StudioSyncData {
  assets: any[];
  workflows: Workflow[];
  canvases: Canvas[];
  currentCanvasId: string | null;
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
  subjects: Subject[];
  nodeConfigs: Record<string, any>;
  taskLogs: TaskLog[];
  deletedItems?: Record<string, number>;
}

export interface StudioSyncRecord {
  data: StudioSyncData;
  version: number;
  clientUpdatedAt: number;
  updatedAt: string;
}

export interface StudioSyncResponse {
  record: StudioSyncRecord | null;
  conflict: boolean;
}

export async function fetchStudioSync(): Promise<StudioSyncRecord | null> {
  const res = await fetch('/api/studio/sync', {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Failed to fetch studio sync data');
  }
  const data = await res.json();
  return data?.record || null;
}

export async function pushStudioSync(
  payload: { data: StudioSyncData; clientUpdatedAt: number; baseVersion?: number },
  options?: { keepalive?: boolean }
): Promise<StudioSyncResponse> {
  const res = await fetch('/api/studio/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
    keepalive: options?.keepalive,
  });

  if (res.status === 409) {
    const data = await res.json();
    return { record: data?.record || null, conflict: true };
  }

  if (!res.ok) {
    throw new Error('Failed to push studio sync data');
  }

  const data = await res.json();
  return { record: data?.record || null, conflict: false };
}
