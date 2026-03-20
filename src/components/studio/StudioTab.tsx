"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Node } from './Node';
import { SidebarDock } from './SidebarDock';
import { useViewport, useInteraction, useCanvasData, useCanvasHistory } from '@/hooks/canvas';
import { useBrand } from '@/hooks/useBrand';
import { AssistantPanel } from './AssistantPanel';
import { ImageCropper } from './ImageCropper';
import { ImageEditOverlay } from './ImageEditOverlay';
import { generateViduMultiFrame, queryViduTask, ViduMultiFrameConfig, compressImageForVidu } from '@/services/viduService';
import { recordAudioConsumption, recordImageConsumption, recordVideoConsumption } from '@/services/consumptionTracker';
import { SettingsModal } from './SettingsModal';
import { AppNode, NodeType, NodeStatus, Connection, ContextMenuState, Group, Workflow, Canvas, VideoGenerationMode, Subject } from '@/types';
import { SubjectEditor } from './subject';
import { uniqueNonEmptyImageSources } from './subject/subjectEditorUtils';
import { urlToBase64 } from '@/services/providers';
import { parseSubjectReferences, cleanSubjectReferences, getPrimaryImage } from '@/services/subjectService';
import { getSubjectImageSrc, uploadToCos, buildMediaPath } from '@/services/cosStorage';
import { removeItemWithTombstone } from '@/services/deletionUtils';
import { UserInfoWidget } from './UserInfoWidget';
import { UserInfoModal } from './UserInfoModal';
import { LoginModal } from './LoginModal';
import { useAuth } from '@/contexts/AuthContext';
import { getImageModelConfig } from './shared/constants';

import Link from "next/link";
import { useRouter } from 'next/navigation';

// ==================== API 调用层 ====================

const IMAGE_INPUT_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB gateway limit
const IMAGE_INPUT_TARGET_MB = 9; // keep a buffer under the limit

const estimateBase64Bytes = (dataUrl: string): number => {
    if (!dataUrl) return 0;
    const commaIndex = dataUrl.indexOf(',');
    const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    const length = base64.length;
    if (!length) return 0;
    let padding = 0;
    if (base64.endsWith('==')) padding = 2;
    else if (base64.endsWith('=')) padding = 1;
    return Math.max(0, Math.floor((length * 3) / 4) - padding);
};

const ensureImageUnderLimit = async (image: string): Promise<string> => {
    if (!image.startsWith('data:image')) return image;
    const sizeBytes = estimateBase64Bytes(image);
    if (sizeBytes <= IMAGE_INPUT_LIMIT_BYTES) return image;
    const compressed = await compressImageForVidu(image, IMAGE_INPUT_TARGET_MB);
    const compressedBytes = estimateBase64Bytes(compressed);
    if (compressedBytes > IMAGE_INPUT_LIMIT_BYTES) {
        throw new Error('参考图片仍然超过10MB，请裁剪或降低分辨率后重试');
    }
    return compressed;
};

const ensureSeedreamInputImage = async (image: string): Promise<string> => {
    if (!image) return image;
    if (image.startsWith('data:image')) {
        return ensureImageUnderLimit(image);
    }
    if (image.startsWith('http')) {
        const base64 = await urlToBase64(image);
        if (!base64) {
            throw new Error('参考图片加载失败，请重试');
        }
        return ensureImageUnderLimit(base64);
    }
    return image;
};

const isSeedreamFamilyModel = (model: string): boolean => {
    return model.includes('seedream') || model.includes('seededit');
};

const SEEDREAM_30_T2I_MODEL = 'doubao-seedream-3-0-t2i-250415';
const SEEDEDIT_30_I2I_MODEL = 'doubao-seededit-3-0-i2i-250628';
const SEEDREAM_45_MODEL = 'doubao-seedream-4-5-251128';

const isSeedream3AutoPair = (model: string): boolean =>
    model === SEEDREAM_30_T2I_MODEL || model === SEEDEDIT_30_I2I_MODEL;

const resolveSeedream3ModelForInputs = (model: string, inputImages: string[]): string => {
    if (!isSeedream3AutoPair(model)) return model;
    return inputImages.length > 0 ? SEEDREAM_45_MODEL : SEEDREAM_30_T2I_MODEL;
};

// 图像生成 (通过 API route)
const generateImageFromText = async (
    prompt: string,
    model: string,
    images: string[] = [],
    options: { aspectRatio?: string; resolution?: string; count?: number } = {}
): Promise<string[]> => {
    let resolvedImages = images;
    if (images.length > 0) {
        const isSeedream = isSeedreamFamilyModel(model);
        if (isSeedream) {
            console.log('[Studio Image] Preparing Seedream input images...');
            resolvedImages = await Promise.all(images.map(img => ensureSeedreamInputImage(img)));
        } else {
            const hasOversized = images.some(img => img.startsWith('data:image') && estimateBase64Bytes(img) > IMAGE_INPUT_LIMIT_BYTES);
            if (hasOversized) {
                console.log('[Studio Image] Compressing oversized input images...');
                resolvedImages = await Promise.all(images.map(img => ensureImageUnderLimit(img)));
            }
        }
    }
    const response = await fetch('/api/studio/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            model,
            images: resolvedImages,
            aspectRatio: options.aspectRatio,
            resolution: options.resolution,
            n: options.count || 1,
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `图像生成失败: ${response.status}`);
    }
    const result = await response.json();
    return result.images;
};

// 图像编辑 (通过 API route)
const editImageWithText = async (imageBase64: string, prompt: string, model: string, aspectRatio?: string): Promise<string> => {
    const results = await generateImageFromText(prompt, model, [imageBase64], { count: 1, aspectRatio });
    return results[0];
};

// 视频生成返回类型
interface VideoGenResult {
    uri: string;
    isFallbackImage?: boolean;
    videoMetadata?: any;
    uris?: string[];
}

interface ChatIncomingAsset {
    id: string;
    type: 'image' | 'video';
    url: string;
    name?: string;
}

// 视频任务管理器 - 支持持久化和页面刷新后恢复
import * as videoTaskManager from '@/services/videoTaskManager';

// 视频生成 (前端轮询模式，支持页面刷新恢复)
const generateVideoWithPolling = async (
    nodeId: string,
    prompt: string,
    model: string,
    options: { aspectRatio?: string; count?: number; generationMode?: any; resolution?: string; duration?: number; videoConfig?: any; viduSubjects?: { id: string; images: string[] }[] } = {},
    inputImageBase64?: string | null,
    _videoInput?: any,
    referenceImages?: string[],
    imageRoles?: ('first_frame' | 'last_frame')[]
): Promise<VideoGenResult> => {
    // 优先使用 referenceImages（首尾帧模式），否则使用单张输入图
    let finalImages: string[] | undefined;
    let finalImageRoles: ('first_frame' | 'last_frame')[] | undefined;

    if (referenceImages && referenceImages.length > 0) {
        finalImages = referenceImages;
        finalImageRoles = imageRoles;
    } else if (inputImageBase64) {
        finalImages = [inputImageBase64];
        finalImageRoles = undefined;
    } else {
        finalImages = undefined;
        finalImageRoles = undefined;
    }

    const requestBody: any = {
        prompt,
        model,
        aspectRatio: options.aspectRatio || '16:9',
        resolution: options.resolution,
        duration: options.duration,
        videoConfig: options.videoConfig,
        viduSubjects: options.viduSubjects,
    };

    if (finalImages) {
        requestBody.images = finalImages;
    }
    if (finalImageRoles) {
        requestBody.imageRoles = finalImageRoles;
    }

    // 1. 创建任务并持久化
    const task = await videoTaskManager.createVideoTask(nodeId, requestBody);
    console.log(`[generateVideo] Task created and saved: ${task.taskId}, provider: ${task.provider}`);

    // 2. 轮询等待结果
    const result = await videoTaskManager.pollTask(
        task,
        (status) => console.log(`[generateVideo] Status: ${status}`),
    );

    if (!result || result.status !== 'SUCCESS') {
        throw new Error(result?.error || '视频生成失败');
    }

    if (!result.videoUrl) {
        throw new Error('视频生成成功但未返回 URL');
    }

    return {
        uri: result.videoUrl,
        isFallbackImage: false,
        videoMetadata: { taskId: task.taskId },
        uris: [result.videoUrl],
    };
};

const ensureViduSubjectMentions = (basePrompt: string, subjectIds: string[]): string => {
    if (!subjectIds || subjectIds.length === 0) return basePrompt;

    const additions: string[] = [];
    for (const subjectId of subjectIds) {
        if (!subjectId) continue;
        const escaped = subjectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`@${escaped}(?![a-zA-Z0-9_])`, 'g');
        const existingCount = (basePrompt.match(pattern) || []).length;
        const missing = Math.max(0, 2 - existingCount);
        for (let i = 0; i < missing; i++) {
            additions.push(`@${subjectId}`);
        }
    }

    if (additions.length === 0) return basePrompt;
    return basePrompt.trim() ? `${basePrompt}\n${additions.join(' ')}` : additions.join(' ');
};
import { getGenerationStrategy } from '@/services/videoStrategies';
import { createMusicCustom, SunoSongInfo } from '@/services/sunoService';
import { synthesizeSpeech, MinimaxGenerateParams } from '@/services/minimaxService';
import { saveToStorage, loadFromStorage, saveSubjects, loadSubjects, loadMultipleFromStorage, markMigrationComplete } from '@/services/storage';
import { getScopedKey, setStorageUserId } from '@/services/storageScope';
import { loadTaskLogs, replaceTaskLogs, onTaskLogUpdate } from '@/services/taskLogService';
import AuthRequiredNotice from '@/components/common/AuthRequiredNotice';
import { type StudioSyncData } from '@/services/studioSyncService';
import { fetchStudioSyncFromCos, pushStudioSyncToCos, pushStudioSyncBeacon } from '@/services/studioSyncCosService';
import { getCache, setCache, resolveCanvasFromCache } from '@/services/studioCache';
import { isInitialSyncComplete } from '@/components/StudioSyncProvider';
import { connectionKey } from '@/services/syncMergeUtils';
import { analyzeViduReferenceImages, MAX_VIDU_REFERENCE_IMAGES } from '@/services/viduReferencePreview';
import { getMenuStructure } from '@/config/models';
import {
    Plus, Copy, Trash2, Type, Image as ImageIcon, Video as VideoIcon,
    MousePointerClick, LayoutTemplate, X, RefreshCw, Film, Brush, Mic2, Music, FileSearch,
    Minus, FolderHeart, Unplug, Sparkles, ChevronLeft, ChevronRight, Scan,
    Undo2, Redo2, Speech, Camera, Loader2, MessageSquare, Layers
} from 'lucide-react';

// Apple Physics Curve
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const SNAP_THRESHOLD = 8; // Pixels for magnetic snap
const COLLISION_PADDING = 24; // Spacing when nodes bounce off each other

// ============================================================================
// Node Config Persistence - 记住用户上次使用的节点配置
// ============================================================================
const NODE_CONFIG_STORAGE_KEY = 'zeocanvas_node_configs';
const STUDIO_SYNC_META_KEY = 'studio_sync_meta';

const createConnection = (from: string, to: string, isAuto?: boolean): Connection => ({
    from,
    to,
    isAuto,
    id: `${from}->${to}`,
    modifiedAt: Date.now(),
});

// 需要记忆的配置字段（按节点类型）
const REMEMBERED_FIELDS: Record<string, string[]> = {
    [NodeType.IMAGE_GENERATOR]: ['model', 'aspectRatio', 'resolution', 'imageCount'],
    [NodeType.VIDEO_GENERATOR]: ['model', 'aspectRatio', 'resolution', 'duration', 'videoConfig', 'generationMode', 'videoModeOverride'],
    [NodeType.VIDEO_FACTORY]: ['model', 'aspectRatio', 'resolution', 'duration', 'videoConfig', 'generationMode', 'videoModeOverride'],
    [NodeType.MULTI_FRAME_VIDEO]: ['aspectRatio', 'multiFrameData'],
    [NodeType.AUDIO_GENERATOR]: ['model', 'audioMode', 'musicConfig', 'voiceConfig'],
    [NodeType.PROMPT_INPUT]: [],
};

const getNodeConfigStorageKey = () => getScopedKey(NODE_CONFIG_STORAGE_KEY);

// 保存节点配置到 localStorage
const saveNodeConfig = (nodeType: string, config: Record<string, any>) => {
    try {
        const fields = REMEMBERED_FIELDS[nodeType];
        if (!fields) return;

        const stored = JSON.parse(localStorage.getItem(getNodeConfigStorageKey()) || '{}');
        const filteredConfig: Record<string, any> = {};

        fields.forEach(field => {
            if (config[field] !== undefined) {
                // 特殊处理 multiFrameData：只保存配置，不保存 frames 数据
                if (field === 'multiFrameData' && config.multiFrameData) {
                    filteredConfig.multiFrameData = {
                        viduModel: config.multiFrameData.viduModel,
                        viduResolution: config.multiFrameData.viduResolution,
                    };
                } else {
                    filteredConfig[field] = config[field];
                }
            }
        });

        if (Object.keys(filteredConfig).length > 0) {
            stored[nodeType] = { ...stored[nodeType], ...filteredConfig };
            localStorage.setItem(getNodeConfigStorageKey(), JSON.stringify(stored));
        }
    } catch (e) {
        console.warn('Failed to save node config:', e);
    }
};

// 从 localStorage 读取节点配置
const loadNodeConfig = (nodeType: string): Record<string, any> => {
    try {
        const stored = loadAllNodeConfigs();
        return stored[nodeType] || {};
    } catch (e) {
        console.warn('Failed to load node config:', e);
        return {};
    }
};

const loadAllNodeConfigs = (): Record<string, any> => {
    try {
        const scopedKey = getNodeConfigStorageKey();
        let stored = localStorage.getItem(scopedKey);
        if (!stored) {
            const legacyStored = localStorage.getItem(NODE_CONFIG_STORAGE_KEY);
            if (legacyStored) {
                localStorage.setItem(scopedKey, legacyStored);
                localStorage.removeItem(NODE_CONFIG_STORAGE_KEY);
                stored = legacyStored;
            }
        }
        return JSON.parse(stored || '{}');
    } catch (e) {
        console.warn('Failed to load all node configs:', e);
        return {};
    }
};

const replaceAllNodeConfigs = (configs: Record<string, any>) => {
    try {
        localStorage.setItem(getNodeConfigStorageKey(), JSON.stringify(configs || {}));
    } catch (e) {
        console.warn('Failed to replace node configs:', e);
    }
};

// 连接点配置 - 与 Node.tsx 中的连接点位置保持一致
// 连接点圆心与节点边中点对齐，不再外偏移
const PORT_OFFSET = 0;
const MULTI_SELECTION_DOCK_ID = 'multi-selection-dock';

// 生成平滑贝塞尔曲线路径
const generateBezierPath = (fx: number, fy: number, tx: number, ty: number): string => {
    const dx = tx - fx;
    const dy = ty - fy;
    // 控制点偏移：水平距离越大，曲线越平缓；垂直落差越大，曲线越陡
    const controlX = Math.max(Math.abs(dx) * 0.5, 60);
    // 当终点在起点左边时（反向连接），调整控制点
    if (dx < 0) {
        const midX = (fx + tx) / 2;
        const midY = (fy + ty) / 2;
        return `M ${fx} ${fy} Q ${fx + 80} ${fy}, ${midX} ${midY} Q ${tx - 80} ${ty}, ${tx} ${ty}`;
    }
    return `M ${fx} ${fy} C ${fx + controlX} ${fy}, ${tx - controlX} ${ty}, ${tx} ${ty}`;
};

// Helper to get image dimensions
const getImageDimensions = (src: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = src;
    });
};

const getVideoDimensions = (src: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            resolve({ width: video.videoWidth, height: video.videoHeight });
        };
        video.onerror = reject;
        video.src = src;
    });
};

const getAspectRatioLabel = (width: number, height: number, isVideo = false) => {
    if (!width || !height) return isVideo ? '16:9' : '1:1';
    const ratio = width / height;
    if (Math.abs(ratio - 16 / 9) < 0.1) return '16:9';
    if (Math.abs(ratio - 9 / 16) < 0.1) return '9:16';
    if (Math.abs(ratio - 4 / 3) < 0.1) return '4:3';
    if (Math.abs(ratio - 3 / 4) < 0.1) return '3:4';
    if (Math.abs(ratio - 1) < 0.1) return '1:1';
    if (Math.abs(ratio - 3 / 2) < 0.1) return '3:2';
    if (Math.abs(ratio - 2 / 3) < 0.1) return '2:3';
    if (Math.abs(ratio - 21 / 9) < 0.1) return '21:9';
    if (isVideo) return '16:9';

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const w = Math.round(width / divisor);
    const h = Math.round(height / divisor);
    if (w > 100 || h > 100) {
        return `${Math.round(ratio * 100)}:100`;
    }
    return `${w}:${h}`;
};

