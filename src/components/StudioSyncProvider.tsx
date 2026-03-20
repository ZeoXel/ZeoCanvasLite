"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { type StudioSyncData } from "@/services/studioSyncService";
import { fetchStudioSyncFromCos, pushStudioSyncToCos, pushStudioSyncBeacon } from "@/services/studioSyncCosService";
import { loadFromStorage, saveToStorage, saveSubjects, loadSubjects, loadMultipleFromStorage } from "@/services/storage";
import { replaceTaskLogs, loadTaskLogs, onTaskLogUpdate } from "@/services/taskLogService";
import { getScopedKey, setStorageUserId } from "@/services/storageScope";
import { setCache } from "@/services/studioCache";
import type { Canvas, Connection, Group, Workflow, AppNode, Subject } from "@/types";

const CLOUD_SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CLOUD_SYNC === 'true';

const NODE_CONFIG_STORAGE_KEY = "zeocanvas_node_configs";
const STUDIO_SYNC_META_KEY = "studio_sync_meta";
const STUDIO_SYNC_EVENT = "studio-sync-updated";

/**
 * 简化的同步策略：
 * 1. 进入时拉取云端数据
 * 2. 离开时推送本地数据
 * 3. 不自动轮询，避免覆盖本地操作
 */

// 模块级同步状态，供 StudioTab 查询
let _initialSyncComplete = false;
let _lastSyncTimestamp = 0;

export function isInitialSyncComplete(): boolean {
  return _initialSyncComplete;
}

export function getLastSyncTimestamp(): number {
  return _lastSyncTimestamp;
}

const hasAnyData = (payload: Partial<StudioSyncData>) => {
  return Boolean(
    (payload.assets && payload.assets.length) ||
    (payload.workflows && payload.workflows.length) ||
    (payload.canvases && payload.canvases.length) ||
    (payload.nodes && payload.nodes.length) ||
    (payload.subjects && payload.subjects.length) ||
    (payload.taskLogs && payload.taskLogs.length) ||
    (payload.deletedItems && Object.keys(payload.deletedItems).length)
  );
};

// 应用云端数据到本地存储 + 写入内存缓存
const applySyncToStorage = async (data: StudioSyncData, updatedAt: number) => {
  await saveToStorage("assets", data.assets || []);
  await saveToStorage("workflows", data.workflows || []);
  await saveToStorage("canvases", data.canvases || []);
  await saveToStorage("currentCanvasId", data.currentCanvasId || null);
  await saveToStorage("nodes", data.nodes || []);
  await saveToStorage("connections", data.connections || []);
  await saveToStorage("groups", data.groups || []);
  await saveToStorage("deletedItems", data.deletedItems || {});
  await saveSubjects(data.subjects || []);
  localStorage.setItem(getScopedKey(NODE_CONFIG_STORAGE_KEY), JSON.stringify(data.nodeConfigs || {}));
  replaceTaskLogs(data.taskLogs || []);
  await saveToStorage(STUDIO_SYNC_META_KEY, { updatedAt });

  // 同步写入内存缓存
  setCache({
    assets: data.assets || [],
    workflows: data.workflows || [],
    subjects: data.subjects || [],
    canvases: data.canvases || [],
    currentCanvasId: data.currentCanvasId || null,
    nodes: data.nodes || [],
    connections: data.connections || [],
    groups: data.groups || [],
    nodeConfigs: data.nodeConfigs || {},
    taskLogs: data.taskLogs || [],
    deletedItems: data.deletedItems || {},
    timestamp: Date.now(),
  });

  window.dispatchEvent(new CustomEvent(STUDIO_SYNC_EVENT));
};

// 判断是否为 data URL
const isDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:');

// 清除 assets 中内嵌的 data URL
const stripAssetDataUrls = (assets: any[]): any[] =>
  assets.filter((a) => !(typeof a === 'string' && isDataUrl(a)))
    .map((a) => {
      if (a && typeof a === 'object' && isDataUrl(a.src)) {
        return { ...a, src: '' };
      }
      return a;
    });

