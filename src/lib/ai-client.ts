import { GLOBAL_ENV_FALLBACK, PROVIDER_ENV_PRIORITY, type AiProviderId } from '@/config/ai-providers';

const readEnv = (key: string): string | null => {
  const value = process.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const dedupe = (keys: readonly string[]): string[] => {
  return Array.from(new Set(keys));
};

export const resolveProviderKey = (provider?: string): string | null => {
  const normalized = provider?.trim().toLowerCase() as AiProviderId | undefined;
  const providerCandidates =
    normalized && normalized in PROVIDER_ENV_PRIORITY
      ? PROVIDER_ENV_PRIORITY[normalized]
      : [];
  const candidates = dedupe([...providerCandidates, ...GLOBAL_ENV_FALLBACK]);

  for (const keyName of candidates) {
    const resolved = readEnv(keyName);
    if (resolved) return resolved;
  }

  return null;
};
