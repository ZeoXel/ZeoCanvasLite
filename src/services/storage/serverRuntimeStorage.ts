import { getRuntimeStorageMode } from '@/config/runtime-mode';
import {
  buildMediaPathServer,
  fetchTextFromCosServer,
  uploadBufferToCosServer,
  uploadFromBase64,
  uploadTextToCosServer,
} from '@/services/cosStorageServer';
import {
  fetchTextFromFeishu,
  isFeishuStorageNotReadyError,
  uploadBufferToFeishu,
  uploadDataUrlToFeishu,
  uploadTextToFeishu,
} from '@/services/storage/feishuDriveAdapter';

type StorageProviderName = 'cos' | 'feishu';

type RuntimeStorageErrorCode = 'STORAGE_MODE_NOT_IMPLEMENTED';

interface RuntimeStorageError extends Error {
  code: RuntimeStorageErrorCode;
}

const createStorageNotImplementedError = (mode: StorageProviderName): RuntimeStorageError => {
  const error = new Error(
    `Storage mode "${mode}" is not implemented yet. Configure RUNTIME_STORAGE_MODE=cos for now.`
  ) as RuntimeStorageError;
  error.code = 'STORAGE_MODE_NOT_IMPLEMENTED';
  return error;
};

export const getStorageProvider = (): StorageProviderName => {
  const mode = getRuntimeStorageMode();
  return mode === 'feishu' ? 'feishu' : 'cos';
};

export const resolveUserStoragePrefix = (category: string, userId: string): string => {
  const mode = getStorageProvider();
  if (mode === 'cos') {
    return buildMediaPathServer(category, userId);
  }
  // Keep deterministic key structure so future Feishu adapter can map paths consistently.
  return `zeocanvas/${userId}/${category}`;
};

export const uploadDataUrlServer = async (dataUrl: string, prefix: string) => {
  const mode = getStorageProvider();
  if (mode === 'cos') {
    return uploadFromBase64(dataUrl, prefix);
  }
  return uploadDataUrlToFeishu(dataUrl, prefix);
};

export const uploadBufferServer = async (
  buffer: Buffer,
  contentType: string,
  prefix: string,
  ext?: string
) => {
  const mode = getStorageProvider();
  if (mode === 'cos') {
    return uploadBufferToCosServer(buffer, contentType, prefix, ext);
  }
  return uploadBufferToFeishu(buffer, contentType, prefix, ext);
};

export const fetchTextServer = async (key: string): Promise<string | null> => {
  const mode = getStorageProvider();
  if (mode === 'cos') {
    return fetchTextFromCosServer(key);
  }
  const result = await fetchTextFromFeishu(key);
  return result.content;
};

export const uploadTextServer = async (content: string, key: string, contentType = 'application/json') => {
  const mode = getStorageProvider();
  if (mode === 'cos') {
    return uploadTextToCosServer(content, key, contentType);
  }
  return uploadTextToFeishu(content, key, contentType);
};

export const isStorageModeNotImplementedError = (error: unknown): boolean => {
  return (
    (!!error && typeof error === 'object' && (error as RuntimeStorageError).code === 'STORAGE_MODE_NOT_IMPLEMENTED') ||
    isFeishuStorageNotReadyError(error)
  );
};

export const assertStorageMode = (): void => {
  const mode = getStorageProvider();
  if (mode !== 'cos' && mode !== 'feishu') {
    throw createStorageNotImplementedError(mode);
  }
};