// 清除节点中未上传的 data URL，避免同步 payload 过大
const stripDataUrls = (nodes: AppNode[]): AppNode[] => {
  return nodes.map((node) => {
    const d = node.data;
    if (!d) return node;
    const hasDataUrl =
      isDataUrl(d.image) || isDataUrl(d.originalImage) || isDataUrl(d.editOriginImage) ||
      isDataUrl(d.canvasData) || (Array.isArray(d.images) && d.images.some(isDataUrl));
    if (!hasDataUrl) return node;
    return {
      ...node,
      data: {
        ...d,
        image: isDataUrl(d.image) ? '' : d.image,
        originalImage: isDataUrl(d.originalImage) ? undefined : d.originalImage,
        editOriginImage: isDataUrl(d.editOriginImage) ? undefined : d.editOriginImage,
        canvasData: isDataUrl(d.canvasData) ? undefined : d.canvasData,
        images: Array.isArray(d.images) ? d.images.filter((img: unknown) => !isDataUrl(img)) : d.images,
      },
    };
  });
};

// 从本地存储构建同步数据（使用批量读取）
const buildPayloadFromStorage = async (): Promise<StudioSyncData> => {
  const bulk = await loadMultipleFromStorage([
    "assets", "workflows", "canvases", "currentCanvasId",
    "nodes", "connections", "groups", "deletedItems",
  ]);
  const subjects = (await loadSubjects()) || [];
  const nodeConfigs = JSON.parse(localStorage.getItem(getScopedKey(NODE_CONFIG_STORAGE_KEY)) || "{}");
  const allTaskLogs = loadTaskLogs();
  // 只同步最近 50 条 taskLogs，按创建时间降序
  const taskLogs = allTaskLogs
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 50);

  return {
    assets: stripAssetDataUrls((bulk["assets"] as any[]) || []),
    workflows: (bulk["workflows"] as Workflow[]) || [],
    canvases: (bulk["canvases"] as Canvas[]) || [],
    currentCanvasId: (bulk["currentCanvasId"] as string) || null,
    nodes: stripDataUrls((bulk["nodes"] as AppNode[]) || []),
    connections: (bulk["connections"] as Connection[]) || [],
    groups: (bulk["groups"] as Group[]) || [],
    subjects,
    nodeConfigs,
    taskLogs,
    deletedItems: (bulk["deletedItems"] as Record<string, number>) || {},
  };
};

