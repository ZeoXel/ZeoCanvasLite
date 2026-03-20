"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import { useUserData } from "@/contexts/UserDataContext";
import { DashboardTrendChart } from "./charts/DashboardTrendChart";
import { DashboardBarChart } from "./charts/DashboardBarChart";

const providerColors: Record<string, string> = {
    vidu: "#3b82f6",
    veo: "#8b5cf6",
    seedream: "#10b981",
    suno: "#f59e0b",
    minimax: "#ef4444",
};

const fallbackColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
];

const getProviderColor = (provider: string, index: number) => {
    const key = provider.toLowerCase();
    if (providerColors[key]) return providerColors[key];
    return fallbackColors[index % fallbackColors.length];
};

const getProviderName = (provider: string) => {
    const names: Record<string, string> = {
        vidu: "Vidu",
        veo: "Veo",
        seedream: "Seedream",
        suno: "Suno",
        minimax: "MiniMax",
    };
    return names[provider.toLowerCase()] || provider;
};

const DashboardAnalytics = () => {
    const { credits, creditsLoading, refreshCredits } = useUserData();
    const [activeTab, setActiveTab] = useState<'trend' | 'distribution' | 'calls'>('trend');

    useEffect(() => {
        if (!credits && !creditsLoading) {
            refreshCredits({ scope: 'full' });
        }
    }, [credits, creditsLoading, refreshCredits]);

    const trendData = useMemo(() => {
        return credits?.usage?.last7Days?.daily?.map((d) => ({
            date: d.date,
            value: d.consumption,
        })) || [];
    }, [credits]);

    const distributionData = useMemo(() => {
        return credits?.usage?.last30Days?.byProvider?.map((item, index) => ({
            model: getProviderName(item.provider),
            value: item.consumption,
            color: getProviderColor(item.provider, index),
        })) || [];
    }, [credits]);

    const callData = useMemo(() => {
        return credits?.usage?.last30Days?.byProvider?.map((item, index) => ({
            model: getProviderName(item.provider),
            value: item.transactions,
            color: getProviderColor(item.provider, index),
        })) || [];
    }, [credits]);

    return (
        <GlassCard className="h-[420px] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据分析</h3>
                </div>
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs dark:bg-white/5">
                    <button
                        onClick={() => setActiveTab('trend')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'trend'
                            ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        消耗趋势
                    </button>
                    <button
                        onClick={() => setActiveTab('distribution')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'distribution'
                            ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        消耗分布
                    </button>
                    <button
                        onClick={() => setActiveTab('calls')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'calls'
                            ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        调用次数
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {creditsLoading && !credits ? (
                    <div className="h-full w-full animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
                ) : (
                    <>
                        {activeTab === 'trend' && <DashboardTrendChart data={trendData} />}
                        {activeTab === 'distribution' && (
                            <DashboardBarChart data={distributionData} valueLabel="积分" />
                        )}
                        {activeTab === 'calls' && (
                            <DashboardBarChart data={callData} valueLabel="次" />
                        )}
                    </>
                )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                    <div className="text-xs">今日消耗</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {credits?.usage?.today?.consumption?.toFixed(1) || 0}
                    </div>
                    <div className="text-xs">{credits?.usage?.today?.transactions || 0} 次</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                    <div className="text-xs">7天消耗</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {credits?.usage?.last7Days?.consumption?.toFixed(1) || 0}
                    </div>
                    <div className="text-xs">{credits?.usage?.last7Days?.transactions || 0} 次</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                    <div className="text-xs">30天消耗</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                        {credits?.usage?.last30Days?.consumption?.toFixed(1) || 0}
                    </div>
                    <div className="text-xs">{credits?.usage?.last30Days?.transactions || 0} 次</div>
                </div>
            </div>
        </GlassCard>
    );
};

export default DashboardAnalytics;
