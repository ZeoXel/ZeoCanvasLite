"use client";

import React, { useState, useEffect } from "react";
import { Search, SlidersHorizontal, ArrowUpRight, Clock, Coins, Play, Loader2, LayoutGrid, Settings, Megaphone, FileText, ShoppingCart, Video } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import Link from "next/link";
import {
    fetchWorkflows,
    formatBalanceCost,
    formatDuration
} from "@/services/coze/workflowClientService";
import type { CozeWorkflow, CozeWorkflowCategory } from "@/types/coze";

const WORKFLOW_CACHE_KEY = "coze_workflow_cache";
const WORKFLOW_CACHE_TTL = 10 * 60 * 1000;

let workflowCache: {
    updatedAt: number;
    workflows: CozeWorkflow[];
    categories: CozeWorkflowCategory[];
} | null = null;

const readWorkflowCache = () => {
    if (workflowCache) {
        const isStale = Date.now() - workflowCache.updatedAt > WORKFLOW_CACHE_TTL;
        return { ...workflowCache, isStale };
    }
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(WORKFLOW_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            updatedAt: number;
            workflows: CozeWorkflow[];
            categories: CozeWorkflowCategory[];
        };
        if (!parsed?.workflows) return null;
        workflowCache = {
            updatedAt: Number(parsed.updatedAt || 0),
            workflows: parsed.workflows || [],
            categories: parsed.categories || [],
        };
        const isStale = Date.now() - workflowCache.updatedAt > WORKFLOW_CACHE_TTL;
        return { ...workflowCache, isStale };
    } catch {
        return null;
    }
};

const writeWorkflowCache = (workflows: CozeWorkflow[], categories: CozeWorkflowCategory[]) => {
    const payload = { updatedAt: Date.now(), workflows, categories };
    workflowCache = payload;
    try {
        localStorage.setItem(WORKFLOW_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // ignore storage errors
    }
};

const WorkflowLibrary = () => {
    const [workflows, setWorkflows] = useState<CozeWorkflow[]>([]);
    const [categories, setCategories] = useState<CozeWorkflowCategory[]>([]);
    const [activeCategory, setActiveCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 加载工作流数据
    useEffect(() => {
        async function loadWorkflows() {
            const cached = readWorkflowCache();
            if (cached) {
                setWorkflows(cached.workflows);
                setCategories(cached.categories);
                setLoading(false);
            } else {
                setLoading(true);
            }
            setError(null);
            if (cached && !cached.isStale) return;

            const result = await fetchWorkflows();

            if (result.success && result.data) {
                setWorkflows(result.data.workflows);
                setCategories(result.data.categories);
                writeWorkflowCache(result.data.workflows, result.data.categories);
            } else {
                setError(result.error?.message || '加载失败');
            }

            setLoading(false);
        }

        loadWorkflows();
    }, []);

    // 筛选工作流
    const filtered = workflows.filter((wf) => {
        const matchesCategory = activeCategory === "all" || wf.category === activeCategory;
        const matchesSearch = wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            wf.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-gray-500 dark:text-gray-400">加载工作流...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 dark:border-red-900/50">
                <p className="text-red-500">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                    重试
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header & Controls */}
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">工作流库</h1>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">
                        发现和部署 {workflows.length} 个 AI 自动化工具
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜索工作流..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pl-9 text-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-blue-500 sm:w-64"
                        />
                    </div>
                    <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10">
                        <SlidersHorizontal size={16} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {categories.map((cat) => {
                    const IconComponent = {
                        'all': LayoutGrid,
                        '功能': Settings,
                        '品宣制作': Megaphone,
                        '文案策划': FileText,
                        '电商内容': ShoppingCart,
                        '自媒体运营': Video,
                    }[cat.id] || LayoutGrid;

                    return (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all ${activeCategory === cat.id
                                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                                : "bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                                }`}
                        >
                            <IconComponent size={14} />
                            <span>{cat.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((wf) => (
                    <GlassCard key={wf.id} hoverEffect className="flex h-full flex-col">
                        {/* Tags */}
                        {(wf.popular || wf.balanceCost === 0) && (
                            <div className="mb-4 flex items-center justify-end gap-2">
                                {wf.popular && (
                                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                                        热门
                                    </span>
                                )}
                                {wf.balanceCost === 0 && (
                                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
                                        免费
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Cover Video Preview */}
                        {wf.coverVideo && (
                            <div className="relative mb-4 aspect-video overflow-hidden rounded-lg bg-gray-100 dark:bg-white/5">
                                <video
                                    src={wf.coverVideo}
                                    className="h-full w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    onMouseEnter={(e) => e.currentTarget.play()}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.pause();
                                        e.currentTarget.currentTime = 0;
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                                    <Play className="h-12 w-12 text-white" fill="white" />
                                </div>
                            </div>
                        )}

                        {/* Title & Description */}
                        <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                            {wf.name}
                        </h3>
                        <p className="mb-4 flex-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
                            {wf.description}
                        </p>

                        {/* Meta Info */}
                        <div className="mb-4 flex items-center gap-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1">
                                <Clock size={12} />
                                <span>{formatDuration(wf.duration)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Coins size={12} />
                                <span>{formatBalanceCost(wf.balanceCost)}</span>
                            </div>
                        </div>

                        {/* Action Button */}
                        <Link href={`/workflow/${wf.id}`} className="mt-auto">
                            <button className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-sm font-medium text-gray-900 transition-all hover:bg-blue-50 hover:text-blue-600 dark:bg-white/5 dark:text-white dark:hover:bg-blue-500/20 dark:hover:text-blue-400">
                                使用工作流
                                <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </button>
                        </Link>
                    </GlassCard>
                ))}
            </div>

            {/* Empty State */}
            {filtered.length === 0 && (
                <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
                    <p className="text-gray-500 dark:text-gray-400">
                        找不到匹配 "{searchQuery}" 的工作流
                    </p>
                    <button
                        onClick={() => { setSearchQuery(""); setActiveCategory("all") }}
                        className="mt-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                        清除筛选
                    </button>
                </div>
            )}
        </div>
    );
};

export default WorkflowLibrary;
