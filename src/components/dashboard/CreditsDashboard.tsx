"use client";

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { UserAvatar } from '@/components/studio/UserAvatar';
import { useUserData } from '@/contexts/UserDataContext';
import GlassCard from '@/components/ui/GlassCard';
import { DashboardTrendChart } from './charts/DashboardTrendChart';
import { DashboardDonutChart } from './charts/DashboardDonutChart';
import { DashboardBarChart } from './charts/DashboardBarChart';
import { RechargeModal } from '@/components/recharge';

const getProviderColor = (provider: string, index: number = 0) => {
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    const hash = provider.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[Math.abs(hash) % colors.length];
};

const getProviderName = (provider: string) => {
    const names: Record<string, string> = {
        'vidu': 'Vidu',
        'suno': 'Suno',
        'minimax': 'MiniMax',
    };
    return names[provider.toLowerCase()] || provider;
};

const CreditsDashboard = () => {
    const { user, credits, refreshAll } = useUserData();
    const [loading, setLoading] = useState(false);
    const [showRechargeModal, setShowRechargeModal] = useState(false);
    const [activeChartTab, setActiveChartTab] = useState<'trend' | 'distribution' | 'calls'>('trend');

    const userName = user?.user?.username || user?.user?.name || 'Loading...';

    const handleManualRefresh = () => {
        setLoading(true);
        refreshAll({ force: true }).finally(() => setLoading(false));
    };

    const trendData = credits?.usage.last7Days.daily?.map(d => ({
        date: d.date,
        value: d.consumption
    })) || [];

    const donutData = credits?.usage.last30Days.byProvider?.map((item, index) => ({
        label: getProviderName(item.provider),
        value: item.consumption,
        color: getProviderColor(item.provider, index)
    })) || [];

    const distributionData = donutData.map(d => ({
        model: d.label,
        value: d.value,
        color: d.color
    }));

    const callData = credits?.usage.last30Days.byProvider?.map((item, index) => ({
        model: getProviderName(item.provider),
        value: item.transactions,
        color: getProviderColor(item.provider, index)
    })) || [];

    return (
        <>
        <div className="space-y-6">
            {/* Header */}
            <GlassCard className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <UserAvatar name={userName} size={80} />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {userName}
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

            {/* Balance Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <GlassCard className="!p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">总积分</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                        {credits?.balance.total.toLocaleString() || 0}
                    </p>
                </GlassCard>
                <GlassCard className="!p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">已使用</p>
                    <p className="mt-2 text-3xl font-bold text-red-500">
                        {credits?.balance.used.toLocaleString() || 0}
                    </p>
                </GlassCard>
                <GlassCard className="relative !p-6 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/10">
                    <p className="text-sm text-blue-600 dark:text-blue-400">剩余积分</p>
                    <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {credits?.balance.remaining.toFixed(2) || '0.00'}
                    </p>
                    <button
                        onClick={() => setShowRechargeModal(true)}
                        className="absolute right-6 top-6 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                        充值
                    </button>
                </GlassCard>
            </div>

            {/* Charts Area */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <GlassCard className="lg:col-span-2 h-80 flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据分析</h3>
                        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs dark:bg-white/5">
                            <button
                                onClick={() => setActiveChartTab('trend')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${activeChartTab === 'trend'
                                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                            >
                                消耗趋势
                            </button>
                            <button
                                onClick={() => setActiveChartTab('distribution')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${activeChartTab === 'distribution'
                                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                            >
                                消耗分布
                            </button>
                            <button
                                onClick={() => setActiveChartTab('calls')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${activeChartTab === 'calls'
                                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                            >
                                调用次数
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        {activeChartTab === 'trend' && (
                            <DashboardTrendChart data={trendData} />
                        )}
                        {activeChartTab === 'distribution' && (
                            <DashboardBarChart data={distributionData} valueLabel="积分" />
                        )}
                        {activeChartTab === 'calls' && (
                            <DashboardBarChart data={callData} valueLabel="次" />
                        )}
                    </div>
                </GlassCard>
                <GlassCard className="h-80 flex flex-col">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">模型消耗分布</h3>
                    <div className="flex-1 w-full min-h-0">
                        <DashboardDonutChart data={donutData} />
                    </div>
                </GlassCard>
            </div>

            {/* Recent Transactions */}
            <GlassCard>
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">最近交易</h3>
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-white/10">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                            <tr>
                                <th className="px-6 py-3 font-medium">服务</th>
                                <th className="px-6 py-3 font-medium">模型</th>
                                <th className="px-6 py-3 font-medium">时间</th>
                                <th className="px-6 py-3 font-medium text-right">消耗</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-white/5">
                            {(credits?.recentTransactions?.length ?? 0) > 0 ? (
                                credits?.recentTransactions?.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                        <td className="px-6 py-4 text-gray-900 dark:text-white">{tx.service}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{tx.model}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                            {new Date(tx.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-red-500">
                                            -{tx.amount}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">暂无交易记录</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>
        </div>
        <RechargeModal
            isOpen={showRechargeModal}
            onClose={() => setShowRechargeModal(false)}
            onSuccess={() => {
                setShowRechargeModal(false);
                refreshAll({ force: true });
            }}
        />
        </>
    );
};

export default CreditsDashboard;
