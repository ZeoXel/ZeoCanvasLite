"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
    CheckCircle2,
    Clock,
    PlayCircle,
    XCircle,
    Ban,
    Workflow,
    Video,
    Music,
    Image as ImageIcon
} from "lucide-react";
import GlassCard from "../ui/GlassCard";
import { useTaskLogs } from "@/contexts/TaskLogContext";
import { getTaskStatusLabel, type TaskStatus, type TaskType } from "@/types/taskLog";

const statusIconMap: Record<TaskStatus, React.ReactNode> = {
    queued: <Clock size={16} className="text-gray-400" />,
    submitted: <Clock size={16} className="text-yellow-500" />,
    running: <PlayCircle size={16} className="text-blue-500 animate-pulse" />,
    success: <CheckCircle2 size={16} className="text-green-500" />,
    failed: <XCircle size={16} className="text-red-500" />,
    cancelled: <Ban size={16} className="text-gray-400" />,
};

const typeIconMap: Record<TaskType, React.ReactNode> = {
    workflow: <Workflow size={18} className="text-blue-500" />,
    video: <Video size={18} className="text-purple-500" />,
    audio: <Music size={18} className="text-amber-500" />,
    image: <ImageIcon size={18} className="text-emerald-500" />,
};

const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return '刚刚';
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString();
};

const DashboardActivity = () => {
    const { logs } = useTaskLogs();
    const recentLogs = useMemo(() => {
        return [...logs]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);
    }, [logs]);

    return (
        <GlassCard className="h-[420px] flex flex-col">
            <div className="mb-4 flex items-center gap-2">
                <Clock size={16} className="text-gray-500 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">最近活动</h3>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                {recentLogs.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                        暂无活动记录
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                        {recentLogs.map((log) => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between py-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-white/5"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
                                        {typeIconMap[log.type]}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {log.name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            {statusIconMap[log.status]}
                                            <span>{getTaskStatusLabel(log.status)}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {formatRelativeTime(log.createdAt)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center dark:border-white/5">
                <Link
                    href="/tasks"
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                    查看所有活动
                </Link>
            </div>
        </GlassCard>
    );
};

export default DashboardActivity;
