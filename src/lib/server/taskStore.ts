export type TaskType = 'image' | 'video' | 'audio';
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface TaskRecord {
  taskId: string;
  type: TaskType;
  provider: string;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

type TaskStoreMap = Map<string, TaskRecord>;

const STORE_KEY = '__zeocanvas_task_store__';

const getStore = (): TaskStoreMap => {
  const globalRef = globalThis as typeof globalThis & { [STORE_KEY]?: TaskStoreMap };
  if (!globalRef[STORE_KEY]) {
    globalRef[STORE_KEY] = new Map<string, TaskRecord>();
  }
  return globalRef[STORE_KEY]!;
};

export const getTaskRecord = (taskId: string): TaskRecord | null => {
  return getStore().get(taskId) || null;
};

export const upsertTaskRecord = (record: TaskRecord): TaskRecord => {
  getStore().set(record.taskId, record);
  return record;
};

export const createTaskRecord = (
  input: Omit<TaskRecord, 'createdAt' | 'updatedAt'>
): TaskRecord => {
  const now = Date.now();
  const record: TaskRecord = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  return upsertTaskRecord(record);
};

export const updateTaskRecord = (
  taskId: string,
  patch: Partial<Omit<TaskRecord, 'taskId' | 'createdAt'>>
): TaskRecord | null => {
  const existing = getTaskRecord(taskId);
  if (!existing) return null;
  const updated: TaskRecord = {
    ...existing,
    ...patch,
    taskId,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  return upsertTaskRecord(updated);
};