export default function StudioSyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const userId = user?.id;
  const initialSyncDoneRef = useRef(false);
  const syncInFlightRef = useRef(false);

  // 本地模式：云同步未启用时立即标记完成
  useEffect(() => {
    if (CLOUD_SYNC_ENABLED) return;
    if (_initialSyncComplete) return;
    _initialSyncComplete = true;
    _lastSyncTimestamp = Date.now();
  }, []);

  // 初始同步：进入时拉取云端数据（仅云同步启用时）
  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    if (authLoading || !isAuthenticated || !userId) return;
    if (initialSyncDoneRef.current) return;

    const initialSync = async () => {
      console.log('[Studio Sync Provider] Starting initial sync...');
      setStorageUserId(userId);
      syncInFlightRef.current = true;

      try {
        const localMeta = await loadFromStorage<{ updatedAt: number }>(STUDIO_SYNC_META_KEY);
        const localUpdatedAt = Number(localMeta?.updatedAt || 0);
        const localPayload = await buildPayloadFromStorage();
        const hasLocal = hasAnyData(localPayload);

        console.log('[Studio Sync Provider] Local updatedAt:', localUpdatedAt, 'hasLocal:', hasLocal);

        const serverRecord = await fetchStudioSyncFromCos().catch(() => null);
        console.log('[Studio Sync Provider] Server updatedAt:', serverRecord?.updatedAt);

        if (!serverRecord) {
          if (hasLocal) {
            console.log('[Studio Sync Provider] No server data, pushing local...');
            await pushStudioSyncToCos(localPayload);
          }
        } else if (serverRecord.updatedAt > localUpdatedAt) {
          console.log('[Studio Sync Provider] Server is newer, applying...');
          await applySyncToStorage(serverRecord.data as StudioSyncData, serverRecord.updatedAt);
        } else if (hasLocal && localUpdatedAt > serverRecord.updatedAt) {
          console.log('[Studio Sync Provider] Local is newer, pushing...');
          await pushStudioSyncToCos(localPayload);
        } else {
          console.log('[Studio Sync Provider] Data is in sync');
        }
      } catch (error) {
        console.warn("[Studio Sync Provider] Initial sync failed:", error);
      } finally {
        syncInFlightRef.current = false;
        initialSyncDoneRef.current = true;
        _initialSyncComplete = true;
        _lastSyncTimestamp = Date.now();
        console.log('[Studio Sync Provider] Initial sync done');
      }
    };

    initialSync();
  }, [authLoading, isAuthenticated, userId]);

  // 用户切换时重置同步状态（仅云同步启用时）
  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    _initialSyncComplete = false;
    _lastSyncTimestamp = 0;
  }, [userId]);

  // 离开时推送（仅云同步启用时）
  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    if (!isAuthenticated || !userId) return;

    const pushOnLeave = async () => {
      if (!initialSyncDoneRef.current) return;
      try {
        const payload = await buildPayloadFromStorage();
        if (!hasAnyData(payload)) return;
        pushStudioSyncBeacon(payload);
      } catch {
        // 静默处理
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pushOnLeave();
    };
    const handlePageHide = () => pushOnLeave();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      pushOnLeave();
    };
  }, [isAuthenticated, userId]);

  // TaskLog 更新时推送（仅云同步启用时）
  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    if (authLoading || !isAuthenticated || !userId) return;

    let syncTimer: NodeJS.Timeout | null = null;

    const scheduleSync = () => {
      if (!initialSyncDoneRef.current) return;
      if (syncTimer) clearTimeout(syncTimer);

      syncTimer = setTimeout(async () => {
        if (syncInFlightRef.current) return;
        syncInFlightRef.current = true;
        try {
          const payload = await buildPayloadFromStorage();
          await pushStudioSyncToCos(payload);
        } catch (error) {
          console.warn("[Studio Sync] Task log sync failed:", error);
        } finally {
          syncInFlightRef.current = false;
        }
      }, 10000);
    };

    const unsubscribe = onTaskLogUpdate(scheduleSync);
    return () => {
      unsubscribe();
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [authLoading, isAuthenticated, userId]);

  return <>{children}</>;
}

// 导出手动同步函数供外部调用
export async function manualSyncFromCloud(options?: { force?: boolean; userId?: string }): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  try {
    if (options?.userId) setStorageUserId(options.userId);
    const serverRecord = await fetchStudioSyncFromCos({ force: options?.force ?? true });
    if (!serverRecord) return false;
    await applySyncToStorage(serverRecord.data as StudioSyncData, serverRecord.updatedAt);
    return true;
  } catch (error) {
    console.warn("[Studio Sync] Manual sync failed:", error);
    return false;
  }
}

// 导出手动推送函数供外部调用
export async function pushLocalSyncToCloud(options?: { keepalive?: boolean; userId?: string }): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  try {
    if (options?.userId) setStorageUserId(options.userId);
    const payload = await buildPayloadFromStorage();
    if (!hasAnyData(payload)) return true;
    if (options?.keepalive) {
      pushStudioSyncBeacon(payload);
    } else {
      await pushStudioSyncToCos(payload);
    }
    _lastSyncTimestamp = Date.now();
    return true;
  } catch (error) {
    console.warn("[Studio Sync] Push local sync failed:", error);
    return false;
  }
}
