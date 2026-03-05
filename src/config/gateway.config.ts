export const GATEWAY_CONFIG = {
  lsapi: {
    apiUrl: 'https://api.lsaigc.com',
    apiPath: '/v1',
    quotaEndpoint: '/api/usage/token/', // New API usage endpoint (requires trailing slash)
    name: 'LSAIGC 网关',
    description: 'LSAIGC 生产网关',
    conversionRate: 500000,
    pricingMultiplier: 2,
  },
} as const;

export type GatewayProvider = keyof typeof GATEWAY_CONFIG;

const DEFAULT_PROVIDER: GatewayProvider = 'lsapi';
const DEFAULT_CONVERSION_RATE = 500000;
const DEFAULT_PRICING_MULTIPLIER = 2;

export function getApiUrlByProvider(provider?: string): string {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  return config?.apiUrl || GATEWAY_CONFIG[DEFAULT_PROVIDER].apiUrl;
}

export function getFullApiUrlByProvider(provider?: string): string {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  if (!config) {
    return (
      GATEWAY_CONFIG[DEFAULT_PROVIDER].apiUrl +
      GATEWAY_CONFIG[DEFAULT_PROVIDER].apiPath
    );
  }
  return config.apiUrl + config.apiPath;
}

export function getQuotaEndpointByProvider(provider?: string): string {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  return config?.quotaEndpoint || GATEWAY_CONFIG[DEFAULT_PROVIDER].quotaEndpoint;
}

export function getGatewayName(provider?: string): string {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  return config?.name || GATEWAY_CONFIG[DEFAULT_PROVIDER].name;
}

export function getConversionRateByProvider(provider?: string): number {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  return config?.conversionRate || DEFAULT_CONVERSION_RATE;
}

export function getPricingMultiplierByProvider(provider?: string): number {
  const config = GATEWAY_CONFIG[provider as GatewayProvider];
  return config?.pricingMultiplier || DEFAULT_PRICING_MULTIPLIER;
}
