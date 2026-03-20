"use client";

import React, { createContext, useContext, useMemo, useState, useCallback, ReactNode, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { setCurrentUserId } from '@/services/cosStorage';
import { setStorageUserId } from '@/services/storageScope';
import { invalidateCache } from '@/services/studioCache';

export interface AuthUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string;
    photo?: string | null;
}

interface AuthContextType {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
    setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const { data: session, status } = useSession();
    const [overrideUser, setOverrideUser] = useState<AuthUser | null>(null);

    const user = useMemo<AuthUser | null>(() => {
        if (overrideUser) return overrideUser;
        if (!session?.user) return null;

        const sessionUser = session.user as any;
        return {
            id: sessionUser.id,
            name: sessionUser.name,
            email: sessionUser.email,
            role: sessionUser.role,
            photo: sessionUser.image || sessionUser.photo || null,
        };
    }, [overrideUser, session]);

    const refreshUser = useCallback(async () => {
        // NextAuth session is refreshed by default on focus/interval;
        // keep this for API compatibility.
        return;
    }, []);

    const logout = useCallback(async () => {
        await signOut({ callbackUrl: '/' });
    }, []);

    const value: AuthContextType = {
        user,
        isLoading: status === 'loading',
        isAuthenticated: !!user,
        refreshUser,
        logout,
        setUser: setOverrideUser,
    };

    useEffect(() => {
        setCurrentUserId(user?.id || '');
        setStorageUserId(user?.id || '');
        invalidateCache();
    }, [user?.id]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
