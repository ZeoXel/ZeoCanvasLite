type FeishuStorageNotReadyCode = 'FEISHU_STORAGE_NOT_READY';

export interface FeishuStorageNotReadyError extends Error {
  code: FeishuStorageNotReadyCode;
}

const createNotReadyError = (reason: string): FeishuStorageNotReadyError => {
  const error = new Error(
    `Feishu Drive adapter is reserved but not implemented yet: ${reason}. ` +
      'Configure RUNTIME_STORAGE_MODE=cos to run now.'
  ) as FeishuStorageNotReadyError;
  error.code = 'FEISHU_STORAGE_NOT_READY';
  return error;
};

export interface FeishuUploadResult {
  url: string;
  key: string;
  etag: string;
  fileToken?: string;
  provider: 'feishu';
}

export interface FeishuTextRecord {
  content: string | null;
  key: string;
  provider: 'feishu';
}

const assertFeishuConfig = () => {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const rootFolderToken = process.env.FEISHU_DRIVE_ROOT_FOLDER_TOKEN;
  if (!appId || !appSecret || !rootFolderToken) {
    throw createNotReadyError(
      'missing FEISHU_APP_ID/FEISHU_APP_SECRET/FEISHU_DRIVE_ROOT_FOLDER_TOKEN'
    );
  }
};

export const uploadDataUrlToFeishu = async (_dataUrl: string, _key: string): Promise<FeishuUploadResult> => {
  assertFeishuConfig();
  throw createNotReadyError('uploadDataUrlToFeishu');
};

export const uploadBufferToFeishu = async (
  _buffer: Buffer,
  _contentType: string,
  _key: string,
  _ext?: string
): Promise<FeishuUploadResult> => {
  assertFeishuConfig();
  throw createNotReadyError('uploadBufferToFeishu');
};

export const fetchTextFromFeishu = async (_key: string): Promise<FeishuTextRecord> => {
  assertFeishuConfig();
  throw createNotReadyError('fetchTextFromFeishu');
};

export const uploadTextToFeishu = async (
  _content: string,
  _key: string,
  _contentType = 'application/json'
): Promise<FeishuUploadResult> => {
  assertFeishuConfig();
  throw createNotReadyError('uploadTextToFeishu');
};

export const isFeishuStorageNotReadyError = (error: unknown): boolean => {
  return !!error && typeof error === 'object' && (error as FeishuStorageNotReadyError).code === 'FEISHU_STORAGE_NOT_READY';
};