// Expanded View Component (Modal)
const ExpandedView = ({ media, onClose }: { media: any, onClose: () => void }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!media) return;
        setCurrentIndex(media.initialIndex || 0);
    }, [media]);

    const handleClose = useCallback(() => onClose(), [onClose]);

    const hasMultiple = media?.images && media.images.length > 1;

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (hasMultiple) {
            setCurrentIndex((prev) => (prev + 1) % media.images.length);
        }
    }, [hasMultiple, media]);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (hasMultiple) {
            setCurrentIndex((prev) => (prev - 1 + media.images.length) % media.images.length);
        }
    }, [hasMultiple, media]);

    useEffect(() => {
        if (!media) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [media, handleClose, handleNext, handlePrev]);

    if (!media) return null;

    // Determine current source and type
    const currentSrc = hasMultiple ? media.images[currentIndex] : media.src;
    const isVideo = (media.type === 'video') && !(currentSrc && currentSrc.startsWith('data:image'));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 dark:bg-slate-950/95" onClick={handleClose}>
            <div className="relative w-full h-full flex items-center justify-center p-8" onClick={e => e.stopPropagation()}>

                {hasMultiple && (
                    <button
                        onClick={handlePrev}
                        className="absolute left-4 md:left-8 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md transition-all hover:scale-110 z-[110]"
                    >
                        <ChevronLeft size={32} />
                    </button>
                )}

                <div className="relative max-w-full max-h-full flex flex-col items-center">
                    {!isVideo ? (
                        <img
                            key={currentSrc}
                            src={currentSrc}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white dark:bg-slate-900"
                            draggable={false}
                        />
                    ) : (
                        <video
                            key={currentSrc}
                            src={currentSrc}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white dark:bg-slate-900"
                            controls
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="auto"
                        />
                    )}

                    {hasMultiple && (
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
                            {media.images.map((_: any, i: number) => (
                                <div
                                    key={i}
                                    onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                                    className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-all ${i === currentIndex ? 'bg-cyan-500 scale-125' : 'bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500'}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {hasMultiple && (
                    <button
                        onClick={handleNext}
                        className="absolute right-4 md:right-8 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md transition-all hover:scale-110 z-[110]"
                    >
                        <ChevronRight size={32} />
                    </button>
                )}

            </div>
            <button onClick={handleClose} className="absolute top-6 right-6 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md transition-colors z-[110]"><X size={24} /></button>
        </div>
    );
};

export default function StudioTab() {
    // 同步缓存解析 —— 在所有 Hook 之前执行，用于零延迟初始化
    const [mountCache] = useState(() => resolveCanvasFromCache());

    // === HOOKS ===
    // Brand Config
    const brand = useBrand();

    // Viewport Hook - 替换原有的 scale, pan, scaleRef, panRef
    // 缓存命中时用保存的视口状态初始化
    const {
        scale, pan, setScale, setPan, setViewport,
        scaleRef, panRef,
        screenToCanvas: viewportScreenToCanvas,
    } = useViewport(mountCache?.canvasPan && mountCache?.canvasScale != null ? {
        initialPan: mountCache.canvasPan,
        initialScale: mountCache.canvasScale,
    } : undefined);

    // Interaction Hook - 交互状态机
    const {
        mode,
        modeRef,
        selection,
        setSelection,
        selectNodes,
        selectGroups,
        clearSelection,
        mousePos, setMousePos,
        isSpacePressed, setIsSpacePressed,
        // Selection rect
        startSelecting,
        updateSelecting,
        finishInteraction,
        isSelecting,
        // Connecting
        startConnecting,
        isConnecting,
        // Panning
        startPanning,
        isPanning,
    } = useInteraction();

    // 解构选择状态（兼容现有代码）
    const selectedNodeIds = selection.nodeIds;
    const selectedGroupIds = selection.groupIds;
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const isMultiNodeSelection = selectedNodeIds.length > 1;
    const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
    const selectedGroupIdsRef = useRef<string[]>(selectedGroupIds);
    useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);
    useEffect(() => { selectedGroupIdsRef.current = selectedGroupIds; }, [selectedGroupIds]);
    // 兼容 selectionRect（从 mode 中提取）
    const selectionRect = mode.type === 'selecting' ? mode.rect : null;
    // 兼容 connectionStart（从 mode 中提取）
    const connectionStart = mode.type === 'connecting' ? mode.start : null;
    // Helper: 从 modeRef 获取 connectionStart（用于事件处理器中避免闭包问题）
    const getConnectionStartRef = useCallback(() => {
        const currentMode = modeRef.current;
        return currentMode.type === 'connecting' ? currentMode.start : null;
    }, [modeRef]);
    // 兼容 isDraggingCanvas（从 isPanning 别名）
    const isDraggingCanvas = isPanning;

    // Canvas Data Hook - 画布数据 (nodes, connections, groups)
    // 缓存命中时同步初始化，避免空数据闪烁
    const {
        nodes, setNodes: setNodesRaw, nodesRef,
        connections, setConnections: setConnectionsRaw, connectionsRef,
        groups, setGroups: setGroupsRaw, groupsRef,
        loadData,
    } = useCanvasData(mountCache ? {
        nodes: structuredClone(mountCache.canvasNodes),
        connections: structuredClone(mountCache.canvasConnections),
        groups: structuredClone(mountCache.canvasGroups),
    } : undefined);

    // History Hook - 撤销/重做
    const {
        historyRef, historyIndexRef,
        canUndo, canRedo,
        saveSnapshot,
        undo: undoHistory,
        redo: redoHistory,
    } = useCanvasHistory();

    // --- Global App State ---
    // 缓存命中时同步初始化
    const [workflows, setWorkflowsInternal] = useState<Workflow[]>(() => mountCache?.cache.workflows || []);
    const [assetHistory, setAssetHistoryInternal] = useState<any[]>(() => mountCache?.cache.assets || []);
    const workflowsRef = useRef<Workflow[]>(mountCache?.cache.workflows || []);
    const assetHistoryRef = useRef<any[]>(mountCache?.cache.assets || []);

    const setWorkflows: React.Dispatch<React.SetStateAction<Workflow[]>> = useCallback((value) => {
        setWorkflowsInternal(prev => {
            const next = typeof value === 'function' ? value(prev) : value;
            workflowsRef.current = next;
            return next;
        });
    }, []);

    const setAssetHistory: React.Dispatch<React.SetStateAction<any[]>> = useCallback((value) => {
        setAssetHistoryInternal(prev => {
            const next = typeof value === 'function' ? value(prev) : value;
            assetHistoryRef.current = next;
            return next;
        });
    }, []);

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatDragState, setChatDragState] = useState<{ active: boolean; over: boolean }>({ active: false, over: false });
    const [chatIncomingAsset, setChatIncomingAsset] = useState<ChatIncomingAsset | null>(null);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    // 缓存命中 → 直接标记已加载、不显示 overlay，实现零延迟渲染
    const [isLoaded, setIsLoaded] = useState(() => !!mountCache);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(() => !mountCache);
    const entryCompletedRef = useRef(false);
    const exitInFlightRef = useRef(false);
    const [pendingUploads, setPendingUploads] = useState(0);
    const pendingUploadsRef = useRef(0);
    const uploadWaitersRef = useRef<Array<() => void>>([]);

    const beginUpload = useCallback(() => {
        setPendingUploads((prev) => {
            const next = prev + 1;
            pendingUploadsRef.current = next;
            return next;
        });
    }, []);

    const endUpload = useCallback(() => {
        setPendingUploads((prev) => {
            const next = Math.max(0, prev - 1);
            pendingUploadsRef.current = next;
            return next;
        });
    }, []);

    const enqueueUpload = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
        beginUpload();
        try {
            return await work();
        } finally {
            endUpload();
        }
    }, [beginUpload, endUpload]);

    const waitForUploads = useCallback(() => {
        if (pendingUploadsRef.current === 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
            uploadWaitersRef.current.push(resolve);
        });
    }, []);

    useEffect(() => {
        if (pendingUploads === 0 && uploadWaitersRef.current.length > 0) {
            const waiters = uploadWaitersRef.current;
            uploadWaitersRef.current = [];
            waiters.forEach((resolve) => resolve());
        }
    }, [pendingUploads]);

    const isUploading = pendingUploads > 0;
    const isUploadingRef = useRef(false);
    useEffect(() => {
        isUploadingRef.current = isUploading;
    }, [isUploading]);

    const uploadImageFile = useCallback(async (file: File): Promise<string> => {
        return enqueueUpload(async () => {
            const prefix = buildMediaPath('images');
            const result = await uploadToCos(file, { prefix });
            return result.url;
        });
    }, [enqueueUpload]);

    const uploadVideoFile = useCallback(async (file: File): Promise<string> => {
        return enqueueUpload(async () => {
            const prefix = buildMediaPath('videos');
            const result = await uploadToCos(file, { prefix });
            return result.url;
        });
    }, [enqueueUpload]);

    const uploadImageDataUrl = useCallback(async (dataUrl: string): Promise<string> => {
        if (!dataUrl) return '';
        if (!dataUrl.startsWith('data:')) return dataUrl;
        return enqueueUpload(async () => {
            const prefix = buildMediaPath('images');
            const result = await uploadToCos(dataUrl, { prefix });
            return result.url;
        });
    }, [enqueueUpload]);

    const getImageMetaFromFile = useCallback(async (file: File) => {
        const objectUrl = URL.createObjectURL(file);
        try {
            const dims = await getImageDimensions(objectUrl);
            const aspectRatio = getAspectRatioLabel(dims.width, dims.height, false);
            return { ...dims, aspectRatio };
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }, []);

    const getVideoMetaFromFile = useCallback(async (file: File) => {
        const objectUrl = URL.createObjectURL(file);
        try {
            const dims = await getVideoDimensions(objectUrl);
            const aspectRatio = getAspectRatioLabel(dims.width, dims.height, true);
            return { ...dims, aspectRatio };
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }, []);

    // Hydration-safe theme state: keep SSR/CSR first paint consistent, then resolve client preference on mount
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [hasMounted, setHasMounted] = useState(false);

    // Resolve theme on client mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('lsai-theme') as 'light' | 'dark' | null;
        const initialTheme: 'light' | 'dark' = savedTheme
            ? savedTheme
            : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(initialTheme);
        document.documentElement.classList.toggle('dark', initialTheme === 'dark');
        setHasMounted(true);
    }, []);

    // Sync theme changes to DOM and localStorage (after mount only)
    useEffect(() => {
        if (!hasMounted) return;
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('lsai-theme', theme);
    }, [theme, hasMounted]);

    // Listen for theme changes from other components/tabs
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'lsai-theme' && e.newValue) {
                const newTheme = e.newValue as 'light' | 'dark';
                setTheme(newTheme);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userModalTab, setUserModalTab] = useState<'account' | 'credits'>('account');
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    // Canvas Management State
    const [canvases, setCanvasesInternal] = useState<Canvas[]>(() => mountCache?.cache.canvases || []);
    const [currentCanvasId, setCurrentCanvasIdInternal] = useState<string | null>(() => mountCache?.cache.currentCanvasId || null);
    const canvasesRef = useRef<Canvas[]>(mountCache?.cache.canvases || []);
    const currentCanvasIdRef = useRef<string | null>(mountCache?.cache.currentCanvasId || null);

    // 包装 setters 以同步更新 ref
    const setCanvases: React.Dispatch<React.SetStateAction<Canvas[]>> = useCallback((value) => {
        setCanvasesInternal(prev => {
            const next = typeof value === 'function' ? value(prev) : value;
            canvasesRef.current = next;
            return next;
        });
    }, []);

    const setCurrentCanvasId: React.Dispatch<React.SetStateAction<string | null>> = useCallback((value) => {
        setCurrentCanvasIdInternal(prev => {
            const next = typeof value === 'function' ? value(prev) : value;
            currentCanvasIdRef.current = next;
            return next;
        });
    }, []);

    // --- Subject Library State ---
    const [subjects, setSubjectsInternal] = useState<Subject[]>(() => mountCache?.cache.subjects || []);
    const subjectsRef = useRef<Subject[]>(mountCache?.cache.subjects || []);

    const setSubjects: React.Dispatch<React.SetStateAction<Subject[]>> = useCallback((value) => {
        setSubjectsInternal(prev => {
            const next = typeof value === 'function' ? value(prev) : value;
            subjectsRef.current = next;
            return next;
        });
    }, []);

    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [subjectEditorInitialImage, setSubjectEditorInitialImage] = useState<string | null>(null);
    const [isSubjectEditorOpen, setIsSubjectEditorOpen] = useState(false);
    const [externalOpenPanel, setExternalOpenPanel] = useState<'subjects' | null>(null);

    const canvasImageSources = useMemo(() => {
        const imageSources: string[] = [];

        nodes.forEach((node) => {
            if (node.data.image) imageSources.push(node.data.image);
            if (Array.isArray(node.data.images)) imageSources.push(...node.data.images);
            if (node.data.firstLastFrameData?.firstFrame) imageSources.push(node.data.firstLastFrameData.firstFrame);
            if (node.data.firstLastFrameData?.lastFrame) imageSources.push(node.data.firstLastFrameData.lastFrame);
            if (node.data.selectedFrame) imageSources.push(node.data.selectedFrame);
            if (node.data.croppedFrame) imageSources.push(node.data.croppedFrame);
            if (Array.isArray(node.data.multiFrameData?.frames)) {
                node.data.multiFrameData.frames.forEach((frame) => {
                    if (frame.src) imageSources.push(frame.src);
                });
            }
        });

        return uniqueNonEmptyImageSources(imageSources);
    }, [nodes]);

    const [deletedItemsState, setDeletedItemsState] = useState<Record<string, number>>(() => mountCache?.cache.deletedItems || {});
    const deletedItemsRef = useRef<Record<string, number>>(mountCache?.cache.deletedItems || {});
    const setDeletedItems: React.Dispatch<React.SetStateAction<Record<string, number>>> = useCallback((value) => {
        setDeletedItemsState((prev) => {
            const next = typeof value === 'function' ? value(prev) : value;
            deletedItemsRef.current = next;
            return next;
        });
    }, []);

    // --- Canvas State ---
    // nodes, setNodes, connections, setConnections, groups, setGroups 已迁移到 useCanvasData Hook
    // history, historyIndex, historyRef, historyIndexRef 已迁移到 useCanvasHistory Hook
    const [clipboard, setClipboard] = useState<AppNode | null>(null);

    // Viewport (scale, pan 已迁移到 useViewport, mousePos 已迁移到 useInteraction)
    // isDraggingCanvas 已迁移到 useInteraction.isPanning
    // lastMousePos (panning) 已迁移到 useInteraction.mode.lastPos
    // 保留 lastMousePos 仅用于 draggingNode fallback 场景
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    // Interaction / Selection (已迁移到 useInteraction)
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [draggingNodeParentGroupId, setDraggingNodeParentGroupId] = useState<string | null>(null);
    const [draggingGroup, setDraggingGroup] = useState<any>(null);
    const [resizingGroupId, setResizingGroupId] = useState<string | null>(null);
    const [activeGroupNodeIds, setActiveGroupNodeIds] = useState<string[]>([]);
    // connectionStart 已迁移到 useInteraction.mode
    // selectionRect 已迁移到 useInteraction.mode
    // isSpacePressed 已迁移到 useInteraction

    // Node Resizing
    const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
    const isCanvasInteractionActive = Boolean(
        draggingNodeId ||
        draggingGroup ||
        resizingNodeId ||
        resizingGroupId ||
        isPanning ||
        isSelecting ||
        isConnecting
    );

    // Context Menu
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [contextMenuTarget, setContextMenuTarget] = useState<any>(null);
    const [isSelectionModifierActive, setIsSelectionModifierActive] = useState(false);

    // Media Overlays
    const [expandedMedia, setExpandedMedia] = useState<any>(null);
    const [imageModal, setImageModal] = useState<{
        nodeId: string;
        src: string;
        images?: string[];
        initialIndex?: number;
        originalImage?: string;
        editOriginImage?: string;
        canvasData?: string;
        initialMode?: 'preview' | 'edit';
    } | null>(null);
    const [croppingNodeId, setCroppingNodeId] = useState<string | null>(null);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [videoToCrop, setVideoToCrop] = useState<string | null>(null); // 视频帧选择源
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const router = useRouter();
    const userId = user?.id;

    useEffect(() => {
        // Ensure all scoped storage reads/writes use the same user context.
        setStorageUserId(userId || '');
    }, [userId]);

    // 组图拖拽放置预览状态
    const [gridDragDropPreview, setGridDragDropPreview] = useState<{
        type: 'image' | 'video';
        src: string;
        canvasX: number;
        canvasY: number;
    } | null>(null);

    // 复制拖拽预览状态
    const [copyDragPreview, setCopyDragPreview] = useState<{
        nodes: { x: number; y: number; width: number; height: number }[];
    } | null>(null);

    // Refs for closures
    // nodesRef, connectionsRef, groupsRef 已迁移到 useCanvasData Hook
    // historyRef, historyIndexRef 已迁移到 useCanvasHistory Hook
    // connectionStartRef 已迁移：使用 modeRef 获取 connectionStart
    const rafRef = useRef<number | null>(null); // For RAF Throttling
    const canvasContainerRef = useRef<HTMLDivElement>(null); // Canvas container ref for coordinate offset
    const viewportLayerRef = useRef<HTMLDivElement | null>(null); // 画布变换层 DOM 引用
    const gridLayerRef = useRef<HTMLDivElement | null>(null); // 网格层 DOM 引用
    const nodeRefsMap = useRef<Map<string, HTMLDivElement>>(new Map()); // 节点 DOM 引用，用于直接操作
    const groupRefsMap = useRef<Map<string, HTMLDivElement>>(new Map()); // 分组 DOM 引用，用于直接操作
    const connectionPathsRef = useRef<Map<string, SVGPathElement>>(new Map()); // 连接线 SVG path 引用
    const previewConnectionPathRef = useRef<SVGPathElement | null>(null); // 连接预览线 DOM 引用
    const dragPositionsRef = useRef<Map<string, { x: number, y: number }>>(new Map()); // 拖拽中节点的实时位置
    const multiSelectionDockNodeIdsRef = useRef<string[]>([]); // 多选图片统一连接点关联的节点ID
    const liveNodeSizeRef = useRef<Map<string, { width: number; height: number }>>(new Map()); // 节点缩放中的实时尺寸
    const nodeByIdRef = useRef<Map<string, AppNode>>(new Map()); // 节点索引（用于高频事件）
    const groupByIdRef = useRef<Map<string, Group>>(new Map()); // 分组索引（用于高频事件）
    const connectionsByNodeRef = useRef<Map<string, Connection[]>>(new Map()); // 连接索引（用于高频事件）
    const connectionPathDCacheRef = useRef<Map<string, string>>(new Map()); // 连接线 d 缓存，避免重复写 DOM
    const previewPathDRef = useRef<string>(''); // 连接预览线 d 缓存
    const liveViewportRef = useRef<{ scale: number; pan: { x: number; y: number } }>({ scale, pan }); // 视口实时值（DOM 预览）
    const panningLastPosRef = useRef<{ x: number; y: number } | null>(null); // 画布拖拽实时坐标
    const viewportCommitTimerRef = useRef<number | null>(null); // 滚轮交互结束后提交 state 的 timer
    const syncInFlightRef = useRef(false);
    const suppressSyncRef = useRef(false);
    const remoteApplyInProgressRef = useRef(false);
    const pendingRemoteUpdatedAtRef = useRef<number | null>(null);
    const lastLocalUpdatedAtRef = useRef<number>(0);
    const localChangeVersionRef = useRef(0);
    const lastSyncedUserIdRef = useRef<string | null>(null);
    const hasPersistedDataRef = useRef(false);
    const initialSyncDoneRef = useRef(false);
    const skipInitialPersistRef = useRef(true);
    const localSnapshotUpdatedAtRef = useRef(0);
    const nodeActionLocksRef = useRef<Set<string>>(new Set());

    const setNodes: React.Dispatch<React.SetStateAction<AppNode[]>> = useCallback((value) => {
        if (!remoteApplyInProgressRef.current) {
            localChangeVersionRef.current += 1;
        }
        setNodesRaw(value);
    }, [setNodesRaw]);

    const setConnections: React.Dispatch<React.SetStateAction<Connection[]>> = useCallback((value) => {
        if (!remoteApplyInProgressRef.current) {
            localChangeVersionRef.current += 1;
        }
        setConnectionsRaw(value);
    }, [setConnectionsRaw]);

    const setGroups: React.Dispatch<React.SetStateAction<Group[]>> = useCallback((value) => {
        if (!remoteApplyInProgressRef.current) {
            localChangeVersionRef.current += 1;
        }
        setGroupsRaw(value);
    }, [setGroupsRaw]);

    // Replacement Input Refs
    const replaceVideoInputRef = useRef<HTMLInputElement>(null);
    const replaceImageInputRef = useRef<HTMLInputElement>(null);
    const replacementTargetRef = useRef<string | null>(null);

    // Interaction Refs
    const dragNodeRef = useRef<{
        id: string,
        startX: number,
        startY: number,
        mouseStartX: number,
        mouseStartY: number,
        parentGroupId?: string | null,
        siblingNodeIds: string[],
        nodeWidth: number,
        nodeHeight: number,
        // 多选拖动：其他被选中节点的初始位置
        otherSelectedNodes?: { id: string, startX: number, startY: number }[],
        // 多选拖动：被选中的分组的初始位置及其内部节点
        selectedGroups?: { id: string, startX: number, startY: number, childNodes: { id: string, startX: number, startY: number }[] }[],
        // 预计算：选中分组的起始位置索引（用于高频读取）
        selectedGroupStartById?: Map<string, { startX: number, startY: number }>,
        // 预计算：拖拽涉及节点集合（用于高频碰撞检测）
        draggingIdSet?: Set<string>,
        // 预计算：是否启用吸附
        shouldSnap?: boolean,
        // 当前拖拽位置（用于 DOM 直接操作后提交 state）
        currentX?: number,
        currentY?: number,
        currentDx?: number,
        currentDy?: number,
        // Cmd/Ctrl + 拖拽复制
        isCopyDrag?: boolean
    } | null>(null);

    const resizeContextRef = useRef<{
        nodeId: string,
        initialWidth: number,
        initialHeight: number,
        startX: number,
        startY: number,
        parentGroupId: string | null,
        siblingNodeIds: string[],
        currentWidth?: number,
        currentHeight?: number
    } | null>(null);

    const dragGroupRef = useRef<{
        id: string,
        startX: number,
        startY: number,
        mouseStartX: number,
        mouseStartY: number,
        childNodes: { id: string, startX: number, startY: number }[],
        currentDx?: number,
        currentDy?: number
    } | null>(null);

    const resizeGroupRef = useRef<{
        id: string,
        initialWidth: number,
        initialHeight: number,
        startX: number,
        startY: number,
        currentWidth?: number,
        currentHeight?: number
    } | null>(null);

    // Helper to get mouse position relative to canvas container (accounting for Navbar offset)
    const getCanvasMousePos = useCallback((clientX: number, clientY: number) => {
        if (!canvasContainerRef.current) return { x: clientX, y: clientY };
        const rect = canvasContainerRef.current.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const applyViewportPreview = useCallback((nextScale: number, nextPan: { x: number; y: number }) => {
        const viewportLayerEl = viewportLayerRef.current;
        if (viewportLayerEl) {
            viewportLayerEl.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextScale})`;
        }

        const gridEl = gridLayerRef.current;
        if (gridEl) {
            gridEl.style.backgroundSize = `${32 * nextScale}px ${32 * nextScale}px`;
            gridEl.style.backgroundPosition = `${nextPan.x}px ${nextPan.y}px`;
        }
    }, []);

    const flushViewportState = useCallback((force = false) => {
        const liveViewport = liveViewportRef.current;
        const hasScaleDiff = Math.abs(liveViewport.scale - scaleRef.current) > 0.0001;
        const hasPanDiff =
            Math.abs(liveViewport.pan.x - panRef.current.x) > 0.01 ||
            Math.abs(liveViewport.pan.y - panRef.current.y) > 0.01;
        if (!force && !hasScaleDiff && !hasPanDiff) return;
        setViewport({ scale: liveViewport.scale, pan: liveViewport.pan });
    }, [panRef, scaleRef, setViewport]);

    const scheduleViewportCommit = useCallback((delay = 80) => {
        if (viewportCommitTimerRef.current) {
            window.clearTimeout(viewportCommitTimerRef.current);
        }
        viewportCommitTimerRef.current = window.setTimeout(() => {
            viewportCommitTimerRef.current = null;
            flushViewportState();
        }, delay);
    }, [flushViewportState]);

    // Helper to calculate the center of all nodes (重心)
    const getNodesCenterPoint = useCallback(() => {
        const currentNodes = nodesRef.current;
        if (currentNodes.length === 0) {
            // 如果没有节点，返回画布中心
            const rect = canvasContainerRef.current?.getBoundingClientRect();
            if (!rect) return { x: 0, y: 0 };
            return { x: rect.width / 2, y: rect.height / 2 };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentNodes.forEach(node => {
            const w = node.width || 420;
            const h = node.height || 360;
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + w);
            maxY = Math.max(maxY, node.y + h);
        });

        // 返回所有节点包围盒的中心点（画布坐标）
        return {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        };
    }, [nodesRef]);

    // nodesRef, connectionsRef, groupsRef 的同步已由 useCanvasData 内部处理
    // historyRef, historyIndexRef 的同步已由 useCanvasHistory 内部处理
    useEffect(() => {
        const nextNodeById = new Map<string, AppNode>();
        nodesRef.current.forEach((node) => nextNodeById.set(node.id, node));
        nodeByIdRef.current = nextNodeById;
    }, [nodes, nodesRef]);

    useEffect(() => {
        const nextGroupById = new Map<string, Group>();
        groupsRef.current.forEach((group) => nextGroupById.set(group.id, group));
        groupByIdRef.current = nextGroupById;
    }, [groups, groupsRef]);

    useEffect(() => {
        const nextConnectionsByNode = new Map<string, Connection[]>();
        connectionsRef.current.forEach((conn) => {
            const fromList = nextConnectionsByNode.get(conn.from) || [];
            fromList.push(conn);
            nextConnectionsByNode.set(conn.from, fromList);

            const toList = nextConnectionsByNode.get(conn.to) || [];
            toList.push(conn);
            nextConnectionsByNode.set(conn.to, toList);
        });
        connectionsByNodeRef.current = nextConnectionsByNode;
    }, [connections, connectionsRef]);

    useEffect(() => {
        const liveKeys = new Set(connectionsRef.current.map(conn => `${conn.from}-${conn.to}`));
        connectionPathDCacheRef.current.forEach((_value, key) => {
            if (!liveKeys.has(key)) connectionPathDCacheRef.current.delete(key);
        });
    }, [connections, connectionsRef]);

    useEffect(() => {
        liveViewportRef.current = { scale, pan };
        applyViewportPreview(scale, pan);
    }, [applyViewportPreview, pan, scale]);

    useEffect(() => {
        return () => {
            if (viewportCommitTimerRef.current) {
                window.clearTimeout(viewportCommitTimerRef.current);
            }
        };
    }, []);

    // --- Persistence ---
    const buildSyncData = useCallback((): StudioSyncData => {
        const latestNodes = nodesRef.current;
        const latestConnections = connectionsRef.current;
        const latestGroups = groupsRef.current;
        const latestCanvases = canvasesRef.current;
        const latestCurrentCanvasId = currentCanvasIdRef.current;
        const latestAssetHistory = assetHistoryRef.current;
        const latestWorkflows = workflowsRef.current;
        const latestSubjects = subjectsRef.current;
        const latestDeletedItems = deletedItemsRef.current;

        const normalizedCanvases = latestCurrentCanvasId
            ? latestCanvases.map((canvas) =>
                canvas.id === latestCurrentCanvasId
                    ? { ...canvas, nodes: latestNodes, connections: latestConnections, groups: latestGroups, updatedAt: Date.now() }
                    : canvas
            )
            : latestCanvases;

        const ensuredCanvases = normalizedCanvases.length > 0
            ? normalizedCanvases
            : [{
                id: `canvas-${Date.now()}`,
                title: '默认画布',
                nodes: latestNodes,
                connections: latestConnections,
                groups: latestGroups,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            } as Canvas];

        const ensuredCurrentId = latestCurrentCanvasId || ensuredCanvases[0]?.id || null;

        return {
            assets: latestAssetHistory,
            workflows: latestWorkflows,
            canvases: ensuredCanvases,
            currentCanvasId: ensuredCurrentId,
            nodes: latestNodes,
            connections: latestConnections,
            groups: latestGroups,
            subjects: latestSubjects,
            nodeConfigs: loadAllNodeConfigs(),
            taskLogs: loadTaskLogs(),
            deletedItems: latestDeletedItems,
        };
    }, []);

    const applySyncData = useCallback((data: StudioSyncData, remoteUpdatedAt: number) => {
        suppressSyncRef.current = true;
        pendingRemoteUpdatedAtRef.current = remoteUpdatedAt;
        hasPersistedDataRef.current = true;
        remoteApplyInProgressRef.current = true;
        try {
            setAssetHistory(data.assets || []);
            setWorkflows(data.workflows || []);
            setSubjects(data.subjects || []);

            const incomingCanvases = data.canvases || [];
            const incomingCurrentId = data.currentCanvasId || null;

            if (incomingCanvases.length > 0) {
                setCanvases(incomingCanvases);
                const canvasToLoad = incomingCurrentId
                    ? incomingCanvases.find(c => c.id === incomingCurrentId) || incomingCanvases[0]
                    : incomingCanvases[0];
                setCurrentCanvasId(canvasToLoad.id);
                setNodes(structuredClone(canvasToLoad.nodes || []));
                setConnections(structuredClone(canvasToLoad.connections || []));
                setGroups(structuredClone(canvasToLoad.groups || []));
            } else {
                const now = Date.now();
                const defaultCanvas: Canvas = {
                    id: `canvas-${now}`,
                    title: '默认画布',
                    nodes: data.nodes || [],
                    connections: data.connections || [],
                    groups: data.groups || [],
                    createdAt: now,
                    updatedAt: now
                };
                setCanvases([defaultCanvas]);
                setCurrentCanvasId(defaultCanvas.id);
                setNodes(structuredClone(defaultCanvas.nodes));
                setConnections(structuredClone(defaultCanvas.connections));
                setGroups(structuredClone(defaultCanvas.groups));
            }

            replaceAllNodeConfigs(data.nodeConfigs || {});
            replaceTaskLogs(data.taskLogs || []);
            if (data.deletedItems) {
                setDeletedItems((prev) => {
                    const merged: Record<string, number> = { ...prev };
                    for (const [id, ts] of Object.entries(data.deletedItems || {})) {
                        merged[id] = Math.max(merged[id] || 0, ts);
                    }
                    return merged;
                });
            }

            // 同步更新内存缓存
            setCache({
                assets: data.assets || [],
                workflows: data.workflows || [],
                subjects: data.subjects || [],
                canvases: incomingCanvases,
                currentCanvasId: incomingCurrentId,
                nodes: data.nodes || [],
                connections: data.connections || [],
                groups: data.groups || [],
                nodeConfigs: data.nodeConfigs || {},
                taskLogs: data.taskLogs || [],
                deletedItems: data.deletedItems || deletedItemsRef.current,
                timestamp: Date.now(),
            });
        } finally {
            remoteApplyInProgressRef.current = false;
        }
    }, [setAssetHistory, setWorkflows, setSubjects, setCanvases, setCurrentCanvasId, setNodes, setConnections, setGroups, setDeletedItems]);

    const persistSyncMeta = useCallback((updatedAt: number) => {
        lastLocalUpdatedAtRef.current = updatedAt;
        saveToStorage(STUDIO_SYNC_META_KEY, { updatedAt }).catch(() => {});
    }, []);

    const markLocalUpdated = useCallback((source: 'local' | 'remote', remoteUpdatedAt?: number) => {
        if (source === 'remote') {
            persistSyncMeta(remoteUpdatedAt || Date.now());
            return;
        }
        localChangeVersionRef.current += 1;
        hasPersistedDataRef.current = true;
        persistSyncMeta(Date.now());
    }, [persistSyncMeta]);

    const pushLocalSync = useCallback(async (options?: { keepalive?: boolean }) => {
        if (!isAuthenticated || !userId) return;
        if (!entryCompletedRef.current) return;

        try {
            await waitForUploads();
            const payload = buildSyncData();

            // keepalive 模式使用 sendBeacon
            if (options?.keepalive) {
                pushStudioSyncBeacon(payload);
                return;
            }

            // 普通模式使用 fetch
            const requestLocalVersion = localChangeVersionRef.current;
            const result = await pushStudioSyncToCos(payload);
            const hasLocalChangesSinceRequest = localChangeVersionRef.current !== requestLocalVersion;
            if (hasLocalChangesSinceRequest) {
                console.log('[Studio Sync] Skip stale push response in pushLocalSync');
                return;
            }
            persistSyncMeta(result.updatedAt);
            if (result.data) {
                applySyncData(result.data as StudioSyncData, result.updatedAt);
            }
        } catch (error) {
            console.warn('[Studio Sync] Failed to push local data:', error);
        }
    }, [applySyncData, buildSyncData, isAuthenticated, persistSyncMeta, userId, waitForUploads]);

    const handleExitToDashboard = useCallback((e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (exitInFlightRef.current) return;
        exitInFlightRef.current = true;
        // 立即导航，零延迟
        router.push('/canvases');
        // 后台静默同步（sendBeacon，不阻塞导航）
        if (isAuthenticated && userId) {
            pushLocalSync({ keepalive: true });
        }
    }, [isAuthenticated, pushLocalSync, router, userId]);

    // 使用 ref 存储最新的函数引用
    const buildSyncDataRef = useRef(buildSyncData);
    buildSyncDataRef.current = buildSyncData;

    // 数据变化时自动保存到云端（防抖 2 秒）
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSyncingRef = useRef(false);

    const triggerCloudSync = useCallback(async () => {
        if (!isAuthenticated || !userId || !isLoaded) return;
        if (isSyncingRef.current) return;

        isSyncingRef.current = true;
        try {
            await waitForUploads();
            const payload = buildSyncDataRef.current();
            const requestLocalVersion = localChangeVersionRef.current;
            console.log('[Studio Sync] Saving to cloud...');
            const result = await pushStudioSyncToCos(payload);
            const hasLocalChangesSinceRequest = localChangeVersionRef.current !== requestLocalVersion;
            if (hasLocalChangesSinceRequest) {
                console.log('[Studio Sync] Skip stale push response in triggerCloudSync');
                return;
            }
            persistSyncMeta(result.updatedAt);
            if (result.data) {
                applySyncData(result.data as StudioSyncData, result.updatedAt);
            }
            console.log('[Studio Sync] Save success, updatedAt:', result.updatedAt);
        } catch (error) {
            console.warn('[Studio Sync] Save failed:', error);
        } finally {
            isSyncingRef.current = false;
        }
    }, [applySyncData, isAuthenticated, userId, isLoaded, persistSyncMeta, waitForUploads]);

    // 监听数据变化，触发防抖保存
    useEffect(() => {
        if (!isAuthenticated || !userId || !isLoaded) return;
        if (!entryCompletedRef.current) return;
        if (suppressSyncRef.current) return;
        if (isCanvasInteractionActive) return;

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }

        syncTimeoutRef.current = setTimeout(() => {
            triggerCloudSync();
        }, 2000); // 2 秒防抖

        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [nodes, connections, groups, canvases, currentCanvasId, workflows, assetHistory, subjects, isAuthenticated, userId, isLoaded, triggerCloudSync, isCanvasInteractionActive]);

    // 离开时强制同步（同步方式，阻塞页面关闭）
    useEffect(() => {
        if (!isAuthenticated || !userId) return;

        const syncBeforeLeave = async () => {
            if (!isLoaded || isSyncingRef.current) return;
            if (!entryCompletedRef.current) return;

            // 取消待执行的防抖保存
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
            }

            console.log('[Studio Sync] Sync before leave...');
            try {
                await waitForUploads();
                const payload = buildSyncDataRef.current();
                await pushStudioSyncToCos(payload);
                console.log('[Studio Sync] Sync before leave success');
            } catch (error) {
                console.warn('[Studio Sync] Sync before leave failed:', error);
            }
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // 使用同步 XMLHttpRequest 强制等待
            if (!isLoaded) return;
            if (!entryCompletedRef.current) return;
            if (isUploadingRef.current) {
                e.preventDefault();
                e.returnValue = '';
                return;
            }

            const payload = buildSyncDataRef.current();
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/studio/sync-cos', false); // false = 同步
            xhr.setRequestHeader('Content-Type', 'application/json');
            try {
                xhr.send(JSON.stringify({ data: payload, updatedAt: Date.now() }));
                console.log('[Studio Sync] Sync on beforeunload success');
            } catch (error) {
                console.warn('[Studio Sync] Sync on beforeunload failed:', error);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                syncBeforeLeave();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isLoaded, isAuthenticated, userId, waitForUploads]);

    const getLocalUpdatedAt = useCallback(async () => {
        const localMeta = await loadFromStorage<{ updatedAt: number }>(STUDIO_SYNC_META_KEY);
        let localUpdatedAt = Number(localMeta?.updatedAt || 0);
        const snapshotUpdatedAt = localSnapshotUpdatedAtRef.current || 0;
        // 只在本地没有时间戳时使用快照时间，不再降级
        if (!localUpdatedAt && snapshotUpdatedAt) {
            localUpdatedAt = snapshotUpdatedAt;
        }
        const memoryUpdatedAt = lastLocalUpdatedAtRef.current || 0;
        return Math.max(localUpdatedAt, memoryUpdatedAt);
    }, []);

    const cloudPullInFlightRef = useRef(false);
    const refreshFromCloud = useCallback(async () => {
        if (!isAuthenticated || !userId) return;
        if (cloudPullInFlightRef.current) return;
        cloudPullInFlightRef.current = true;
        const requestLocalVersion = localChangeVersionRef.current;
        try {
            await waitForUploads();
            const serverRecord = await fetchStudioSyncFromCos().catch(() => null);
            if (!serverRecord) return;
            if (localChangeVersionRef.current !== requestLocalVersion) return;
            const localUpdatedAt = await getLocalUpdatedAt();
            if (serverRecord.updatedAt > localUpdatedAt) {
                applySyncData(serverRecord.data as StudioSyncData, serverRecord.updatedAt);
            }
        } catch (error) {
            console.warn('[Studio Sync] Auto pull failed:', error);
        } finally {
            cloudPullInFlightRef.current = false;
        }
    }, [applySyncData, getLocalUpdatedAt, isAuthenticated, userId, waitForUploads]);

    const initialSync = useCallback(async () => {
        if (!isAuthenticated || !userId) return;

        try {
            const requestLocalVersion = localChangeVersionRef.current;
            let localUpdatedAt = await getLocalUpdatedAt();
            const hasLocalData = hasPersistedDataRef.current || loadTaskLogs().length > 0;
            if (!hasLocalData) {
                localUpdatedAt = 0;
            } else if (!localUpdatedAt) {
                localUpdatedAt = localSnapshotUpdatedAtRef.current || 0;
                if (localUpdatedAt > 0) {
                    persistSyncMeta(localUpdatedAt);
                }
            }

            const serverRecord = await fetchStudioSyncFromCos().catch(() => null);
            if (!serverRecord) {
                if (hasLocalData && localUpdatedAt > 0) {
                    await pushLocalSync();
                }
                return;
            }

            localUpdatedAt = await getLocalUpdatedAt();
            if (localChangeVersionRef.current !== requestLocalVersion) {
                return;
            }
            if (serverRecord.updatedAt > localUpdatedAt) {
                applySyncData(serverRecord.data as StudioSyncData, serverRecord.updatedAt);
            }
        } catch (error) {
            console.warn('[Studio Sync] Initial sync failed:', error);
        } finally {
            initialSyncDoneRef.current = true;
        }
    }, [applySyncData, getLocalUpdatedAt, isAuthenticated, userId, persistSyncMeta, pushLocalSync]);

    // 移除了 refreshCloudSnapshot 和切换画布时的自动拉取
    // 只在初始加载时同步，避免覆盖用户正在操作的数据

    useEffect(() => {
        if (authLoading) return;
        setStorageUserId(userId || '');
        const win = window as any;
        if (win.aistudio) win.aistudio.hasSelectedApiKey().then((hasKey: boolean) => { if (!hasKey) win.aistudio.openSelectKey(); });

        // 应用已加载的数据到 state 的通用逻辑
        const applyLoadedData = (
            sAssets: any[] | undefined,
            sWfs: Workflow[] | undefined,
            sSubjects: Subject[] | undefined,
            sCanvases: Canvas[] | undefined,
            sCurrentCanvasId: string | undefined,
            sNodes: AppNode[] | undefined,
            sConns: Connection[] | undefined,
            sGroups: Group[] | undefined,
            sDeletedItems: Record<string, number> | undefined
        ) => {
            setAssetHistory(sAssets || []);
            setWorkflows(sWfs || []);
            setSubjects(sSubjects || []);
            setDeletedItems(sDeletedItems || {});
            localSnapshotUpdatedAtRef.current = sCanvases && sCanvases.length > 0
                ? Math.max(...sCanvases.map(c => c.updatedAt || c.createdAt || 0))
                : 0;

            hasPersistedDataRef.current = Boolean(
                (sAssets && sAssets.length) ||
                (sWfs && sWfs.length) ||
                (sSubjects && sSubjects.length) ||
                (sCanvases && sCanvases.length) ||
                (sNodes && sNodes.length) ||
                (sConns && sConns.length) ||
                (sGroups && sGroups.length) ||
                loadTaskLogs().length > 0
            );

            if (sCanvases && sCanvases.length > 0) {
                setCanvases(sCanvases);
                const canvasToLoad = sCurrentCanvasId
                    ? sCanvases.find(c => c.id === sCurrentCanvasId) || sCanvases[0]
                    : sCanvases[0];
                setCurrentCanvasId(canvasToLoad.id);
                setNodes(structuredClone(canvasToLoad.nodes));
                setConnections(structuredClone(canvasToLoad.connections));
                setGroups(structuredClone(canvasToLoad.groups));

                if (canvasToLoad.pan && canvasToLoad.scale) {
                    setPan(canvasToLoad.pan);
                    setScale(canvasToLoad.scale);
                } else if (canvasToLoad.nodes.length > 0) {
                    setTimeout(() => {
                        const loadedNodes = canvasToLoad.nodes;
                        if (loadedNodes.length === 0) return;
                        const padding = 80;
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        loadedNodes.forEach((n: AppNode) => {
                            const h = n.height || 360;
                            const w = n.width || 420;
                            if (n.x < minX) minX = n.x;
                            if (n.y < minY) minY = n.y;
                            if (n.x + w > maxX) maxX = n.x + w;
                            if (n.y + h > maxY) maxY = n.y + h;
                        });
                        const contentW = maxX - minX;
                        const contentH = maxY - minY;
                        const scaleX = (window.innerWidth - padding * 2) / contentW;
                        const scaleY = (window.innerHeight - padding * 2) / contentH;
                        let newScale = Math.min(scaleX, scaleY, 1);
                        newScale = Math.max(0.2, newScale);
                        const contentCenterX = minX + contentW / 2;
                        const contentCenterY = minY + contentH / 2;
                        const newPanX = (window.innerWidth / 2) - (contentCenterX * newScale);
                        const newPanY = (window.innerHeight / 2) - (contentCenterY * newScale);
                        setPan({ x: newPanX, y: newPanY });
                        setScale(newScale);
                    }, 100);
                }
            } else {
                const now = Date.now();
                const defaultCanvas: Canvas = {
                    id: `canvas-${now}`,
                    title: '默认画布',
                    nodes: sNodes || [],
                    connections: sConns ? sConns.filter((conn, idx, arr) =>
                        arr.findIndex(c => c.from === conn.from && c.to === conn.to) === idx
                    ) : [],
                    groups: sGroups || [],
                    createdAt: now,
                    updatedAt: now
                };

                setCanvases([defaultCanvas]);
                setCurrentCanvasId(defaultCanvas.id);
                if (sNodes) setNodes(sNodes);
                if (sConns) {
                    const uniqueConns = sConns.filter((conn, idx, arr) =>
                        arr.findIndex(c => c.from === conn.from && c.to === conn.to) === idx
                    );
                    setConnections(uniqueConns);
                }
                if (sGroups) setGroups(sGroups);
            }
        };

        const loadData = async () => {
            skipInitialPersistRef.current = true;

            // mountCache 已在 useState 初始化时同步应用，只需设置 refs
            if (mountCache) {
                console.log('[StudioTab] Cache hit — data pre-loaded at mount');
                const c = mountCache.cache;
                localSnapshotUpdatedAtRef.current = c.canvases && c.canvases.length > 0
                    ? Math.max(...c.canvases.map(cv => cv.updatedAt || cv.createdAt || 0))
                    : 0;
                hasPersistedDataRef.current = Boolean(
                    c.assets?.length || c.workflows?.length || c.subjects?.length ||
                    c.canvases?.length || c.nodes?.length || c.connections?.length ||
                    c.groups?.length || loadTaskLogs().length > 0
                );
                markMigrationComplete();
                // isLoaded 和 showLoadingOverlay 已在 useState 初始化中设置
                return;
            }

            setIsLoaded(false);
            setAssetHistory([]);
            setWorkflows([]);
            setSubjects([]);
            setCanvases([]);
            setNodes([]);
            setConnections([]);
            setGroups([]);
            setDeletedItems({});
            setCurrentCanvasId(null);
            try {
                // 使用批量读取，一个事务完成
                const bulk = await loadMultipleFromStorage([
                    'assets', 'workflows', 'canvases', 'currentCanvasId',
                    'nodes', 'connections', 'groups', 'deletedItems',
                ]);
                const sSubjects = await loadSubjects();
                markMigrationComplete();

                applyLoadedData(
                    bulk['assets'] as any[],
                    bulk['workflows'] as Workflow[],
                    sSubjects,
                    bulk['canvases'] as Canvas[],
                    bulk['currentCanvasId'] as string | undefined,
                    bulk['nodes'] as AppNode[],
                    bulk['connections'] as Connection[],
                    bulk['groups'] as Group[],
                    bulk['deletedItems'] as Record<string, number> | undefined,
                );
            } catch (e) {
                console.error("Failed to load storage", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadData();
    }, [authLoading, userId, setDeletedItems]);

    // 加载完成后移除覆盖层（缓存命中时直接跳过，否则等退场动画结束）
    useEffect(() => {
        if (isLoaded && showLoadingOverlay) {
            // 缓存命中时几乎无延迟，直接移除
            const delay = getCache() ? 0 : 300;
            const timer = setTimeout(() => setShowLoadingOverlay(false), delay);
            return () => clearTimeout(timer);
        }
    }, [isLoaded, showLoadingOverlay]);

    useEffect(() => {
        lastLocalUpdatedAtRef.current = 0;
        pendingRemoteUpdatedAtRef.current = null;
        suppressSyncRef.current = false;
        hasPersistedDataRef.current = false;
        initialSyncDoneRef.current = false;
        skipInitialPersistRef.current = true;
        localSnapshotUpdatedAtRef.current = 0;
        localChangeVersionRef.current = 0;
        lastSyncedUserIdRef.current = null;
        entryCompletedRef.current = false;
        setDeletedItems({});
    }, [userId, setDeletedItems]);

    useEffect(() => {
        if (!isLoaded || authLoading) return;
        if (entryCompletedRef.current) return;

        let active = true;
        const run = async () => {
            try {
                if (!isAuthenticated || !userId) {
                    return;
                }

                if (lastSyncedUserIdRef.current !== userId) {
                    lastSyncedUserIdRef.current = userId;
                    // 如果 StudioSyncProvider 已完成初始同步，跳过重复的 COS 请求
                    if (isInitialSyncComplete()) {
                        console.log('[Studio Sync] Provider already synced, skipping initial COS fetch');
                        initialSyncDoneRef.current = true;
                        // 数据已通过 applySyncToStorage 写入缓存/IndexedDB，loadData 已读取
                    } else {
                        // 监听 Provider 完成同步的事件，或自己做初始同步
                        const handleSyncDone = () => {
                            if (!active) return;
                            // Provider 同步完成后从缓存刷新
                            const cached = getCache();
                            if (cached) {
                                applySyncData({
                                    assets: cached.assets,
                                    workflows: cached.workflows,
                                    canvases: cached.canvases,
                                    currentCanvasId: cached.currentCanvasId,
                                    nodes: cached.nodes,
                                    connections: cached.connections,
                                    groups: cached.groups,
                                    subjects: cached.subjects,
                                    nodeConfigs: cached.nodeConfigs,
                                    taskLogs: cached.taskLogs,
                                    deletedItems: cached.deletedItems,
                                }, cached.timestamp);
                            }
                            initialSyncDoneRef.current = true;
                        };
                        window.addEventListener('studio-sync-updated', handleSyncDone, { once: true });
                        // 如果 10 秒后 Provider 仍未完成，自行做初始同步
                        const timeout = setTimeout(() => {
                            window.removeEventListener('studio-sync-updated', handleSyncDone);
                            if (!initialSyncDoneRef.current && active) {
                                initialSync();
                            }
                        }, 10_000);
                        return () => {
                            window.removeEventListener('studio-sync-updated', handleSyncDone);
                            clearTimeout(timeout);
                        };
                    }
                } else {
                    // 仅在非首次进入（用户切换回来等）时拉取
                    await refreshFromCloud();
                }
            } catch (error) {
                console.warn('[Studio Sync] Enter sync failed:', error);
            } finally {
                if (active) {
                    entryCompletedRef.current = true;
                }
            }
        };

        run();
        return () => {
            active = false;
        };
    }, [isLoaded, authLoading, isAuthenticated, userId, initialSync, refreshFromCloud, applySyncData]);

    useEffect(() => {
        if (!isLoaded || !isAuthenticated || !userId) return;

        // 节流：事件触发的 refresh 至少间隔 10 秒
        let lastRefreshTime = 0;
        const throttledRefresh = () => {
            const now = Date.now();
            if (now - lastRefreshTime < 10_000) return;
            lastRefreshTime = now;
            refreshFromCloud();
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                throttledRefresh();
            }
        };

        const handleFocus = () => {
            throttledRefresh();
        };

        const handleSyncEvent = () => {
            throttledRefresh();
        };

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                refreshFromCloud();
            }
        }, 60_000); // 60秒轮询（从15秒放宽）

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('studio-sync-updated', handleSyncEvent as EventListener);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('studio-sync-updated', handleSyncEvent as EventListener);
            window.clearInterval(intervalId);
        };
    }, [isLoaded, isAuthenticated, userId, refreshFromCloud]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!entryCompletedRef.current) return;
        if (isCanvasInteractionActive) return;
        if (canvases.length === 0 || !currentCanvasId) return;
        if (skipInitialPersistRef.current) {
            skipInitialPersistRef.current = false;
            return;
        }

        const latestNodes = nodesRef.current;
        const latestConnections = connectionsRef.current;
        const latestGroups = groupsRef.current;

        const persistedCanvases = currentCanvasId
            ? canvases.map((canvas) =>
                canvas.id === currentCanvasId
                    ? {
                        ...canvas,
                        nodes: latestNodes,
                        connections: latestConnections,
                        groups: latestGroups,
                        updatedAt: Date.now(),
                    }
                    : canvas
            )
            : canvases;

        saveToStorage('assets', assetHistory);
        saveToStorage('workflows', workflows);
        saveToStorage('canvases', persistedCanvases);
        saveToStorage('currentCanvasId', currentCanvasId);
        // 保留旧的 keys 用于向后兼容，但主要数据在 canvases 中
        saveToStorage('nodes', latestNodes);
        saveToStorage('connections', latestConnections);
        saveToStorage('groups', latestGroups);
        saveToStorage('deletedItems', deletedItemsState);
        saveSubjects(subjects);

        // 同步更新内存缓存，保持缓存热
        setCache({
            assets: assetHistory,
            workflows,
            subjects,
            canvases: persistedCanvases,
            currentCanvasId,
            nodes: latestNodes,
            connections: latestConnections,
            groups: latestGroups,
            nodeConfigs: loadAllNodeConfigs(),
            taskLogs: loadTaskLogs(),
            deletedItems: deletedItemsState,
            timestamp: Date.now(),
        });

        if (suppressSyncRef.current) {
            suppressSyncRef.current = false;
            if (pendingRemoteUpdatedAtRef.current) {
                markLocalUpdated('remote', pendingRemoteUpdatedAtRef.current);
                pendingRemoteUpdatedAtRef.current = null;
            }
            return;
        }

        markLocalUpdated('local');
    }, [assetHistory, workflows, nodes, connections, groups, canvases, currentCanvasId, subjects, isLoaded, markLocalUpdated, nodesRef, connectionsRef, groupsRef, isCanvasInteractionActive, deletedItemsState]);

    // 移除了自动推送防抖逻辑，只在离开时推送

    // 恢复待处理的视频任务轮询
    useEffect(() => {
        if (!isLoaded) return;

        const completedTasks = videoTaskManager.getCompletedTasks();
        if (completedTasks.length > 0) {
            console.log(`[VideoTaskRestore] Found ${completedTasks.length} completed video tasks, applying results...`);
            completedTasks.forEach(task => {
                if (!task.nodeId) {
                    videoTaskManager.removeCompletedTask(task.taskId);
                    return;
                }

                const node = nodesRef.current.find(n => n.id === task.nodeId);
                if (!node) return;

                if (task.status === 'SUCCESS' && task.videoUrl) {
                    handleNodeUpdate(task.nodeId, {
                        videoUri: task.videoUrl,
                        videoMetadata: { taskId: task.taskId },
                        videoUris: task.videoUrl ? [task.videoUrl] : undefined,
                        model: task.model || node.data.model,
                        aspectRatio: task.aspectRatio || node.data.aspectRatio,
                    });
                    setNodes(prev => prev.map(n =>
                        n.id === task.nodeId ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n
                    ));
                } else {
                    handleNodeUpdate(task.nodeId, { error: task.error || '视频生成失败' });
                    setNodes(prev => prev.map(n =>
                        n.id === task.nodeId ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n
                    ));
                }

                videoTaskManager.removeCompletedTask(task.taskId);
                videoTaskManager.removeTask(task.taskId);
            });
        }

        const completedTaskIds = new Set(completedTasks.map(t => t.taskId));
        const pendingTasks = videoTaskManager.getPendingTasks().filter(task => !completedTaskIds.has(task.taskId));
        if (pendingTasks.length === 0) return;

        console.log(`[VideoTaskRestore] Found ${pendingTasks.length} pending video tasks, resuming polling...`);

        pendingTasks.forEach(task => {
            // 检查节点是否存在
            const node = nodesRef.current.find(n => n.id === task.nodeId);
            if (!node) {
                console.log(`[VideoTaskRestore] Node ${task.nodeId} not found, skipping task ${task.taskId}`);
                return;
            }

            // 设置节点为工作状态
            setNodes(prev => prev.map(n =>
                n.id === task.nodeId ? { ...n, status: NodeStatus.WORKING, modifiedAt: Date.now() } : n
            ));

            // 恢复轮询
            videoTaskManager.pollTask(
                task,
                (status) => {
                    console.log(`[VideoTaskRestore] Task ${task.taskId} status: ${status}`);
                },
                (result) => {
                    console.log(`[VideoTaskRestore] Task ${task.taskId} completed:`, result.videoUrl);
                    // 更新节点
                    handleNodeUpdate(task.nodeId, {
                        videoUri: result.videoUrl,
                        videoMetadata: { taskId: task.taskId },
                        videoUris: result.videoUrl ? [result.videoUrl] : undefined,
                        model: task.model,
                        aspectRatio: task.aspectRatio,
                    });
                    setNodes(prev => prev.map(n =>
                        n.id === task.nodeId ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n
                    ));
                },
                (error) => {
                    console.error(`[VideoTaskRestore] Task ${task.taskId} failed:`, error);
                    handleNodeUpdate(task.nodeId, { error });
                    setNodes(prev => prev.map(n =>
                        n.id === task.nodeId ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n
                    ));
                }
            );
        });
    }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps


    const getApproxNodeHeight = (node: AppNode) => {
        if (node.height) return node.height;
        const width = node.width || 420;
        if (node.type === NodeType.IMAGE_EDITOR) return 360;
        if (node.type === NodeType.AUDIO_GENERATOR) return Math.round(width * 9 / 16); // 16:9 比例
        if (node.type === NodeType.IMAGE_3D_CAMERA) return 380; // 3D 运镜节点固定高度
        // 文本节点默认 9:16，素材节点默认 16:9
        const defaultRatio = node.type === NodeType.PROMPT_INPUT ? '9:16'
            : (node.type === NodeType.IMAGE_ASSET || node.type === NodeType.VIDEO_ASSET) ? '16:9' : '1:1';
        const [w, h] = (node.data.aspectRatio || defaultRatio).split(':').map(Number);
        return (width * h / w);
    };

    const getNodeSize = (node: AppNode) => {
        const liveSize = liveNodeSizeRef.current.get(node.id);
        if (liveSize) return liveSize;
        return {
            width: node.width || 420,
            height: node.height || getApproxNodeHeight(node),
        };
    };

    const getNodeBounds = (node: AppNode) => {
        const { width, height } = getNodeSize(node);
        return { x: node.x, y: node.y, width, height, r: node.x + width, b: node.y + height };
    };

    const getMultiSelectionMenuPosition = useCallback((ids: string[]) => {
        if (!canvasContainerRef.current || ids.length < 2) return null;
        const selectedNodes = ids.map(id => nodeByIdRef.current.get(id)).filter((n): n is AppNode => Boolean(n));
        if (selectedNodes.length < 2) return null;

        const minX = Math.min(...selectedNodes.map(n => n.x));
        const minY = Math.min(...selectedNodes.map(n => n.y));
        const maxX = Math.max(...selectedNodes.map(n => n.x + (n.width || 420)));
        const maxY = Math.max(...selectedNodes.map(n => n.y + (n.height || getApproxNodeHeight(n))));

        // 与“新建分组”保持一致的包围框尺寸（左右上下各 32）
        const boxX = minX - 32;
        const boxY = minY - 32;
        const boxWidth = (maxX - minX) + 64;

        const anchorX = boxX + boxWidth / 2;
        const anchorY = boxY;
        const rect = canvasContainerRef.current.getBoundingClientRect();

        let x = rect.left + anchorX * scale + pan.x;
        let y = rect.top + anchorY * scale + pan.y - 8;

        if (typeof window !== 'undefined') {
            const margin = 20;
            const halfW = 180;
            const halfH = 56;
            x = Math.min(Math.max(x, margin + halfW), window.innerWidth - margin - halfW);
            y = Math.min(Math.max(y, margin + halfH), window.innerHeight - margin - halfH);
        }

        return { x, y };
    }, [getApproxNodeHeight, pan.x, pan.y, scale]);

    useEffect(() => {
        // 连接拖拽期间暂停多选菜单自动定位，避免与 output-action 菜单位置互相抢占
        if (isConnecting) {
            if (contextMenuTarget?.type === 'multi-selection' && contextMenuTarget?.anchor === 'bounds-top') {
                setContextMenu(null);
            }
            return;
        }

        if (isSelectionModifierActive) {
            if (contextMenuTarget?.type === 'multi-selection' && contextMenuTarget?.anchor === 'bounds-top') {
                setContextMenu(null);
            }
            return;
        }

        if (!isMultiNodeSelection) {
            if (contextMenuTarget?.type === 'multi-selection' && contextMenuTarget?.anchor === 'bounds-top') {
                setContextMenu(null);
                setContextMenuTarget(null);
            }
            return;
        }

        // 非多选菜单（例如 output-action/input-action）正在显示时，不抢占当前菜单
        if (contextMenu?.visible && contextMenuTarget && contextMenuTarget.type !== 'multi-selection') {
            return;
        }

        const position = getMultiSelectionMenuPosition(selectedNodeIds);
        if (!position) return;

        const ids = [...selectedNodeIds];
        const idsKey = [...ids].sort().join(',');

        setContextMenu(prev => {
            if (
                prev &&
                prev.id === 'multi-selection-anchor' &&
                Math.abs(prev.x - position.x) < 0.5 &&
                Math.abs(prev.y - position.y) < 0.5
            ) {
                return prev;
            }
            return { visible: true, x: position.x, y: position.y, id: 'multi-selection-anchor' };
        });

        setContextMenuTarget((prev: any) => {
            const prevIds = Array.isArray(prev?.ids) ? [...prev.ids].sort().join(',') : '';
            if (prev?.type === 'multi-selection' && prev?.anchor === 'bounds-top' && prevIds === idsKey) {
                return prev;
            }
            return { type: 'multi-selection', ids, anchor: 'bounds-top' };
        });
    }, [contextMenu?.visible, contextMenuTarget?.anchor, contextMenuTarget?.type, getMultiSelectionMenuPosition, isConnecting, isMultiNodeSelection, isSelectionModifierActive, selectedNodeIds]);

    useEffect(() => {
        const handleModifierChange = (e: KeyboardEvent) => {
            setIsSelectionModifierActive(e.altKey);
        };
        const clearModifierState = () => setIsSelectionModifierActive(false);
        window.addEventListener('keydown', handleModifierChange);
        window.addEventListener('keyup', handleModifierChange);
        window.addEventListener('blur', clearModifierState);
        return () => {
            window.removeEventListener('keydown', handleModifierChange);
            window.removeEventListener('keyup', handleModifierChange);
            window.removeEventListener('blur', clearModifierState);
        };
    }, []);

    const nodeById = useMemo(() => {
        const map = new Map<string, AppNode>();
        for (const node of nodes) map.set(node.id, node);
        return map;
    }, [nodes]);

    const groupById = useMemo(() => {
        const map = new Map<string, Group>();
        for (const group of groups) map.set(group.id, group);
        return map;
    }, [groups]);

    const nodesInGroupById = useMemo(() => {
        const map = new Map<string, AppNode[]>();
        if (groups.length === 0 || nodes.length === 0) return map;
        for (const group of groups) map.set(group.id, []);

        for (const node of nodes) {
            const width = node.width || 420;
            const height = node.height || getApproxNodeHeight(node);
            const cx = node.x + width / 2;
            const cy = node.y + height / 2;
            for (const group of groups) {
                if (cx > group.x && cx < group.x + group.width && cy > group.y && cy < group.y + group.height) {
                    map.get(group.id)?.push(node);
                }
            }
        }
        return map;
    }, [groups, nodes]);

    const inputAssetsByNodeId = useMemo(() => {
        const map = new Map<string, Array<{ id: string; type: 'image' | 'video'; src: string }>>();
        for (const node of nodes) {
            const assets: Array<{ id: string; type: 'image' | 'video'; src: string }> = [];
            for (const inputId of node.inputs) {
                const inputNode = nodeById.get(inputId);
                if (!inputNode) continue;
                const src = inputNode.data.croppedFrame || inputNode.data.image || inputNode.data.videoUri;
                if (!src) continue;
                assets.push({
                    id: inputNode.id,
                    type: (inputNode.data.croppedFrame || inputNode.data.image) ? 'image' : 'video',
                    src,
                });
                if (assets.length >= 6) break;
            }
            map.set(node.id, assets);
        }
        return map;
    }, [nodes, nodeById]);

    const multiSelectionDock = useMemo(() => {
        if (selectedNodeIds.length < 2 || selectedGroupIds.length > 0) return null;
        const selectedNodes = selectedNodeIds
            .map(id => nodeById.get(id))
            .filter((n): n is AppNode => Boolean(n));
        if (selectedNodes.length < 2) return null;

        const allImageLike = selectedNodes.every((n) => {
            const hasImage = Boolean(n.data.image || (n.data.images && n.data.images.length > 0));
            const hasVideo = Boolean(n.data.videoUri || (n.data.videoUris && n.data.videoUris.length > 0));
            return hasImage && !hasVideo;
        });
        if (!allImageLike) return null;

        const minX = Math.min(...selectedNodes.map(n => n.x));
        const minY = Math.min(...selectedNodes.map(n => n.y));
        const maxX = Math.max(...selectedNodes.map(n => n.x + (n.width || 420)));
        const maxY = Math.max(...selectedNodes.map(n => n.y + (n.height || getApproxNodeHeight(n))));
        const boxX = minX - 32;
        const boxY = minY - 32;
        const boxWidth = (maxX - minX) + 64;
        const boxHeight = (maxY - minY) + 64;

        return {
            x: boxX + boxWidth + PORT_OFFSET + 12,
            y: boxY + boxHeight / 2,
            sourceNodeIds: selectedNodes.map(n => n.id),
        };
    }, [getApproxNodeHeight, nodeById, selectedGroupIds.length, selectedNodeIds]);

    useEffect(() => {
        multiSelectionDockNodeIdsRef.current = multiSelectionDock?.sourceNodeIds || [];
    }, [multiSelectionDock]);

    // 获取节点的实时位置（优先使用拖拽位置）
    const getNodePosition = (nodeId: string) => {
        const dragPos = dragPositionsRef.current.get(nodeId);
        if (dragPos) return dragPos;
        const node = nodeByIdRef.current.get(nodeId) || nodesRef.current.find(n => n.id === nodeId);
        return node ? { x: node.x, y: node.y } : null;
    };

    // 计算连接点中心位置
    const getPortCenter = (node: AppNode, portType: 'input' | 'output') => {
        const pos = getNodePosition(node.id) || { x: node.x, y: node.y };
        const { width, height } = getNodeSize(node);

        const y = pos.y + height / 2;
        // 连接点中心 = 节点边缘中点（PORT_OFFSET 用于微调）
        return portType === 'output'
            ? { x: pos.x + width + PORT_OFFSET, y }
            : { x: pos.x - PORT_OFFSET, y };
    };

    // 更新与指定节点相关的所有连接线
    const updateConnectionPaths = (nodeIds: string[], updateHitArea: boolean = true) => {
        if (nodeIds.length === 0) return;

        const handled = new Set<string>();
        const portCenterCache = new Map<string, { x: number; y: number }>();
        const getCachedPortCenter = (node: AppNode, portType: 'input' | 'output') => {
            const cacheKey = `${node.id}:${portType}`;
            const cached = portCenterCache.get(cacheKey);
            if (cached) return cached;
            const center = getPortCenter(node, portType);
            portCenterCache.set(cacheKey, center);
            return center;
        };
        nodeIds.forEach((nodeId) => {
            const relatedConnections = connectionsByNodeRef.current.get(nodeId);
            if (!relatedConnections || relatedConnections.length === 0) return;

            relatedConnections.forEach((conn) => {
                const connKey = `${conn.from}-${conn.to}`;
                if (handled.has(connKey)) return;
                handled.add(connKey);

                const pathEl = connectionPathsRef.current.get(connKey);
                const hitPathEl = connectionPathsRef.current.get(`${connKey}-hit`);
                if (!pathEl) return;

                const fromNode = nodeByIdRef.current.get(conn.from) || nodesRef.current.find(n => n.id === conn.from);
                const toNode = nodeByIdRef.current.get(conn.to) || nodesRef.current.find(n => n.id === conn.to);
                if (!fromNode || !toNode) return;

                const fromCenter = getCachedPortCenter(fromNode, 'output');
                const toCenter = getCachedPortCenter(toNode, 'input');
                const from = { ...fromCenter };
                const to = { ...toCenter };
                // 避免完全水平时渲染问题
                if (Math.abs(from.y - to.y) < 0.5) to.y += 0.5;

                const d = generateBezierPath(from.x, from.y, to.x, to.y);
                    if (connectionPathDCacheRef.current.get(connKey) !== d) {
                        pathEl.setAttribute('d', d);
                        if (updateHitArea && hitPathEl) hitPathEl.setAttribute('d', d);
                        connectionPathDCacheRef.current.set(connKey, d);
                    }
                });
            });
        };

    const getConnectionPreviewStart = (start: { id: string; portType: 'input' | 'output'; screenX: number; screenY: number }) => {
        const currentScale = scaleRef.current;
        const currentPan = panRef.current;

        if (start.id === 'smart-sequence-dock' || start.id === MULTI_SELECTION_DOCK_ID) {
            return {
                x: (start.screenX - currentPan.x) / currentScale,
                y: (start.screenY - currentPan.y) / currentScale,
            };
        }

        const startNode = nodeByIdRef.current.get(start.id) || nodesRef.current.find(n => n.id === start.id);
        if (!startNode) return null;
        return getPortCenter(startNode, start.portType);
    };

    const updatePreviewConnectionPath = (
        start: { id: string; portType: 'input' | 'output'; screenX: number; screenY: number },
        canvasX: number,
        canvasY: number
    ): boolean => {
        const pathEl = previewConnectionPathRef.current;
        if (!pathEl) return false;

        const startPos = getConnectionPreviewStart(start);
        if (!startPos) return false;

        const currentScale = scaleRef.current;
        const currentPan = panRef.current;
        const endX = (canvasX - currentPan.x) / currentScale;
        const endY = (canvasY - currentPan.y) / currentScale;
        const d = `M ${startPos.x} ${startPos.y} L ${endX} ${endY}`;
        if (previewPathDRef.current !== d) {
            pathEl.setAttribute('d', d);
            previewPathDRef.current = d;
        }
        return true;
    };

    // 检测两个矩形是否重叠
    const isOverlapping = (a: { x: number, y: number, width: number, height: number }, b: { x: number, y: number, width: number, height: number }, padding = 20) => {
        return !(a.x + a.width + padding < b.x || b.x + b.width + padding < a.x || a.y + a.height + padding < b.y || b.y + b.height + padding < a.y);
    };

    // 找到不重叠的位置
    const findNonOverlappingPosition = (startX: number, startY: number, width: number, height: number, existingNodes: AppNode[], direction: 'right' | 'down' | 'up' = 'right'): { x: number, y: number } => {
        let x = startX, y = startY;
        const step = direction === 'right' ? 80 : direction === 'up' ? 80 : 60;
        const maxAttempts = 20;

        for (let i = 0; i < maxAttempts; i++) {
            const candidate = { x, y, width, height };
            const hasOverlap = existingNodes.some(node => {
                const bounds = getNodeBounds(node);
                return isOverlapping(candidate, bounds);
            });

            if (!hasOverlap) return { x, y };

            // 尝试下一个位置
            if (direction === 'right') {
                x += step;
            } else if (direction === 'up') {
                y -= step; // 向上偏移
            } else {
                y += step;
            }
        }

        return { x, y }; // 返回最后尝试的位置
    };

    const getNodeNameCN = (t: string) => {
        switch (t) {
            case NodeType.PROMPT_INPUT: return '文本';
            case NodeType.IMAGE_ASSET: return '插入图片';
            case NodeType.VIDEO_ASSET: return '插入视频';
            case NodeType.IMAGE_GENERATOR: return '图片生成';
            case NodeType.VIDEO_GENERATOR: return '视频生成';
            case NodeType.VIDEO_FACTORY: return '视频工厂';
            case NodeType.AUDIO_GENERATOR: return '灵感音乐';
            case NodeType.VOICE_GENERATOR: return '语音合成';
            case NodeType.IMAGE_EDITOR: return '图像编辑';
            case NodeType.MULTI_FRAME_VIDEO: return '智能多帧';
            case NodeType.IMAGE_3D_CAMERA: return '3D 运镜';
            default: return t;
        }
    };
    const getNodeIcon = (t: string) => {
        switch (t) {
            case NodeType.PROMPT_INPUT: return Type;
            case NodeType.IMAGE_ASSET: return ImageIcon;
            case NodeType.VIDEO_ASSET: return VideoIcon;
            case NodeType.IMAGE_GENERATOR: return ImageIcon;
            case NodeType.VIDEO_GENERATOR: return Film;
            case NodeType.VIDEO_FACTORY: return VideoIcon;
            case NodeType.AUDIO_GENERATOR: return Music;
            case NodeType.VOICE_GENERATOR: return Speech;
            case NodeType.IMAGE_EDITOR: return Brush;
            case NodeType.MULTI_FRAME_VIDEO: return Scan;
            case NodeType.IMAGE_3D_CAMERA: return Camera;
            default: return Plus;
        }
    };

    const isPointInsideChatPanel = useCallback((clientX: number, clientY: number) => {
        if (!isChatOpen) return false;
        const panelEl = document.querySelector('[data-chat-panel]') as HTMLElement | null;
        if (!panelEl) return false;
        const rect = panelEl.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }, [isChatOpen]);

    const getNodePrimaryAsset = useCallback((node?: AppNode | null): ChatIncomingAsset | null => {
        if (!node) return null;
        const imageUrl = node.data.image
            || (Array.isArray(node.data.images) ? node.data.images[0] : undefined)
            || node.data.croppedFrame
            || node.data.selectedFrame
            || node.data.firstLastFrameData?.firstFrame
            || node.data.firstLastFrameData?.lastFrame
            || (Array.isArray(node.data.referenceImages) ? node.data.referenceImages[0] : undefined);
        if (imageUrl) {
            return {
                id: `chat-asset-${node.id}-${Date.now()}`,
                type: 'image',
                url: imageUrl,
                name: node.title || '图片素材',
            };
        }
        const videoUrl = node.data.videoUri || (Array.isArray(node.data.videoUris) ? node.data.videoUris[0] : undefined);
        if (videoUrl) {
            return {
                id: `chat-asset-${node.id}-${Date.now()}`,
                type: 'video',
                url: videoUrl,
                name: node.title || '视频素材',
            };
        }
        return null;
    }, []);

    const handleFitView = useCallback(() => {
        if (nodes.length === 0) {
            setPan({ x: 0, y: 0 });
            setScale(1);
            return;
        }

        const padding = 100;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        nodes.forEach(n => {
            const h = n.height || getApproxNodeHeight(n);
            const w = n.width || 420;
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + w > maxX) maxX = n.x + w;
            if (n.y + h > maxY) maxY = n.y + h;
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        const scaleX = (window.innerWidth - padding * 2) / contentW;
        const scaleY = (window.innerHeight - padding * 2) / contentH;
        let newScale = Math.min(scaleX, scaleY, 1);
        newScale = Math.max(0.2, newScale);

        const contentCenterX = minX + contentW / 2;
        const contentCenterY = minY + contentH / 2;

        const newPanX = (window.innerWidth / 2) - (contentCenterX * newScale);
        const newPanY = (window.innerHeight / 2) - (contentCenterY * newScale);

        setPan({ x: newPanX, y: newPanY });
        setScale(newScale);
    }, [nodes]);

    // 使用 useCanvasHistory 的 saveSnapshot
    const saveHistory = useCallback(() => {
        try {
            saveSnapshot({
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                groups: groupsRef.current,
            });
        } catch (e) {
            console.warn("History save failed:", e);
        }
    }, [saveSnapshot, nodesRef, connectionsRef, groupsRef]);

    // 使用 useCanvasHistory 的 undo 和 useCanvasData 的 loadData
    const undo = useCallback(() => {
        const prev = undoHistory();
        if (prev) loadData(prev);
    }, [undoHistory, loadData]);

    // redo 功能 (可选)
    const redo = useCallback(() => {
        const next = redoHistory();
        if (next) loadData(next);
    }, [redoHistory, loadData]);

    const deleteNodes = useCallback((ids: string[]) => {
        if (ids.length === 0) return;
        saveHistory();
        const now = Date.now();
        setDeletedItems((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
                next[id] = now;
            });
            return next;
        });
        setConnections(p => {
            const removed = p.filter(c => ids.includes(c.from) || ids.includes(c.to));
            if (removed.length > 0) {
                setDeletedItems((prev) => {
                    const next = { ...prev };
                    removed.forEach((conn) => {
                        next[connectionKey(conn)] = now;
                    });
                    return next;
                });
            }
            const nextConnections = p.filter(c => !ids.includes(c.from) && !ids.includes(c.to));
            connectionsRef.current = nextConnections;
            return nextConnections;
        });
        setNodes(p => {
            const nextNodes = p
                .filter(n => !ids.includes(n.id))
                .map(n => {
                    const nextInputs = n.inputs.filter(i => !ids.includes(i));
                    if (nextInputs.length === n.inputs.length) return n;
                    return { ...n, inputs: nextInputs, modifiedAt: now };
                });
            nodesRef.current = nextNodes;
            return nextNodes;
        });
        selectNodes([]);
    }, [saveHistory, selectNodes, nodesRef, connectionsRef, setDeletedItems]);

    const addNode = useCallback((type: NodeType, x?: number, y?: number, initialData?: any, modelId?: string) => {
        // IMAGE_EDITOR type removed - use ImageEditOverlay on existing images instead

        try { saveHistory(); } catch (e) { }

        // 读取用户上次使用的配置
        const savedConfig = loadNodeConfig(type);

        // 确定音频节点的默认模式和模型
        const defaultAudioMode = initialData?.audioMode || savedConfig.audioMode || 'music';
        const defaultAudioModel = defaultAudioMode === 'music' ? 'suno-v4' : 'speech-2.6-hd';

        // 判断两个模型是否属于同一厂商
        const isSameProvider = (model1?: string, model2?: string): boolean => {
            if (!model1 || !model2) return false;
            // 根据模型名前缀判断厂商
            const getProvider = (m: string) => {
                if (m.startsWith('veo')) return 'veo';
                if (m.startsWith('vidu')) return 'vidu';
                if (m.startsWith('doubao-seed')) return 'doubao';
                if (m.startsWith('nano-banana')) return 'nano';
                if (m.startsWith('gemini')) return 'gemini';
                if (m.startsWith('suno')) return 'suno';
                if (m.startsWith('speech')) return 'minimax';
                return m.split('-')[0]; // fallback: 使用第一段作为厂商标识
            };
            return getProvider(model1) === getProvider(model2);
        };

        // 如果传入了 modelId 且与保存的配置属于同一厂商，使用保存的配置；否则使用传入的 modelId
        const resolveModel = () => {
            if (modelId && savedConfig.model && isSameProvider(modelId, savedConfig.model)) {
                return savedConfig.model; // 同厂商，使用保存的配置
            }
            if (modelId) return modelId; // 不同厂商或无保存配置，使用传入的 modelId
            if (savedConfig.model) return savedConfig.model; // 无传入 modelId，使用保存的配置
            if (type === NodeType.VIDEO_GENERATOR) return 'veo3.1';
            if (type === NodeType.AUDIO_GENERATOR) return 'suno-v4';
            if (type === NodeType.VOICE_GENERATOR) return 'speech-2.6-hd';
            if (type.includes('IMAGE')) return 'doubao-seedream-5-0-260128';
            return 'gemini-2.5-flash';
        };

        // 默认比例：优先使用保存的配置
        const defaultAspectRatio = savedConfig.aspectRatio ||
            ((type === NodeType.IMAGE_GENERATOR || type === NodeType.VIDEO_GENERATOR || type === NodeType.VIDEO_FACTORY || type === NodeType.MULTI_FRAME_VIDEO) ? '16:9' : undefined);

        const defaults: any = {
            model: resolveModel(),
            generationMode: savedConfig.generationMode || (type === NodeType.VIDEO_GENERATOR ? 'DEFAULT' : undefined),
            videoModeOverride: savedConfig.videoModeOverride,
            aspectRatio: defaultAspectRatio,
            resolution: savedConfig.resolution,
            duration: savedConfig.duration,
            videoConfig: savedConfig.videoConfig,
            imageCount: savedConfig.imageCount,
            // 音频节点默认配置（合并保存的配置）
            musicConfig: type === NodeType.AUDIO_GENERATOR ? { mv: 'chirp-v4', tags: 'pop, catchy', ...savedConfig.musicConfig } : undefined,
            voiceConfig: type === NodeType.VOICE_GENERATOR ? { voiceId: 'female-shaonv', speed: 1, emotion: 'calm', ...savedConfig.voiceConfig } : undefined,
            // 多帧视频节点默认配置（合并保存的配置）
            multiFrameData: type === NodeType.MULTI_FRAME_VIDEO ? {
                frames: [],
                viduModel: savedConfig.multiFrameData?.viduModel || 'viduq2-turbo',
                viduResolution: savedConfig.multiFrameData?.viduResolution || '720p'
            } : undefined,
            ...initialData
        };

        const typeMap: Record<string, string> = {
            [NodeType.PROMPT_INPUT]: '文本',
            [NodeType.IMAGE_ASSET]: '插入图片',
            [NodeType.VIDEO_ASSET]: '插入视频',
            [NodeType.IMAGE_GENERATOR]: '图片生成',
            [NodeType.VIDEO_GENERATOR]: '视频生成',
            [NodeType.VIDEO_FACTORY]: '视频工厂',
            [NodeType.AUDIO_GENERATOR]: '灵感音乐',
            [NodeType.VOICE_GENERATOR]: '语音合成',
            [NodeType.IMAGE_EDITOR]: '图像编辑',
            [NodeType.MULTI_FRAME_VIDEO]: '智能多帧'
        };

        const baseX = x !== undefined ? x : (-pan.x + window.innerWidth / 2) / scale - 210;
        const baseY = y !== undefined ? y : (-pan.y + window.innerHeight / 2) / scale - 180;
        const safeBaseX = isNaN(baseX) ? 100 : baseX;
        const safeBaseY = isNaN(baseY) ? 100 : baseY;

        // 计算节点预估高度并找到不重叠的位置
        const nodeWidth = 420;
        const [rw, rh] = (defaults.aspectRatio || '16:9').split(':').map(Number);
        const nodeHeight = type === NodeType.AUDIO_GENERATOR || type === NodeType.VOICE_GENERATOR ? Math.round(nodeWidth * 9 / 16) : // 16:9 比例
            type === NodeType.PROMPT_INPUT ? Math.round(nodeWidth * 16 / 9) : // 9:16 比例
                type === NodeType.MULTI_FRAME_VIDEO ? Math.round(nodeWidth * 9 / 16) : // 16:9 比例
                    (nodeWidth * rh / rw);

        const { x: finalX, y: finalY } = findNonOverlappingPosition(safeBaseX, safeBaseY, nodeWidth, nodeHeight, nodesRef.current, 'down');

        const newNode: AppNode = {
            id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type,
            x: finalX,
            y: finalY,
            width: nodeWidth,
            title: typeMap[type] || '未命名节点',
            status: NodeStatus.IDLE,
            data: defaults,
            inputs: [],
            modifiedAt: Date.now(),
        };

        setNodes(prev => [...prev, newNode]);
    }, [pan, scale, saveHistory]);

    const handleAssetGenerated = useCallback((type: 'image' | 'video' | 'audio', src: string, title: string) => {
        setAssetHistory(h => {
            const exists = h.find(a => a.src === src);
            if (exists) return h;
            return [{ id: `a-${Date.now()}`, type, src, title, timestamp: Date.now() }, ...h];
        });
    }, []);

    // 检查画布坐标是否在空白区域（不与任何节点重叠）
    const isPointOnEmptyCanvas = useCallback((canvasX: number, canvasY: number): boolean => {
        // 检查点是否在任何现有节点内部
        for (const node of nodesRef.current) {
            const bounds = getNodeBounds(node);
            if (
                canvasX >= bounds.x &&
                canvasX <= bounds.x + bounds.width &&
                canvasY >= bounds.y &&
                canvasY <= bounds.y + bounds.height
            ) {
                return false; // 在节点上
            }
        }
        // 检查是否在任何分组标题栏上（可选）
        for (const group of groupsRef.current) {
            if (
                canvasX >= group.x &&
                canvasX <= group.x + group.width &&
                canvasY >= group.y &&
                canvasY <= group.y + 40 // 标题栏高度约40px
            ) {
                return false;
            }
        }
        return true; // 空白区域
    }, []);

    // 处理组图拖拽状态变化，用于显示放置预览
    const handleGridDragStateChange = useCallback((state: { isDragging: boolean; type?: 'image' | 'video'; src?: string; screenX?: number; screenY?: number } | null) => {
        if (!state || !state.isDragging || !state.type || !state.src || !state.screenX || !state.screenY) {
            setGridDragDropPreview(null);
            return;
        }

        // 将屏幕坐标转换为画布坐标
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const canvasX = (state.screenX - rect.left - pan.x) / scale;
        const canvasY = (state.screenY - rect.top - pan.y) / scale;

        // 仅当鼠标在空白画布区域时才显示预览
        if (!isPointOnEmptyCanvas(canvasX, canvasY)) {
            setGridDragDropPreview(null);
            return;
        }

        setGridDragDropPreview({
            type: state.type,
            src: state.src,
            canvasX: canvasX - 210, // 节点宽度一半
            canvasY: canvasY - 120, // 大致居中
        });
    }, [pan, scale, isPointOnEmptyCanvas]);

    // 从组图宫格拖拽某个结果到画布，创建独立副本节点
    const handleDragResultToCanvas = useCallback((sourceNodeId: string, type: 'image' | 'video', src: string, screenX: number, screenY: number) => {
        // 清除预览
        setGridDragDropPreview(null);

        // 将屏幕坐标转换为画布坐标
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const canvasX = (screenX - rect.left - pan.x) / scale;
        const canvasY = (screenY - rect.top - pan.y) / scale;

        // 仅当鼠标在空白画布区域时才创建节点
        if (!isPointOnEmptyCanvas(canvasX, canvasY)) {
            return; // 不在空白区域，不创建
        }

        // 获取源节点信息以复制相关配置
        const sourceNode = nodesRef.current.find(n => n.id === sourceNodeId);
        if (!sourceNode) return;

        saveHistory();

        // 计算节点尺寸
        const nodeWidth = 420;
        const ratio = sourceNode.data.aspectRatio || '16:9';
        const [rw, rh] = ratio.split(':').map(Number);
        const nodeHeight = (nodeWidth * rh) / rw;

        // 寻找不重叠的位置
        const { x: finalX, y: finalY } = findNonOverlappingPosition(
            canvasX - nodeWidth / 2,
            canvasY - nodeHeight / 2,
            nodeWidth,
            nodeHeight,
            nodesRef.current,
            'right'
        );

        // 创建新节点（复制源节点的部分配置）
        const newNode: AppNode = {
            id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: type === 'image' ? NodeType.IMAGE_GENERATOR : NodeType.VIDEO_GENERATOR,
            x: finalX,
            y: finalY,
            width: nodeWidth,
            title: type === 'image' ? '图片副本' : '视频副本',
            status: NodeStatus.SUCCESS,
            data: {
                model: sourceNode.data.model,
                aspectRatio: sourceNode.data.aspectRatio,
                prompt: sourceNode.data.prompt,
                ...(type === 'image'
                    ? { image: src, images: [src] }
                    : { videoUri: src, videoUris: [src] }
                ),
            },
            inputs: [],
            modifiedAt: Date.now(),
        };

        setNodes(prev => [...prev, newNode]);
        // 选中新创建的节点
        selectNodes([newNode.id]);
    }, [pan, scale, saveHistory, isPointOnEmptyCanvas, selectNodes]);

    // 批量上传素材：创建多个纵向排布的节点并用分组框包裹
    const handleBatchUpload = useCallback(async (files: File[], type: 'image' | 'video', sourceNodeId: string) => {
        if (files.length === 0) return;

        saveHistory();

        const sourceNode = nodesRef.current.find(n => n.id === sourceNodeId);
        if (!sourceNode) return;

        // 节点参数
        const nodeWidth = 420;
        const defaultHeight = type === 'image' ? 315 : 236; // 4:3 for images, 16:9 for videos
        const verticalGap = 24; // 节点间垂直间距
        const groupPadding = 30; // 分组框内边距

        // 计算起始位置（在源节点右侧）
        const startX = sourceNode.x + (sourceNode.width || nodeWidth) + 80;
        let currentY = sourceNode.y;

        const newNodes: AppNode[] = [];
        const newNodeIds: string[] = [];

        // 处理每个文件
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const nodeId = `n-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;
            newNodeIds.push(nodeId);

            if (type === 'image') {
                const [meta, url] = await Promise.all([
                    getImageMetaFromFile(file),
                    uploadImageFile(file),
                ]);

                const nodeHeight = Math.round(nodeWidth * meta.height / meta.width);
                const newNode: AppNode = {
                    id: nodeId,
                    type: NodeType.IMAGE_ASSET,
                    x: startX,
                    y: currentY,
                    width: nodeWidth,
                    height: nodeHeight,
                    title: file.name.replace(/\.[^/.]+$/, '').slice(0, 20) || `图片 ${i + 1}`,
                    status: NodeStatus.SUCCESS,
                    data: { image: url, aspectRatio: meta.aspectRatio },
                    inputs: [],
                    modifiedAt: Date.now(),
                };
                newNodes.push(newNode);
                currentY += nodeHeight + verticalGap;
            } else {
                const [meta, url] = await Promise.all([
                    getVideoMetaFromFile(file).catch(() => null),
                    uploadVideoFile(file),
                ]);

                const height = meta ? Math.round(nodeWidth * meta.height / meta.width) : defaultHeight;
                const newNode: AppNode = {
                    id: nodeId,
                    type: NodeType.VIDEO_ASSET,
                    x: startX,
                    y: currentY,
                    width: nodeWidth,
                    height,
                    title: file.name.replace(/\.[^/.]+$/, '').slice(0, 20) || `视频 ${i + 1}`,
                    status: NodeStatus.SUCCESS,
                    data: { videoUri: url, ...(meta?.aspectRatio ? { aspectRatio: meta.aspectRatio } : {}) },
                    inputs: [],
                    modifiedAt: Date.now(),
                };
                newNodes.push(newNode);
                currentY += height + verticalGap;
            }
        }

        // 计算分组框尺寸
        const totalHeight = currentY - sourceNode.y - verticalGap; // 减去最后一个间距
        const groupWidth = nodeWidth + groupPadding * 2;
        const groupHeight = totalHeight + groupPadding * 2;

        // 创建分组框
        const newGroup: Group = {
            id: `g-${Date.now()}`,
            title: type === 'image' ? '批量图片' : '批量视频',
            x: startX - groupPadding,
            y: sourceNode.y - groupPadding,
            width: groupWidth,
            height: groupHeight,
            nodeIds: newNodeIds,
            modifiedAt: Date.now(),
        };

        // 更新状态
        setNodes(prev => [...prev, ...newNodes]);
        setGroups(prev => [...prev, newGroup]);

        // 删除原始空节点（如果它是空的）
        const originalNode = nodesRef.current.find(n => n.id === sourceNodeId);
        if (originalNode && !originalNode.data.image && !originalNode.data.videoUri) {
            setDeletedItems((prev) => ({ ...prev, [sourceNodeId]: Date.now() }));
            setNodes(prev => prev.filter(n => n.id !== sourceNodeId));
        }

        // 选中新创建的分组
        setSelection({ nodeIds: [], groupIds: [newGroup.id] });
    }, [getImageMetaFromFile, getVideoMetaFromFile, saveHistory, setSelection, setDeletedItems, uploadImageFile, uploadVideoFile]);

    // scaleRef, panRef 已迁移到 useViewport

    const handleWheel = useCallback((e: WheelEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-chat-panel], [data-config-panel], textarea, input, select, [contenteditable="true"]')) {
            // 鼠标悬停在输入/面板区域时，优先滚动该区域，不触发画布缩放/平移
            return;
        }
        e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const currentViewport = liveViewportRef.current;
        const currentScale = currentViewport.scale;
        const currentPan = currentViewport.pan;

        if (e.ctrlKey || e.metaKey) {
            // 以鼠标位置为中心缩放
            // 鼠标在容器中的位置
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 鼠标在画布坐标系中的位置
            const canvasX = (mouseX - currentPan.x) / currentScale;
            const canvasY = (mouseY - currentPan.y) / currentScale;

            // 计算新的缩放值（指数曲线，触控板与鼠标滚轮更平滑）
            const zoomFactor = Math.exp(-e.deltaY * 0.002);
            const newScale = Math.min(Math.max(0.1, currentScale * zoomFactor), 5);

            // 计算新的 pan 值，保持鼠标下的画布位置不变
            const newPanX = mouseX - canvasX * newScale;
            const newPanY = mouseY - canvasY * newScale;
            const nextPan = { x: newPanX, y: newPanY };
            liveViewportRef.current = { scale: newScale, pan: nextPan };
            applyViewportPreview(newScale, nextPan);
            scheduleViewportCommit();
        } else {
            // 平移画布
            let deltaX = e.deltaX;
            let deltaY = e.deltaY;
            // Windows 上 Shift+滚轮常只上报垂直 delta，需要转换为水平移动
            if (e.shiftKey) {
                if (deltaX === 0 && deltaY !== 0) {
                    deltaX = deltaY;
                }
                deltaY = 0;
            }
            const nextPan = { x: currentPan.x - deltaX, y: currentPan.y - deltaY };
            liveViewportRef.current = { scale: currentScale, pan: nextPan };
            applyViewportPreview(currentScale, nextPan);
            scheduleViewportCommit();
        }
    }, [applyViewportPreview, scheduleViewportCommit]);

    // 使用原生事件监听器以支持 preventDefault（非 passive 模式）
    useEffect(() => {
        const el = canvasContainerRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (viewportCommitTimerRef.current) {
            window.clearTimeout(viewportCommitTimerRef.current);
            viewportCommitTimerRef.current = null;
            flushViewportState(true);
        }
        if (contextMenu) setContextMenu(null);
        selectGroups([]);
        // 点击画布空白区域时，让当前聚焦的输入框失去焦点
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

        // Space + Left Click = Canvas Drag (like middle mouse or shift+click)
        if (e.button === 0 && isSpacePressed) {
            e.preventDefault();
            panningLastPosRef.current = { x: e.clientX, y: e.clientY };
            startPanning({ x: e.clientX, y: e.clientY });
            return;
        }

        if (e.button === 0 && !e.shiftKey) {
            if (e.detail > 1) { e.preventDefault(); return; }
            e.preventDefault(); // 防止拖拽选中文本
            selectNodes([]);
            // Use canvas-relative coordinates for selection rect
            const canvasPos = getCanvasMousePos(e.clientX, e.clientY);
            startSelecting(canvasPos.x, canvasPos.y);
        }
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            e.preventDefault();
            panningLastPosRef.current = { x: e.clientX, y: e.clientY };
            startPanning({ x: e.clientX, y: e.clientY });
        }
    };

    const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
        const { clientX, clientY } = e;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            // Get canvas-relative coordinates (accounting for Navbar offset)
            let canvasX = clientX, canvasY = clientY;
            if (canvasContainerRef.current) {
                const rect = canvasContainerRef.current.getBoundingClientRect();
                canvasX = clientX - rect.left;
                canvasY = clientY - rect.top;
            }

            const activeConnection = getConnectionStartRef();
            if (activeConnection) {
                const didUpdatePreview = updatePreviewConnectionPath(activeConnection, canvasX, canvasY);
                if (!didUpdatePreview) {
                    setMousePos({ x: canvasX, y: canvasY });
                }
            }

            if (isSelecting) {
                updateSelecting(canvasX, canvasY);
                if (!activeConnection) return;
            }

            if (dragGroupRef.current) {
                const { id, startX, startY, mouseStartX, mouseStartY, childNodes } = dragGroupRef.current;
                const dx = (clientX - mouseStartX) / scale;
                const dy = (clientY - mouseStartY) / scale;
                if (dragGroupRef.current.currentDx === dx && dragGroupRef.current.currentDy === dy) return;

                dragGroupRef.current.currentDx = dx;
                dragGroupRef.current.currentDy = dy;

                const groupEl = groupRefsMap.current.get(id);
                if (groupEl) {
                    groupEl.style.left = `${startX + dx}px`;
                    groupEl.style.top = `${startY + dy}px`;
                }

                if (childNodes.length > 0) {
                    const affectedNodeIds: string[] = [];
                    childNodes.forEach((child) => {
                        const newX = child.startX + dx;
                        const newY = child.startY + dy;
                        const childEl = nodeRefsMap.current.get(child.id);
                        if (childEl) {
                            childEl.style.transform = `translate(${newX}px, ${newY}px)`;
                        }
                        dragPositionsRef.current.set(child.id, { x: newX, y: newY });
                        affectedNodeIds.push(child.id);
                    });
                    updateConnectionPaths(affectedNodeIds, false);
                }
                return;
            }

            // Panning: 直接 DOM 预览，避免每帧 setState 导致卡顿
            const panningLastPos = panningLastPosRef.current;
            if (panningLastPos) {
                const dx = clientX - panningLastPos.x;
                const dy = clientY - panningLastPos.y;
                if (dx !== 0 || dy !== 0) {
                    const currentViewport = liveViewportRef.current;
                    const nextPan = { x: currentViewport.pan.x + dx, y: currentViewport.pan.y + dy };
                    liveViewportRef.current = { scale: currentViewport.scale, pan: nextPan };
                    applyViewportPreview(currentViewport.scale, nextPan);
                }
                panningLastPosRef.current = { x: clientX, y: clientY };
                return;
            }

            if (draggingNodeId && dragNodeRef.current && dragNodeRef.current.id === draggingNodeId) {
                const { startX, startY, mouseStartX, mouseStartY, nodeWidth, nodeHeight, otherSelectedNodes, selectedGroups, draggingIdSet, shouldSnap, isCopyDrag } = dragNodeRef.current;
                // 复制拖拽时显示复制光标
                document.body.style.cursor = isCopyDrag ? 'copy' : '';
                let dx = (clientX - mouseStartX) / scale;
                let dy = (clientY - mouseStartY) / scale;
                let proposedX = startX + dx;
                let proposedY = startY + dy;

                // 多选/分组联动拖拽禁用吸附，避免果冻感
                if (shouldSnap) {
                    const SNAP = SNAP_THRESHOLD / scale;
                    const myL = proposedX; const myC = proposedX + nodeWidth / 2; const myR = proposedX + nodeWidth;
                    const myT = proposedY; const myM = proposedY + nodeHeight / 2; const myB = proposedY + nodeHeight;
                    let snappedX = false; let snappedY = false;

                    nodesRef.current.forEach(other => {
                        if (draggingIdSet?.has(other.id)) return; // 跳过所有正在拖动的节点
                        const otherBounds = getNodeBounds(other);
                        if (!snappedX) {
                            if (Math.abs(myL - otherBounds.x) < SNAP) { proposedX = otherBounds.x; snappedX = true; }
                            else if (Math.abs(myL - otherBounds.r) < SNAP) { proposedX = otherBounds.r; snappedX = true; }
                            else if (Math.abs(myR - otherBounds.x) < SNAP) { proposedX = otherBounds.x - nodeWidth; snappedX = true; }
                            else if (Math.abs(myR - otherBounds.r) < SNAP) { proposedX = otherBounds.r - nodeWidth; snappedX = true; }
                            else if (Math.abs(myC - (otherBounds.x + otherBounds.width / 2)) < SNAP) { proposedX = (otherBounds.x + otherBounds.width / 2) - nodeWidth / 2; snappedX = true; }
                        }
                        if (!snappedY) {
                            if (Math.abs(myT - otherBounds.y) < SNAP) { proposedY = otherBounds.y; snappedY = true; }
                            else if (Math.abs(myT - otherBounds.b) < SNAP) { proposedY = otherBounds.b; snappedY = true; }
                            else if (Math.abs(myB - otherBounds.y) < SNAP) { proposedY = otherBounds.y - nodeHeight; snappedY = true; }
                            else if (Math.abs(myB - otherBounds.b) < SNAP) { proposedY = otherBounds.b - nodeHeight; snappedY = true; }
                            else if (Math.abs(myM - (otherBounds.y + otherBounds.height / 2)) < SNAP) { proposedY = (otherBounds.y + otherBounds.height / 2) - nodeHeight / 2; snappedY = true; }
                        }
                    })
                }

                // 计算实际位移（考虑吸附后的调整）
                const actualDx = proposedX - startX;
                const actualDy = proposedY - startY;
                if (dragNodeRef.current.currentX === proposedX && dragNodeRef.current.currentY === proposedY) return;

                // 保存当前拖拽位置到 ref（用于 mouseUp 时提交）
                dragNodeRef.current.currentX = proposedX;
                dragNodeRef.current.currentY = proposedY;
                dragNodeRef.current.currentDx = actualDx;
                dragNodeRef.current.currentDy = actualDy;

                if (isCopyDrag) {
                    // 复制拖拽：原节点不动，显示半透明预览
                    const mainEl = nodeRefsMap.current.get(draggingNodeId);
                    if (mainEl) {
                        mainEl.style.opacity = '0.5'; // 原节点变半透明
                    }
                    // 其他选中节点也变半透明
                    otherSelectedNodes?.forEach(on => {
                        const el = nodeRefsMap.current.get(on.id);
                        if (el) el.style.opacity = '0.5';
                    });
                    // 更新复制预览位置
                    const previewNodes = [{ x: proposedX, y: proposedY, width: nodeWidth, height: nodeHeight }];
                    otherSelectedNodes?.forEach(on => {
                        const originalNode = nodeByIdRef.current.get(on.id) || nodesRef.current.find(n => n.id === on.id);
                        if (originalNode) {
                            previewNodes.push({
                                x: on.startX + actualDx,
                                y: on.startY + actualDy,
                                width: originalNode.width || 420,
                                height: originalNode.height || 320
                            });
                        }
                    });
                    setCopyDragPreview({ nodes: previewNodes });
                } else {
                    // 普通拖拽：直接操作 DOM，绕过 React 渲染 ⚡
                    const mainEl = nodeRefsMap.current.get(draggingNodeId);
                    if (mainEl) {
                        mainEl.style.transform = `translate(${proposedX}px, ${proposedY}px)`;
                    }
                    // 更新拖拽位置 ref（用于连接线计算）
                    dragPositionsRef.current.set(draggingNodeId, { x: proposedX, y: proposedY });
                    const affectedNodeIds = new Set<string>([draggingNodeId]);

                    // 同步移动其他选中节点
                    otherSelectedNodes?.forEach(on => {
                        const newX = on.startX + actualDx;
                        const newY = on.startY + actualDy;
                        const el = nodeRefsMap.current.get(on.id);
                        if (el) {
                            el.style.transform = `translate(${newX}px, ${newY}px)`;
                        }
                        dragPositionsRef.current.set(on.id, { x: newX, y: newY });
                        affectedNodeIds.add(on.id);
                    });

                    // 同步移动选中的分组及其内部节点 ⚡
                    selectedGroups?.forEach(sg => {
                        const newX = sg.startX + actualDx;
                        const newY = sg.startY + actualDy;
                        const groupEl = groupRefsMap.current.get(sg.id);
                        if (groupEl) {
                            groupEl.style.transition = 'none';
                            groupEl.style.left = `${newX}px`;
                            groupEl.style.top = `${newY}px`;
                        }
                        // 移动分组内部的节点
                        sg.childNodes?.forEach(cn => {
                            const childX = cn.startX + actualDx;
                            const childY = cn.startY + actualDy;
                            const childEl = nodeRefsMap.current.get(cn.id);
                            if (childEl) {
                                childEl.style.transform = `translate(${childX}px, ${childY}px)`;
                            }
                            dragPositionsRef.current.set(cn.id, { x: childX, y: childY });
                            affectedNodeIds.add(cn.id);
                        });
                    });

                    // 更新相关连接线 ⚡
                    if (affectedNodeIds.size > 0) {
                        updateConnectionPaths(Array.from(affectedNodeIds), false);
                    }
                }
                const draggingSourceNode = nodeByIdRef.current.get(draggingNodeId) || nodesRef.current.find(n => n.id === draggingNodeId);
                const draggingAsset = getNodePrimaryAsset(draggingSourceNode);
                if (draggingAsset && !isCopyDrag && isChatOpen) {
                    const overChatPanel = isPointInsideChatPanel(clientX, clientY);
                    setChatDragState(prev => (prev.active === true && prev.over === overChatPanel
                        ? prev
                        : { active: true, over: overChatPanel }
                    ));
                } else {
                    setChatDragState(prev => (prev.active || prev.over ? { active: false, over: false } : prev));
                }
                // 不调用 setNodes()！

            } else if (draggingNodeId) {
                // fallback: 没有 dragNodeRef 时的处理（不应该发生）
                const dx = (clientX - lastMousePos.x) / scale;
                const dy = (clientY - lastMousePos.y) / scale;
                const el = nodeRefsMap.current.get(draggingNodeId);
                const node = nodeByIdRef.current.get(draggingNodeId) || nodesRef.current.find(n => n.id === draggingNodeId);
                if (el && node) {
                    el.style.transform = `translate(${node.x + dx}px, ${node.y + dy}px)`;
                }
                setLastMousePos({ x: clientX, y: clientY });
            }

            if (resizingNodeId && resizeContextRef.current) {
                const { initialWidth, initialHeight, startX } = resizeContextRef.current;
                const dx = (clientX - startX) / scale;
                // 等比例缩放：根据宽度变化计算新尺寸
                const aspectRatio = initialWidth / initialHeight;
                const newWidth = Math.max(280, initialWidth + dx);
                const newHeight = newWidth / aspectRatio;
                // 确保高度不会太小
                if (newHeight >= 160) {
                    resizeContextRef.current.currentWidth = newWidth;
                    resizeContextRef.current.currentHeight = newHeight;
                    liveNodeSizeRef.current.set(resizingNodeId, { width: newWidth, height: newHeight });

                    const nodeEl = nodeRefsMap.current.get(resizingNodeId);
                    if (nodeEl) {
                        nodeEl.style.width = `${newWidth}px`;
                        nodeEl.style.height = `${newHeight}px`;
                    }

                    updateConnectionPaths([resizingNodeId], false);
                }
            }

            // 分组调整尺寸 - 直接操作 DOM ⚡
            if (resizeGroupRef.current && resizingGroupId) {
                const { id, initialWidth, initialHeight, startX, startY } = resizeGroupRef.current;
                const dx = (clientX - startX) / scale;
                const dy = (clientY - startY) / scale;
                const newWidth = Math.max(200, initialWidth + dx);
                const newHeight = Math.max(150, initialHeight + dy);
                // 直接操作 DOM，不触发 React 渲染
                const groupEl = groupRefsMap.current.get(id);
                if (groupEl) {
                    groupEl.style.width = `${newWidth}px`;
                    groupEl.style.height = `${newHeight}px`;
                }
                // 缓存当前尺寸用于 mouseup 提交
                resizeGroupRef.current.currentWidth = newWidth;
                resizeGroupRef.current.currentHeight = newHeight;
            }
        });
    }, [applyViewportPreview, isSelecting, updateSelecting, getConnectionStartRef, draggingNodeId, resizingNodeId, resizingGroupId, scale, lastMousePos, getNodePrimaryAsset, isChatOpen, isPointInsideChatPanel]);

    const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
        let skipHistoryCommit = false;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (panningLastPosRef.current) {
            panningLastPosRef.current = null;
            if (viewportCommitTimerRef.current) {
                window.clearTimeout(viewportCommitTimerRef.current);
                viewportCommitTimerRef.current = null;
            }
            flushViewportState(true);
        }
        if (selectionRect) {
            const x = Math.min(selectionRect.startX, selectionRect.currentX);
            const y = Math.min(selectionRect.startY, selectionRect.currentY);
            const w = Math.abs(selectionRect.currentX - selectionRect.startX);
            const h = Math.abs(selectionRect.currentY - selectionRect.startY);
            if (w > 10 && h > 10) {
                const rect = { x: (x - pan.x) / scale, y: (y - pan.y) / scale, w: w / scale, h: h / scale };

                // 检查是否有分组被框选（框选区域与分组有足够重叠）
                const selectedGroups = groupsRef.current.filter(g => {
                    const overlapX = Math.max(0, Math.min(rect.x + rect.w, g.x + g.width) - Math.max(rect.x, g.x));
                    const overlapY = Math.max(0, Math.min(rect.y + rect.h, g.y + g.height) - Math.max(rect.y, g.y));
                    const overlapArea = overlapX * overlapY;
                    const groupArea = g.width * g.height;
                    return overlapArea > groupArea * 0.3;
                });

                // 选中框选区域内的节点（以节点中心判断）
                // 排除已在选中分组内的节点（避免重复移动）
                const enclosedNodes = nodesRef.current.filter(n => {
                    const cx = n.x + (n.width || 420) / 2;
                    const cy = n.y + 160;
                    const inRect = cx > rect.x && cx < rect.x + rect.w && cy > rect.y && cy < rect.y + rect.h;
                    if (!inRect) return false;
                    // 检查节点是否在选中的分组内
                    const inSelectedGroup = selectedGroups.some(g =>
                        cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height
                    );
                    return !inSelectedGroup; // 只选中不在分组内的节点
                });

                // 同时设置选中的分组和节点
                setSelection({
                    groupIds: selectedGroups.map(g => g.id),
                    nodeIds: enclosedNodes.map(n => n.id)
                });
            }
            finishInteraction();
        }
        setChatDragState(prev => (prev.active || prev.over ? { active: false, over: false } : prev));

        // 拖拽结束：一次性提交节点位置到 state ⚡
        if (draggingNodeId && dragNodeRef.current && dragNodeRef.current.currentX !== undefined) {
            const { currentX, currentY, currentDx, currentDy, otherSelectedNodes, isCopyDrag, startX, startY } = dragNodeRef.current;
            const draggingSourceNode = nodeByIdRef.current.get(draggingNodeId) || nodesRef.current.find(n => n.id === draggingNodeId);
            const draggingAsset = getNodePrimaryAsset(draggingSourceNode);
            const droppedIntoChat = Boolean(!isCopyDrag && draggingAsset && isPointInsideChatPanel(e.clientX, e.clientY));

            // 检测是否实际发生了移动（防止点击时复制）
            const hasMoved = Math.abs((currentX || startX) - startX) > 5 || Math.abs((currentY || startY) - startY) > 5;

            // 恢复节点透明度（复制拖拽时会变半透明）
            const mainEl = nodeRefsMap.current.get(draggingNodeId);
            if (mainEl) mainEl.style.opacity = '';
            otherSelectedNodes?.forEach(on => {
                const el = nodeRefsMap.current.get(on.id);
                if (el) el.style.opacity = '';
            });
            // 清除复制预览
            setCopyDragPreview(null);

            if (droppedIntoChat && draggingAsset) {
                skipHistoryCommit = true;
                setChatIncomingAsset({
                    id: `chat-drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    type: draggingAsset.type,
                    url: draggingAsset.url,
                    name: draggingAsset.name,
                });
                const revertedNodeIds = new Set<string>();

                // 回滚主节点到拖拽起始位
                if (mainEl) {
                    mainEl.style.transform = `translate(${startX}px, ${startY}px)`;
                }
                dragPositionsRef.current.set(draggingNodeId, { x: startX, y: startY });
                revertedNodeIds.add(draggingNodeId);

                // 回滚其他选中节点到起始位
                otherSelectedNodes?.forEach(on => {
                    const el = nodeRefsMap.current.get(on.id);
                    if (el) {
                        el.style.transform = `translate(${on.startX}px, ${on.startY}px)`;
                    }
                    dragPositionsRef.current.set(on.id, { x: on.startX, y: on.startY });
                    revertedNodeIds.add(on.id);
                });

                // 回滚选中分组及其内部节点
                dragNodeRef.current?.selectedGroups?.forEach((sg) => {
                    const groupEl = groupRefsMap.current.get(sg.id);
                    if (groupEl) {
                        groupEl.style.left = `${sg.startX}px`;
                        groupEl.style.top = `${sg.startY}px`;
                    }
                    sg.childNodes?.forEach((child) => {
                        const childEl = nodeRefsMap.current.get(child.id);
                        if (childEl) {
                            childEl.style.transform = `translate(${child.startX}px, ${child.startY}px)`;
                        }
                        dragPositionsRef.current.set(child.id, { x: child.startX, y: child.startY });
                        revertedNodeIds.add(child.id);
                    });
                });
                if (revertedNodeIds.size > 0) {
                    updateConnectionPaths(Array.from(revertedNodeIds));
                }
            } else if (isCopyDrag && hasMoved) {
                // Cmd/Ctrl + 拖拽：复制节点到新位置
                const nodesToCopy = [draggingNodeId, ...(otherSelectedNodes?.map(n => n.id) || [])];
                const newNodes: AppNode[] = [];
                const idMapping: Record<string, string> = {}; // 旧ID -> 新ID 映射

                nodesToCopy.forEach((nodeId, index) => {
                    const originalNode = nodeByIdRef.current.get(nodeId) || nodesRef.current.find(n => n.id === nodeId);
                    if (!originalNode) return;

                    const newId = `n-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
                    idMapping[nodeId] = newId;

                    // 计算新位置
                    let newX: number, newY: number;
                    if (nodeId === draggingNodeId) {
                        newX = currentX!;
                        newY = currentY!;
                    } else {
                        const otherNode = otherSelectedNodes?.find(on => on.id === nodeId);
                        if (otherNode && currentDx !== undefined && currentDy !== undefined) {
                            newX = otherNode.startX + currentDx;
                            newY = otherNode.startY + currentDy;
                        } else {
                            newX = originalNode.x;
                            newY = originalNode.y;
                        }
                    }

                    // 继承外部上游连接（不在复制集合中的上游节点）
                    const externalInputs = originalNode.inputs.filter(inputId => !nodesToCopy.includes(inputId));

                    newNodes.push({
                        ...originalNode,
                        id: newId,
                        x: newX,
                        y: newY,
                        title: `${originalNode.title} 副本`,
                        inputs: externalInputs, // 继承外部上游连接
                        modifiedAt: Date.now(),
                    });
                });

                // 创建外部上游连接的 Connection 对象
                const newConnections: Connection[] = [];
                newNodes.forEach(newNode => {
                    newNode.inputs.forEach(inputId => {
                        newConnections.push(createConnection(inputId, newNode.id));
                    });
                });

                setNodes(prev => [...prev, ...newNodes]);
                if (newConnections.length > 0) {
                    setConnections(prev => [...prev, ...newConnections]);
                }
                // 选中新复制的节点
                selectNodes(newNodes.map(n => n.id));
            } else {
                // 普通拖拽：移动节点（包括选中分组的内部节点）
                const selectedGroupsToMove = dragNodeRef.current?.selectedGroups || [];
                const allChildNodes = selectedGroupsToMove.flatMap(sg => sg.childNodes || []);
                const otherSelectedNodeMap = new Map(
                    (otherSelectedNodes || []).map(item => [item.id, item] as const)
                );
                const childNodeStartMap = new Map(allChildNodes.map(item => [item.id, item] as const));
                const selectedGroupStartMap = new Map(
                    selectedGroupsToMove.map(item => [item.id, item] as const)
                );

                setNodes(prev => prev.map(n => {
                    if (n.id === draggingNodeId) {
                        return { ...n, x: currentX!, y: currentY!, modifiedAt: Date.now() };
                    }
                    const otherNode = otherSelectedNodeMap.get(n.id);
                    if (otherNode && currentDx !== undefined && currentDy !== undefined) {
                        return { ...n, x: otherNode.startX + currentDx, y: otherNode.startY + currentDy, modifiedAt: Date.now() };
                    }
                    // 分组内部节点
                    const childNode = childNodeStartMap.get(n.id);
                    if (childNode && currentDx !== undefined && currentDy !== undefined) {
                        return { ...n, x: childNode.startX + currentDx, y: childNode.startY + currentDy, modifiedAt: Date.now() };
                    }
                    return n;
                }));

                // 同步提交选中分组的位置变更
                if (selectedGroupsToMove.length > 0 && currentDx !== undefined && currentDy !== undefined) {
                    setGroups(prev => prev.map(g => {
                        const sg = selectedGroupStartMap.get(g.id);
                        if (sg) {
                            return { ...g, x: sg.startX + currentDx, y: sg.startY + currentDy, modifiedAt: Date.now() };
                        }
                        return g;
                    }));
                }
            }
        }

        if (dragNodeRef.current?.selectedGroups?.length) {
            dragNodeRef.current.selectedGroups.forEach((sg) => {
                const groupEl = groupRefsMap.current.get(sg.id);
                if (groupEl) {
                    groupEl.style.transition = '';
                }
            });
        }

        if (dragGroupRef.current) {
            const { id, startX, startY, currentDx, currentDy, childNodes } = dragGroupRef.current;
            if (currentDx !== undefined && currentDy !== undefined && (Math.abs(currentDx) > 0 || Math.abs(currentDy) > 0)) {
                setGroups(prev => prev.map(g =>
                    g.id === id ? { ...g, x: startX + currentDx, y: startY + currentDy, modifiedAt: Date.now() } : g
                ));

                if (childNodes.length > 0) {
                    const childStartMap = new Map(childNodes.map(child => [child.id, child] as const));
                    setNodes(prev => prev.map(n => {
                        const child = childStartMap.get(n.id);
                        if (!child) return n;
                        return { ...n, x: child.startX + currentDx, y: child.startY + currentDy, modifiedAt: Date.now() };
                    }));
                }
            }
        }

        if (resizingNodeId && resizeContextRef.current) {
            const { nodeId, currentWidth, currentHeight } = resizeContextRef.current;
            if (nodeId === resizingNodeId && currentWidth !== undefined && currentHeight !== undefined) {
                setNodes(prev => prev.map(n =>
                    n.id === resizingNodeId ? { ...n, width: currentWidth, height: currentHeight, modifiedAt: Date.now() } : n
                ));
            }
        }

        // 清除拖拽位置缓存
        dragPositionsRef.current.clear();
        if (resizingNodeId) {
            liveNodeSizeRef.current.delete(resizingNodeId);
            const resizedNodeEl = nodeRefsMap.current.get(resizingNodeId);
            if (resizedNodeEl) {
                resizedNodeEl.style.width = '';
                resizedNodeEl.style.height = '';
            }
            updateConnectionPaths([resizingNodeId]);
        }

        if (!skipHistoryCommit && (draggingNodeId || resizingNodeId || dragGroupRef.current || resizeGroupRef.current)) saveHistory();

        // 分组调整尺寸完成后，提交最终尺寸到 state 并更新 nodeIds
        if (resizeGroupRef.current) {
            const { id: groupId, currentWidth, currentHeight } = resizeGroupRef.current;
            setGroups(prev => prev.map(g => {
                if (g.id !== groupId) return g;
                const newWidth = currentWidth ?? g.width;
                const newHeight = currentHeight ?? g.height;
                // 找出在分组范围内的节点（以节点中心判断）
                const enclosedNodeIds = nodesRef.current.filter(n => {
                    const b = getNodeBounds(n);
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    return cx > g.x && cx < g.x + newWidth && cy > g.y && cy < g.y + newHeight;
                }).map(n => n.id);
                return { ...g, width: newWidth, height: newHeight, nodeIds: enclosedNodeIds, modifiedAt: Date.now() };
            }));
        }

        // 检查是否从节点输出端口开始拖拽并释放到空白区域
        // 统一弹出 output-action，菜单内部再根据节点内容决定展示“后续操作”或“创建下游节点”
        const connStart = getConnectionStartRef();
        if (connStart && connStart.portType === 'output' && connStart.id !== 'smart-sequence-dock') {
            const canvasX = (e.clientX - pan.x) / scale;
            const canvasY = (e.clientY - pan.y) / scale;

            if (connStart.id === MULTI_SELECTION_DOCK_ID) {
                const sourceNodeIds = Array.from(new Set(multiSelectionDockNodeIdsRef.current))
                    .filter(nodeId => nodesRef.current.some(n => n.id === nodeId));
                if (sourceNodeIds.length > 0) {
                    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: MULTI_SELECTION_DOCK_ID });
                    setContextMenuTarget({
                        type: 'output-action',
                        sourceNodeId: sourceNodeIds[0],
                        sourceNodeIds,
                        canvasX,
                        canvasY
                    });
                }
            } else {
                const sourceNode = nodesRef.current.find(n => n.id === connStart.id);
                if (sourceNode) {
                    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: connStart.id });
                    setContextMenuTarget({ type: 'output-action', sourceNodeId: connStart.id, canvasX, canvasY });
                }
            }
        }

        // 检查是否从生成节点/提示词节点的输入端口开始拖拽并释放到空白区域
        // 如果是，弹出上游节点选择框（素材/描述）
        if (connStart && connStart.portType === 'input') {
            const targetNode = nodesRef.current.find(n => n.id === connStart.id);
            // 对生成节点（图像/视频/多帧视频）和提示词节点生效
            if (targetNode && (
                targetNode.type === NodeType.IMAGE_GENERATOR ||
                targetNode.type === NodeType.VIDEO_GENERATOR ||
                targetNode.type === NodeType.VIDEO_FACTORY ||
                targetNode.type === NodeType.MULTI_FRAME_VIDEO ||
                targetNode.type === NodeType.PROMPT_INPUT
            )) {
                const canvasX = (e.clientX - pan.x) / scale;
                const canvasY = (e.clientY - pan.y) / scale;
                setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: connStart.id });
                setContextMenuTarget({ type: 'input-action', targetNodeId: connStart.id, canvasX, canvasY });
            }
        }

        // 清除复制光标
        document.body.style.cursor = '';
        previewPathDRef.current = '';
        // 重置所有交互状态
        setDraggingNodeId(null); setDraggingNodeParentGroupId(null); setDraggingGroup(null); setResizingGroupId(null); setActiveGroupNodeIds([]); setResizingNodeId(null);
        finishInteraction(); // 重置 mode 为 idle (包括 panning, connectionStart, selectionRect)
        dragNodeRef.current = null; resizeContextRef.current = null; dragGroupRef.current = null; resizeGroupRef.current = null;
    }, [selectionRect, finishInteraction, flushViewportState, getConnectionStartRef, pan, scale, saveHistory, draggingNodeId, resizingNodeId, resizingGroupId, getNodePrimaryAsset, isPointInsideChatPanel, updateConnectionPaths]);

    useEffect(() => { window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp); return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); }; }, [handleGlobalMouseMove, handleGlobalMouseUp]);

    const autoFitNodeToMedia = useCallback(async (nodeId: string, src: string, mediaType: 'image' | 'video') => {
        if (!src) return;
        try {
            const dims = mediaType === 'video'
                ? await getVideoDimensions(src)
                : await getImageDimensions(src);
            if (!dims?.width || !dims?.height) return;
            const aspectRatio = getAspectRatioLabel(dims.width, dims.height, mediaType === 'video');
            setNodes(prev => {
                const next = prev.map(n => {
                    if (n.id !== nodeId) return n;
                    const nodeWidth = n.width || 420;
                    const newHeight = Math.round(nodeWidth * dims.height / dims.width);
                    return {
                        ...n,
                        height: newHeight,
                        data: { ...n.data, aspectRatio },
                        modifiedAt: Date.now(),
                    };
                });
                nodesRef.current = next;
                return next;
            });
        } catch (e) {
            // ignore media metadata errors
        }
    }, [nodesRef, setNodes]);

    const handleNodeUpdate = useCallback((id: string, data: any, size?: any, title?: string) => {
        setNodes(prev => {
            const newNodes = prev.map(n => {
                if (n.id === id) {
                    const hasExplicitErrorField = !!data
                        && typeof data === 'object'
                        && Object.prototype.hasOwnProperty.call(data, 'error');
                    // 深度合并 firstLastFrameData（避免快速连续上传时丢失数据）
                    const mergedData = { ...n.data, ...data };
                    const hasSuccessfulMediaUpdate =
                        (typeof data?.image === 'string' && data.image.length > 0) ||
                        (typeof data?.videoUri === 'string' && data.videoUri.length > 0) ||
                        (typeof data?.audioUri === 'string' && data.audioUri.length > 0) ||
                        (Array.isArray(data?.images) && data.images.some((item: unknown) => typeof item === 'string' && item.length > 0)) ||
                        (Array.isArray(data?.videoUris) && data.videoUris.some((item: unknown) => typeof item === 'string' && item.length > 0)) ||
                        (Array.isArray(data?.audioUris) && data.audioUris.some((item: unknown) => typeof item === 'string' && item.length > 0));
                    if (!hasExplicitErrorField && hasSuccessfulMediaUpdate) {
                        mergedData.error = undefined;
                    }
                    if ((data?.image || data?.videoUri) && data?.mediaOrigin === undefined) {
                        mergedData.mediaOrigin = 'generated';
                    }
                    if (data.firstLastFrameData) {
                        mergedData.firstLastFrameData = {
                            ...n.data.firstLastFrameData,
                            ...data.firstLastFrameData
                        };
                    }
                    const updated = { ...n, data: mergedData, title: title || n.title, modifiedAt: Date.now() };
                    // 清除错误时自动恢复节点状态
                    if (hasExplicitErrorField && data.error === undefined && n.status === NodeStatus.ERROR) {
                        updated.status = NodeStatus.IDLE;
                    }
                    if (size) { if (size.width) updated.width = size.width; if (size.height) updated.height = size.height; }

                    if (data.image) handleAssetGenerated('image', data.image, updated.title);
                    if (data.videoUri) handleAssetGenerated('video', data.videoUri, updated.title);
                    if (data.audioUri) handleAssetGenerated('audio', data.audioUri, updated.title);

                    // 保存用户配置（仅保存配置相关字段，不保存结果数据）
                    const configFields = REMEMBERED_FIELDS[n.type];
                    if (configFields) {
                        const hasConfigUpdate = configFields.some(field => data[field] !== undefined);
                        if (hasConfigUpdate) {
                            saveNodeConfig(n.type, mergedData);
                        }
                    }

                    return updated;
                }
                return n;
            });
            // 同步更新 ref，确保后续操作能立即获取最新数据
            nodesRef.current = newNodes;
            return newNodes;
        });
        const imageSrc = data?.image || (Array.isArray(data?.images) ? data.images[0] : null);
        const videoSrc = data?.videoUri || (Array.isArray(data?.videoUris) ? data.videoUris[0] : null);
        if (imageSrc) {
            autoFitNodeToMedia(id, imageSrc, 'image');
        } else if (videoSrc) {
            autoFitNodeToMedia(id, videoSrc, 'video');
        }
        // 移除了自动推送，只在离开时推送
    }, [autoFitNodeToMedia, handleAssetGenerated]);

    const editedDataUrlMigrationDoneRef = useRef(false);
    useEffect(() => {
        if (!isLoaded) return;
        if (editedDataUrlMigrationDoneRef.current) return;

        editedDataUrlMigrationDoneRef.current = true;
        let cancelled = false;
        const isDataUrl = (value: unknown): value is string => typeof value === 'string' && value.startsWith('data:');
        const uploadIfDataUrl = async (value?: string) => {
            if (!isDataUrl(value)) return value;
            return uploadImageDataUrl(value);
        };

        const migrateEditedDataUrls = async () => {
            const snapshot = [...nodesRef.current];
            for (const node of snapshot) {
                if (cancelled) return;
                const data = node.data || {};
                const hasDataUrl =
                    isDataUrl(data.image) ||
                    isDataUrl(data.originalImage) ||
                    isDataUrl(data.editOriginImage) ||
                    isDataUrl(data.canvasData) ||
                    (Array.isArray(data.images) && data.images.some((img) => isDataUrl(img)));

                if (!hasDataUrl) continue;

                try {
                    handleNodeUpdate(node.id, { uploading: true });

                    const [image, originalImage, editOriginImage, canvasData] = await Promise.all([
                        uploadIfDataUrl(data.image),
                        uploadIfDataUrl(data.originalImage),
                        uploadIfDataUrl(data.editOriginImage),
                        uploadIfDataUrl(data.canvasData),
                    ]);

                    const images = Array.isArray(data.images)
                        ? await Promise.all(
                            data.images.map((img) => uploadIfDataUrl(img))
                        )
                        : data.images;

                    if (cancelled) return;
                    handleNodeUpdate(node.id, {
                        image,
                        images,
                        originalImage,
                        editOriginImage,
                        canvasData,
                        uploading: false,
                    });
                } catch (error) {
                    console.warn('[Studio Sync] Data URL migration failed:', error);
                    handleNodeUpdate(node.id, { uploading: false });
                }
            }
        };

        migrateEditedDataUrls();
        return () => {
            cancelled = true;
        };
    }, [isLoaded, handleNodeUpdate, uploadImageDataUrl]);

    const reconcileNodesWithTaskLogs = useCallback(() => {
        const logs = loadTaskLogs();
        if (!logs || logs.length === 0) return;

        const latestByNode = new Map<string, typeof logs[number]>();

        for (const log of logs) {
            if (log.type !== 'video') continue;

            let targetNodeId = log.nodeId;
            if (!targetNodeId && log.externalId) {
                const match = nodesRef.current.find(
                    (n) => n.data?.videoMetadata?.taskId === log.externalId
                );
                targetNodeId = match?.id;
            }
            if (!targetNodeId) continue;

            const existing = latestByNode.get(targetNodeId);
            const logUpdatedAt = Math.max(log.createdAt || 0, log.startedAt || 0, log.completedAt || 0);
            const existingUpdatedAt = existing
                ? Math.max(existing.createdAt || 0, existing.startedAt || 0, existing.completedAt || 0)
                : -1;
            if (!existing || logUpdatedAt > existingUpdatedAt) {
                latestByNode.set(targetNodeId, log);
            }
        }

        if (latestByNode.size === 0) return;

        latestByNode.forEach((log, nodeId) => {
            const node = nodesRef.current.find(n => n.id === nodeId);
            if (!node) return;
            const logUpdatedAt = Math.max(log.createdAt || 0, log.startedAt || 0, log.completedAt || 0);
            if (node.status === NodeStatus.WORKING && logUpdatedAt <= (node.modifiedAt || 0)) {
                // 节点重新开始生成后，忽略更旧的历史日志，避免回退到过期终态。
                return;
            }

            if (log.status === 'success') {
                const videoUrl = log.outputUrls?.videos?.[0];
                if (videoUrl && node.data.videoUri !== videoUrl) {
                    handleNodeUpdate(nodeId, {
                        videoUri: videoUrl,
                        videoMetadata: { taskId: log.externalId || node.data.videoMetadata?.taskId },
                        videoUris: [videoUrl],
                        model: typeof log.parameters?.model === 'string' ? log.parameters.model : node.data.model,
                        aspectRatio: typeof log.parameters?.aspectRatio === 'string' ? log.parameters.aspectRatio : node.data.aspectRatio,
                    });
                }
                setNodes(prev => prev.map(n =>
                    n.id === nodeId ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n
                ));
            } else if (log.status === 'failed') {
                const errorText = log.error || log.output || '任务失败';
                if (errorText && node.data.error !== errorText) {
                    handleNodeUpdate(nodeId, { error: errorText });
                }
                setNodes(prev => prev.map(n =>
                    n.id === nodeId ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n
                ));
            } else {
                // 最新日志仍在运行/排队/已取消时，不覆盖节点终态。
                return;
            }
        });
    }, [handleNodeUpdate]);

    // 任务日志同步 - 必须在 reconcileNodesWithTaskLogs 定义之后
    useEffect(() => {
        if (!isLoaded) return;
        reconcileNodesWithTaskLogs();
    }, [isLoaded, currentCanvasId, reconcileNodesWithTaskLogs]);

    useEffect(() => {
        if (!isLoaded) return;
        const unsubscribe = onTaskLogUpdate(() => {
            reconcileNodesWithTaskLogs();
        });
        return () => unsubscribe();
    }, [isLoaded, reconcileNodesWithTaskLogs]);

    const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        const inputEl = e.target;
        const file = inputEl.files?.[0];
        const targetId = replacementTargetRef.current;
        if (file && targetId) {
            try {
                handleNodeUpdate(targetId, { uploading: true });
                const url = type === 'image'
                    ? await uploadImageFile(file)
                    : await uploadVideoFile(file);
                if (type === 'image') handleNodeUpdate(targetId, { image: url, uploading: false, mediaOrigin: 'uploaded' });
                else handleNodeUpdate(targetId, { videoUri: url, uploading: false, mediaOrigin: 'uploaded' });
            } catch (error) {
                console.warn('[Studio] Replace upload failed:', error);
                handleNodeUpdate(targetId, { uploading: false });
            }
        }
        inputEl.value = '';
        setContextMenu(null);
        replacementTargetRef.current = null;
    };

    const handleNodeAction = useCallback(async (id: string, promptOverride?: string) => {
        const runningActions = nodeActionLocksRef.current;
        if (runningActions.has(id)) {
            console.warn(`[NodeAction] Skip duplicate trigger for node ${id}`);
            return;
        }

        const node = nodesRef.current.find(n => n.id === id);
        if (!node) return;
        if (node.status === NodeStatus.WORKING) return;

        runningActions.add(id);

        try {
            handleNodeUpdate(id, { error: undefined });
            setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.WORKING, modifiedAt: Date.now() } : n));

            const inputs = node.inputs.map(i => nodesRef.current.find(n => n.id === i)).filter(Boolean) as AppNode[];
            const latestSubjects = subjectsRef.current;

            const upstreamTexts = inputs.map(n => {
                if (n?.type === NodeType.PROMPT_INPUT) return n.data.prompt;
                return null;
            }).filter(t => t && t.trim().length > 0) as string[];

            let prompt = promptOverride || node.data.prompt || '';
            if (upstreamTexts.length > 0) {
                const combinedUpstream = upstreamTexts.join('\n');
                prompt = prompt ? `${combinedUpstream}\n${prompt}` : combinedUpstream;
            }

            // 文本节点：纯文本载体，不执行 AI 操作
            if (node.type === NodeType.PROMPT_INPUT) {
                return;
            }

            if (node.type === NodeType.IMAGE_GENERATOR) {
                const inputImages: string[] = [];
                // 收集上游连接节点的图片
                console.log(`[ImageGen] Node ${node.id} has ${inputs.length} upstream inputs:`, inputs.map(n => ({ id: n?.id, type: n?.type, hasImage: !!n?.data.image })));
                inputs.forEach(n => { if (n?.data.image) inputImages.push(n.data.image); });

                console.log(`[ImageGen] Collected ${inputImages.length} input images for model ${node.data.model}`);

                try {
                    // 获取组图数量（默认1张）
                    const imageCount = node.data.imageCount || 1;
                    // 验证模型是否为图片生成模型
                    let usedModel = node.data.model || 'doubao-seedream-5-0-260128';
                    const isValidImageModel = isSeedreamFamilyModel(usedModel) || usedModel.includes('nano-banana') || usedModel.includes('gemini');
                    if (!isValidImageModel) {
                        console.warn(`[ImageGen] Invalid model ${usedModel} for image generation, falling back to Seedream`);
                        usedModel = 'doubao-seedream-5-0-260128';
                    }
                    const autoResolvedModel = resolveSeedream3ModelForInputs(usedModel, inputImages);
                    if (autoResolvedModel !== usedModel) {
                        console.log(`[ImageGen] Auto switched Seedream 3.0 model: ${usedModel} -> ${autoResolvedModel}`);
                        usedModel = autoResolvedModel;
                    }
                    const imageModelConfig = getImageModelConfig(usedModel);
                    const usedAspectRatio = node.data.aspectRatio || imageModelConfig.defaultAspectRatio || '16:9';
                    const cleanedPrompt = cleanSubjectReferences(prompt, latestSubjects);
                    const res = await generateImageFromText(cleanedPrompt, usedModel, inputImages, { aspectRatio: usedAspectRatio, resolution: node.data.resolution, count: imageCount });

                    // 重新生成时追加到已有组图（而非替换），复用组图展示 UI
                    const existingImages = node.data.images || [];
                    const mergedImages = [...existingImages, ...res];
                    handleNodeUpdate(id, { image: res[0], images: mergedImages, imageCount, model: usedModel, aspectRatio: usedAspectRatio });

                    // 记录图像生成消耗
                    const imageProvider = isSeedreamFamilyModel(usedModel) ? 'seedream' : 'nano-banana';
                    recordImageConsumption({
                        provider: imageProvider,
                        model: usedModel,
                        imageCount: res.length,
                        resolution: node.data.resolution,
                            prompt: cleanedPrompt.slice(0, 100),
                        }).catch(err => console.warn('[Image] Failed to record consumption:', err));
                } catch (imgErr: any) {
                    throw imgErr; // 抛给外层 catch 处理
                }

            } else if (node.type === NodeType.VIDEO_GENERATOR) {
                // 产品期望：视频节点重新生成时始终覆盖当前节点，不自动创建右侧虚线新节点。
                const shouldCreateNewNode = false;
                const factoryNodeId: string | null = null;

                try {
                    const usedModel = node.data.model || 'veo3.1';
                    const usedAspectRatio = node.data.aspectRatio || '16:9';
                    const isViduModel = usedModel.startsWith('vidu');
                    const isStoryContinueMode = node.data.generationMode === 'CONTINUE' || node.data.generationMode === 'CUT';
                    const selectedSubjects = node.data.selectedSubjects || [];

                    // 主体能力仅在 Vidu 模型下启用
                    let processedPrompt = prompt;
                    let viduSubjects: { id: string; images: string[] }[] | undefined;

                    if (isViduModel && !isStoryContinueMode) {
                        const subjectRefs = parseSubjectReferences(prompt, latestSubjects);
                        if (subjectRefs.length > 0) {
                            console.log(`[VideoGen] Found ${subjectRefs.length} subject references for Vidu:`, subjectRefs.map(s => s.name));
                            viduSubjects = subjectRefs.map(ref => ({
                                id: ref.id,
                                images: ref.subject.images.map(img => getSubjectImageSrc(img)).slice(0, 3),
                            }));
                            processedPrompt = prompt;
                            console.log(`[VideoGen] Vidu subjects:`, viduSubjects.map(s => ({ id: s.id, imageCount: s.images.length })));
                        }

                        if ((!viduSubjects || viduSubjects.length === 0) && selectedSubjects.length > 0) {
                            const selectedViduSubjects = selectedSubjects
                                .map(s => ({
                                    id: s.id,
                                    images: (s.imageUrls || s.images || []).filter(Boolean),
                                }))
                                .filter(s => s.images.length > 0);
                            if (selectedViduSubjects.length > 0) {
                                viduSubjects = selectedViduSubjects;
                                console.log(`[VideoGen] Using selected subjects for Vidu:`, selectedViduSubjects.map(s => ({ id: s.id, imageCount: s.images.length })));
                            }
                        }
                    }

                    const strategyNode: AppNode = (!isViduModel && node.data.generationMode === 'SUBJECT_REF')
                        ? { ...node, data: { ...node.data, generationMode: 'DEFAULT', selectedSubjects: [] } }
                        : node;
                    const strategy = await getGenerationStrategy(strategyNode, inputs, processedPrompt);

                    const useViduSubjectMode = isViduModel && !!(viduSubjects && viduSubjects.length > 0);
                    const finalPrompt = useViduSubjectMode
                        ? ensureViduSubjectMentions(strategy.finalPrompt, (viduSubjects || []).map(s => s.id))
                        : strategy.finalPrompt;

                    if (useViduSubjectMode && viduSubjects) {
                        console.log(`[VideoGen] Using Vidu subject reference mode with upstream assets enabled`);
                        console.log(`[VideoGen] viduSubjects:`, JSON.stringify(viduSubjects.map(s => ({ id: s.id, imageCount: s.images.length }))));
                        const upstreamReferenceImages = (strategy.referenceImages && strategy.referenceImages.length > 0)
                            ? strategy.referenceImages
                            : (strategy.inputImageForGeneration ? [strategy.inputImageForGeneration] : []);
                        const usage = analyzeViduReferenceImages(
                            upstreamReferenceImages.filter(Boolean),
                            viduSubjects.map((s) => ({ subjectId: s.id, imageUrls: (s.images || []).filter(Boolean) }))
                        );
                        if (usage.totalUniqueImages > MAX_VIDU_REFERENCE_IMAGES) {
                            throw new Error(`参考图超过 ${MAX_VIDU_REFERENCE_IMAGES} 张上限（当前 ${usage.totalUniqueImages} 张），请减少上游参考图或 @主体 后重试`);
                        }
                    }

                    // 确定目标节点 ID（新节点或当前节点）
                    const targetNodeId = shouldCreateNewNode && factoryNodeId ? factoryNodeId : id;

                    const res = await generateVideoWithPolling(
                        targetNodeId,
                        finalPrompt,
                        usedModel,
                        {
                            aspectRatio: usedAspectRatio,
                            count: node.data.videoCount || 1,
                            generationMode: strategy.generationMode,
                            resolution: node.data.resolution,
                            duration: node.data.duration,  // 视频时长
                            videoConfig: node.data.videoConfig,  // 厂商扩展配置
                            viduSubjects,  // Vidu 主体参考
                        },
                        strategy.inputImageForGeneration,
                        strategy.videoInput,
                        strategy.referenceImages,
                        strategy.imageRoles
                    );

                    if (shouldCreateNewNode && factoryNodeId) {
                        // 有视频节点：更新新节点（保存实际使用的模型和比例）
                        if (res.isFallbackImage) {
                            handleNodeUpdate(factoryNodeId, {
                                image: res.uri,
                                videoUri: undefined,
                                model: usedModel,
                                aspectRatio: usedAspectRatio,
                                error: "Region restricted: Generated preview image instead."
                            });
                        } else {
                            handleNodeUpdate(factoryNodeId, { videoUri: res.uri, videoMetadata: res.videoMetadata, videoUris: res.uris, model: usedModel, aspectRatio: usedAspectRatio });
                        }
                        setNodes(p => p.map(n => n.id === factoryNodeId ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n));
                    } else {
                        // 空节点：结果直接在当前节点显示（保存实际使用的模型和比例）
                        if (res.isFallbackImage) {
                            handleNodeUpdate(id, {
                                image: res.uri,
                                videoUri: undefined,
                                model: usedModel,
                                aspectRatio: usedAspectRatio,
                                error: "Region restricted: Generated preview image instead."
                            });
                        } else {
                            // 重新生成时追加到已有组图（而非替换），复用组图展示 UI
                            const existingUris = node.data.videoUris || [];
                            const newUris = res.uris || [res.uri];
                            const mergedUris = [...existingUris, ...newUris];
                            handleNodeUpdate(id, { videoUri: res.uri, videoMetadata: res.videoMetadata, videoUris: mergedUris, model: usedModel, aspectRatio: usedAspectRatio });
                        }
                    }

                    // 记录视频生成消耗（非 Vidu 模型）
                    if (!res.isFallbackImage && !usedModel.includes('vidu')) {
                        const videoProvider = usedModel.includes('seedance') ? 'seedance' : 'veo';
                        recordVideoConsumption({
                            provider: videoProvider,
                            model: usedModel,
                            taskId: res.videoMetadata?.taskId || '',
                            durationSeconds: node.data.duration || 4,
                            resolution: (node.data.resolution as '480p' | '720p' | '1080p') || '720p',
                            prompt: finalPrompt?.slice(0, 100),
                        }).catch(err => console.warn('[Video] Failed to record consumption:', err));
                    }
                } catch (videoErr: any) {
                    if (shouldCreateNewNode && factoryNodeId) {
                        handleNodeUpdate(factoryNodeId, { error: videoErr.message });
                        setNodes(p => p.map(n => n.id === factoryNodeId ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n));
                    } else {
                        throw videoErr;
                    }
                }

            } else if (node.type === NodeType.VIDEO_FACTORY) {
                // 产品期望：视频工厂节点重新生成时覆盖当前节点，不新增分支节点。
                const shouldCreateNewNode = false;
                const newFactoryNodeId: string | null = null;

                try {
                    // 使用当前视频作为输入进行继续/编辑
                    let videoInput: string | undefined;
                    if (node.data.videoUri) {
                        videoInput = node.data.videoUri.startsWith('http')
                            ? await urlToBase64(node.data.videoUri)
                            : node.data.videoUri;
                    }

                    const usedModel = node.data.model || 'veo3.1';
                    const usedAspectRatio = node.data.aspectRatio || '16:9';
                    const isViduModel = usedModel.startsWith('vidu');
                    const isStoryContinueMode = node.data.generationMode === 'CONTINUE' || node.data.generationMode === 'CUT';
                    const selectedSubjects = node.data.selectedSubjects || [];

                    // 主体能力仅在 Vidu 模型下启用
                    let processedPrompt = prompt;
                    let viduSubjects: { id: string; images: string[] }[] | undefined;

                    if (isViduModel && !isStoryContinueMode) {
                        const subjectRefs = parseSubjectReferences(prompt, latestSubjects);
                        if (subjectRefs.length > 0) {
                            console.log(`[VideoFactory] Found ${subjectRefs.length} subject references for Vidu:`, subjectRefs.map(s => s.name));
                            viduSubjects = subjectRefs.map(ref => ({
                                id: ref.id,
                                images: ref.subject.images.map(img => getSubjectImageSrc(img)).slice(0, 3),
                            }));
                            processedPrompt = prompt;
                        }
                        if ((!viduSubjects || viduSubjects.length === 0) && selectedSubjects.length > 0) {
                            const selectedViduSubjects = selectedSubjects
                                .map(s => ({
                                    id: s.id,
                                    images: (s.imageUrls || s.images || []).filter(Boolean),
                                }))
                                .filter(s => s.images.length > 0);
                            if (selectedViduSubjects.length > 0) {
                                viduSubjects = selectedViduSubjects;
                                console.log(`[VideoFactory] Using selected subjects for Vidu:`, selectedViduSubjects.map(s => ({ id: s.id, imageCount: s.images.length })));
                            }
                        }
                    }

                    const strategyNode: AppNode = (!isViduModel && node.data.generationMode === 'SUBJECT_REF')
                        ? { ...node, data: { ...node.data, generationMode: 'DEFAULT', selectedSubjects: [] } }
                        : node;
                    const strategy = await getGenerationStrategy(strategyNode, inputs, processedPrompt);
                    const useViduSubjectMode = isViduModel && !!(viduSubjects && viduSubjects.length > 0);
                    const finalPrompt = useViduSubjectMode
                        ? ensureViduSubjectMentions(strategy.finalPrompt, (viduSubjects || []).map(s => s.id))
                        : strategy.finalPrompt;

                    if (useViduSubjectMode && viduSubjects) {
                        const upstreamReferenceImages = (strategy.referenceImages && strategy.referenceImages.length > 0)
                            ? strategy.referenceImages
                            : (strategy.inputImageForGeneration ? [strategy.inputImageForGeneration] : []);
                        const usage = analyzeViduReferenceImages(
                            upstreamReferenceImages.filter(Boolean),
                            viduSubjects.map((s) => ({ subjectId: s.id, imageUrls: (s.images || []).filter(Boolean) }))
                        );
                        if (usage.totalUniqueImages > MAX_VIDU_REFERENCE_IMAGES) {
                            throw new Error(`参考图超过 ${MAX_VIDU_REFERENCE_IMAGES} 张上限（当前 ${usage.totalUniqueImages} 张），请减少上游参考图或 @主体 后重试`);
                        }
                    }

                    // 确定目标节点 ID（新节点或当前节点）
                    const targetNodeId = shouldCreateNewNode && newFactoryNodeId ? newFactoryNodeId : id;

                    const res = await generateVideoWithPolling(
                        targetNodeId,
                        finalPrompt,
                        usedModel,
                        {
                            aspectRatio: usedAspectRatio,
                            count: node.data.videoCount || 1,
                            generationMode: strategy.generationMode,
                            resolution: node.data.resolution,
                            duration: node.data.duration,  // 视频时长
                            videoConfig: node.data.videoConfig,  // 厂商扩展配置
                            viduSubjects,  // Vidu 主体参考
                        },
                        strategy.inputImageForGeneration,
                        videoInput || strategy.videoInput,
                        strategy.referenceImages,
                        strategy.imageRoles
                    );

                    if (shouldCreateNewNode && newFactoryNodeId) {
                        // 有视频节点：更新新节点（保存实际使用的模型和比例）
                        if (res.isFallbackImage) {
                            handleNodeUpdate(newFactoryNodeId, {
                                image: res.uri,
                                videoUri: undefined,
                                model: usedModel,
                                aspectRatio: usedAspectRatio,
                                error: "Region restricted: Generated preview image instead."
                            });
                        } else {
                            handleNodeUpdate(newFactoryNodeId, { videoUri: res.uri, videoMetadata: res.videoMetadata, videoUris: res.uris, model: usedModel, aspectRatio: usedAspectRatio });
                        }
                        setNodes(p => p.map(n => n.id === newFactoryNodeId ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n));
                    } else {
                        // 空节点：结果直接在当前节点显示（保存实际使用的模型和比例）
                        if (res.isFallbackImage) {
                            handleNodeUpdate(id, {
                                image: res.uri,
                                videoUri: undefined,
                                model: usedModel,
                                aspectRatio: usedAspectRatio,
                                error: "Region restricted: Generated preview image instead."
                            });
                        } else {
                            // 重新生成时追加到已有组图（而非替换），复用组图展示 UI
                            const existingUris = node.data.videoUris || [];
                            const newUris = res.uris || [res.uri];
                            const mergedUris = [...existingUris, ...newUris];
                            handleNodeUpdate(id, { videoUri: res.uri, videoMetadata: res.videoMetadata, videoUris: mergedUris, model: usedModel, aspectRatio: usedAspectRatio });
                        }
                    }

                    // 记录视频生成消耗（非 Vidu 模型，Vidu 在 queryViduTask 中记录）
                    if (!res.isFallbackImage && !usedModel.includes('vidu')) {
                        const videoProvider = usedModel.includes('seedance') ? 'seedance' : 'veo';
                        recordVideoConsumption({
                            provider: videoProvider,
                            model: usedModel,
                            taskId: res.videoMetadata?.taskId || '',
                            durationSeconds: node.data.duration || 4,
                            resolution: (node.data.resolution as '480p' | '720p' | '1080p') || '720p',
                            prompt: finalPrompt?.slice(0, 100),
                        }).catch(err => console.warn('[VideoFactory] Failed to record consumption:', err));
                    }
                } catch (videoErr: any) {
                    if (shouldCreateNewNode && newFactoryNodeId) {
                        handleNodeUpdate(newFactoryNodeId, { error: videoErr.message });
                        setNodes(p => p.map(n => n.id === newFactoryNodeId ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n));
                    } else {
                        throw videoErr;
                    }
                }

            } else if (node.type === NodeType.AUDIO_GENERATOR || node.type === NodeType.VOICE_GENERATOR) {
                const isVoiceNode = node.type === NodeType.VOICE_GENERATOR;
                const audioMode = isVoiceNode ? 'voice' : (node.data.audioMode || 'music');

                if (audioMode === 'music') {
                    // Suno 音乐生成（自定义创作模式）
                    const musicConfig = node.data.musicConfig || {};
                    const songs = await createMusicCustom(
                        {
                            title: musicConfig.title || undefined,
                            tags: musicConfig.tags || undefined,
                            negative_tags: musicConfig.negativeTags || undefined,
                            prompt: prompt || undefined,
                            mv: musicConfig.mv || 'chirp-v4',
                            make_instrumental: musicConfig.instrumental || false,
                        },
                        (progressText, songData) => {
                            // 更新封面图（如果有）
                            if (songData?.[0]?.image_url) {
                                handleNodeUpdate(id, {
                                    musicConfig: {
                                        ...node.data.musicConfig,
                                        coverImage: songData[0].image_url
                                    }
                                });
                            }
                        }
                    );

                    // 获取第一首歌曲的音频 URL
                    const mainSong = songs[0];
                    if (!mainSong?.audio_url) {
                        throw new Error('未获取到音频文件');
                    }

                    // 保存结果
                    handleNodeUpdate(id, {
                        audioUri: mainSong.audio_url,
                        audioUris: songs.map(s => s.audio_url).filter(Boolean) as string[],
                        duration: mainSong.duration,
                        musicConfig: {
                            ...node.data.musicConfig,
                            title: mainSong.title,
                            coverImage: mainSong.image_url,
                            status: 'complete',
                        },
                    });

                    // 记录音频消耗
                    recordAudioConsumption({
                        provider: 'suno',
                        model: musicConfig.mv || 'chirp-v4',
                        songCount: songs.length,
                        prompt: prompt,
                    }).catch(err => console.warn('[Suno] Failed to record consumption:', err));

                } else {
                    // MiniMax 语音合成
                    const voiceConfig = node.data.voiceConfig || {};
                    const params: MinimaxGenerateParams = {
                        model: (node.data.model as any) || 'speech-2.6-hd',
                        text: prompt,
                        voice_setting: {
                            voice_id: voiceConfig.voiceId || 'female-shaonv',
                            speed: voiceConfig.speed || 1.0,
                            vol: voiceConfig.volume || 1.0,
                            pitch: voiceConfig.pitch || 0,
                            emotion: voiceConfig.emotion,
                        },
                    };

                    // 添加声音效果器（如果有）
                    if (voiceConfig.voiceModify) {
                        params.voice_modify = {
                            pitch: voiceConfig.voiceModify.pitch,
                            intensity: voiceConfig.voiceModify.intensity,
                            timbre: voiceConfig.voiceModify.timbre,
                            sound_effects: voiceConfig.voiceModify.soundEffect as any,
                        };
                    }

                    const audioUri = await synthesizeSpeech(params, (progressText) => {
                        handleNodeUpdate(id, { progress: progressText });
                    });

                    handleNodeUpdate(id, { audioUri });

                    // 记录语音合成消耗
                    recordAudioConsumption({
                        provider: 'minimax',
                        model: params.model || 'speech-2.6-hd',
                        characterCount: prompt.length,
                        prompt: prompt.slice(0, 100),
                    }).catch(err => console.warn('[MiniMax] Failed to record consumption:', err));
                }

            } else if (node.type === NodeType.IMAGE_EDITOR) {
                const inputImages: string[] = [];
                inputs.forEach(n => { if (n?.data.image) inputImages.push(n.data.image); });
                const img = node.data.image || inputImages[0];
                const res = await editImageWithText(img, prompt, node.data.model || 'gemini-2.5-flash-image');
                handleNodeUpdate(id, { image: res });

            } else if (node.type === NodeType.IMAGE_3D_CAMERA) {
                // 3D 运镜节点：使用 fal.ai 多角度模型重绘视角
                const inputImages: string[] = [];
                inputs.forEach(n => { if (n?.data.image) inputImages.push(n.data.image); });
                const inputImage = node.data.image || inputImages[0];

                if (!inputImage) {
                    throw new Error('请连接或上传图片');
                }

                // 获取相机参数
                const cameraParams = node.data.cameraParams || { azimuth: 0, elevation: 0, distance: 1.0 };
                const aspectRatio = node.data.aspectRatio || '1:1';

                // 将相机参数映射为 fal.ai 数值参数
                const { mapToFalParams, generateCameraPrompt } = await import('@/services/camera3d');
                const falParams = mapToFalParams(cameraParams);
                const displayPrompt = generateCameraPrompt(cameraParams);

                // 确保输入图片是 URL（base64 需要先上传到 COS）
                const { smartUpload, buildMediaPath } = await import('@/services/cosStorage');
                const imageUrl = await smartUpload(inputImage, { prefix: buildMediaPath('inputs') });

                // 计算结果节点尺寸（根据画面比例）
                const nodeWidth = 420;
                const [rw, rh] = aspectRatio.split(':').map(Number);
                const nodeHeight = (nodeWidth * rh) / rw;
                const newNodeId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                // 查找不重叠的位置
                const startX = node.x + (node.width || 420) + 80;
                const { x: newX, y: newY } = findNonOverlappingPosition(startX, node.y, nodeWidth, nodeHeight, nodesRef.current, 'right');

                // 创建加载中的结果节点
                const newNode: AppNode = {
                    id: newNodeId,
                    type: NodeType.IMAGE_GENERATOR,
                    x: newX,
                    y: newY,
                    width: nodeWidth,
                    height: nodeHeight,
                    title: '运镜结果',
                    status: NodeStatus.WORKING,
                    data: {
                        prompt: `${displayPrompt} (fal.ai: h=${falParams.horizontal_angle}° v=${falParams.vertical_angle}° z=${falParams.zoom})`,
                        model: 'fal-ai/qwen-image-edit-2511-multiple-angles',
                        aspectRatio: aspectRatio,
                        hideConfigPanel: true,
                    },
                    inputs: [id],
                    modifiedAt: Date.now(),
                };

                setNodes(prev => [...prev, newNode]);
                setConnections(prev => [...prev, createConnection(id, newNodeId)]);

                // 3D 运镜节点立即恢复空闲状态，保持可操作
                setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.IDLE, modifiedAt: Date.now() } : n));

                // 异步调用 fal.ai 3D 运镜 API（前端轮询模式，避免 Cloudflare 504）
                (async () => {
                    let hasSuccessfulImage = false;
                    try {
                        // 1. 提交任务（快速返回 task_id）
                        const submitRes = await fetch('/api/studio/camera3d', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                imageUrl,
                                horizontal_angle: falParams.horizontal_angle,
                                vertical_angle: falParams.vertical_angle,
                                zoom: falParams.zoom,
                            }),
                        });

                        if (!submitRes.ok) {
                            const errData = await submitRes.json().catch(() => ({}));
                            throw new Error(errData.error || `提交失败: ${submitRes.status}`);
                        }

                        const { taskId } = await submitRes.json();
                        if (!taskId) throw new Error('未返回任务ID');

                        // 2. 前端轮询任务状态 + COS 转存
                        // 任务完成后服务端自动触发后台 COS 转存（海外→国内）
                        // 前端继续短轮询直到 cosReady，确保最终图片走国内 CDN
                        const POLL_INTERVAL = 4000;
                        const COS_POLL_INTERVAL = 2000;
                        const MAX_POLLS = 45; // 最多 3 分钟
                        let taskDone = false;
                        let latestImageUrl: string | null = null;
                        for (let i = 0; i < MAX_POLLS; i++) {
                            await new Promise(r => setTimeout(r, taskDone ? COS_POLL_INTERVAL : POLL_INTERVAL));

                            const pollRes = await fetch(`/api/studio/camera3d?taskId=${taskId}`);
                            if (!pollRes.ok) {
                                const errData = await pollRes.json().catch(() => ({}));
                                const errorMessage = errData.error || `查询失败: ${pollRes.status}`;
                                if (hasSuccessfulImage) {
                                    console.warn(`[Camera3D] Poll non-OK after success, keep success state: ${errorMessage}`);
                                    continue;
                                }
                                throw new Error(errorMessage);
                            }

                            const pollData = await pollRes.json();

                            if (pollData.status === 'success' && pollData.image) {
                                hasSuccessfulImage = true;
                                latestImageUrl = pollData.image;
                                // 更新图片（首次为原始海外 URL，cosReady 后为国内 COS URL）
                                setNodes(prev => prev.map(n => n.id === newNodeId ? {
                                    ...n,
                                    status: NodeStatus.SUCCESS,
                                    data: {
                                        ...n.data,
                                        image: pollData.image,
                                        images: [pollData.image],
                                        error: undefined,
                                        progress: undefined,
                                    },
                                    modifiedAt: Date.now(),
                                } : n));

                                if (pollData.cosReady) {
                                    // COS 转存完成，停止轮询
                                    return;
                                }

                                // COS 还在转存中，继续轮询（用更短间隔）
                                taskDone = true;
                                continue;
                            }

                            if (pollData.status === 'failed') {
                                const errorMessage = pollData.error || '任务失败';
                                if (hasSuccessfulImage) {
                                    console.warn(`[Camera3D] Received failed status after success, keep success state: ${errorMessage}`);
                                    continue;
                                }
                                throw new Error(errorMessage);
                            }

                            // 更新进度提示
                            if (pollData.progress) {
                                setNodes(prev => prev.map(n => n.id === newNodeId ? {
                                    ...n,
                                    data: { ...n.data, progress: pollData.progress },
                                    modifiedAt: Date.now(),
                                } : n));
                            }
                        }

                        if (hasSuccessfulImage) {
                            console.warn('[Camera3D] Timeout waiting for COS URL, preserving successful result');
                            if (latestImageUrl) {
                                setNodes(prev => prev.map(n => n.id === newNodeId ? {
                                    ...n,
                                    status: NodeStatus.SUCCESS,
                                    data: {
                                        ...n.data,
                                        image: latestImageUrl,
                                        images: [latestImageUrl],
                                        error: undefined,
                                    },
                                    modifiedAt: Date.now(),
                                } : n));
                            }
                            return;
                        }

                        throw new Error('任务超时，请重试');
                    } catch (error: any) {
                        if (hasSuccessfulImage) {
                            console.warn('[Camera3D] Poll error happened after success, preserving successful result:', error?.message || error);
                            return;
                        }
                        setNodes(prev => prev.map(n => n.id === newNodeId ? {
                            ...n,
                            status: NodeStatus.ERROR,
                            data: { ...n.data, error: error.message || '生成失败' },
                            modifiedAt: Date.now(),
                        } : n));
                    }
                })();

                // 直接返回，不执行后续的状态更新逻辑
                return;

            } else if (node.type === NodeType.MULTI_FRAME_VIDEO) {
                // 智能多帧视频生成
                const frames = node.data.multiFrameData?.frames || [];
                if (frames.length < 2) {
                    throw new Error('智能多帧至少需要2张关键帧');
                }

                const viduConfig: ViduMultiFrameConfig = {
                    model: node.data.multiFrameData?.viduModel || 'viduq2-turbo',
                    resolution: node.data.multiFrameData?.viduResolution || '720p',
                };

                // 调用 Vidu API 生成视频
                const result = await generateViduMultiFrame(frames, viduConfig);

                if (!result.success) {
                    throw new Error(result.error || 'Vidu 生成失败');
                }

                // 如果返回 taskId，需要轮询查询结果
                if (result.taskId && !result.videoUrl) {
                    // 保存 taskId 到节点数据
                    handleNodeUpdate(id, {
                        multiFrameData: {
                            ...node.data.multiFrameData,
                            taskId: result.taskId,
                        },
                        progress: '正在生成视频...',
                    });

                    // 轮询查询任务状态
                    const maxAttempts = 120; // 最多查询 120 次（约 10 分钟）
                    let attempts = 0;
                    let finalResult = result;

                    // 计算视频总时长（用于消耗记录）
                    const totalDuration = frames.slice(0, -1).reduce((sum, frame) => {
                        return sum + (frame.transition?.duration || 5);
                    }, 0);

                    while (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 5000)); // 每 5 秒查询一次
                        attempts++;

                        const queryResult = await queryViduTask(result.taskId);

                        if (!queryResult.success) {
                            throw new Error(queryResult.error || '查询任务状态失败');
                        }

                        if (queryResult.videoUrl) {
                            finalResult = queryResult;
                            break;
                        }

                        if (queryResult.state === 'failed') {
                            throw new Error('视频生成失败');
                        }

                        // 更新进度
                        handleNodeUpdate(id, {
                            progress: `生成中... (${attempts * 5}s)`,
                        });
                    }

                    if (!finalResult.videoUrl) {
                        throw new Error('生成超时，请稍后重试');
                    }

                    // 生成完成，更新节点
                    handleNodeUpdate(id, {
                        videoUri: finalResult.videoUrl,
                        progress: undefined,
                    });
                } else if (result.videoUrl) {
                    // 直接返回视频 URL
                    handleNodeUpdate(id, {
                        videoUri: result.videoUrl,
                    });
                }
            }
            setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.SUCCESS, modifiedAt: Date.now() } : n));
        } catch (e: any) {
            handleNodeUpdate(id, { error: e.message });
            setNodes(p => p.map(n => n.id === id ? { ...n, status: NodeStatus.ERROR, modifiedAt: Date.now() } : n));
        } finally {
            runningActions.delete(id);
        }
    }, [handleNodeUpdate]);


    const saveGroupAsWorkflow = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        const nodesInGroup = nodes.filter(n => { const w = n.width || 420; const h = n.height || getApproxNodeHeight(n); const cx = n.x + w / 2; const cy = n.y + h / 2; return cx > group.x && cx < group.x + group.width && cy > group.y && cy < group.y + group.height; });
        const nodeIds = new Set(nodesInGroup.map(n => n.id));
        const connectionsInGroup = connections.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to));
        const thumbNode = nodesInGroup.find(n => n.data.image);
        const thumbnail = thumbNode ? thumbNode.data.image : '';
        const newWf: Workflow = { id: `wf-${Date.now()}`, title: group.title || '未命名工作流', thumbnail: thumbnail || '', nodes: structuredClone(nodesInGroup), connections: structuredClone(connectionsInGroup), groups: [structuredClone(group)] };
        setWorkflows(prev => [newWf, ...prev]);
    };

    const loadWorkflow = (id: string | null) => {
        if (!id) return;
        const wf = workflows.find(w => w.id === id);
        if (wf) {
            saveHistory();
            setNodes(structuredClone(wf.nodes));
            // Deduplicate connections when loading workflow
            const conns = structuredClone(wf.connections) as Connection[];
            const uniqueConns = conns.filter((conn, idx, arr) =>
                arr.findIndex(c => c.from === conn.from && c.to === conn.to) === idx
            );
            setConnections(uniqueConns);
            setGroups(structuredClone(wf.groups));
            setSelectedWorkflowId(id);
        }
    };

    const deleteWorkflow = (id: string) => { setWorkflows(prev => prev.filter(w => w.id !== id)); if (selectedWorkflowId === id) setSelectedWorkflowId(null); };
    const renameWorkflow = (id: string, newTitle: string) => { setWorkflows(prev => prev.map(w => w.id === id ? { ...w, title: newTitle } : w)); };

    // --- Canvas Management ---
    const saveCurrentCanvas = useCallback(() => {
        if (!currentCanvasId) return;
        const now = Date.now();
        setCanvases(prev => prev.map(c =>
            c.id === currentCanvasId
                ? {
                    ...c,
                    nodes: structuredClone(nodes),
                    connections: structuredClone(connections),
                    groups: structuredClone(groups),
                    pan: { ...pan },
                    scale: scale,
                    updatedAt: now
                }
                : c
        ));
    }, [currentCanvasId, nodes, connections, groups, pan, scale]);

    const createNewCanvas = useCallback(() => {
        // 先保存当前画布（含最新 nodes）
        const latestNodes = nodesRef.current;
        const latestConnections = connectionsRef.current;
        const latestGroups = groupsRef.current;

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

        // 构建包含当前画布最新内容的完整列表
        const updatedCanvases = currentCanvasId
            ? canvases.map(c =>
                c.id === currentCanvasId
                    ? { ...c, nodes: latestNodes, connections: latestConnections, groups: latestGroups, updatedAt: now }
                    : c
            )
            : canvases;
        const newCanvases = [newCanvas, ...updatedCanvases];

        // 直接写入 IndexedDB + 内存 cache，不依赖 persist effect 的各种 guard
        saveToStorage('canvases', newCanvases);
        saveToStorage('currentCanvasId', newCanvas.id);
        saveToStorage('nodes', []);
        saveToStorage('connections', []);
        saveToStorage('groups', []);
        const existingCache = getCache();
        setCache({
            assets: existingCache?.assets || [],
            workflows: existingCache?.workflows || [],
            subjects: existingCache?.subjects || [],
            nodeConfigs: existingCache?.nodeConfigs || {},
            taskLogs: existingCache?.taskLogs || [],
            deletedItems: existingCache?.deletedItems || {},
            canvases: newCanvases,
            currentCanvasId: newCanvas.id,
            nodes: [],
            connections: [],
            groups: [],
            timestamp: now,
        });

        // 重置 skipInitialPersistRef，后续 persist effect 也能正常写入
        skipInitialPersistRef.current = false;

        setCanvases(newCanvases);
        setCurrentCanvasId(newCanvas.id);
        setNodes([]);
        setConnections([]);
        setGroups([]);
        clearSelection();
        setPan({ x: 0, y: 0 });
        setScale(1);
    }, [currentCanvasId, canvases, nodesRef, connectionsRef, groupsRef, clearSelection]);

    const selectCanvas = useCallback((id: string) => {
        if (id === currentCanvasId) return;

        // 保存当前画布
        if (currentCanvasId) {
            saveCurrentCanvas();
        }

        // 加载选中的画布
        const canvas = canvases.find(c => c.id === id);
        if (canvas) {
            setNodes(structuredClone(canvas.nodes));
            setConnections(structuredClone(canvas.connections));
            setGroups(structuredClone(canvas.groups));
            setCurrentCanvasId(id);
            clearSelection();

            // 恢复视口状态
            if (canvas.pan && canvas.scale) {
                setPan(canvas.pan);
                setScale(canvas.scale);
            } else {
                // 没有保存的视口状态，重置并定位到内容
                if (canvas.nodes.length > 0) {
                    setTimeout(() => {
                        // 内联 fitToContent 逻辑
                        const loadedNodes = canvas.nodes;
                        if (loadedNodes.length === 0) return;
                        const padding = 80;
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        loadedNodes.forEach((n: AppNode) => {
                            const h = n.height || 360;
                            const w = n.width || 420;
                            if (n.x < minX) minX = n.x;
                            if (n.y < minY) minY = n.y;
                            if (n.x + w > maxX) maxX = n.x + w;
                            if (n.y + h > maxY) maxY = n.y + h;
                        });
                        const contentW = maxX - minX;
                        const contentH = maxY - minY;
                        const scaleX = (window.innerWidth - padding * 2) / contentW;
                        const scaleY = (window.innerHeight - padding * 2) / contentH;
                        let newScale = Math.min(scaleX, scaleY, 1);
                        newScale = Math.max(0.2, newScale);
                        const contentCenterX = minX + contentW / 2;
                        const contentCenterY = minY + contentH / 2;
                        const newPanX = (window.innerWidth / 2) - (contentCenterX * newScale);
                        const newPanY = (window.innerHeight / 2) - (contentCenterY * newScale);
                        setPan({ x: newPanX, y: newPanY });
                        setScale(newScale);
                    }, 100);
                } else {
                    setPan({ x: 0, y: 0 });
                    setScale(1);
                }
            }
        }
    }, [currentCanvasId, canvases, saveCurrentCanvas]);

    const deleteCanvas = useCallback((id: string) => {
        if (canvases.length <= 1) {
            // 如果只剩一个画布，不允许删除，而是清空它
            setNodes([]);
            setConnections([]);
            setGroups([]);
            setPan({ x: 0, y: 0 });
            setScale(1);
            return;
        }

        const now = Date.now();
        setDeletedItems(prev => ({
            ...prev,
            [id]: Math.max(prev[id] || 0, now),
        }));

        setCanvases(prev => {
            const newCanvases = prev.filter(c => c.id !== id);
            // 如果删除的是当前画布，切换到第一个
            if (id === currentCanvasId && newCanvases.length > 0) {
                const firstCanvas = newCanvases[0];
                setNodes(structuredClone(firstCanvas.nodes));
                setConnections(structuredClone(firstCanvas.connections));
                setGroups(structuredClone(firstCanvas.groups));
                setCurrentCanvasId(firstCanvas.id);
                // 恢复视口状态
                if (firstCanvas.pan && firstCanvas.scale) {
                    setPan(firstCanvas.pan);
                    setScale(firstCanvas.scale);
                } else {
                    setPan({ x: 0, y: 0 });
                    setScale(1);
                }
            }
            return newCanvases;
        });
        clearSelection();
    }, [canvases, currentCanvasId, clearSelection]);

    const renameCanvas = useCallback((id: string, newTitle: string) => {
        setCanvases(prev => prev.map(c => c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c));
    }, []);

    // --- Subject Library Handlers ---
    const handleAddSubject = useCallback(() => {
        setEditingSubject(null);
        setSubjectEditorInitialImage(null);
        setIsSubjectEditorOpen(true);
    }, []);

    // 从画布素材创建主体
    const handleCreateSubjectFromImage = useCallback((imageSrc: string) => {
        setEditingSubject(null);
        setSubjectEditorInitialImage(imageSrc);
        setIsSubjectEditorOpen(true);
    }, []);

    // 从图片创建3D运镜节点
    const handleCreate3DCameraFromImage = useCallback((imageSrc: string, sourceNodeId: string) => {
        const sourceNode = nodes.find(n => n.id === sourceNodeId);
        if (!sourceNode) return;

        saveHistory();
        const nodeWidth = 420;
        const nodeHeight = 380; // 3D 运镜节点固定高度

        // 新节点放在源节点右侧
        const gap = 60;
        const newX = sourceNode.x + (sourceNode.width || 420) + gap;
        const newY = sourceNode.y;

        const newNodeId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const savedConfig = loadNodeConfig(NodeType.IMAGE_3D_CAMERA);

        const newNode: AppNode = {
            id: newNodeId,
            type: NodeType.IMAGE_3D_CAMERA,
            x: newX,
            y: newY,
            width: nodeWidth,
            height: nodeHeight,
            title: '3D 运镜',
            status: NodeStatus.IDLE,
            data: {
                model: savedConfig.model || 'fal-ai/qwen-image-edit-2511-multiple-angles',
                aspectRatio: savedConfig.aspectRatio || '16:9',
            },
            inputs: [sourceNodeId],
            modifiedAt: Date.now(),
        };

        setNodes(prev => [...prev, newNode]);
        setConnections(prev => [...prev, createConnection(sourceNodeId, newNodeId)]);
    }, [nodes, saveHistory]);

    const handleEditSubject = useCallback((id: string) => {
        const subject = subjects.find(s => s.id === id);
        if (subject) {
            setEditingSubject(subject);
            setIsSubjectEditorOpen(true);
        }
    }, [subjects]);

    const handleDeleteSubject = useCallback((id: string) => {
        const now = Date.now();
        const next = removeItemWithTombstone(subjectsRef.current, deletedItemsRef.current, id, now);
        setDeletedItems(next.deletedItems);
        setSubjects(next.items);
    }, [setDeletedItems, setSubjects]);

    const handleSaveSubject = useCallback((subject: Subject) => {
        setSubjects(prev => {
            const existingIndex = prev.findIndex(s => s.id === subject.id);
            if (existingIndex >= 0) {
                // 更新现有主体
                const updated = [...prev];
                updated[existingIndex] = subject;
                return updated;
            } else {
                // 添加新主体
                return [subject, ...prev];
            }
        });
        setIsSubjectEditorOpen(false);
        setEditingSubject(null);
        setSubjectEditorInitialImage(null);
    }, []);

    // 自动保存当前画布（节流）
    useEffect(() => {
        if (!currentCanvasId || !isLoaded) return;
        const timer = setTimeout(() => {
            saveCurrentCanvas();
        }, 2000); // 2秒后自动保存
        return () => clearTimeout(timer);
    }, [nodes, connections, groups, currentCanvasId, isLoaded, saveCurrentCanvas]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectNodes(nodesRef.current.map(n => n.id)); return; }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(); return; }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { const lastSelected = selectedNodeIds[selectedNodeIds.length - 1]; if (lastSelected) { const nodeToCopy = nodesRef.current.find(n => n.id === lastSelected); if (nodeToCopy) { e.preventDefault(); setClipboard(structuredClone(nodeToCopy)); } } return; }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
                if (clipboard) {
                    e.preventDefault();
                    saveHistory();
                    const newNodeId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    // 继承原节点的输入连接
                    const inheritedInputs = clipboard.inputs || [];
                    const newNode: AppNode = {
                        ...clipboard,
                        id: newNodeId,
                        x: clipboard.x + 50,
                        y: clipboard.y + 50,
                        status: NodeStatus.IDLE,
                        inputs: inheritedInputs,
                        modifiedAt: Date.now(),
                    };
                    setNodes(prev => [...prev, newNode]);
                    // 为继承的输入创建新的连接
                    if (inheritedInputs.length > 0) {
                        const newConnections = inheritedInputs.map(inputId => createConnection(inputId, newNodeId));
                        setConnections(prev => [...prev, ...newConnections]);
                    }
                    selectNodes([newNode.id]);
                }
                return;
            }
            if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === 'Enter' && !e.repeat) {
                const lastSelected = selectedNodeIds[selectedNodeIds.length - 1];
                if (lastSelected) {
                    const targetNode = nodesRef.current.find(n => n.id === lastSelected);
                    if (targetNode && targetNode.status !== NodeStatus.WORKING && targetNode.type !== NodeType.PROMPT_INPUT) {
                        e.preventDefault();
                        handleNodeAction(lastSelected);
                    }
                }
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedGroupIds.length > 0 || selectedNodeIds.length > 0) {
                    saveHistory();
                    if (selectedGroupIds.length > 0) {
                        const now = Date.now();
                        setDeletedItems((prev) => {
                            const next = { ...prev };
                            selectedGroupIds.forEach((groupId) => {
                                next[groupId] = now;
                            });
                            return next;
                        });
                        setGroups(prev => prev.filter(g => !selectedGroupIds.includes(g.id)));
                        selectGroups([]);
                    }
                    if (selectedNodeIds.length > 0) {
                        deleteNodes(selectedNodeIds);
                    }
                }
            }
        };
        const handleKeyDownSpace = (e: KeyboardEvent) => {
            if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault(); // Prevent page scroll
                document.body.classList.add('cursor-grab-override');
                setIsSpacePressed(true);
            }
        };
        const handleKeyUpSpace = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                document.body.classList.remove('cursor-grab-override');
                setIsSpacePressed(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keydown', handleKeyDownSpace); window.addEventListener('keyup', handleKeyUpSpace);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keydown', handleKeyDownSpace); window.removeEventListener('keyup', handleKeyUpSpace); };
    }, [selectedWorkflowId, selectedNodeIds, selectedGroupIds, deleteNodes, undo, saveHistory, clipboard, redo, handleNodeAction, selectNodes, selectGroups, setDeletedItems]);

    const handleCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const handleCanvasDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const dropX = (e.clientX - pan.x) / scale;
        const dropY = (e.clientY - pan.y) / scale;
        const assetData = e.dataTransfer.getData('application/json');
        const workflowId = e.dataTransfer.getData('application/workflow-id');

        if (workflowId && workflows) {
            const wf = workflows.find(w => w.id === workflowId);
            if (wf) {
                saveHistory();
                const minX = Math.min(...wf.nodes.map(n => n.x));
                const minY = Math.min(...wf.nodes.map(n => n.y));
                const width = Math.max(...wf.nodes.map(n => n.x + (n.width || 420))) - minX;
                const height = Math.max(...wf.nodes.map(n => n.y + 320)) - minY;
                const offsetX = dropX - (minX + width / 2);
                const offsetY = dropY - (minY + height / 2);
                const idMap = new Map<string, string>();
                const newNodes = wf.nodes.map(n => { const newId = `n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; idMap.set(n.id, newId); return { ...n, id: newId, x: n.x + offsetX, y: n.y + offsetY, status: NodeStatus.IDLE, inputs: [] as string[], modifiedAt: Date.now() }; });
                newNodes.forEach((n, i) => { const original = wf.nodes[i]; n.inputs = original.inputs.map(oldId => idMap.get(oldId)).filter(Boolean) as string[]; });
                const newConnections = wf.connections.map(c => createConnection(idMap.get(c.from)!, idMap.get(c.to)!)).filter(c => c.from && c.to);
                const newGroups = (wf.groups || []).map(g => ({ ...g, id: `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, x: g.x + offsetX, y: g.y + offsetY, modifiedAt: Date.now() }));
                setNodes(prev => [...prev, ...newNodes]); setConnections(prev => [...prev, ...newConnections]); setGroups(prev => [...prev, ...newGroups]);
            }
            return;
        }
        if (assetData) {
            try {
                const asset = JSON.parse(assetData);
                if (asset && asset.type) {
                    if (asset.type === 'image') addNode(NodeType.IMAGE_GENERATOR, dropX - 210, dropY - 180, { image: asset.src, prompt: asset.title });
                    else if (asset.type === 'video') addNode(NodeType.VIDEO_GENERATOR, dropX - 210, dropY - 180, { videoUri: asset.src });
                }
                return;
            } catch (err) { console.error("Drop failed", err); }
        }

        // 主体拖拽到画布 - 创建图片素材节点
        const subjectData = e.dataTransfer.getData('application/subject');
        if (subjectData) {
            try {
                const subject = JSON.parse(subjectData) as Subject;
                const primaryImage = getPrimaryImage(subject);
                if (primaryImage) {
                    addNode(NodeType.IMAGE_GENERATOR, dropX - 210, dropY - 180, {
                        image: primaryImage,
                        prompt: subject.name,
                        status: NodeStatus.SUCCESS,
                    });
                }
                return;
            } catch (err) { console.error("Subject drop failed", err); }
        }

        // Updated Multi-File Logic (Grid Support with Original Aspect Ratio)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files) as File[];
            const validFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));

            if (validFiles.length > 0) {
                saveHistory();
                const COLS = 3;
                const GAP = 40;
                const BASE_WIDTH = 420;
                const DEFAULT_HEIGHT = Math.round(BASE_WIDTH * 9 / 16);

                const startX = dropX - 210;
                const startY = dropY - 180;

                // 先创建上传中的节点，再异步上传并回填结果
                for (let index = 0; index < validFiles.length; index++) {
                    const file = validFiles[index];
                    const col = index % COLS;
                    const row = Math.floor(index / COLS);

                    const xPos = startX + (col * (BASE_WIDTH + GAP));
                    const yPos = startY + (row * (DEFAULT_HEIGHT + GAP));
                    const isImage = file.type.startsWith('image/');
                    const nodeId = `n-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
                    const fallbackTitle = `${isImage ? '图片' : '视频'} ${index + 1}`;

                    const pendingNode: AppNode = {
                        id: nodeId,
                        type: isImage ? NodeType.IMAGE_GENERATOR : NodeType.VIDEO_GENERATOR,
                        x: xPos,
                        y: yPos,
                        width: BASE_WIDTH,
                        height: DEFAULT_HEIGHT,
                        title: file.name.replace(/\.[^/.]+$/, '').slice(0, 20) || fallbackTitle,
                        status: NodeStatus.IDLE,
                        data: {
                            prompt: file.name,
                            aspectRatio: '16:9',
                            uploading: true,
                            mediaOrigin: 'uploaded',
                        },
                        inputs: [],
                        modifiedAt: Date.now(),
                    };
                    setNodes(prev => [...prev, pendingNode]);

                    if (isImage) {
                        try {
                            const [meta, url] = await Promise.all([
                                getImageMetaFromFile(file),
                                uploadImageFile(file),
                            ]);
                            const nodeHeight = Math.round(BASE_WIDTH * meta.height / meta.width);
                            setNodes(prev => prev.map(node => {
                                if (node.id !== nodeId) return node;
                                return {
                                    ...node,
                                    status: NodeStatus.SUCCESS,
                                    height: nodeHeight,
                                    data: {
                                        ...node.data,
                                        image: url,
                                        prompt: file.name,
                                        aspectRatio: meta.aspectRatio,
                                        uploading: false,
                                        mediaOrigin: 'uploaded',
                                        error: undefined,
                                    },
                                    modifiedAt: Date.now(),
                                };
                            }));
                        } catch (error) {
                            console.warn('[Studio] Drop image upload failed:', error);
                            setNodes(prev => prev.map(node => {
                                if (node.id !== nodeId) return node;
                                return {
                                    ...node,
                                    status: NodeStatus.ERROR,
                                    data: {
                                        ...node.data,
                                        uploading: false,
                                        error: '图片上传失败，请重试',
                                    },
                                    modifiedAt: Date.now(),
                                };
                            }));
                        }
                    } else if (file.type.startsWith('video/')) {
                        try {
                            const [meta, url] = await Promise.all([
                                getVideoMetaFromFile(file).catch(() => null),
                                uploadVideoFile(file),
                            ]);
                            const nodeHeight = meta ? Math.round(BASE_WIDTH * meta.height / meta.width) : DEFAULT_HEIGHT;
                            setNodes(prev => prev.map(node => {
                                if (node.id !== nodeId) return node;
                                return {
                                    ...node,
                                    status: NodeStatus.SUCCESS,
                                    height: nodeHeight,
                                    data: {
                                        ...node.data,
                                        videoUri: url,
                                        prompt: file.name,
                                        aspectRatio: meta?.aspectRatio || '16:9',
                                        uploading: false,
                                        mediaOrigin: 'uploaded',
                                        error: undefined,
                                    },
                                    modifiedAt: Date.now(),
                                };
                            }));
                        } catch (error) {
                            console.warn('[Studio] Drop video upload failed:', error);
                            setNodes(prev => prev.map(node => {
                                if (node.id !== nodeId) return node;
                                return {
                                    ...node,
                                    status: NodeStatus.ERROR,
                                    data: {
                                        ...node.data,
                                        uploading: false,
                                        error: '视频上传失败，请重试',
                                    },
                                    modifiedAt: Date.now(),
                                };
                            }));
                        }
                    }
                }
            }
        }
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = ` .cursor-grab-override, .cursor-grab-override * { cursor: grab !important; } .cursor-grab-override:active, .cursor-grab-override:active * { cursor: grabbing !important; } `;
        document.head.appendChild(style);

        // Disable global scrollbars for Studio canvas
        const htmlEl = document.documentElement;
        const bodyEl = document.body;
        const originalHtmlOverflow = htmlEl.style.overflow;
        const originalBodyOverflow = bodyEl.style.overflow;
        htmlEl.style.overflow = 'hidden';
        bodyEl.style.overflow = 'hidden';

        return () => {
            document.head.removeChild(style);
            // Restore original overflow on unmount
            htmlEl.style.overflow = originalHtmlOverflow;
            bodyEl.style.overflow = originalBodyOverflow;
        };
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (isAuthenticated) {
            setIsLoginOpen(false);
            return;
        }
        const seen = typeof window !== 'undefined' ? localStorage.getItem('login_modal_seen') : null;
        if (!seen) {
            setIsLoginOpen(true);
            if (typeof window !== 'undefined') {
                localStorage.setItem('login_modal_seen', '1');
            }
        }
    }, [authLoading, isAuthenticated]);

    return (
        <div className="w-full h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200" style={{ '--grid-color': '#cbd5e1', '--grid-color-dark': '#334155' } as React.CSSProperties}>
            {/* 全屏加载覆盖层 */}
            {showLoadingOverlay && (
                <div className={`absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 transition-all duration-300 ease-[${SPRING}] ${isLoaded ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'}`}>
                    <div className="relative select-none">
                        {/* 氛围背景光 */}
                        <div className="absolute -top-20 -left-20 w-64 h-64 bg-amber-400/10 dark:bg-amber-900/10 rounded-full blur-[120px] animate-pulse" />
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-400/10 dark:bg-blue-900/10 rounded-full blur-[120px] animate-pulse delay-700" />
                        <div className="absolute -bottom-20 left-10 w-64 h-64 bg-emerald-400/10 dark:bg-emerald-900/10 rounded-full blur-[120px] animate-pulse delay-1000" />

                        <div className="relative flex flex-col items-center">
                            {/* Logo & Title — 复用品牌配置 */}
                            <div className="flex items-center gap-4 mb-8">
                                <div className="relative w-16 h-16 flex items-center justify-center">
                                    <img
                                        src={theme === 'dark' ? brand.logo.dark : brand.logo.light}
                                        alt={`${brand.name} Logo`}
                                        className="w-14 h-14 object-contain"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                                        {brand.namePrefix}<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500 font-extrabold">{brand.nameHighlight}</span>
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="h-1 w-1 rounded-full bg-amber-400" />
                                        <span className="h-1 w-1 rounded-full bg-blue-400" />
                                        <span className="h-1 w-1 rounded-full bg-emerald-400" />
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">{brand.slogan}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 加载指示器 */}
                            <div className="mt-6 flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                            </div>
                            <span className="mt-3 text-xs text-slate-400 dark:text-slate-500">正在加载画布...</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Back to Dashboard Canvas */}
            <Link
                href="/canvases"
                onClick={handleExitToDashboard}
                className="absolute left-6 top-6 z-50 flex items-center gap-2 rounded-2xl border border-slate-300 bg-[#ffffff]/70 px-3 py-2 text-xs font-medium text-slate-600 shadow-2xl backdrop-blur-2xl transition-all duration-150 ease-out hover:bg-white/80 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
            >
                <ChevronLeft size={16} />
                返回我的画布
            </Link>
            <div className="absolute left-4 right-4 top-16 z-50">
                <AuthRequiredNotice />
            </div>
            <div
                ref={canvasContainerRef}
                data-canvas-container
                className={`w-full h-full overflow-hidden text-slate-700 selection:bg-blue-200 ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-default'} ${(isDraggingCanvas || draggingNodeId || resizingNodeId || connectionStart || selectionRect || draggingGroup) ? 'select-none' : ''}`}
                onMouseDown={handleCanvasMouseDown}
                onDoubleClick={(e) => {
                    e.preventDefault();
                    // 只在画布空白区域双击时触发
                    const target = e.target as HTMLElement;

                    // 排除：节点、分组、侧边栏、对话面板、节点配置面板、底部工具栏
                    const isOnNode = target.closest('[data-node-id]');
                    const isOnGroup = target.closest('[data-group-id]');
                    const isOnSidebar = target.closest('[data-sidebar]');
                    const isOnChat = target.closest('[data-chat-panel]');
                    const isOnConfigPanel = target.closest('[data-config-panel]');
                    const isOnBottomToolbar = target.closest('[data-bottom-toolbar]');
                    const isOnUserPanel = target.closest('[data-user-panel]');
                    if (isOnNode || isOnGroup || isOnSidebar || isOnChat || isOnConfigPanel || isOnBottomToolbar || isOnUserPanel || selectionRect) return;

                    // 转换为画布坐标并检查是否在空白区域
                    const rect = canvasContainerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const canvasX = (e.clientX - rect.left - pan.x) / scale;
                    const canvasY = (e.clientY - rect.top - pan.y) / scale;

                    if (isPointOnEmptyCanvas(canvasX, canvasY)) {
                        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: '' });
                        setContextMenuTarget({ type: 'create' });
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    // 多选菜单改为重心自动弹出，右键画布不再重新定位
                    if (isMultiNodeSelection) return;
                    if (e.target === e.currentTarget) {
                        setContextMenu(null);
                    }
                }}
                onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}
            >
                <div className="absolute inset-0 noise-bg opacity-30 dark:opacity-20 pointer-events-none" />
                <div
                    ref={gridLayerRef}
                    className="absolute inset-0 pointer-events-none opacity-[0.4] dark:opacity-[0.5]"
                    style={{ backgroundImage: 'radial-gradient(circle, var(--grid-color) 1px, transparent 1px)', backgroundSize: `${32 * scale}px ${32 * scale}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
                />
                {/* 深色模式下使用更亮的网格点颜色 */}
                <style dangerouslySetInnerHTML={{ __html: `.dark [data-canvas-container] { --grid-color: #475569; }` }} />

                {/* 空状态 / 初始欢迎页 - 重新设计 (V2: 极简去框) */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-[${SPRING}] z-10 pointer-events-none ${nodes.length > 0 ? 'opacity-0 scale-110 blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
                    <div className="relative group select-none">
                        {/* 氛围背景光 - 使用主题色 (更柔和低饱和) */}
                        <div className="absolute -top-20 -left-20 w-64 h-64 bg-amber-400/10 dark:bg-amber-900/10 rounded-full blur-[120px] animate-pulse" />
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-400/10 dark:bg-blue-900/10 rounded-full blur-[120px] animate-pulse delay-700" />
                        <div className="absolute -bottom-20 left-10 w-64 h-64 bg-emerald-400/10 dark:bg-emerald-900/10 rounded-full blur-[120px] animate-pulse delay-1000" />

                        {/* 主卡片 */}
                        <div className="relative">
                            <div className="relative flex flex-col items-center">

                                {/* Logo & Title - 从 /public/brand.json 配置 */}
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="relative w-16 h-16 flex items-center justify-center">
                                        <img
                                            src={theme === 'dark' ? brand.logo.dark : brand.logo.light}
                                            alt={`${brand.name} Logo`}
                                            className="w-14 h-14 object-contain"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <h1 className="text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                                            {brand.namePrefix}<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500 font-extrabold">{brand.nameHighlight}</span>
                                        </h1>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="h-1 w-1 rounded-full bg-amber-400" />
                                            <span className="h-1 w-1 rounded-full bg-blue-400" />
                                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">{brand.slogan}</span>
                                        </div>
                                    </div>
                                </div>



                                <div className="mt-8 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-medium">
                                    <MousePointerClick size={14} />
                                    <span>双击画布任意位置唤起菜单</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="file" ref={replaceVideoInputRef} className="hidden" accept="video/*" onChange={(e) => handleReplaceFile(e, 'video')} />
                <input type="file" ref={replaceImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleReplaceFile(e, 'image')} />

                <div
                    ref={viewportLayerRef}
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, width: '100%', height: '100%', transformOrigin: '0 0' }}
                    className="w-full h-full"
                >
                    {/* Groups Layer */}
                    {groups.map(g => (
                        <div
                            key={g.id}
                            ref={(el) => { if (el) groupRefsMap.current.set(g.id, el); else groupRefsMap.current.delete(g.id); }}
                            className={`absolute rounded-[32px] border transition-all ${(draggingGroup?.id === g.id || draggingNodeParentGroupId === g.id || resizingGroupId === g.id) ? 'duration-0' : 'duration-300'} ${selectedGroupIds.includes(g.id) ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}
                            style={{ left: g.x, top: g.y, width: g.width, height: g.height }}
                            onMouseDown={(e) => {
                                // 检查是否点击在连接点上
                                const target = e.target as HTMLElement;
                                if (target.closest('[data-resize-handle]')) return;
                                e.stopPropagation(); e.preventDefault();
                                // 点击分组：选中分组，清除节点选择
                                setSelection({ nodeIds: [], groupIds: [g.id] });
                                const childNodes = (nodesInGroupById.get(g.id) || []).map(n => ({ id: n.id, startX: n.x, startY: n.y }));
                                dragGroupRef.current = { id: g.id, startX: g.x, startY: g.y, mouseStartX: e.clientX, mouseStartY: e.clientY, childNodes };
                                setActiveGroupNodeIds(childNodes.map(c => c.id)); setDraggingGroup({ id: g.id });
                            }}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: g.id }); setContextMenuTarget({ type: 'group', id: g.id }); }}
                        >
                            <div className="absolute -top-8 left-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{g.title}</div>
                            {/* 分组右下角调整尺寸手柄 */}
                            <div
                                data-resize-handle
                                className="absolute w-5 h-5 cursor-se-resize opacity-0 hover:opacity-100 transition-opacity"
                                style={{ right: 4, bottom: 4, zIndex: 100 }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setResizingGroupId(g.id);
                                    resizeGroupRef.current = {
                                        id: g.id,
                                        initialWidth: g.width,
                                        initialHeight: g.height,
                                        startX: e.clientX,
                                        startY: e.clientY
                                    };
                                }}
                            >
                                <svg viewBox="0 0 20 20" className="w-full h-full text-slate-400 dark:text-slate-500">
                                    <path d="M17 17L7 17M17 17L17 7M17 17L10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>
                    ))}

                    {/* 多选图片统一右连接点：位于整体框右中点 */}
                    {multiSelectionDock && !isSelectionModifierActive && (() => {
                        const inverseScale = 1 / Math.max(0.1, scale);
                        return (
                            <div
                                className="absolute z-50"
                                style={{
                                    left: `${multiSelectionDock.x}px`,
                                    top: `${multiSelectionDock.y}px`,
                                    transform: `translate(-50%, -50%) scale(${inverseScale})`,
                                    transformOrigin: 'center center',
                                }}
                            >
                                <div
                                    className={`w-8 h-8 flex items-center justify-center cursor-crosshair transition-all duration-200 group/output ${connectionStart?.id === MULTI_SELECTION_DOCK_ID ? 'ring-2 ring-purple-400/60 rounded-full' : ''}`}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        // 清理当前菜单，避免拖拽开始后先复用顶部菜单位置再跳转到鼠标点
                                        setContextMenu(null);
                                        setContextMenuTarget(null);
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        const centerX = rect.left + rect.width / 2;
                                        const centerY = rect.top + rect.height / 2;
                                        const canvasPos = getCanvasMousePos(centerX, centerY);
                                        setMousePos(canvasPos);
                                        startConnecting({
                                            id: MULTI_SELECTION_DOCK_ID,
                                            portType: 'output',
                                            screenX: centerX,
                                            screenY: centerY,
                                        });
                                    }}
                                    title="拖拽批量连接到下游节点"
                                >
                                    <div className={`w-5 h-5 rounded-full border bg-white dark:bg-slate-800 flex items-center justify-center transition-all duration-200 shadow-md border-purple-400 group-hover/output:bg-purple-500 group-hover/output:border-purple-500 group-hover/output:scale-110 ${connectionStart?.id === MULTI_SELECTION_DOCK_ID ? 'ring-2 ring-purple-400 animate-pulse' : ''}`}>
                                        <Plus size={12} strokeWidth={3} className="transition-colors text-purple-400 group-hover/output:text-white" />
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Connections Layer */}
                    <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
                        {connections.map((conn) => {
                            const f = nodeById.get(conn.from), t = nodeById.get(conn.to);
                            if (!f || !t) return null;

                            // 计算连接点中心位置
                            const fW = f.width || 420, fH = f.height || getApproxNodeHeight(f);
                            const tH = t.height || getApproxNodeHeight(t);

                            const fx = f.x + fW + PORT_OFFSET;
                            const fy = f.y + fH / 2;

                            const tx = t.x - PORT_OFFSET; let ty = t.y + tH / 2;
                            if (Math.abs(fy - ty) < 0.5) ty += 0.5;
                            if (isNaN(fx) || isNaN(fy) || isNaN(tx) || isNaN(ty)) return null;
                            const d = generateBezierPath(fx, fy, tx, ty);
                            const hasSelection = selectedNodeIdSet.size > 0;
                            const isRelatedToSelection = hasSelection && (selectedNodeIdSet.has(conn.from) || selectedNodeIdSet.has(conn.to));
                            const isDimmed = hasSelection && !isRelatedToSelection;
                            const baseStroke = theme === 'dark' ? '#94a3b8' : '#64748b';
                            const highlightStroke = theme === 'dark' ? '#60a5fa' : '#2563eb';
                            const strokeColor = isRelatedToSelection ? highlightStroke : baseStroke;
                            const baseOpacity = isRelatedToSelection ? 0.88 : isDimmed ? 0.14 : 0.35;
                            const isAutoConnection = conn.isAuto;
                            const connKey = `${conn.from}-${conn.to}`;
                            return (
                                <g key={connKey} className="pointer-events-auto">
                                    <path
                                        ref={(el) => { if (el) connectionPathsRef.current.set(connKey, el); else connectionPathsRef.current.delete(connKey); }}
                                        d={d}
                                        stroke={strokeColor}
                                        strokeWidth={(isRelatedToSelection ? 2 : isAutoConnection ? 1.1 : 1.4) / scale}
                                        fill="none"
                                        strokeOpacity={isAutoConnection ? Math.max(0.1, baseOpacity - 0.08) : baseOpacity}
                                        strokeDasharray={isAutoConnection ? `${8 / scale} ${4 / scale}` : "none"}
                                        className="transition-colors"
                                    />
                                    <path ref={(el) => { if (el) connectionPathsRef.current.set(`${connKey}-hit`, el); else connectionPathsRef.current.delete(`${connKey}-hit`); }} d={d} stroke="transparent" strokeWidth="15" fill="none" style={{ cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: connKey }); setContextMenuTarget({ type: 'connection', from: conn.from, to: conn.to }); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: connKey }); setContextMenuTarget({ type: 'connection', from: conn.from, to: conn.to }); }} />
                                </g>
                            );
                        })}
                        <defs>
                            <linearGradient id="previewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9" />
                            </linearGradient>
                            <linearGradient id="previewGradientDark" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
                            </linearGradient>
                        </defs>
                        {connectionStart && (() => {
                            // 计算起点位置（连接点中心）
                            let startX = 0, startY = 0;
                            if (connectionStart.id === 'smart-sequence-dock' || connectionStart.id === MULTI_SELECTION_DOCK_ID) {
                                startX = (connectionStart.screenX - pan.x) / scale;
                                startY = (connectionStart.screenY - pan.y) / scale;
                            } else {
                                const startNode = nodeById.get(connectionStart.id);
                                if (!startNode) return null;
                                const w = startNode.width || 420;
                                const h = startNode.height || getApproxNodeHeight(startNode);
                                startY = startNode.y + h / 2;
                                startX = connectionStart.portType === 'output'
                                    ? startNode.x + w + PORT_OFFSET
                                    : startNode.x - PORT_OFFSET;
                            }
                            const endX = (mousePos.x - pan.x) / scale;
                            const endY = (mousePos.y - pan.y) / scale;
                            // 预览线使用简单直线，更直观
                            return (
                                <path
                                    ref={previewConnectionPathRef}
                                    d={`M ${startX} ${startY} L ${endX} ${endY}`}
                                    stroke={`url(#${theme === 'dark' ? 'previewGradientDark' : 'previewGradient'})`}
                                    strokeWidth={3 / scale}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            );
                        })()}
                    </svg>

                    {nodes.map(node => (
                        <Node
                            key={node.id} node={node} zoom={scale} onUpdate={handleNodeUpdate} onAction={handleNodeAction} onDelete={(id) => deleteNodes([id])}
                            onExpand={(data) => {
                                if (data.type === 'image') {
                                    setImageModal({
                                        nodeId: data.nodeId || '',
                                        src: data.src,
                                        images: data.images,
                                        initialIndex: data.initialIndex,
                                        originalImage: data.originalImage,
                                        editOriginImage: data.editOriginImage,
                                        canvasData: data.canvasData,
                                        initialMode: 'preview',
                                    });
                                    return;
                                }
                                setExpandedMedia(data);
                            }}
                            onEdit={(nodeId, src, originalImage, canvasData, editOriginImage) => setImageModal({ nodeId, src, originalImage, canvasData, editOriginImage, initialMode: 'edit' })}
                            onCrop={(id, src, type) => { setCroppingNodeId(id); if (type === 'video') { setVideoToCrop(src); setImageToCrop(null); } else { setImageToCrop(src); setVideoToCrop(null); } }} onUploadImageFile={uploadImageFile} onUploadVideoFile={uploadVideoFile}
                            onNodeMouseDown={(e, id) => {
                                e.stopPropagation();
                                e.preventDefault(); // 防止拖拽选中文本

                                // 点击节点时，让当前聚焦的输入框失去焦点（除非点击的是输入框本身）
                                const target = e.target as HTMLElement;
                                if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
                                    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                                }

                                // 检测是否是复制拖拽（Cmd/Ctrl + 拖拽）
                                const isMetaOrCtrl = e.metaKey || e.ctrlKey;
                                const liveSelectedNodeIds = selectedNodeIdsRef.current;
                                const liveSelectedGroupIds = selectedGroupIdsRef.current;
                                const isCopyDrag = isMetaOrCtrl && liveSelectedNodeIds.includes(id);
                                if (e.altKey) setIsSelectionModifierActive(true);

                                // 处理选择逻辑：
                                // 1) Cmd/Ctrl + 点选未选中节点：加入多选
                                // 2) Shift + 点选：切换选择
                                // 3) 普通点击：单选
                                let currentSelection = liveSelectedNodeIds;
                                if (isMetaOrCtrl && !liveSelectedNodeIds.includes(id)) {
                                    currentSelection = [...liveSelectedNodeIds, id];
                                    selectedNodeIdsRef.current = currentSelection;
                                    selectNodes(currentSelection);
                                } else if (e.shiftKey) {
                                    // Shift 点击：切换选择
                                    currentSelection = liveSelectedNodeIds.includes(id)
                                        ? liveSelectedNodeIds.filter(i => i !== id)
                                        : [...liveSelectedNodeIds, id];
                                    selectedNodeIdsRef.current = currentSelection;
                                    selectNodes(currentSelection);
                                } else if (!liveSelectedNodeIds.includes(id) && !isCopyDrag) {
                                    // 点击未选中的节点：只选中当前节点（复制拖拽时不改变选择）
                                    currentSelection = [id];
                                    selectedNodeIdsRef.current = currentSelection;
                                    selectNodes(currentSelection);
                                }
                                // 如果点击已选中的节点，保持当前选择不变（允许拖动多选）

                                const n = nodeById.get(id);
                                if (n) {
                                    const w = n.width || 420;
                                    const h = n.height || getApproxNodeHeight(n);
                                    const cx = n.x + w / 2;
                                    const cy = n.y + 160;
                                    const pGroup = groups.find(g => cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height);
                                    let siblingNodeIds: string[] = [];
                                    if (pGroup) {
                                        siblingNodeIds = (nodesInGroupById.get(pGroup.id) || [])
                                            .map(s => s.id)
                                            .filter(nodeId => nodeId !== id);
                                    }

                                    // 记录其他选中节点的初始位置（用于多选拖动）
                                    const otherSelectedNodes = currentSelection
                                        .filter(nodeId => nodeId !== id)
                                        .map(nodeId => {
                                            const node = nodeById.get(nodeId);
                                            return node ? { id: nodeId, startX: node.x, startY: node.y } : null;
                                        })
                                        .filter((item): item is { id: string, startX: number, startY: number } => item !== null);

                                    // 记录选中的分组的初始位置及其内部节点（用于多选拖动）
                                    const selectedGroupsData = liveSelectedGroupIds.map(gId => {
                                        const group = groupById.get(gId);
                                        if (!group) return null;
                                        // 找出分组内部的节点（不包括已在otherSelectedNodes中的节点）
                                        const childNodes = (nodesInGroupById.get(gId) || [])
                                            .filter(nd => !currentSelection.includes(nd.id))
                                            .map(nd => ({ id: nd.id, startX: nd.x, startY: nd.y }));
                                        return { id: gId, startX: group.x, startY: group.y, childNodes };
                                    }).filter((item): item is { id: string, startX: number, startY: number, childNodes: { id: string, startX: number, startY: number }[] } => item !== null);
                                    const selectedGroupStartById = new Map(
                                        selectedGroupsData.map(item => [item.id, { startX: item.startX, startY: item.startY }] as const)
                                    );

                                    const interactionNodeIds = Array.from(new Set([
                                        ...otherSelectedNodes.map(item => item.id),
                                        ...selectedGroupsData.flatMap(groupItem => groupItem.childNodes.map(child => child.id)),
                                    ]));
                                    setActiveGroupNodeIds(interactionNodeIds);
                                    const draggingIdSet = new Set<string>([id, ...interactionNodeIds]);
                                    const shouldSnap = !isCopyDrag && draggingIdSet.size === 1;

                                    dragNodeRef.current = {
                                        id,
                                        startX: n.x,
                                        startY: n.y,
                                        mouseStartX: e.clientX,
                                        mouseStartY: e.clientY,
                                        parentGroupId: pGroup?.id,
                                        siblingNodeIds,
                                        nodeWidth: w,
                                        nodeHeight: h,
                                        otherSelectedNodes,
                                        selectedGroups: selectedGroupsData,
                                        selectedGroupStartById,
                                        draggingIdSet,
                                        shouldSnap,
                                        isCopyDrag
                                    };
                                    setDraggingNodeParentGroupId(pGroup?.id || null);
                                    setDraggingNodeId(id);
                                }
                            }}
                            onPortMouseDown={(e, id, type) => {
                                e.stopPropagation();
                                e.preventDefault(); // 防止拖拽选中文本
                                // Get the actual center position of the port element
                                const portElement = e.currentTarget as HTMLElement;
                                const rect = portElement.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;
                                const canvasPos = getCanvasMousePos(centerX, centerY);
                                setMousePos(canvasPos);
                                startConnecting({ id, portType: type, screenX: centerX, screenY: centerY });
                            }}
                            onPortMouseUp={(e, id, type) => {
                                e.stopPropagation();
                                const start = getConnectionStartRef();
                                if (start && start.id !== id) {
                                    if (start.id === 'smart-sequence-dock') {
                                        // Smart sequence dock connection - do nothing for now
                                    } else if (start.id === MULTI_SELECTION_DOCK_ID) {
                                        if (type !== 'input') {
                                            finishInteraction();
                                            return;
                                        }

                                        const sourceNodeIds = multiSelectionDockNodeIdsRef.current;
                                        if (sourceNodeIds.length > 0) {
                                            const newConnections: Connection[] = [];
                                            sourceNodeIds.forEach((sourceId) => {
                                                const exists = connectionsRef.current.some(c => c.from === sourceId && c.to === id);
                                                if (!exists) {
                                                    newConnections.push(createConnection(sourceId, id));
                                                }
                                            });

                                            if (newConnections.length > 0) {
                                                setConnections(p => [...p, ...newConnections]);
                                                setNodes(p => p.map(n => {
                                                    if (n.id !== id) return n;
                                                    const newInputs = [...n.inputs];

                                                    if (n.type === NodeType.MULTI_FRAME_VIDEO) {
                                                        let currentFrames = n.data.multiFrameData?.frames || [];
                                                        sourceNodeIds.forEach((sourceId) => {
                                                            if (!newInputs.includes(sourceId)) {
                                                                newInputs.push(sourceId);
                                                                const sourceNode = p.find(x => x.id === sourceId);
                                                                const sourceImage = sourceNode?.data.image;
                                                                if (sourceImage && !currentFrames.some(f => f.src === sourceImage) && currentFrames.length < 10) {
                                                                    currentFrames = [...currentFrames, {
                                                                        id: `mf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                                                        src: sourceImage,
                                                                        transition: { duration: 4, prompt: '' }
                                                                    }];
                                                                }
                                                            }
                                                        });
                                                        return {
                                                            ...n,
                                                            inputs: newInputs,
                                                            data: {
                                                                ...n.data,
                                                                multiFrameData: {
                                                                    ...n.data.multiFrameData,
                                                                    frames: currentFrames,
                                                                }
                                                            },
                                                            modifiedAt: Date.now(),
                                                        };
                                                    }

                                                    sourceNodeIds.forEach((sourceId) => {
                                                        if (!newInputs.includes(sourceId)) {
                                                            newInputs.push(sourceId);
                                                        }
                                                    });
                                                    return { ...n, inputs: newInputs, modifiedAt: Date.now() };
                                                }));
                                            }
                                        }
                                    } else {
                                        // Determine connection direction based on port types
                                        // output -> input: from = start, to = target (normal)
                                        // input -> output: from = target, to = start (reversed)
                                        let fromId = start.id;
                                        let toId = id;
                                        if (start.portType === 'input' && type === 'output') {
                                            // Reverse: target output -> start input
                                            fromId = id;
                                            toId = start.id;
                                        }
                                        // Prevent duplicate connections
                                        setConnections(p => {
                                            const exists = p.some(c => c.from === fromId && c.to === toId);
                                            if (exists) return p;
                                            return [...p, createConnection(fromId, toId)];
                                        });
                                        setNodes(p => {
                                            // 获取源节点信息
                                            const sourceNode = p.find(x => x.id === fromId);
                                            const sourceImage = sourceNode?.data.image;
                                            const sourcePrompt = sourceNode?.data.prompt;
                                            const isSourcePromptNode = sourceNode?.type === NodeType.PROMPT_INPUT;

                                            return p.map(n => {
                                                if (n.id !== toId) return n;
                                                // Prevent duplicate inputs
                                                if (n.inputs.includes(fromId)) return n;

                                                // 如果目标是 MULTI_FRAME_VIDEO 且源节点有图片，添加为帧
                                                if (n.type === NodeType.MULTI_FRAME_VIDEO && sourceImage) {
                                                    const currentFrames = n.data.multiFrameData?.frames || [];
                                                    // 检查是否已存在该图片
                                                    const alreadyExists = currentFrames.some(f => f.src === sourceImage);
                                                    if (!alreadyExists && currentFrames.length < 10) {
                                                        const newFrame = {
                                                            id: `mf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                                            src: sourceImage,
                                                            transition: { duration: 4, prompt: '' }
                                                        };
                                                        return {
                                                            ...n,
                                                            inputs: [...n.inputs, fromId],
                                                            data: {
                                                                ...n.data,
                                                                multiFrameData: {
                                                                    ...n.data.multiFrameData,
                                                                    frames: [...currentFrames, newFrame],
                                                                }
                                                            },
                                                            modifiedAt: Date.now(),
                                                        };
                                                    }
                                                }

                                                // 如果源节点是提示词节点，且目标是图片/视频生成节点，自动复制提示词
                                                if (isSourcePromptNode && sourcePrompt && (
                                                    n.type === NodeType.IMAGE_GENERATOR ||
                                                    n.type === NodeType.VIDEO_GENERATOR ||
                                                    n.type === NodeType.VIDEO_FACTORY
                                                )) {
                                                    return {
                                                        ...n,
                                                        inputs: [...n.inputs, fromId],
                                                        data: { ...n.data, prompt: sourcePrompt },
                                                        modifiedAt: Date.now(),
                                                    };
                                                }

                                                return { ...n, inputs: [...n.inputs, fromId], modifiedAt: Date.now() };
                                            });
                                        });
                                    }
                                }
                                // 结束连接模式
                                finishInteraction();
                            }}
                            onNodeContextMenu={(e, id) => {
                                e.stopPropagation(); e.preventDefault();
                                // 多选时使用重心菜单，不弹出节点级菜单
                                if (isMultiNodeSelection) return;
                                setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id });
                                setContextMenuTarget({ type: 'node', id });
                            }}
                            onOutputPortAction={(nodeId, position) => {
                                // 双击右连接点时，弹出适配上游素材的节点选择框
                                const canvasX = (position.x - pan.x) / scale;
                                const canvasY = (position.y - pan.y) / scale;
                                setContextMenu({ visible: true, x: position.x, y: position.y, id: nodeId });
                                setContextMenuTarget({ type: 'output-action', sourceNodeId: nodeId, canvasX, canvasY });
                            }}
                            onInputPortAction={(nodeId, position) => {
                                // 双击左连接点时，弹出上游节点选择框（素材/描述）
                                const canvasX = (position.x - pan.x) / scale;
                                const canvasY = (position.y - pan.y) / scale;
                                setContextMenu({ visible: true, x: position.x, y: position.y, id: nodeId });
                                setContextMenuTarget({ type: 'input-action', targetNodeId: nodeId, canvasX, canvasY });
                            }}
                            onResizeMouseDown={(e, id, w, h) => {
                                e.stopPropagation(); e.preventDefault(); // 防止拖拽选中文本
                                const n = nodeById.get(id);
                                if (n) {
                                    const cx = n.x + w / 2; const cy = n.y + 160;
                                    const pGroup = groups.find(g => { return cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height; });
                                    setDraggingNodeParentGroupId(pGroup?.id || null);
                                    let siblingNodeIds: string[] = [];
                                    if (pGroup) { siblingNodeIds = (nodesInGroupById.get(pGroup.id) || []).filter(other => other.id !== id).map(s => s.id); }
                                    resizeContextRef.current = {
                                        nodeId: id,
                                        initialWidth: w,
                                        initialHeight: h,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                        parentGroupId: pGroup?.id || null,
                                        siblingNodeIds,
                                        currentWidth: w,
                                        currentHeight: h,
                                    };
                                }
                                setResizingNodeId(id);
                            }}
                            onDragResultToCanvas={handleDragResultToCanvas}
                            onGridDragStateChange={handleGridDragStateChange}
                            onBatchUpload={handleBatchUpload}
                            isSelected={selectedNodeIds.includes(node.id)}
                            inputAssets={inputAssetsByNodeId.get(node.id) || []}
                            onInputReorder={(nodeId, newOrder) => { setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, inputs: newOrder, modifiedAt: Date.now() } : n)); }}
                            nodeRef={(el) => { if (el) nodeRefsMap.current.set(node.id, el); else nodeRefsMap.current.delete(node.id); }}
                            subjects={subjects}
                            onOpenSubjectLibrary={() => setExternalOpenPanel('subjects')}
                            onCreateSubject={handleCreateSubjectFromImage}
                            on3DCamera={handleCreate3DCameraFromImage}
                            suppressFloatingPanels={isSelectionModifierActive || (isMultiNodeSelection && selectedNodeIds.includes(node.id))}
                            suppressPorts={isMultiNodeSelection && selectedNodeIds.includes(node.id)}
                            isDragging={draggingNodeId === node.id} isResizing={resizingNodeId === node.id} isConnecting={!!connectionStart} isGroupDragging={activeGroupNodeIds.includes(node.id)}
                        />
                    ))}

                    {selectionRect && <div className="absolute border border-cyan-500/40 bg-cyan-500/10 rounded-lg pointer-events-none" style={{ left: (Math.min(selectionRect.startX, selectionRect.currentX) - pan.x) / scale, top: (Math.min(selectionRect.startY, selectionRect.currentY) - pan.y) / scale, width: Math.abs(selectionRect.currentX - selectionRect.startX) / scale, height: Math.abs(selectionRect.currentY - selectionRect.startY) / scale }} />}

                    {/* 复制拖拽预览 - 显示节点副本将被创建的位置 */}
                    {copyDragPreview && copyDragPreview.nodes.map((node, idx) => (
                        <div
                            key={idx}
                            className="absolute pointer-events-none rounded-[24px] border-2 border-dashed border-purple-400 bg-purple-500/10"
                            style={{
                                left: node.x,
                                top: node.y,
                                width: node.width,
                                height: node.height,
                            }}
                        >
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="px-3 py-1.5 bg-purple-500/80 rounded-full text-[10px] font-bold text-white whitespace-nowrap shadow-lg flex items-center gap-1">
                                    <Copy size={10} /> 复制到此处
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* 组图拖拽放置预览 - 显示节点将被创建的位置 */}
                    {gridDragDropPreview && (
                        <div
                            className="absolute pointer-events-none rounded-[24px] border-2 border-dashed border-cyan-400 bg-cyan-500/10 backdrop-blur-sm"
                            style={{
                                left: gridDragDropPreview.canvasX,
                                top: gridDragDropPreview.canvasY,
                                width: 420,
                                height: 236,
                                transition: 'left 0.05s ease-out, top 0.05s ease-out',
                            }}
                        >
                            <div className="absolute inset-2 rounded-[20px] overflow-hidden opacity-60">
                                {gridDragDropPreview.type === 'image' ? (
                                    <img src={gridDragDropPreview.src} className="w-full h-full object-cover" />
                                ) : (
                                    <video src={gridDragDropPreview.src} className="w-full h-full object-cover" muted />
                                )}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/30 border-2 border-cyan-400 flex items-center justify-center animate-pulse">
                                    <Plus size={24} className="text-cyan-500" />
                                </div>
                            </div>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 rounded-full text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                                松开放置
                            </div>
                        </div>
                    )}
                </div>

                {contextMenu && (
                    <div
                        className={`fixed z-[100] bg-white/80 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-300 dark:border-slate-700 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${contextMenuTarget?.type === 'multi-selection' && contextMenuTarget?.anchor === 'bounds-top' ? 'origin-bottom rounded-2xl px-2 py-1.5 min-w-0' : 'origin-top-left rounded-2xl p-1.5 min-w-[160px]'}`}
                        style={{
                            top: contextMenu.y,
                            left: contextMenu.x,
                            transform: contextMenuTarget?.type === 'multi-selection' && contextMenuTarget?.anchor === 'bounds-top'
                                ? 'translate(-50%, -100%)'
                                : undefined
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {contextMenuTarget?.type === 'node' && (
                            <>
                                <button className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-cyan-500/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg flex items-center gap-2 transition-colors" onClick={() => { const targetNode = nodes.find(n => n.id === contextMenu.id); if (targetNode) setClipboard(structuredClone(targetNode)); setContextMenu(null); }}>
                                    <Copy size={12} /> 复制节点
                                </button>
                                {(() => { const targetNode = nodes.find(n => n.id === contextMenu.id); if (targetNode) { const isVideo = targetNode.type === NodeType.VIDEO_GENERATOR; const isImage = targetNode.type === NodeType.IMAGE_GENERATOR || targetNode.type === NodeType.IMAGE_EDITOR; if (isVideo || isImage) { return (<button className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-purple-500/20 hover:text-purple-400 rounded-lg flex items-center gap-2 transition-colors" onClick={() => { replacementTargetRef.current = contextMenu.id ?? null; if (isVideo) replaceVideoInputRef.current?.click(); else replaceImageInputRef.current?.click(); setContextMenu(null); }}> <RefreshCw size={12} /> 替换素材 </button>); } } return null; })()}
                                {/* 平铺组图：将组图内图片/视频拆分为独立节点 */}
                                {(() => {
                                    const targetNode = nodes.find(n => n.id === contextMenu.id);
                                    if (!targetNode) return null;
                                    const imgs = targetNode.data.images || [];
                                    const vids = targetNode.data.videoUris || [];
                                    if (imgs.length <= 1 && vids.length <= 1) return null;
                                    const isVideoTile = vids.length > 1;
                                    const items = isVideoTile ? vids : imgs;
                                    return (
                                        <button
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg flex items-center gap-2 transition-colors"
                                            onClick={() => {
                                                saveHistory();
                                                const nodeWidth = targetNode.width || 420;
                                                const [rw, rh] = (targetNode.data.aspectRatio || '16:9').split(':').map(Number);
                                                const nodeHeight = targetNode.height || Math.round(nodeWidth * rh / rw);
                                                const gap = 24;
                                                // 获取上游连接
                                                const upstreamConns = connections.filter(c => c.to === targetNode.id);
                                                // 第一张留在原节点，清除组图数组
                                                if (isVideoTile) {
                                                    handleNodeUpdate(targetNode.id, { videoUri: items[0], videoUris: [items[0]] });
                                                } else {
                                                    handleNodeUpdate(targetNode.id, { image: items[0], images: [items[0]] });
                                                }
                                                // 其余项创建新节点，平铺在原节点右侧
                                                const newNodes: AppNode[] = [];
                                                const newConns: Connection[] = [];
                                                for (let i = 1; i < items.length; i++) {
                                                    const newId = `n-${Date.now()}-${Math.floor(Math.random() * 10000)}-${i}`;
                                                    const newX = targetNode.x + (nodeWidth + gap) * i;
                                                    const newY = targetNode.y;
                                                    const newData = isVideoTile
                                                        ? { ...targetNode.data, videoUri: items[i], videoUris: [items[i]], images: undefined, image: undefined }
                                                        : { ...targetNode.data, image: items[i], images: [items[i]], videoUri: undefined, videoUris: undefined };
                                                    newNodes.push({
                                                        id: newId,
                                                        type: targetNode.type,
                                                        x: newX,
                                                        y: newY,
                                                        width: targetNode.width,
                                                        height: targetNode.height,
                                                        title: targetNode.title,
                                                        status: NodeStatus.SUCCESS,
                                                        data: newData,
                                                        inputs: upstreamConns.map(c => c.from),
                                                        modifiedAt: Date.now(),
                                                    });
                                                    // 复制上游连接
                                                    upstreamConns.forEach(c => {
                                                        newConns.push({ from: c.from, to: newId, modifiedAt: Date.now() });
                                                    });
                                                }
                                                setNodes(prev => [...prev, ...newNodes]);
                                                setConnections(prev => [...prev, ...newConns]);
                                                setContextMenu(null);
                                                setContextMenuTarget(null);
                                            }}
                                        >
                                            <Layers size={12} /> 平铺组图
                                        </button>
                                    );
                                })()}
                                <button className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 dark:text-red-400 hover:bg-red-500/20 rounded-lg flex items-center gap-2 transition-colors mt-1" onClick={() => { deleteNodes([contextMenuTarget.id]); setContextMenu(null); }}><Trash2 size={12} /> 删除节点</button>
                            </>
                        )}
                        {contextMenuTarget?.type === 'create' && (
                            <>
                                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">创建新节点</div>
                                {getMenuStructure().map((item, idx) => {
                                    if (item.type === 'divider') {
                                        return <div key={`divider-${idx}`} className="my-1.5 border-t border-slate-200 dark:border-slate-700" />;
                                    }
                                    const ItemIcon = getNodeIcon(item.type as NodeType);
                                    return (
                                        <button
                                            key={item.type}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition-colors"
                                            onClick={() => {
                                                addNode(item.type as NodeType, (contextMenu.x - pan.x) / scale, (contextMenu.y - pan.y) / scale);
                                                setContextMenu(null);
                                            }}
                                        >
                                            <ItemIcon size={12} className="text-blue-600 dark:text-blue-400" />
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </>
                        )}
                        {contextMenuTarget?.type === 'group' && (
                            <>
                                <button className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors mb-1" onClick={() => { if (contextMenu.id) saveGroupAsWorkflow(contextMenu.id); setContextMenu(null); }}> <FolderHeart size={12} className="text-blue-600 dark:text-blue-400" /> 保存为工作流 </button>
                                <button className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 dark:text-red-400 hover:bg-red-500/20 rounded-lg flex items-center gap-2 transition-colors" onClick={() => { if (contextMenu.id) setDeletedItems(prev => ({ ...prev, [contextMenu.id as string]: Date.now() })); setGroups(p => p.filter(g => g.id !== contextMenu.id)); setContextMenu(null); }}> <Trash2 size={12} /> 删除分组 </button>
                            </>
                        )}
                        {contextMenuTarget?.type === 'connection' && (
                            <button className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 rounded-lg flex items-center gap-2 transition-colors" onClick={() => { const conn = connections.find(c => c.from === contextMenuTarget.from && c.to === contextMenuTarget.to); const key = conn ? connectionKey(conn) : `${contextMenuTarget.from}->${contextMenuTarget.to}`; setDeletedItems(prev => ({ ...prev, [key]: Date.now() })); setConnections(prev => prev.filter(c => c.from !== contextMenuTarget.from || c.to !== contextMenuTarget.to)); setNodes(prev => prev.map(n => n.id === contextMenuTarget.to ? { ...n, inputs: n.inputs.filter(i => i !== contextMenuTarget.from), modifiedAt: Date.now() } : n)); setContextMenu(null); }}> <Unplug size={12} /> 删除连接线 </button>
                        )}
                        {contextMenuTarget?.type === 'output-action' && (() => {
                            // 支持单源与多源（例如多选图片统一连接点）
                            const rawSourceNodeIds: string[] = Array.isArray(contextMenuTarget.sourceNodeIds) && contextMenuTarget.sourceNodeIds.length > 0
                                ? (contextMenuTarget.sourceNodeIds as string[])
                                : (contextMenuTarget.sourceNodeId ? [contextMenuTarget.sourceNodeId as string] : []);
                            const sourceNodeIds = Array.from(new Set(rawSourceNodeIds));
                            const sourceNodes = sourceNodeIds
                                .map((id: string) => nodes.find(n => n.id === id))
                                .filter((n): n is AppNode => Boolean(n));
                            if (sourceNodes.length === 0) return null;
                            const getPrimaryImage = (node: AppNode): string | null => {
                                if (node.data.image) return node.data.image;
                                if (Array.isArray(node.data.images) && node.data.images.length > 0) return node.data.images[0];
                                return null;
                            };
                            const getPrimaryVideo = (node: AppNode): string | null => {
                                if (node.data.videoUri) return node.data.videoUri;
                                if (Array.isArray(node.data.videoUris) && node.data.videoUris.length > 0) return node.data.videoUris[0];
                                return null;
                            };

                            const sourceImages = sourceNodes
                                .map(getPrimaryImage)
                                .filter((src): src is string => Boolean(src));
                            const sourceVideos = sourceNodes
                                .map(getPrimaryVideo)
                                .filter((src): src is string => Boolean(src));
                            const sourcePrompts = sourceNodes
                                .map(n => (n.type === NodeType.PROMPT_INPUT ? (n.data.prompt || '').trim() : ''))
                                .filter(Boolean);

                            const hasImage = sourceImages.length > 0;
                            const hasVideo = sourceVideos.length > 0;
                            const allPromptWithContent = sourceNodes.length > 0 && sourceNodes.every(
                                n => n.type === NodeType.PROMPT_INPUT && Boolean(n.data.prompt && n.data.prompt.trim())
                            );

                            // 根据上游类型确定可用的下游节点类型
                            let availableTypes: { type: NodeType, label: string, icon: any, color: string, generationMode?: VideoGenerationMode }[] = [];
                            if (allPromptWithContent) {
                                availableTypes = [
                                    { type: NodeType.IMAGE_GENERATOR, label: '生成图片', icon: ImageIcon, color: 'text-blue-500' },
                                    { type: NodeType.VIDEO_GENERATOR, label: '生成视频', icon: Film, color: 'text-purple-500' },
                                    { type: NodeType.AUDIO_GENERATOR, label: '生成音频', icon: Music, color: 'text-pink-500' },
                                ];
                            } else if (hasImage && !hasVideo) {
                                availableTypes = [
                                    { type: NodeType.PROMPT_INPUT, label: '文本', icon: Type, color: 'text-amber-500' },
                                    { type: NodeType.IMAGE_GENERATOR, label: '编辑图片', icon: ImageIcon, color: 'text-blue-500' },
                                    { type: NodeType.VIDEO_GENERATOR, label: '生成视频', icon: Film, color: 'text-purple-500' },
                                    { type: NodeType.MULTI_FRAME_VIDEO, label: '智能多帧', icon: Scan, color: 'text-teal-500' },
                                    { type: NodeType.IMAGE_3D_CAMERA, label: '3D 运镜', icon: Camera, color: 'text-purple-400' },
                                ];
                            } else if (hasVideo && !hasImage) {
                                availableTypes = [
                                    { type: NodeType.PROMPT_INPUT, label: '文本', icon: Type, color: 'text-amber-500' },
                                    { type: NodeType.VIDEO_FACTORY, label: '剧情延展', icon: Film, color: 'text-purple-500', generationMode: 'CONTINUE' },
                                ];
                            }

                            if (availableTypes.length === 0) {
                                // 空节点阶段也允许快速构建下游工作流，避免出现空菜单
                                availableTypes = [
                                    { type: NodeType.IMAGE_GENERATOR, label: '生成图片', icon: ImageIcon, color: 'text-blue-500' },
                                    { type: NodeType.VIDEO_GENERATOR, label: '生成视频', icon: Film, color: 'text-purple-500' },
                                    { type: NodeType.AUDIO_GENERATOR, label: '生成音频', icon: Music, color: 'text-pink-500' },
                                ];
                            }

                            const handleCreateDownstreamNode = (nodeType: NodeType, generationMode?: VideoGenerationMode, modelId?: string) => {
                                saveHistory();
                                const nodeWidth = 420;
                                // 计算节点高度：音频360，视频分析360，其他16:9
                                const nodeHeight = nodeType === NodeType.AUDIO_GENERATOR
                                    ? 360
                                    : Math.round(nodeWidth * 9 / 16);

                                const sourceMaxRight = Math.max(...sourceNodes.map(n => n.x + (n.width || 420)));
                                const sourceMinTop = Math.min(...sourceNodes.map(n => n.y));

                                // 鼠标释放位置对应新节点的左侧连接点位置
                                const newX = contextMenuTarget.canvasX !== undefined
                                    ? contextMenuTarget.canvasX + 12
                                    : sourceMaxRight + 80;
                                const newY = contextMenuTarget.canvasY !== undefined
                                    ? contextMenuTarget.canvasY - nodeHeight / 2
                                    : sourceMinTop;

                                const newNodeId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                                // 根据生成模式设置标题
                                const getTitleByMode = (): string => {
                                    if (nodeType === NodeType.VIDEO_FACTORY && generationMode === 'CONTINUE') {
                                        return '剧情延展';
                                    }
                                    const typeMap: Record<string, string> = {
                                        [NodeType.PROMPT_INPUT]: '文本',
                                        [NodeType.IMAGE_GENERATOR]: '图片生成',
                                        [NodeType.VIDEO_GENERATOR]: '视频生成',
                                        [NodeType.VIDEO_FACTORY]: '视频工厂',
                                        [NodeType.AUDIO_GENERATOR]: '音频生成',
                                        [NodeType.MULTI_FRAME_VIDEO]: '智能多帧',
                                        [NodeType.IMAGE_3D_CAMERA]: '3D 运镜',
                                    };
                                    return typeMap[nodeType] || '新节点';
                                };

                                // 根据节点类型设置默认模型
                                const savedConfig = loadNodeConfig(nodeType);

                                const getDefaultModel = () => {
                                    if (modelId) return modelId;
                                    if (savedConfig.model) return savedConfig.model;
                                    if (nodeType === NodeType.PROMPT_INPUT) return undefined;
                                    if (nodeType === NodeType.IMAGE_GENERATOR) return 'nano-banana';
                                    if (nodeType === NodeType.VIDEO_GENERATOR) return 'veo3.1';
                                    if (nodeType === NodeType.VIDEO_FACTORY) return 'veo3.1';
                                    if (nodeType === NodeType.IMAGE_3D_CAMERA) return 'fal-ai/qwen-image-edit-2511-multiple-angles';
                                    return undefined;
                                };

                                const promptToInject = sourcePrompts.length > 0 ? sourcePrompts[0] : undefined;

                                const getMultiFrameData = () => {
                                    const viduModel = savedConfig.multiFrameData?.viduModel || 'viduq2-turbo';
                                    const viduResolution = savedConfig.multiFrameData?.viduResolution || '720p';
                                    if (nodeType === NodeType.MULTI_FRAME_VIDEO) {
                                        const frames = sourceImages.slice(0, 10).map((src, index) => ({
                                            id: `mf-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                                            src,
                                            transition: { duration: 4, prompt: '' }
                                        }));
                                        return { frames, viduModel, viduResolution };
                                    }
                                    return undefined;
                                };

                                const upstreamIds = sourceNodes.map(n => n.id);
                                const multiFrameData = getMultiFrameData();
                                const newNode: AppNode = {
                                    id: newNodeId,
                                    type: nodeType,
                                    x: newX,
                                    y: newY,
                                    width: nodeWidth,
                                    height: nodeHeight,
                                    title: getTitleByMode(),
                                    status: NodeStatus.IDLE,
                                    data: {
                                        model: getDefaultModel(),
                                        aspectRatio: savedConfig.aspectRatio || '16:9',
                                        resolution: savedConfig.resolution,
                                        duration: savedConfig.duration,
                                        imageCount: savedConfig.imageCount,
                                        videoConfig: savedConfig.videoConfig,
                                        videoModeOverride: savedConfig.videoModeOverride,
                                        ...(generationMode && { generationMode }),
                                        ...(!generationMode && savedConfig.generationMode && { generationMode: savedConfig.generationMode }),
                                        ...(promptToInject && { prompt: promptToInject }),
                                        ...(multiFrameData && { multiFrameData }),
                                    },
                                    inputs: upstreamIds,
                                    modifiedAt: Date.now(),
                                };

                                setNodes(prev => [...prev, newNode]);
                                setConnections(prev => [
                                    ...prev,
                                    ...upstreamIds.map((fromId) => createConnection(fromId, newNodeId))
                                ]);
                                setContextMenu(null);
                            };

                            // 菜单标题
                            const menuTitle = allPromptWithContent
                                ? '创建生成节点'
                                : hasImage && !hasVideo
                                    ? '图片后续操作'
                                    : hasVideo && !hasImage
                                        ? '视频后续操作'
                                        : '创建下游节点';

                            return (
                                <>
                                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {menuTitle}
                                    </div>
                                    {availableTypes.map(({ type, label, icon: Icon, color, generationMode }, idx) => (
                                        <button
                                            key={`${type}-${generationMode || idx}`}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition-colors"
                                            onClick={() => handleCreateDownstreamNode(type, generationMode)}
                                        >
                                            <Icon size={12} className={color} /> {label}
                                        </button>
                                    ))}
                                </>
                            );
                        })()}
                        {contextMenuTarget?.type === 'input-action' && (() => {
                            // 左连接点双击：创建上游输入节点
                            const targetNode = nodes.find(n => n.id === contextMenuTarget.targetNodeId);
                            if (!targetNode) return null;

                            // 判断目标节点类型：提示词节点只能连接素材用于分析
                            const isPromptNode = targetNode.type === NodeType.PROMPT_INPUT;

                            const handleCreateUpstreamNode = (type: NodeType) => {
                                saveHistory();
                                const newNodeWidth = 420;
                                // 计算新节点高度：文本9:16(747)，素材16:9(236)
                                const newNodeHeight = type === NodeType.PROMPT_INPUT ? Math.round(420 * 16 / 9) :
                                    (type === NodeType.IMAGE_ASSET || type === NodeType.VIDEO_ASSET) ? Math.round(420 * 9 / 16) : 320;

                                // 获取目标节点的实际高度
                                const targetHeight = targetNode.height || getApproxNodeHeight(targetNode);

                                // 新节点放在目标节点左侧，保持合理间距
                                const gap = 60; // 节点之间的间距
                                const newX = targetNode.x - gap - newNodeWidth;
                                // 新节点中心对齐目标节点中心
                                const newY = targetNode.y + targetHeight / 2 - newNodeHeight / 2;

                                // 获取节点标题
                                const getTitle = () => {
                                    if (type === NodeType.PROMPT_INPUT) return '文本';
                                    if (type === NodeType.IMAGE_ASSET) return '图片';
                                    if (type === NodeType.VIDEO_ASSET) return '视频';
                                    return '节点';
                                };

                                const newNodeId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                                const newNode: AppNode = {
                                    id: newNodeId,
                                    type,
                                    x: newX,
                                    y: newY,
                                    title: getTitle(),
                                    status: NodeStatus.IDLE,
                                    data: {},
                                    inputs: [],
                                    modifiedAt: Date.now(),
                                };

                                setNodes(prev => [...prev, newNode]);
                                // 自动连接：新节点 → 目标节点
                                setConnections(prev => [...prev, createConnection(newNodeId, targetNode.id)]);
                                // 同时更新目标节点的 inputs
                                setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, inputs: [...n.inputs, newNodeId], modifiedAt: Date.now() } : n));
                                setContextMenu(null);
                            };

                            return (
                                <>
                                    <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isPromptNode ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400'}`}>
                                        {isPromptNode ? '添加输入' : '添加输入节点'}
                                    </div>
                                    {/* 非提示词节点才显示文本选项 */}
                                    {!isPromptNode && (
                                        <button
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg flex items-center gap-2.5 transition-colors"
                                            onClick={() => handleCreateUpstreamNode(NodeType.PROMPT_INPUT)}
                                        >
                                            <Type size={12} className="text-amber-500 dark:text-amber-400" /> 文本
                                        </button>
                                    )}
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg flex items-center gap-2.5 transition-colors"
                                        onClick={() => handleCreateUpstreamNode(NodeType.IMAGE_ASSET)}
                                    >
                                        <ImageIcon size={12} className="text-blue-500 dark:text-blue-400" /> 图片
                                    </button>
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg flex items-center gap-2.5 transition-colors"
                                        onClick={() => handleCreateUpstreamNode(NodeType.VIDEO_ASSET)}
                                    >
                                        <VideoIcon size={12} className="text-green-500 dark:text-green-400" /> 视频
                                    </button>
                                </>
                            );
                        })()}
                        {contextMenuTarget?.type === 'multi-selection' && (
                            <div className="flex items-center gap-1">
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 whitespace-nowrap">
                                    已选中 {contextMenuTarget.ids?.length || 0} 个节点
                                </div>
                                <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />
                                <button
                                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                    onClick={() => {
                                        const selectedNodes = nodes.filter(n => contextMenuTarget.ids?.includes(n.id));
                                        if (selectedNodes.length > 0) {
                                            saveHistory();
                                            const newGroupId = `g-${Date.now()}`;
                                            const minX = Math.min(...selectedNodes.map(n => n.x));
                                            const minY = Math.min(...selectedNodes.map(n => n.y));
                                            const maxX = Math.max(...selectedNodes.map(n => n.x + (n.width || 420)));
                                            const maxY = Math.max(...selectedNodes.map(n => n.y + (n.height || 320)));
                                            setGroups(prev => [...prev, {
                                                id: newGroupId,
                                                title: '新建分组',
                                                x: minX - 32,
                                                y: minY - 32,
                                                width: (maxX - minX) + 64,
                                                height: (maxY - minY) + 64,
                                                nodeIds: selectedNodes.map(n => n.id),
                                                modifiedAt: Date.now(),
                                            }]);
                                            setSelection({ nodeIds: [], groupIds: [newGroupId] });
                                        }
                                        setContextMenu(null);
                                        setContextMenuTarget(null);
                                    }}
                                >
                                    <LayoutTemplate size={12} /> 新建分组
                                </button>
                                {/* 打包：将选中节点的图片/视频合并为组图 */}
                                {(() => {
                                    const selNodes = nodes.filter(n => contextMenuTarget.ids?.includes(n.id));
                                    const imgNodes = selNodes.filter(n => n.data.image && !n.data.videoUri);
                                    const vidNodes = selNodes.filter(n => n.data.videoUri);
                                    const canPack = imgNodes.length >= 2 || vidNodes.length >= 2;
                                    if (!canPack) return null;
                                    return (
                                        <button
                                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                            onClick={() => {
                                                saveHistory();
                                                const removedIds: string[] = [];
                                                // 打包图片节点
                                                if (imgNodes.length >= 2) {
                                                    const target = imgNodes[0];
                                                    const allImages: string[] = [];
                                                    imgNodes.forEach(n => {
                                                        if (n.data.images && n.data.images.length > 0) {
                                                            allImages.push(...n.data.images);
                                                        } else if (n.data.image) {
                                                            allImages.push(n.data.image);
                                                        }
                                                    });
                                                    handleNodeUpdate(target.id, { image: target.data.image, images: allImages });
                                                    removedIds.push(...imgNodes.slice(1).map(n => n.id));
                                                }
                                                // 打包视频节点
                                                if (vidNodes.length >= 2) {
                                                    const target = vidNodes[0];
                                                    const allVideos: string[] = [];
                                                    vidNodes.forEach(n => {
                                                        if (n.data.videoUris && n.data.videoUris.length > 0) {
                                                            allVideos.push(...n.data.videoUris);
                                                        } else if (n.data.videoUri) {
                                                            allVideos.push(n.data.videoUri);
                                                        }
                                                    });
                                                    handleNodeUpdate(target.id, { videoUri: target.data.videoUri, videoUris: allVideos });
                                                    removedIds.push(...vidNodes.slice(1).map(n => n.id));
                                                }
                                                if (removedIds.length > 0) {
                                                    deleteNodes(removedIds);
                                                }
                                                setContextMenu(null);
                                                setContextMenuTarget(null);
                                            }}
                                        >
                                            <Layers size={12} /> 打包为组图
                                        </button>
                                    );
                                })()}
                                <button
                                    className="px-2.5 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/15 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                    onClick={() => {
                                        if (contextMenuTarget.ids) {
                                            deleteNodes(contextMenuTarget.ids);
                                        }
                                        setContextMenu(null);
                                        setContextMenuTarget(null);
                                    }}
                                >
                                    <Trash2 size={12} /> 删除选中节点
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {croppingNodeId && (imageToCrop || videoToCrop) && <ImageCropper imageSrc={imageToCrop || undefined} videoSrc={videoToCrop || undefined} onCancel={() => { setCroppingNodeId(null); setImageToCrop(null); setVideoToCrop(null); }} onConfirm={async (b) => {
                    try {
                        handleNodeUpdate(croppingNodeId, { uploading: true });
                        const url = await uploadImageDataUrl(b);
                        handleNodeUpdate(croppingNodeId, { croppedFrame: url, uploading: false });
                    } catch (error) {
                        console.warn('[Studio] Crop upload failed:', error);
                        handleNodeUpdate(croppingNodeId, { uploading: false });
                    } finally {
                        setCroppingNodeId(null);
                        setImageToCrop(null);
                        setVideoToCrop(null);
                    }
                }} />}
                <ExpandedView media={expandedMedia} onClose={() => setExpandedMedia(null)} />
                {imageModal && (
                    <ImageEditOverlay
                        imageSrc={imageModal.src}
                        images={imageModal.images}
                        initialIndex={imageModal.initialIndex}
                        initialMode={imageModal.initialMode}
                        originalImage={imageModal.originalImage}
                        editOriginImage={imageModal.editOriginImage}
                        canvasData={imageModal.canvasData}
                        nodeId={imageModal.nodeId}
                        onClose={() => setImageModal(null)}
                        onSave={async (nodeId, compositeImage, originalImage, canvasData, activeIndex) => {
                            const maybeUploadImage = async (value?: string) => {
                                if (!value) return value;
                                if (!value.startsWith('data:')) return value;
                                return uploadImageDataUrl(value);
                            };

                            try {
                                handleNodeUpdate(nodeId, { uploading: true });

                                const [compositeUrl, originalUrl, canvasUrl, editOriginUrl] = await Promise.all([
                                    maybeUploadImage(compositeImage),
                                    maybeUploadImage(originalImage),
                                    maybeUploadImage(canvasData),
                                    maybeUploadImage(imageModal.editOriginImage || imageModal.src),
                                ]);

                                let nextImages: string[] | undefined;
                                if (imageModal.images && imageModal.images.length > 0) {
                                    nextImages = [...imageModal.images];
                                    const idx = typeof activeIndex === 'number'
                                        ? activeIndex
                                        : Math.max(0, nextImages.indexOf(imageModal.src));
                                    if (idx >= 0 && idx < nextImages.length) {
                                        nextImages[idx] = compositeUrl || compositeImage;
                                    }
                                    nextImages = await Promise.all(
                                        nextImages.map(async (img) => (await maybeUploadImage(img)) || img)
                                    );
                                }

                                handleNodeUpdate(nodeId, {
                                    image: compositeUrl || compositeImage,
                                    images: nextImages,
                                    originalImage: originalUrl || originalImage,
                                    editOriginImage: editOriginUrl || imageModal.editOriginImage || imageModal.src,
                                    canvasData: canvasUrl || canvasData,
                                    uploading: false,
                                    mediaOrigin: 'edited',
                                });
                            } catch (error) {
                                console.warn('[Studio] Edit upload failed:', error);
                                handleNodeUpdate(nodeId, { uploading: false });
                            } finally {
                                setImageModal(null);
                            }
                        }}
                    />
                )}
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

                <SidebarDock
                    onAddNode={addNode}
                    assetHistory={assetHistory}
                    onHistoryItemClick={(item) => { const type = item.type.includes('image') ? NodeType.IMAGE_GENERATOR : NodeType.VIDEO_GENERATOR; const data = item.type === 'image' ? { image: item.src } : { videoUri: item.src }; addNode(type, undefined, undefined, data); }}
                    onDeleteAsset={(id) => setAssetHistory(prev => prev.filter(a => a.id !== id))}
                    canvases={canvases}
                    currentCanvasId={currentCanvasId}
                    onNewCanvas={createNewCanvas}
                    onSelectCanvas={selectCanvas}
                    onDeleteCanvas={deleteCanvas}
                    onRenameCanvas={renameCanvas}
                    theme={theme}
                    onSetTheme={setTheme}
                    // Subject Library
                    subjects={subjects}
                    onAddSubject={handleAddSubject}
                    onEditSubject={handleEditSubject}
                    onDeleteSubject={handleDeleteSubject}
                    // External panel control
                    externalOpenPanel={externalOpenPanel}
                    onExternalPanelHandled={() => setExternalOpenPanel(null)}
                />

                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="absolute right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-2xl border border-r-0 border-slate-300 bg-white/90 px-2 py-4 text-slate-700 shadow-2xl backdrop-blur-2xl transition-all duration-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        title="展开对话助手"
                    >
                        <span className="flex items-center justify-center">
                            <MessageSquare size={16} />
                        </span>
                    </button>
                )}

                <AssistantPanel
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    externalDragState={chatDragState}
                    externalIncomingAsset={chatIncomingAsset}
                    onExternalIncomingAssetHandled={() => setChatIncomingAsset(null)}
                />

                {/* 用户信息入口 - 左下角 */}
                <div data-user-panel className="absolute bottom-8 left-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <UserInfoWidget
                        onOpenModal={(tab) => {
                            setUserModalTab(tab);
                            setIsUserModalOpen(true);
                        }}
                        onOpenLogin={() => setIsLoginOpen(true)}
                    />
                </div>

                <UserInfoModal
                    isOpen={isUserModalOpen}
                    onClose={() => setIsUserModalOpen(false)}
                    defaultTab={userModalTab}
                />

                <LoginModal
                    isOpen={isLoginOpen}
                    onClose={() => setIsLoginOpen(false)}
                />

                {/* 底部工具栏：撤销/重做 + 缩放控制 */}
                <div data-bottom-toolbar className="absolute bottom-8 right-8 flex items-center gap-1 px-2 py-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* 撤销/重做 */}
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 disabled:hover:bg-transparent"
                        title="撤销 (⌘Z)"
                    >
                        <Undo2 size={16} strokeWidth={2} />
                    </button>
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 disabled:hover:bg-transparent"
                        title="重做 (⌘⇧Z)"
                    >
                        <Redo2 size={16} strokeWidth={2} />
                    </button>

                    {/* 分隔线 */}
                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* 缩放控制 */}
                    <button
                        onClick={() => {
                            // 以节点重心为中心缩放
                            const currentScale = scaleRef.current;
                            const currentPan = panRef.current;
                            const newScale = Math.max(0.2, currentScale - 0.1);

                            const rect = canvasContainerRef.current?.getBoundingClientRect();
                            if (!rect) {
                                setScale(newScale);
                                return;
                            }

                            // 获取节点重心在画布坐标系中的位置
                            const centerCanvas = getNodesCenterPoint();

                            // 将重心转换为屏幕坐标
                            const centerScreenX = centerCanvas.x * currentScale + currentPan.x;
                            const centerScreenY = centerCanvas.y * currentScale + currentPan.y;

                            // 计算新的 pan，使重心在缩放后保持在相同的屏幕位置
                            const newPanX = centerScreenX - centerCanvas.x * newScale;
                            const newPanY = centerScreenY - centerCanvas.y * newScale;

                            setScale(newScale);
                            setPan({ x: newPanX, y: newPanY });
                        }}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <Minus size={14} strokeWidth={2.5} />
                    </button>
                    <span
                        className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-10 text-center tabular-nums cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 select-none"
                        onClick={() => setScale(1)}
                        title="重置缩放"
                    >
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={() => {
                            // 以节点重心为中心缩放
                            const currentScale = scaleRef.current;
                            const currentPan = panRef.current;
                            const newScale = Math.min(3, currentScale + 0.1);

                            const rect = canvasContainerRef.current?.getBoundingClientRect();
                            if (!rect) {
                                setScale(newScale);
                                return;
                            }

                            // 获取节点重心在画布坐标系中的位置
                            const centerCanvas = getNodesCenterPoint();

                            // 将重心转换为屏幕坐标
                            const centerScreenX = centerCanvas.x * currentScale + currentPan.x;
                            const centerScreenY = centerCanvas.y * currentScale + currentPan.y;

                            // 计算新的 pan，使重心在缩放后保持在相同的屏幕位置
                            const newPanX = centerScreenX - centerCanvas.x * newScale;
                            const newPanY = centerScreenY - centerCanvas.y * newScale;

                            setScale(newScale);
                            setPan({ x: newPanX, y: newPanY });
                        }}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <Plus size={14} strokeWidth={2.5} />
                    </button>

                    {/* 分隔线 */}
                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* 适配视图 */}
                    <button onClick={handleFitView} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700" title="适配视图">
                        <Scan size={14} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Subject Editor Modal */}
                {isSubjectEditorOpen && (
                    <SubjectEditor
                        subject={editingSubject}
                        initialImage={subjectEditorInitialImage || undefined}
                        canvasImageSources={canvasImageSources}
                        onSave={handleSaveSubject}
                        onCancel={() => { setIsSubjectEditorOpen(false); setEditingSubject(null); setSubjectEditorInitialImage(null); }}
                    />
                )}
            </div>
        </div>
    );
};
