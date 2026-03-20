"use client";

import React, { useState, useEffect } from 'react';
import {
    RefreshCw, Copy, Eye, EyeOff
} from 'lucide-react';
import { UserAvatar } from '@/components/studio/UserAvatar';
import { fetchAssignedApiKey } from '@/services/userKeyService';
import { useUserData } from '@/contexts/UserDataContext';
import { useAuth } from '@/contexts/AuthContext';
import GlassCard from '@/components/ui/GlassCard';

const CACHE_TTL = 5 * 60 * 1000;

const UserProfile = () => {
    const { user, refreshAll } = useUserData();
    const { logout } = useAuth();
    const [loading, setLoading] = useState(false);
    const [keyVisible, setKeyVisible] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);

    useEffect(() => {
        const loadKey = async () => {
            try {
                const cachedKey = localStorage.getItem('api_key_cache');
                if (cachedKey) {
                    const { data, timestamp } = JSON.parse(cachedKey);
                    if (Date.now() - timestamp < CACHE_TTL && data) {
                        setApiKey(data as string);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Failed to parse key cache', e);
            }

            try {
                const key = await fetchAssignedApiKey();
                if (key) {
                    setApiKey(key);
                    localStorage.setItem('api_key_cache', JSON.stringify({ data: key, timestamp: Date.now() }));
                }
            } catch (e) {
                console.warn('Failed to fetch api key', e);
            }
        };

        loadKey();
    }, []);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleManualRefresh = () => {
        setLoading(true);
        Promise.all([
            refreshAll({ force: true }),
            fetchAssignedApiKey().then((key) => {
                if (key) {
                    setApiKey(key);
                    localStorage.setItem('api_key_cache', JSON.stringify({ data: key, timestamp: Date.now() }));
                }
            }),
        ]).finally(() => setLoading(false));
    };

    const handleLogout = async () => {
        if (confirm('确定要退出登录吗?')) {
            await logout();
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <GlassCard className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <UserAvatar name={user?.user.username} size={80} />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {user?.user.username || 'Loading...'}
                        </h1>
                        <div className="mt-1 flex gap-2">
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                {user?.user.role || 'User'}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-400">
                                {user?.user.email}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleManualRefresh}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        刷新
                    </button>
                </div>
            </GlassCard>

            {/* Account Info */}
            <GlassCard>
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">基本信息</h3>
                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-500 dark:text-gray-400">用户名</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={user?.user.username || ''}
                                disabled
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-black/20 dark:text-gray-400"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-500 dark:text-gray-400">邮箱</label>
                        <input
                            type="text"
                            value={user?.user.email || ''}
                            disabled
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-black/20 dark:text-gray-400"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-500 dark:text-gray-400">Studio API Key</label>
                        <div className="relative">
                            <input
                                type={keyVisible ? "text" : "password"}
                                value={apiKey || 'No Key Assigned'}
                                readOnly
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-20 text-sm font-mono text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                            <div className="absolute right-2 top-1.5 flex gap-1">
                                <button onClick={() => setKeyVisible(!keyVisible)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button onClick={() => apiKey && copyToClipboard(apiKey)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-gray-200 dark:border-white/10 flex justify-end">
                        <button
                            onClick={handleLogout}
                            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                        >
                            退出登录
                        </button>
                    </div>
                </div>
            </GlassCard>
        </div>
    );
};

export default UserProfile;
