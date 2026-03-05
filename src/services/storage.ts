import { getScopedKey } from './storageScope';

const DB_NAME = 'studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

// SSR guard - check if we're in browser environment
const isBrowser = typeof window !== 'undefined';

let _dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!isBrowser) {
      reject(new Error('IndexedDB is not available in SSR'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      _dbPromise = null; // 失败时重置，允许重试
      reject(event.target.error);
    };
  });
  return _dbPromise;
};

export const saveToStorage = async (key: string, data: any) => {
  if (!isBrowser) return; // Skip in SSR
  const scopedKey = getScopedKey(key);
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, scopedKey);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 迁移完成标志 —— 避免每次读取都回退检查 legacy key
let _migrationComplete = false;

export const loadFromStorage = async <T>(key: string): Promise<T | undefined> => {
  if (!isBrowser) return undefined; // Skip in SSR
  const scopedKey = getScopedKey(key);
  const db = await getDB();
  return new Promise<T | undefined>((resolve, reject) => {
    // 常规路径使用 readonly 事务
    if (_migrationComplete) {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(scopedKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      return;
    }

    // 首次需要检查 legacy key 迁移，用 readwrite
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(scopedKey);

    request.onsuccess = () => {
      if (request.result !== undefined) {
        resolve(request.result);
        return;
      }

      // 兼容旧 key：如果 scoped 不存在，尝试读取 legacy key 并迁移
      const legacyRequest = store.get(key);
      legacyRequest.onsuccess = () => {
        const legacyValue = legacyRequest.result;
        if (legacyValue !== undefined) {
          store.put(legacyValue, scopedKey);
          store.delete(key);
        }
        resolve(legacyValue);
      };
      legacyRequest.onerror = () => {
        reject(legacyRequest.error);
      };
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
};

/** 批量读取 —— 一个 readonly 事务读取所有 key */
export const loadMultipleFromStorage = async <T = any>(keys: string[]): Promise<Record<string, T | undefined>> => {
  if (!isBrowser) return {};
  const db = await getDB();
  const scopedKeys = keys.map(k => ({ raw: k, scoped: getScopedKey(k) }));

  return new Promise<Record<string, T | undefined>>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, _migrationComplete ? 'readonly' : 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const result: Record<string, T | undefined> = {};
    let pending = scopedKeys.length;

    if (pending === 0) {
      resolve(result);
      return;
    }

    const checkDone = () => {
      pending--;
      if (pending <= 0) {
        _migrationComplete = true;
        resolve(result);
      }
    };

    for (const { raw, scoped } of scopedKeys) {
      const request = store.get(scoped);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          result[raw] = request.result;
          checkDone();
          return;
        }

        // 迁移已完成时不回退检查 legacy key
        if (_migrationComplete) {
          result[raw] = undefined;
          checkDone();
          return;
        }

        // legacy fallback
        const legacyRequest = store.get(raw);
        legacyRequest.onsuccess = () => {
          const legacyValue = legacyRequest.result;
          if (legacyValue !== undefined) {
            store.put(legacyValue, scoped);
            store.delete(raw);
          }
          result[raw] = legacyValue;
          checkDone();
        };
        legacyRequest.onerror = () => {
          result[raw] = undefined;
          checkDone();
        };
      };
      request.onerror = () => {
        result[raw] = undefined;
        checkDone();
      };
    }

    tx.onerror = () => reject(tx.error);
  });
};

/** 标记迁移已完成，后续读取跳过 legacy 回退 */
export const markMigrationComplete = () => {
  _migrationComplete = true;
};

// ==================== 主体库存储 ====================
import type { Subject } from '@/types';

const SUBJECTS_KEY = 'studio_subjects';
const SUBJECT_CATEGORIES_KEY = 'studio_subject_categories';

// 默认分类
const DEFAULT_CATEGORIES = ['character', 'object', 'animal', 'vehicle'];

/** 保存主体列表 */
export const saveSubjects = async (subjects: Subject[]): Promise<void> => {
  await saveToStorage(SUBJECTS_KEY, subjects);
};

/** 加载主体列表 */
export const loadSubjects = async (): Promise<Subject[]> => {
  return (await loadFromStorage<Subject[]>(SUBJECTS_KEY)) || [];
};

/** 保存分类列表 */
export const saveSubjectCategories = async (categories: string[]): Promise<void> => {
  await saveToStorage(SUBJECT_CATEGORIES_KEY, categories);
};

/** 加载分类列表 */
export const loadSubjectCategories = async (): Promise<string[]> => {
  return (await loadFromStorage<string[]>(SUBJECT_CATEGORIES_KEY)) || DEFAULT_CATEGORIES;
};
