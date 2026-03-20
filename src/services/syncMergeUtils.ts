import type { AppNode, Canvas, Connection, Group, Subject, Workflow } from '@/types';
import type { StudioSyncData } from '@/services/studioSyncService';
import type { TaskLog } from '@/types/taskLog';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isDeleted(
  id: string,
  modifiedAt: number | undefined,
  deletedItems: Record<string, number>
): boolean {
  const deletedAt = deletedItems[id];
  return !!deletedAt && deletedAt > (modifiedAt || 0);
}

export function connectionKey(connection: Connection): string {
  return connection.id || `${connection.from}->${connection.to}`;
}

export function mergeDeletedItems(
  incoming: Record<string, number>,
  existing: Record<string, number>
): Record<string, number> {
  const merged: Record<string, number> = {};
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const keys = new Set([...Object.keys(incoming), ...Object.keys(existing)]);

  for (const key of keys) {
    const deletedAt = Math.max(incoming[key] || 0, existing[key] || 0);
    if (deletedAt > cutoff) {
      merged[key] = deletedAt;
    }
  }

  return merged;
}

function mergeById<T extends { id: string; modifiedAt?: number }>(
  incoming: T[],
  existing: T[],
  deletedItems: Record<string, number>
): T[] {
  const map = new Map<string, T>();

  for (const item of existing) {
    if (!isDeleted(item.id, item.modifiedAt, deletedItems)) {
      map.set(item.id, item);
    }
  }

  for (const item of incoming) {
    if (isDeleted(item.id, item.modifiedAt, deletedItems)) continue;
    const exist = map.get(item.id);
    if (!exist || (item.modifiedAt || 0) >= (exist.modifiedAt || 0)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function mergeConnections(
  incoming: Connection[],
  existing: Connection[],
  deletedItems: Record<string, number>
): Connection[] {
  const map = new Map<string, Connection>();

  for (const connection of existing) {
    const key = connectionKey(connection);
    if (!isDeleted(key, connection.modifiedAt, deletedItems)) {
      map.set(key, connection);
    }
  }

  for (const connection of incoming) {
    const key = connectionKey(connection);
    if (isDeleted(key, connection.modifiedAt, deletedItems)) continue;
    const exist = map.get(key);
    if (!exist || (connection.modifiedAt || 0) >= (exist.modifiedAt || 0)) {
      map.set(key, connection);
    }
  }

  return Array.from(map.values());
}

function mergeCanvases(
  incoming: Canvas[],
  existing: Canvas[],
  deletedItems: Record<string, number>
): Canvas[] {
  const map = new Map<string, Canvas>();

  for (const canvas of existing) {
    if (!isDeleted(canvas.id, canvas.updatedAt, deletedItems)) {
      map.set(canvas.id, canvas);
    }
  }

  for (const canvas of incoming) {
    if (isDeleted(canvas.id, canvas.updatedAt, deletedItems)) continue;
    const exist = map.get(canvas.id);
    if (!exist) {
      map.set(canvas.id, canvas);
      continue;
    }

    const newer = (canvas.updatedAt || 0) >= (exist.updatedAt || 0) ? canvas : exist;
    const older = newer === canvas ? exist : canvas;
    map.set(canvas.id, {
      ...older,
      ...newer,
      nodes: mergeById(canvas.nodes || [], exist.nodes || [], deletedItems),
      connections: mergeConnections(canvas.connections || [], exist.connections || [], deletedItems),
      groups: mergeById(canvas.groups || [], exist.groups || [], deletedItems),
      updatedAt: Math.max(canvas.updatedAt || 0, exist.updatedAt || 0),
    });
  }

  return Array.from(map.values());
}

function mergeSubjects(
  incoming: Subject[],
  existing: Subject[],
  deletedItems: Record<string, number>
): Subject[] {
  const map = new Map<string, Subject>();

  for (const subject of existing) {
    if (!isDeleted(subject.id, subject.updatedAt, deletedItems)) {
      map.set(subject.id, subject);
    }
  }

  for (const subject of incoming) {
    if (isDeleted(subject.id, subject.updatedAt, deletedItems)) continue;
    const exist = map.get(subject.id);
    if (!exist || (subject.updatedAt || 0) >= (exist.updatedAt || 0)) {
      map.set(subject.id, subject);
    }
  }

  return Array.from(map.values());
}

function mergeWorkflows(
  incoming: Workflow[],
  existing: Workflow[],
  deletedItems: Record<string, number>
): Workflow[] {
  const map = new Map<string, Workflow>();

  for (const workflow of existing) {
    if (!isDeleted(workflow.id, workflow.modifiedAt, deletedItems)) {
      map.set(workflow.id, workflow);
    }
  }

  for (const workflow of incoming) {
    if (isDeleted(workflow.id, workflow.modifiedAt, deletedItems)) continue;
    const exist = map.get(workflow.id);
    if (!exist) {
      map.set(workflow.id, workflow);
      continue;
    }

    const newer = (workflow.modifiedAt || 0) >= (exist.modifiedAt || 0) ? workflow : exist;
    const older = newer === workflow ? exist : workflow;
    map.set(workflow.id, {
      ...older,
      ...newer,
      nodes: mergeById(workflow.nodes || [], exist.nodes || [], deletedItems),
      connections: mergeConnections(workflow.connections || [], exist.connections || [], deletedItems),
      groups: mergeById(workflow.groups || [], exist.groups || [], deletedItems),
      modifiedAt: Math.max(workflow.modifiedAt || 0, exist.modifiedAt || 0),
    });
  }

  return Array.from(map.values());
}

function mergeNodeConfigs(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  incomingNodes: AppNode[],
  existingNodes: AppNode[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  const incomingNodeMap = new Map(incomingNodes.map((node) => [node.id, node]));
  const existingNodeMap = new Map(existingNodes.map((node) => [node.id, node]));

  for (const [key, value] of Object.entries(incoming)) {
    const incomingTs = incomingNodeMap.get(key)?.modifiedAt || 0;
    const existingTs = existingNodeMap.get(key)?.modifiedAt || 0;
    if (!(key in merged) || incomingTs >= existingTs) {
      merged[key] = value;
    }
  }

  return merged;
}

function mergeTaskLogs(incoming: TaskLog[], existing: TaskLog[]): TaskLog[] {
  const map = new Map<string, TaskLog>();

  for (const log of existing) {
    map.set(log.id, log);
  }

  for (const log of incoming) {
    const exist = map.get(log.id);
    if (!exist) {
      map.set(log.id, log);
      continue;
    }

    const incomingTs = log.completedAt || log.startedAt || log.createdAt || 0;
    const existingTs = exist.completedAt || exist.startedAt || exist.createdAt || 0;
    if (incomingTs >= existingTs) {
      map.set(log.id, log);
    }
  }

  return Array.from(map.values());
}

function mergeAssets(incoming: unknown[], existing: unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();

  for (const item of [...existing, ...incoming]) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

export function mergeSyncData(incoming: StudioSyncData, existing: StudioSyncData): StudioSyncData {
  const deletedItems = mergeDeletedItems(incoming.deletedItems || {}, existing.deletedItems || {});

  return {
    canvases: mergeCanvases(incoming.canvases || [], existing.canvases || [], deletedItems),
    currentCanvasId: incoming.currentCanvasId ?? existing.currentCanvasId,
    nodes: mergeById(incoming.nodes || [], existing.nodes || [], deletedItems),
    connections: mergeConnections(incoming.connections || [], existing.connections || [], deletedItems),
    groups: mergeById(incoming.groups || [], existing.groups || [], deletedItems),
    subjects: mergeSubjects(incoming.subjects || [], existing.subjects || [], deletedItems),
    workflows: mergeWorkflows(incoming.workflows || [], existing.workflows || [], deletedItems),
    nodeConfigs: mergeNodeConfigs(
      incoming.nodeConfigs || {},
      existing.nodeConfigs || {},
      incoming.nodes || [],
      existing.nodes || []
    ),
    assets: mergeAssets(incoming.assets || [], existing.assets || []),
    taskLogs: mergeTaskLogs(incoming.taskLogs || [], existing.taskLogs || []),
    deletedItems,
  };
}
