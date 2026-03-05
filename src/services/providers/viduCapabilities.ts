/**
 * Vidu 模型能力矩阵（按网关当前支持能力维护）
 *
 * 说明：
 * - 这里定义的是“模型是否支持某生成模式”的硬边界
 * - 供前端模型过滤、后端参数校验共用，避免规则分叉
 */

export type ViduModel =
  | 'viduq3-pro'
  | 'viduq2-pro'
  | 'viduq2-turbo'
  | 'viduq2-pro-fast'
  | 'viduq2';

export type ViduGenerationMode =
  | 'text2video'
  | 'img2video'
  | 'start-end'
  | 'multiframe'
  | 'reference'
  | 'reference-audio';

export const VIDU_MODEL_LABELS: Record<ViduModel, string> = {
  'viduq3-pro': 'Q3 Pro',
  'viduq2-pro': 'Q2 Pro',
  'viduq2-turbo': 'Q2 Turbo',
  'viduq2-pro-fast': 'Q2 Pro Fast',
  'viduq2': 'Q2',
};

export const VIDU_MODE_LABELS: Record<ViduGenerationMode, string> = {
  'text2video': '文生视频',
  'img2video': '图生视频',
  'start-end': '首尾帧',
  'multiframe': '智能多帧',
  'reference': '参考生视频',
  'reference-audio': '参考生视频（音视频直出）',
};

export const VIDU_MODEL_MODE_MATRIX: Record<ViduModel, ViduGenerationMode[]> = {
  // Q3 Pro：当前接入支持文生/图生
  'viduq3-pro': ['text2video', 'img2video'],
  // Q2 Pro：图生/首尾帧/参考生
  'viduq2-pro': ['img2video', 'start-end', 'multiframe', 'reference'],
  // Q2 Turbo：图生/首尾帧
  'viduq2-turbo': ['img2video', 'start-end', 'multiframe'],
  // Q2 Pro Fast：图生/首尾帧
  'viduq2-pro-fast': ['img2video', 'start-end'],
  // Q2：文生/参考生（含主体音视频直出）
  'viduq2': ['text2video', 'reference', 'reference-audio'],
};

export class ViduModelModeError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ViduModelModeError';
  }
}

export function isViduModel(model: string): model is ViduModel {
  return Object.prototype.hasOwnProperty.call(VIDU_MODEL_MODE_MATRIX, model);
}

export function getViduModelLabel(model: string): string {
  return isViduModel(model) ? VIDU_MODEL_LABELS[model] : model;
}

export function getSupportedModesForModel(model: ViduModel): ViduGenerationMode[] {
  return VIDU_MODEL_MODE_MATRIX[model] || [];
}

export function getSupportedModelsForMode(mode: ViduGenerationMode): ViduModel[] {
  return (Object.keys(VIDU_MODEL_MODE_MATRIX) as ViduModel[]).filter((model) =>
    VIDU_MODEL_MODE_MATRIX[model].includes(mode)
  );
}

export function isViduModelModeSupported(
  model: string,
  mode: ViduGenerationMode
): model is ViduModel {
  return isViduModel(model) && VIDU_MODEL_MODE_MATRIX[model].includes(mode);
}

export function assertViduModelModeSupported(
  model: string,
  mode: ViduGenerationMode
): asserts model is ViduModel {
  if (!isViduModel(model)) {
    throw new ViduModelModeError(`不支持的 Vidu 模型: ${model}`);
  }

  if (VIDU_MODEL_MODE_MATRIX[model].includes(mode)) return;

  const supportedModels = getSupportedModelsForMode(mode).map((m) => VIDU_MODEL_LABELS[m]).join('、');
  const modeLabel = VIDU_MODE_LABELS[mode] || mode;
  const modelLabel = getViduModelLabel(model);
  throw new ViduModelModeError(`模型 ${modelLabel} (${model}) 不支持${modeLabel}，请改用：${supportedModels}`);
}
