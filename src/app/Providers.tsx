"use client";

import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserDataProvider } from '@/contexts/UserDataContext';
import { TaskLogProvider } from '@/contexts/TaskLogContext';
import StudioSyncProvider from '@/components/StudioSyncProvider';

interface ProvidersProps {
    children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
    return (
        <SessionProvider>
            <AuthProvider>
                <UserDataProvider>
                    <TaskLogProvider>
                        <StudioSyncProvider>
                            {children}
                        </StudioSyncProvider>
                    </TaskLogProvider>
                </UserDataProvider>
            </AuthProvider>
        </SessionProvider>
    );
}
