/**
 * 消耗追踪服务（Lite 模式）
 * 单用户本地版不再依赖 user/payment API，保留调用接口以兼容现有业务代码。
 */

// 用量信息类型
export interface UsageData {
  durationSeconds?: number;
  resolution?: string;
  imageCount?: number;
  quality?: string;
  songCount?: number;
  characterCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ConsumptionRecord {
  service: 'video' | 'image' | 'audio' | 'chat';
  provider: string;
  model: string;
  usage: UsageData;
  metadata?: {
    taskId?: string;
    prompt?: string;
    rawProviderCost?: number;
    [key: string]: unknown;
  };
}

interface RecordConsumptionResponse {
  success: boolean;
  transaction?: {
    id: string;
    credits: number;
    balance: number;
  };
  balanceInfo?: {
    total: number;
    used: number;
    remaining: number;
  };
  error?: string;
}

const okResult = (service: ConsumptionRecord['service']): RecordConsumptionResponse => ({
  success: true,
  transaction: {
    id: `lite-${service}-${Date.now()}`,
    credits: 0,
    balance: 0,
  },
  balanceInfo: {
    total: 0,
    used: 0,
    remaining: 0,
  },
});

export async function recordConsumption(record: ConsumptionRecord): Promise<RecordConsumptionResponse> {
  console.log('[ConsumptionTracker][Lite] skip remote credit tracking:', record.service, record.provider, record.model);
  return okResult(record.service);
}

export async function recordVideoConsumption(params: {
  provider: string;
  model: string;
  taskId: string;
  durationSeconds: number;
  resolution?: '480p' | '720p' | '1080p';
  prompt?: string;
  viduCredits?: number;
}): Promise<RecordConsumptionResponse> {
  return recordConsumption({
    service: 'video',
    provider: params.provider,
    model: params.model,
    usage: {
      durationSeconds: params.durationSeconds,
      resolution: params.resolution || '720p',
    },
    metadata: {
      taskId: params.taskId,
      prompt: params.prompt,
      rawProviderCost: params.viduCredits,
    },
  });
}

export async function recordImageConsumption(params: {
  provider: string;
  model: string;
  taskId?: string;
  imageCount: number;
  resolution?: string;
  quality?: string;
  prompt?: string;
  seedreamTokens?: number;
}): Promise<RecordConsumptionResponse> {
  return recordConsumption({
    service: 'image',
    provider: params.provider,
    model: params.model,
    usage: {
      imageCount: params.imageCount,
      resolution: params.resolution,
      quality: params.quality,
    },
    metadata: {
      taskId: params.taskId,
      prompt: params.prompt,
      rawProviderCost: params.seedreamTokens,
    },
  });
}

export async function recordAudioConsumption(params: {
  provider: string;
  model: string;
  taskId?: string;
  songCount?: number;
  durationSeconds?: number;
  characterCount?: number;
  prompt?: string;
}): Promise<RecordConsumptionResponse> {
  return recordConsumption({
    service: 'audio',
    provider: params.provider,
    model: params.model,
    usage: {
      songCount: params.songCount,
      characterCount: params.characterCount,
    },
    metadata: {
      taskId: params.taskId,
      prompt: params.prompt,
    },
  });
}

export async function recordChatConsumption(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  prompt?: string;
}): Promise<RecordConsumptionResponse> {
  return recordConsumption({
    service: 'chat',
    provider: params.provider,
    model: params.model,
    usage: {
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    },
    metadata: {
      prompt: params.prompt?.slice(0, 200),
    },
  });
}

export async function checkSufficientCredits(requiredCredits: number): Promise<{
  sufficient: boolean;
  balance: number;
  required: number;
}> {
  return { sufficient: true, balance: Number.MAX_SAFE_INTEGER, required: requiredCredits };
}

export async function fetchEstimatedCredits(
  type: 'video' | 'image' | 'audio' | 'chat',
  _provider: string,
  _model: string,
  usage: UsageData
): Promise<number> {
  return estimateCreditsLocally(type, {
    durationSeconds: usage.durationSeconds,
    resolution: usage.resolution,
    imageCount: usage.imageCount,
    songCount: usage.songCount,
    characterCount: usage.characterCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

export function estimateCreditsLocally(
  type: 'video' | 'image' | 'audio' | 'chat',
  params: {
    durationSeconds?: number;
    resolution?: string;
    imageCount?: number;
    songCount?: number;
    characterCount?: number;
    inputTokens?: number;
    outputTokens?: number;
  }
): number {
  switch (type) {
    case 'video': {
      const videoBase = 15;
      const resMultiplier = params.resolution === '1080p' ? 1.5 : params.resolution === '480p' ? 0.6 : 1.0;
      return Math.ceil((params.durationSeconds || 4) * videoBase * resMultiplier);
    }
    case 'image':
      return Math.max(1, (params.imageCount || 1) * 10);
    case 'audio':
      return Math.max(1, Math.ceil((params.characterCount || 0) / 100));
    case 'chat':
      return Math.max(1, Math.ceil(((params.inputTokens || 0) + (params.outputTokens || 0)) / 1000));
    default:
      return 0;
  }
}
