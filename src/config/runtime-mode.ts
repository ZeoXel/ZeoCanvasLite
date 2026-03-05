export type RuntimeStorageMode = 'cos' | 'feishu';

const DEFAULT_STORAGE_MODE: RuntimeStorageMode = 'cos';

export const getRuntimeStorageMode = (): RuntimeStorageMode => {
  const mode = process.env.RUNTIME_STORAGE_MODE?.trim().toLowerCase();
  if (mode === 'feishu') return 'feishu';
  return DEFAULT_STORAGE_MODE;
};

export const isFeishuStorageMode = (): boolean => getRuntimeStorageMode() === 'feishu';
