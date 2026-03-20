"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowRight,
    LayoutGrid,
    Settings,
    Megaphone,
    FileText,
    ShoppingCart,
    Video,
    Image as ImageIcon,
    Music
} from "lucide-react";
import GlassCard from "../ui/GlassCard";
import {
    fetchWorkflows,
    formatBalanceCost,
    formatDuration,
    getCategoryColor
} from "@/services/coze/workflowClientService";
import type { CozeWorkflow } from "@/types/coze";

const WORKFLOW_CACHE_KEY = "coze_workflow_cache";
const WORKFLOW_CACHE_TTL = 10 * 60 * 1000;

let workflowCache: { updatedAt: number; workflows: CozeWorkflow[] } | null = null;

const readWorkflowCache = () => {
    if (workflowCache) {
        const isStale = Date.now() - workflowCache.updatedAt > WORKFLOW_CACHE_TTL;
        return { ...workflowCache, isStale };
    }
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(WORKFLOW_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { updatedAt: number; workflows: CozeWorkflow[] };
        if (!parsed?.workflows) return null;
        const isStale = Date.now() - Number(parsed.updatedAt || 0) > WORKFLOW_CACHE_TTL;
        workflowCache = { updatedAt: Number(parsed.updatedAt || 0), workflows: parsed.workflows };
        return { ...workflowCache, isStale };
    } catch {
        return null;
    }
};

const writeWorkflowCache = (workflows: CozeWorkflow[]) => {
    const payload = { updatedAt: Date.now(), workflows };
    workflowCache = payload;
    try {
        localStorage.setItem(WORKFLOW_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // ignore storage errors
    }
};

const getWorkflowIcon = (workflow: CozeWorkflow) => {
    if (workflow.outputFormat === 'image') return <ImageIcon size={24} />;
    if (workflow.outputFormat === 'video') return <Video size={24} />;
    if (workflow.outputFormat === 'audio') return <Music size={24} />;
    const categoryIcons: Record<string, React.ReactNode> = {
        '功能': <Settings size={24} />,
        '品宣制作': <Megaphone size={24} />,
        '文案策划': <FileText size={24} />,
        '电商内容': <ShoppingCart size={24} />,
        '自媒体运营': <Video size={24} />,
    };
    return categoryIcons[workflow.category] || <LayoutGrid size={24} />;
};

const getFeaturedWorkflows = (workflows: CozeWorkflow[]) => {
    const active = workflows.filter((wf) => wf.status !== 'inactive');
    const popular = active.filter((wf) => wf.popular);
    const combined = [...popular, ...active];
    const unique = combined.filter(
        (wf, index, arr) => arr.findIndex((item) => item.id === wf.id) === index
    );
    return unique.slice(0, 4);
};

const DashboardWorkflows = () => {
    const [workflows, setWorkflows] = useState<CozeWorkflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadWorkflows = async () => {
            const cached = readWorkflowCache();
            if (cached) {
                setWorkflows(cached.workflows);
                setLoading(false);
            } else {
                setLoading(true);
            }
            setError(null);
            if (cached && !cached.isStale) return;
            const result = await fetchWorkflows();
            if (!isMounted) return;
            if (result.success && result.data) {
                setWorkflows(result.data.workflows);
                writeWorkflowCache(result.data.workflows);
            } else {
                setError(result.error?.message || '加载失败');
            }
            setLoading(false);
        };
        loadWorkflows();
        return () => {
            isMounted = false;
        };
    }, []);

    const featuredWorkflows = useMemo(
        () => getFeaturedWorkflows(workflows),
        [workflows]
    );

    return (
        <div className="mb-12">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    热门工作流
                </h2>
                <Link
                    href="/workflow"
                    className="group flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                >
                    查看全部
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <GlassCard key={index} className="h-full animate-pulse">
                            <div className="mb-4 h-12 w-12 rounded-xl bg-gray-200 dark:bg-white/10" />
                            <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
                            <div className="h-3 w-full rounded bg-gray-200 dark:bg-white/10" />
                        </GlassCard>
                    ))}
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                    {error}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {featuredWorkflows.map((wf) => (
                        <Link key={wf.id} href={`/workflow/${wf.id}`} className="block h-full">
                            <GlassCard className="h-full" hoverEffect>
                                <div className={`mb-4 inline-flex items-center justify-center rounded-xl p-3 ${getCategoryColor(wf.category)}`}>
                                    {getWorkflowIcon(wf)}
                                </div>
                                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                                    {wf.name}
                                </h3>
                                <p className="mb-3 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                                    {wf.description}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                    <span>{formatDuration(wf.duration)}</span>
                                    <span>{formatBalanceCost(wf.balanceCost)}</span>
                                </div>
                            </GlassCard>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DashboardWorkflows;
