"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserInfo, type UserMeResponse } from '@/services/userApiService';
import { getCreditBalance, getCreditInfo } from '@/services/creditsService';
import type { CreditBalance, CreditInfo } from '@/types/credits';
import { loadFromStorage, saveToStorage } from '@/services/storage';
import { onCreditsUpdated } from '@/services/creditsEvents';
import { getScopedKey } from '@/services/storageScope';

interface UserDataContextType {
  user: UserMeResponse | null;
  userLoading: boolean;
  refreshUser: (options?: { force?: boolean }) => Promise<void>;
  updateUserLocal: (updater: (prev: UserMeResponse | null) => UserMeResponse | null) => void;

  credits: CreditInfo | null;
  creditBalance: CreditBalance | null;
  creditsLoading: boolean;
  refreshCredits: (options?: { force?: boolean; scope?: 'balance' | 'full' }) => Promise<void>;

  refreshAll: (options?: { force?: boolean }) => Promise<void>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

const USER_CACHE_KEY = 'user_data_cache';
const CREDIT_CACHE_KEY = 'credit_data_cache';
const BALANCE_CACHE_KEY = 'user_balance_cache';
const CACHE_TTL = 5 * 60 * 1000;

const isBrowser = typeof window !== 'undefined';

const readCache = <T,>(key: string): { data: T; timestamp: number } | null => {
  if (!isBrowser) return null;
  try {
    const cached = localStorage.getItem(getScopedKey(key));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed?.data || !parsed?.timestamp) return null;
    return parsed as { data: T; timestamp: number };
  } catch {
    return null;
  }
};

const writeCache = (key: string, data: unknown) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(getScopedKey(key), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore
  }
};

const isFresh = (timestamp?: number | null) => {
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
};

interface UserDataProviderProps {
  children: ReactNode;
}

