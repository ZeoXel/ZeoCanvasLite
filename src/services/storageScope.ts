const DEFAULT_USER_ID = 'anonymous';

let currentStorageUserId: string = DEFAULT_USER_ID;

export function setStorageUserId(userId?: string | null): void {
  currentStorageUserId = userId || DEFAULT_USER_ID;
}

export function getStorageUserId(): string {
  return currentStorageUserId;
}

export function getScopedKey(baseKey: string, userId?: string | null): string {
  const uid = userId || currentStorageUserId || DEFAULT_USER_ID;
  return `${baseKey}:${uid}`;
}

export function isAnonymousStorageUser(): boolean {
  return currentStorageUserId === DEFAULT_USER_ID;
}
