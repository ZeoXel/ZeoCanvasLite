import { resolveProviderKey } from '@/lib/ai-client';

export async function getAssignedGatewayKey(provider?: string) {
  const apiKey = resolveProviderKey(provider);
  return { userId: 'local-user', apiKey };
}
