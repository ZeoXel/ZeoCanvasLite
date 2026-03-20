const SUBMIT_ENDPOINTS = ['/v1/video/generations', '/v2/videos/generations'] as const;
const FALLBACK_STATUSES = new Set([404, 405, 406, 410, 501]);
const DEFAULT_TIMEOUT_MS = 55_000;

type FetchLike = typeof fetch;

export interface Camera3DSubmitOptions {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface Camera3DQueryOptions {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface Camera3DSubmitResult {
  taskId: string;
  endpoint: string;
}

export interface Camera3DTaskStatusResult {
  status: 'success' | 'failed' | 'processing';
  endpoint: string;
  resultUrl?: string;
  progress?: string;
  error?: string;
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

const shouldFallbackByStatus = (status: number) => FALLBACK_STATUSES.has(status);

const isRetryableFetchError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const name = error instanceof Error ? error.name : '';
  return name === 'AbortError'
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('socket')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('econnreset')
    || message.includes('terminated');
};

const fetchWithTimeout = async (
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const splitConcatenatedJson = (rawText: string): string => {
  const firstJsonEnd = rawText.indexOf('}{');
  return firstJsonEnd > 0 ? rawText.slice(0, firstJsonEnd + 1) : rawText;
};

const parseResponseJson = (rawText: string): any => {
  const jsonText = splitConcatenatedJson(rawText).trim();
  if (!jsonText) return {};
  return JSON.parse(jsonText);
};

const extractTaskId = (payload: any): string | undefined => {
  return payload?.task_id || payload?.id || payload?.data?.task_id || payload?.data?.id;
};

const compactError = (rawText: string): string => rawText.slice(0, 200).replace(/\s+/g, ' ').trim();

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error
      ? `${error.cause.name}: ${error.cause.message}`
      : typeof error.cause === 'string'
        ? error.cause
        : '';
    return cause ? `${error.message} (cause: ${cause})` : error.message;
  }
  return String(error);
};

export async function submitCamera3DTask(options: Camera3DSubmitOptions): Promise<Camera3DSubmitResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const errors: string[] = [];

  for (let i = 0; i < SUBMIT_ENDPOINTS.length; i++) {
    const endpoint = SUBMIT_ENDPOINTS[i];
    const url = `${baseUrl}${endpoint}`;
    const hasFallback = i < SUBMIT_ENDPOINTS.length - 1;

    try {
      const response = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(options.body),
      }, timeoutMs);

      const rawText = await response.text();
      if (!response.ok) {
        const msg = `HTTP ${response.status}: ${compactError(rawText)}`;
        errors.push(`${endpoint} -> ${msg}`);
        if (hasFallback && shouldFallbackByStatus(response.status)) {
          continue;
        }
        throw new Error(`提交任务失败: ${msg}`);
      }

      let payload: any;
      try {
        payload = parseResponseJson(rawText);
      } catch (error) {
        errors.push(`${endpoint} -> 响应解析失败: ${compactError(rawText)}`);
        if (hasFallback) {
          continue;
        }
        throw new Error(`提交成功但响应无法解析: ${toErrorMessage(error)}`);
      }

      const taskId = extractTaskId(payload);
      if (!taskId) {
        const msg = `未返回任务ID: ${compactError(rawText)}`;
        errors.push(`${endpoint} -> ${msg}`);
        if (hasFallback) {
          continue;
        }
        throw new Error(msg);
      }

      return { taskId, endpoint };
    } catch (error) {
      const msg = toErrorMessage(error);
      errors.push(`${endpoint} -> ${msg}`);
      if (hasFallback && isRetryableFetchError(error)) {
        continue;
      }
      throw new Error(`提交任务失败: ${msg}`);
    }
  }

  throw new Error(`提交任务失败: 已尝试所有端点。${errors.join(' | ')}`);
}

export async function queryCamera3DTaskStatus(options: Camera3DQueryOptions): Promise<Camera3DTaskStatusResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const taskId = encodeURIComponent(options.taskId);
  const endpoints = [`/v1/video/generations/${taskId}`, `/v2/videos/generations/${taskId}`];
  const errors: string[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const url = `${baseUrl}${endpoint}`;
    const hasFallback = i < endpoints.length - 1;

    try {
      const response = await fetchWithTimeout(fetchImpl, url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${options.apiKey}`,
        },
      }, timeoutMs);

      const rawText = await response.text();
      if (!response.ok) {
        const msg = `HTTP ${response.status}: ${compactError(rawText)}`;
        errors.push(`${endpoint} -> ${msg}`);
        if (hasFallback && shouldFallbackByStatus(response.status)) {
          continue;
        }
        throw new Error(`查询失败: ${msg}`);
      }

      let payload: any;
      try {
        payload = parseResponseJson(rawText);
      } catch (error) {
        errors.push(`${endpoint} -> 响应解析失败: ${compactError(rawText)}`);
        if (hasFallback) {
          continue;
        }
        throw new Error(`查询成功但响应无法解析: ${toErrorMessage(error)}`);
      }

      const taskData = payload?.data || payload || {};
      const rawStatus = String(taskData.status || taskData.state || '').toLowerCase();
      const failReason = typeof taskData.fail_reason === 'string' ? taskData.fail_reason : '';
      const resultUrl = (
        taskData.url
        || taskData.output_url
        || taskData.data?.output
        || (failReason.startsWith('http') ? failReason : undefined)
      ) as string | undefined;

      if (['success', 'succeeded', 'done'].includes(rawStatus)) {
        return { status: 'success', endpoint, resultUrl };
      }

      if (['failed', 'failure', 'error'].includes(rawStatus)) {
        return {
          status: 'failed',
          endpoint,
          error: failReason || taskData.error || taskData.message || '任务失败',
        };
      }

      return {
        status: 'processing',
        endpoint,
        progress: taskData.progress || '',
      };
    } catch (error) {
      const msg = toErrorMessage(error);
      errors.push(`${endpoint} -> ${msg}`);
      if (hasFallback && isRetryableFetchError(error)) {
        continue;
      }
      throw new Error(`查询失败: ${msg}`);
    }
  }

  throw new Error(`查询失败: 已尝试所有端点。${errors.join(' | ')}`);
}
