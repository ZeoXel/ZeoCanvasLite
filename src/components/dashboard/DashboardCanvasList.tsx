"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Calendar, FileImage, RefreshCw, Pencil } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import GradientButton from "@/components/ui/GradientButton";
import CanvasPreview from "@/components/studio/CanvasPreview";
import { loadFromStorage, saveToStorage } from "@/services/storage";
import { useAuth } from "@/contexts/AuthContext";
import { setStorageUserId } from "@/services/storageScope";
import { manualSyncFromCloud, pushLocalSyncToCloud } from "@/components/StudioSyncProvider";
import { appendCanvasToCache, removeCanvasFromCache, setCacheCurrentCanvasId } from "@/services/studioCache";
import { removeItemWithTombstone } from "@/services/deletionUtils";
import type { Canvas } from "@/types";

const DashboardCanvasList = () => {
    const router = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();
    const [canvases, setCanvases] = useState<Canvas[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
    const [deletedItems, setDeletedItems] = useState<Record<string, number>>({});
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        router.prefetch("/canvas");
    }, [router]);

    const sortCanvases = (list: Canvas[]) => {
        return [...list].sort((a, b) => {
            const aTime = a.updatedAt || a.createdAt || 0;
            const bTime = b.updatedAt || b.createdAt || 0;
            return bTime - aTime;
        });
    };

    // Load canvases from IndexedDB when auth state is ready
    useEffect(() => {
        if (authLoading) return;
        const loadCanvases = async () => {
            setLoading(true);
            try {
                if (!isAuthenticated) {
                    setCanvases([]);
                    setCurrentCanvasId(null);
                    setDeletedItems({});
                    return;
                }
                setStorageUserId(user?.id || '');
                const [savedCanvases, savedCurrentCanvasId, savedDeletedItems] = await Promise.all([
                    loadFromStorage<Canvas[]>("canvases"),
                    loadFromStorage<string>("currentCanvasId"),
                    loadFromStorage<Record<string, number>>("deletedItems"),
                ]);
                if (savedCanvases && savedCanvases.length > 0) {
                    setCanvases(sortCanvases(savedCanvases));
                }
                if (savedCurrentCanvasId) {
                    setCurrentCanvasId(savedCurrentCanvasId);
                }
                setDeletedItems(savedDeletedItems || {});
            } catch (e) {
                console.error("Failed to load canvases", e);
            } finally {
                setLoading(false);
            }
        };

        loadCanvases();
    }, [authLoading, isAuthenticated, user?.id]);

    useEffect(() => {
        const handleSync = () => {
            setLoading(true);
            setStorageUserId(user?.id || '');
            Promise.all([
                loadFromStorage<Canvas[]>("canvases"),
                loadFromStorage<Record<string, number>>("deletedItems"),
            ])
                .then(([savedCanvases, savedDeletedItems]) => {
                    if (savedCanvases && savedCanvases.length > 0) {
                        setCanvases(sortCanvases(savedCanvases));
                    } else {
                        setCanvases([]);
                    }
                    setDeletedItems(savedDeletedItems || {});
                })
                .finally(() => setLoading(false));
        };

        window.addEventListener("studio-sync-updated", handleSync as EventListener);
        return () => window.removeEventListener("studio-sync-updated", handleSync as EventListener);
    }, [user?.id]);

    // 手动同步云端数据
    const handleManualSync = useCallback(async () => {
        if (!isAuthenticated || !user?.id || syncing) return;

        setSyncing(true);
        try {
            setStorageUserId(user.id);
            await manualSyncFromCloud({ force: true, userId: user.id });
            // 重新加载本地数据（无论云端是否有记录，都刷新 UI）
            const [savedCanvases, savedDeletedItems] = await Promise.all([
                loadFromStorage<Canvas[]>("canvases"),
                loadFromStorage<Record<string, number>>("deletedItems"),
            ]);
            if (savedCanvases && savedCanvases.length > 0) {
                setCanvases(sortCanvases(savedCanvases));
            } else {
                setCanvases([]);
            }
            setDeletedItems(savedDeletedItems || {});
        } catch (error) {
            console.error("[Manual Sync] Failed:", error);
        } finally {
            setSyncing(false);
        }
    }, [isAuthenticated, user?.id, syncing]);

    const handleCreateNew = async () => {
        const now = Date.now();
        const newCanvas: Canvas = {
            id: `canvas-${now}-${Math.floor(Math.random() * 1000)}`,
            title: `画布 ${canvases.length + 1}`,
            nodes: [],
            connections: [],
            groups: [],
            createdAt: now,
            updatedAt: now,
            pan: { x: 0, y: 0 },
            scale: 1
        };

        const nextCanvases = [newCanvas, ...canvases];
        setCanvases(nextCanvases);
        try {
            await saveToStorage("canvases", nextCanvases);
            await saveToStorage("currentCanvasId", newCanvas.id);
            // 同步更新内存缓存，避免进入 /canvas 时命中旧画布
            appendCanvasToCache(newCanvas);
            setCurrentCanvasId(newCanvas.id);
            if (isAuthenticated && user?.id) {
                void pushLocalSyncToCloud({ userId: user.id });
            }
            router.push("/canvas");
        } catch (e) {
            console.error("Failed to create canvas", e);
        }
    };

    const handleOpen = (id: string) => {
        setCurrentCanvasId(id);
        // 同步更新内存缓存，使 StudioTab 挂载时能立即读到正确的 canvasId
        setCacheCurrentCanvasId(id);
        router.push("/canvas");
        // 异步写入，不阻塞跳转
        saveToStorage("currentCanvasId", id).catch(e => console.error("Failed to save currentCanvasId", e));
    };

    const handleStartRename = (e: React.MouseEvent, canvas: Canvas) => {
        e.stopPropagation();
        setRenamingId(canvas.id);
        setRenameValue(canvas.title || "");
        setTimeout(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }, 0);
    };

    const handleRenameCommit = async (id: string) => {
        const trimmed = renameValue.trim();
        if (!trimmed || trimmed === canvases.find(c => c.id === id)?.title) {
            setRenamingId(null);
            return;
        }
        const nextCanvases = canvases.map(c =>
            c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c
        );
        setCanvases(sortCanvases(nextCanvases));
        setRenamingId(null);
        try {
            await saveToStorage("canvases", nextCanvases);
        } catch (e) {
            console.error("Failed to rename canvas", e);
        }
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === "Enter") handleRenameCommit(id);
        if (e.key === "Escape") setRenamingId(null);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("确定要删除这个画布吗？")) {
            try {
                const now = Date.now();
                const next = removeItemWithTombstone(canvases, deletedItems, id, now);
                const nextCanvases = next.items;
                const nextDeletedItems = next.deletedItems;
                const nextCurrentCanvasId = currentCanvasId === id
                    ? (nextCanvases[0]?.id || null)
                    : currentCanvasId;

                setCanvases(nextCanvases);
                setDeletedItems(nextDeletedItems);
                setCurrentCanvasId(nextCurrentCanvasId || null);
                removeCanvasFromCache(id, nextCurrentCanvasId || null);

                await saveToStorage("canvases", nextCanvases);
                await saveToStorage("deletedItems", nextDeletedItems);
                await saveToStorage("currentCanvasId", nextCurrentCanvasId || null);
                if (isAuthenticated && user?.id) {
                    await pushLocalSyncToCloud({ userId: user.id });
                }
            } catch (e) {
                console.error("Failed to delete canvas", e);
            }
        }
    };

    return (
        <div>
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的画布</h1>
                    <button
                        onClick={handleManualSync}
                        disabled={syncing || !isAuthenticated}
                        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        title="同步云端数据"
                    >
                        <RefreshCw size={20} className={syncing ? "animate-spin" : ""} />
                    </button>
                </div>
                <GradientButton icon={<Plus size={18} />} onClick={handleCreateNew}>
                    新建画布
                </GradientButton>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                </div>
            ) : canvases.length === 0 ? (
                <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
                    <div className="mb-4 rounded-full bg-gray-100 p-6 dark:bg-white/5">
                        <FileImage size={32} className="text-gray-400" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">暂无画布</h3>
                    <p className="mb-6 text-gray-500 dark:text-gray-400">创建一个新画布开始您的创作之旅。</p>
                    <GradientButton variant="secondary" icon={<Plus size={18} />} onClick={handleCreateNew}>
                        新建画布
                    </GradientButton>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {canvases.map((canvas) => (
                        <GlassCard
                            key={canvas.id}
                            className="group cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                            <div onClick={() => handleOpen(canvas.id)}>
                                <div className="mb-4 aspect-[2/1] w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-black/40">
                                    <CanvasPreview
                                        nodes={canvas.nodes}
                                        groups={canvas.groups}
                                        connections={canvas.connections}
                                        canvasId={canvas.id}
                                    />
                                </div>

                                <div className="flex items-start justify-between">
                                    <div className="min-w-0 flex-1">
                                        {renamingId === canvas.id ? (
                                            <input
                                                ref={renameInputRef}
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onBlur={() => handleRenameCommit(canvas.id)}
                                                onKeyDown={e => handleRenameKeyDown(e, canvas.id)}
                                                onClick={e => e.stopPropagation()}
                                                className="w-full rounded-md border border-blue-400 bg-transparent px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none ring-2 ring-blue-400/30 dark:border-blue-500 dark:text-white"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-1.5 group/title">
                                                <h3
                                                    className="truncate font-semibold text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 cursor-text"
                                                    onClick={e => handleStartRename(e, canvas)}
                                                    title="点击重命名"
                                                >
                                                    {canvas.title || "未命名画布"}
                                                </h3>
                                                <Pencil
                                                    size={12}
                                                    className="shrink-0 text-gray-400 opacity-0 group-hover/title:opacity-100 transition-opacity cursor-pointer"
                                                    onClick={e => handleStartRename(e, canvas)}
                                                />
                                            </div>
                                        )}
                                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                            <Calendar size={12} />
                                            {new Date(canvas.updatedAt || canvas.createdAt || Date.now()).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, canvas.id)}
                                        className="ml-2 shrink-0 rounded-lg p-2 text-gray-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/20"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DashboardCanvasList;
