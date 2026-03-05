export type AiProviderId =
  | 'openai'
  | 'gateway'
  | 'veo'
  | 'seedance'
  | 'seedream'
  | 'vidu'
  | 'minimax'
  | 'suno'
  | 'coze'
  | 'camera3d';

export const PROVIDER_ENV_PRIORITY: Record<AiProviderId, string[]> = {
  openai: ['OPENAI_API_KEY', 'GATEWAY_API_KEY', 'API_KEY'],
  gateway: ['GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
  veo: ['OPENAI_API_KEY', 'GATEWAY_API_KEY', 'API_KEY'],
  seedance: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'GATEWAY_API_KEY', 'API_KEY'],
  seedream: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'GATEWAY_API_KEY', 'API_KEY'],
  vidu: ['VIDU_API_KEY', 'GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
  minimax: ['MINIMAX_API_KEY', 'GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
  suno: ['SUNO_API_KEY', 'GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
  coze: ['COZE_API_KEY', 'GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
  camera3d: ['GATEWAY_API_KEY', 'OPENAI_API_KEY', 'API_KEY'],
};

export const GLOBAL_ENV_FALLBACK = [
  'GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'VOLCENGINE_API_KEY',
  'ARK_API_KEY',
  'GEMINI_API_KEY',
  'API_KEY',
] as const;