export const UserDataProvider: React.FC<UserDataProviderProps> = ({ children }) => {
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();

  const [user, setUser] = useState<UserMeResponse | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  const [credits, setCredits] = useState<CreditInfo | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const lastUserFetchRef = useRef<number | null>(null);
  const lastCreditsFetchRef = useRef<number | null>(null);
  const authUserIdRef = useRef<string | undefined>(undefined);
  const creditBalanceRef = useRef<CreditBalance | null>(null);
  const creditsRef = useRef<CreditInfo | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const balanceInFlightRef = useRef<Promise<void> | null>(null);
  const fullCreditsInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    creditBalanceRef.current = creditBalance;
  }, [creditBalance]);

  useEffect(() => {
    creditsRef.current = credits;
  }, [credits]);

  const updateCreditCaches = useCallback((nextBalance: CreditBalance) => {
    saveToStorage(BALANCE_CACHE_KEY, { balance: nextBalance.remaining, timestamp: Date.now() }).catch(() => {});

    const cachedCredits = readCache<CreditInfo>(CREDIT_CACHE_KEY);
    const baseCredits = cachedCredits?.data ?? creditsRef.current;
    if (baseCredits) {
      const updatedCredits: CreditInfo = {
        ...baseCredits,
        balance: nextBalance,
      };
      writeCache(CREDIT_CACHE_KEY, updatedCredits);
    }
  }, []);

  const refreshUser = useCallback(
    async (options?: { force?: boolean }) => {
      if (authLoading || !isAuthenticated) return;
      const force = options?.force ?? false;
      if (!force && isFresh(lastUserFetchRef.current)) return;

      setUserLoading(true);
      try {
        const data = await getUserInfo();
        if (data) {
          setUser(data);
          lastUserFetchRef.current = Date.now();
          writeCache(USER_CACHE_KEY, data);
        }
      } catch (error) {
        console.error('[UserData] Failed to refresh user:', error);
      } finally {
        setUserLoading(false);
      }
    },
    [authLoading, isAuthenticated]
  );

  const refreshCredits = useCallback(
    async (options?: { force?: boolean; scope?: 'balance' | 'full' }) => {
      if (authLoading || !isAuthenticated) return;
      const force = options?.force ?? false;
      const scope = options?.scope ?? 'full';

      if (scope === 'full' && !force && isFresh(lastCreditsFetchRef.current)) return;

      if (scope === 'balance') {
        if (fullCreditsInFlightRef.current) return fullCreditsInFlightRef.current;
        if (balanceInFlightRef.current) return balanceInFlightRef.current;

        const task = (async () => {
          try {
            const balance = await getCreditBalance();
            setCreditBalance(balance);
            setCredits((prev) => (prev ? { ...prev, balance } : prev));
            updateCreditCaches(balance);
          } catch (error) {
            console.error('[UserData] Failed to refresh credit balance:', error);
          } finally {
            balanceInFlightRef.current = null;
          }
        })();

        balanceInFlightRef.current = task;
        return task;
      }

      if (fullCreditsInFlightRef.current) return fullCreditsInFlightRef.current;

      const task = (async () => {
        setCreditsLoading(true);
        try {
          const info = await getCreditInfo();
          if (info) {
            setCredits(info);
            setCreditBalance(info.balance);
            lastCreditsFetchRef.current = Date.now();
            writeCache(CREDIT_CACHE_KEY, info);
            updateCreditCaches(info.balance);
          }
        } catch (error) {
          console.error('[UserData] Failed to refresh credits:', error);
        } finally {
          setCreditsLoading(false);
          fullCreditsInFlightRef.current = null;
        }
      })();

      fullCreditsInFlightRef.current = task;
      return task;
    },
    [authLoading, isAuthenticated, updateCreditCaches]
  );

  const refreshAll = useCallback(
    async (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      await Promise.all([
        refreshUser({ force }),
        refreshCredits({ force, scope: 'full' }),
      ]);
    },
    [refreshCredits, refreshUser]
  );

  const updateUserLocal = useCallback(
    (updater: (prev: UserMeResponse | null) => UserMeResponse | null) => {
      setUser((prev) => {
        const next = updater(prev);
        if (next) {
          writeCache(USER_CACHE_KEY, next);
          lastUserFetchRef.current = Date.now();
        }
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setUser(null);
      setCredits(null);
      setCreditBalance(null);
      lastUserFetchRef.current = null;
      lastCreditsFetchRef.current = null;
      authUserIdRef.current = undefined;
      return;
    }

    const authId = authUser?.id;
    const authIdChanged = Boolean(
      authId && authUserIdRef.current && authUserIdRef.current !== authId
    );
    authUserIdRef.current = authId;

    if (authIdChanged) {
      setUser(null);
      setCredits(null);
      setCreditBalance(null);
      lastUserFetchRef.current = null;
      lastCreditsFetchRef.current = null;
    }

    if (!authIdChanged) {
      const cachedUser = readCache<UserMeResponse>(USER_CACHE_KEY);
      if (cachedUser) {
        setUser(cachedUser.data);
        if (isFresh(cachedUser.timestamp)) {
          lastUserFetchRef.current = cachedUser.timestamp;
        }
      }

      const cachedCredits = readCache<CreditInfo>(CREDIT_CACHE_KEY);
      if (cachedCredits) {
        setCredits(cachedCredits.data);
        setCreditBalance(cachedCredits.data.balance);
        if (isFresh(cachedCredits.timestamp)) {
          lastCreditsFetchRef.current = cachedCredits.timestamp;
        }
      }

      loadFromStorage<{ balance: number; timestamp: number }>(BALANCE_CACHE_KEY)
        .then((cachedBalance) => {
          if (!cachedBalance) return;
          if (!isFresh(cachedBalance.timestamp)) return;
          setCreditBalance((prev) => {
            if (prev?.remaining !== undefined) return prev;
            return {
              total: prev?.total ?? 0,
              used: prev?.used ?? 0,
              remaining: cachedBalance.balance,
              locked: prev?.locked ?? 0,
            };
          });
        })
        .catch(() => {});
    }

    refreshUser({ force: authIdChanged });

    if (authIdChanged) {
      refreshCredits({ force: true, scope: 'full' });
    } else {
      const cachedCredits = readCache<CreditInfo>(CREDIT_CACHE_KEY);
      const cachedRecent = cachedCredits?.data?.recentTransactions ?? [];
      const needsCredits =
        !cachedCredits ||
        !isFresh(cachedCredits.timestamp) ||
        cachedRecent.length === 0;
      if (needsCredits) {
        refreshCredits({ force: true, scope: 'full' });
      }
    }
  }, [authLoading, authUser?.id, isAuthenticated, refreshCredits, refreshUser]);

  useEffect(() => {
    const unsubscribe = onCreditsUpdated((detail) => {
      const previous = creditsRef.current?.balance ?? creditBalanceRef.current;
      const nextBalance: CreditBalance = {
        total: detail.total ?? previous?.total ?? 0,
        used: detail.used ?? (previous?.used ?? 0) + detail.credits,
        remaining: detail.remaining ?? detail.balance,
        locked: previous?.locked ?? 0,
      };

      setCreditBalance(nextBalance);
      setCredits((prev) => (prev ? { ...prev, balance: nextBalance } : prev));
      updateCreditCaches(nextBalance);

      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshCredits({ force: true, scope: 'full' }).finally(() => {
          refreshTimerRef.current = null;
        });
      }, 1500);
    });

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      unsubscribe();
    };
  }, [refreshCredits, updateCreditCaches]);

  const value: UserDataContextType = {
    user,
    userLoading,
    refreshUser,
    updateUserLocal,
    credits,
    creditBalance,
    creditsLoading,
    refreshCredits,
    refreshAll,
  };

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

export const useUserData = (): UserDataContextType => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};

export default UserDataContext;
