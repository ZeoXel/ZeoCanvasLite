import type { CozeGatewayConfig, CozeRegionConfig, CozeConfig } from '@/types/coze';

/**
 * Coze 网关配置
 * 注意：与 coze-workflow-platform 使用相同的网关配置
 */
export const gatewayConfig: CozeGatewayConfig = {
  USE_GATEWAY: true,
  GATEWAY_BASE_URL: process.env.COZE_GATEWAY_BASE_URL || 'https://api.lsaigc.com/v1',
  GATEWAY_API_KEY: process.env.COZE_GATEWAY_API_KEY || '', // 不硬编码，从用户分配的 key 获取
  GATEWAY_MODEL: process.env.COZE_GATEWAY_MODEL || 'coze-workflow',
  DEFAULT_WORKFLOW_ID: process.env.COZE_DEFAULT_WORKFLOW_ID || '7549079559813087284',
};

/**
 * 中国区配置
 */
export const cnConfig: CozeRegionConfig = {
  COZE_BASE_URL: 'https://api.coze.cn',
  auth: {
    oauth_jwt: {
      COZE_APP_ID: process.env.COZE_CN_APP_ID || '1142673671974',
      COZE_KEY_ID: process.env.COZE_CN_KEY_ID || '4cyH3f18atVg3Z9V4xJbWld6ybh2Ptleaj5v_kfaA4k',
      COZE_AUD: 'api.coze.cn',
    },
    pat: {
      COZE_API_PAT_TOKEN: process.env.COZE_CN_PAT_TOKEN || 'none',
    },
  },
};

/**
 * 国际区配置
 */
export const enConfig: CozeRegionConfig = {
  COZE_BASE_URL: 'https://api.coze.com',
  auth: {
    oauth_jwt: {
      COZE_APP_ID: process.env.COZE_EN_APP_ID || '1142673671974',
      COZE_KEY_ID: process.env.COZE_EN_KEY_ID || '4cyH3f18atVg3Z9V4xJbWld6ybh2Ptleaj5v_kfaA4k',
      COZE_AUD: 'api.coze.com',
    },
    pat: {
      COZE_API_PAT_TOKEN: process.env.COZE_EN_PAT_TOKEN || 'none',
    },
  },
};

/**
 * 完整配置导出
 */
export const cozeConfig: CozeConfig = {
  cn: cnConfig,
  en: enConfig,
  gateway: gatewayConfig,
  server: {
    BASE_URL: process.env.COZE_SERVER_BASE_URL || 'https://coze.lsaigc.com',
    PORT: parseInt(process.env.COZE_SERVER_PORT || '9005', 10),
  },
};

/**
 * 获取当前区域配置
 */
export function getRegionConfig(region: 'cn' | 'en' = 'cn'): CozeRegionConfig {
  return region === 'cn' ? cnConfig : enConfig;
}

/**
 * 获取网关配置
 */
export function getGatewayConfig(): CozeGatewayConfig {
  return gatewayConfig;
}

export default cozeConfig;
