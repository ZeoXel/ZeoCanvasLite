const USER_ASSIGNED_KEY = 'user_assigned_key';
const USER_ASSIGNED_KEY_TS = 'user_assigned_key_ts';
const ASSIGNED_KEY_TTL_MS = Number(process.env.NEXT_PUBLIC_ASSIGNED_KEY_TTL_MS) || 24 * 60 * 60 * 1000;

const cacheAssignedKey = (keyValue: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_ASSIGNED_KEY, keyValue);
  localStorage.setItem(USER_ASSIGNED_KEY_TS, String(Date.now()));
};

export const getCachedAssignedKey = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ASSIGNED_KEY);
};

export const getAssignedKeyTimestamp = (): number | null => {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(USER_ASSIGNED_KEY_TS);
  return value ? Number(value) : null;
};

export const isAssignedKeyCacheValid = (): boolean => {
  const ts = getAssignedKeyTimestamp();
  if (!ts) return false;
  return Date.now() - ts <= ASSIGNED_KEY_TTL_MS;
};

export const clearAssignedKeyCache = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_ASSIGNED_KEY);
  localStorage.removeItem(USER_ASSIGNED_KEY_TS);
};

/**
 * Fetch assigned API key from server (Next API).
 */
export const fetchAssignedApiKey = async (options?: { force?: boolean }): Promise<string | null> => {
  try {
    const cached = getCachedAssignedKey();
    if (!options?.force && cached && isAssignedKeyCacheValid()) {
      return cached;
    }

    const response = await fetch('/api/user/apikey');
    if (!response.ok) {
      return cached || null;
    }
    const result = await response.json();
    if (!result?.success || !result?.key) {
      return cached || null;
    }
    cacheAssignedKey(result.key);
    return result.key;
  } catch {
    return getCachedAssignedKey();
  }
};
