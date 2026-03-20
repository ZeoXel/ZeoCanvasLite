"use client";

import { AppNode, NodeStatus, NodeType, AudioGenerationMode, Subject, SelectedSubject, CameraParams } from '@/types';
import { Play, Image as ImageIcon, Video as VideoIcon, Type, AlertCircle, CheckCircle, Plus, Maximize2, Download, Wand2, Scaling, FileSearch, Edit, Loader2, X, Upload, Film, ChevronDown, ChevronUp, Copy, Monitor, Music, Pause, Mic2, Grid3X3, Check, Clock, ArrowRight, Settings2, Speech, User, Camera } from 'lucide-react';
import { AudioNodePanel } from './AudioNodePanel';
import { ConfigExpandButton, CollapsibleContent } from './shared/ConfigExpandSection';
import { GenerateCreditButton } from './shared/GenerateCreditButton';
import { VideoConfigPanel, ViduConfig, VeoConfig, SeedanceConfig } from './shared/VideoConfigPanel';
import { SubjectPicker, SubjectHighlighter, SubjectMention } from './subject';
import React, { memo, useRef, useState, useEffect, useCallback, useMemo } from 'react';

// Import shared components and utilities
import {
    SecureVideo,
    globalVideoBlobCache,
    getProxiedUrl,
    needsProxy,
    safePlay,
    safePause,
    InputThumbnails,
    AudioVisualizer,
    IMAGE_ASPECT_RATIOS,
    VIDEO_ASPECT_RATIOS,
    IMAGE_RESOLUTIONS,
    VIDEO_RESOLUTIONS,
    IMAGE_COUNTS,
    VIDEO_COUNTS,
    getImageModelConfig,
    GLASS_PANEL,
    DEFAULT_NODE_WIDTH,
    DEFAULT_FIXED_HEIGHT,
    AUDIO_NODE_HEIGHT,
    getDurationOptions,
    getDefaultDuration,
    supportsFirstLastFrame,
    getVideoResolutions,
    getDefaultVideoResolution,
} from './shared';
import type { VideoGenerationMode } from './shared/constants';
import type { InputAsset } from './shared';
import { getProviderByModelId, getProvidersByCategory, type ModelCategory } from '@/config/models';
import { estimateNodeCredits } from '@/services/pricing/nodeCreditEstimator';
import { isViduModelModeSupported, type ViduGenerationMode } from '@/services/providers/viduCapabilities';
import { parseSubjectReferences } from '@/services/subjectService';
import { getSubjectImageSrc } from '@/services/cosStorage';
import { analyzeViduReferenceImages, buildViduReferencePreviewAssets, MAX_VIDU_REFERENCE_IMAGES } from '@/services/viduReferencePreview';

// Re-export for backward compatibility
export { globalVideoBlobCache } from './shared';

// 动态导入 Camera3DVisualizer（避免 SSR 问题）- 放在组件外部避免重复创建
const Camera3DVisualizer = React.lazy(() => import('./Camera3DVisualizer'));

const PROMPT_CONTENT_MIN_HEIGHT = 96;
const PROMPT_CONTENT_MAX_HEIGHT = 2400;
const PROMPT_NODE_CHROME_HEIGHT = 56;
const CONFIG_PROMPT_MIN_HEIGHT = 80;
const CONFIG_PROMPT_MAX_HEIGHT = 520;
const FIXED_CONFIG_PANEL_WIDTH = 412;
const SEEDREAM_30_T2I_MODEL = 'doubao-seedream-3-0-t2i-250415';
const SEEDEDIT_30_I2I_MODEL = 'doubao-seededit-3-0-i2i-250628';
const SEEDREAM_45_MODEL = 'doubao-seedream-4-5-251128';
const SEEDREAM_3_I2I_DISABLED_REASON = '官方修复中';

const isSeedream3AutoPair = (model?: string): boolean =>
    model === SEEDREAM_30_T2I_MODEL || model === SEEDEDIT_30_I2I_MODEL;

const resolveSeedream3TextModel = (): string => SEEDREAM_30_T2I_MODEL;

/**
 * 带悬停提示的图标组件
 * 用于节点空状态的简洁显示
 */
const IconWithTooltip: React.FC<{
    icon: React.ElementType;
    tooltip: string;
    colorClass: string;
    size?: number;
    onClick?: (e: React.MouseEvent) => void;
    isLoading?: boolean;
}> = ({ icon: Icon, tooltip, colorClass, size = 32, onClick, isLoading }) => (
    <div className="relative group/icon select-none" onClick={onClick} onMouseDown={onClick ? (e) => e.stopPropagation() : undefined}>
        {isLoading ? (
            <Loader2 size={size} className={`animate-spin ${colorClass}`} />
        ) : (
            <Icon size={size} className={`${colorClass} opacity-50 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`} />
        )}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 dark:bg-slate-700 text-white text-[9px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-50">
            {tooltip}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 dark:bg-slate-700 rotate-45" />
        </div>
    </div>
);

interface NodeProps {
    node: AppNode;
    onUpdate: (id: string, data: Partial<AppNode['data']>, size?: { width?: number, height?: number }, title?: string) => void;
    onAction: (id: string, prompt?: string) => void;
    onDelete: (id: string) => void;
    onExpand?: (data: {
        type: 'image' | 'video',
        src: string,
        rect: DOMRect,
        images?: string[],
        initialIndex?: number,
        nodeId?: string,
        originalImage?: string,
        canvasData?: string,
        editOriginImage?: string
    }) => void;
    onEdit?: (nodeId: string, src: string, originalImage?: string, canvasData?: string, editOriginImage?: string) => void;
    onCrop?: (id: string, src: string, type?: 'image' | 'video') => void;
    onNodeMouseDown: (e: React.MouseEvent, id: string) => void;
    onPortMouseDown: (e: React.MouseEvent, id: string, type: 'input' | 'output') => void;
    onPortMouseUp: (e: React.MouseEvent, id: string, type: 'input' | 'output') => void;
    onOutputPortAction?: (nodeId: string, position: { x: number, y: number }) => void; // 双击/拖拽释放右连接点时触发
    onInputPortAction?: (nodeId: string, position: { x: number, y: number }) => void; // 双击/拖拽释放左连接点时触发（创建上游节点）
    onNodeContextMenu: (e: React.MouseEvent, id: string) => void;
    onMediaContextMenu?: (e: React.MouseEvent, nodeId: string, type: 'image' | 'video', src: string) => void;
    onResizeMouseDown: (e: React.MouseEvent, id: string, initialWidth: number, initialHeight: number) => void;
    onDragResultToCanvas?: (sourceNodeId: string, type: 'image' | 'video', src: string, canvasX: number, canvasY: number) => void; // 从组图宫格拖拽结果到画布
    onGridDragStateChange?: (state: { isDragging: boolean; type?: 'image' | 'video'; src?: string; screenX?: number; screenY?: number } | null) => void; // 通知父组件拖拽状态变化
    onBatchUpload?: (files: File[], type: 'image' | 'video', sourceNodeId: string) => void; // 批量上传素材回调
    onUploadImageFile?: (file: File) => Promise<string>;
    onUploadVideoFile?: (file: File) => Promise<string>;
    inputAssets?: InputAsset[];
    onInputReorder?: (nodeId: string, newOrder: string[]) => void;
    nodeRef?: (el: HTMLDivElement | null) => void; // 用于父组件直接操作 DOM
    subjects?: Subject[]; // 主体库
    onOpenSubjectLibrary?: () => void; // 打开主体库面板
    onCreateSubject?: (imageSrc: string) => void; // 从图片创建主体
    on3DCamera?: (imageSrc: string, nodeId: string) => void; // 从图片创建3D运镜节点

    isDragging?: boolean;
    isGroupDragging?: boolean;
    isSelected?: boolean;
    suppressFloatingPanels?: boolean;
    suppressPorts?: boolean;
    isResizing?: boolean;
    isConnecting?: boolean;
    zoom?: number;
}

// Custom Comparator for React.memo to prevent unnecessary re-renders during drag
const arePropsEqual = (prev: NodeProps, next: NodeProps) => {
    if (prev.isDragging !== next.isDragging ||
        prev.isResizing !== next.isResizing ||
        prev.isSelected !== next.isSelected ||
        prev.suppressFloatingPanels !== next.suppressFloatingPanels ||
        prev.suppressPorts !== next.suppressPorts ||
        prev.isGroupDragging !== next.isGroupDragging ||
        prev.isConnecting !== next.isConnecting ||
        prev.zoom !== next.zoom) {
        return false;
    }
    if (prev.node !== next.node) return false;
    const prevInputs = prev.inputAssets || [];
    const nextInputs = next.inputAssets || [];
    if (prevInputs.length !== nextInputs.length) return false;
    for (let i = 0; i < prevInputs.length; i++) {
        if (prevInputs[i].id !== nextInputs[i].id || prevInputs[i].src !== nextInputs[i].src) return false;
    }
    return true;
};

const NodeComponent: React.FC<NodeProps> = ({
    node, onUpdate, onAction, onDelete, onExpand, onEdit, onCrop, onNodeMouseDown, onPortMouseDown, onPortMouseUp, onOutputPortAction, onInputPortAction, onNodeContextMenu, onMediaContextMenu, onResizeMouseDown, onDragResultToCanvas, onGridDragStateChange, onBatchUpload, onUploadImageFile, onUploadVideoFile, inputAssets, onInputReorder, nodeRef, subjects, onOpenSubjectLibrary, onCreateSubject, on3DCamera, isDragging, isGroupDragging, isSelected, suppressFloatingPanels, suppressPorts, isResizing, isConnecting, zoom = 1
}) => {
    const inverseScale = 1 / Math.max(0.1, zoom);
    // 检测深色模式
    const [isDarkMode, setIsDarkMode] = useState(false);
    useEffect(() => {
        const checkDarkMode = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
        checkDarkMode();
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    const isWorking = node.status === NodeStatus.WORKING;
    const isUploading = Boolean(node.data?.uploading);
    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null>(null);
    const playPromiseRef = useRef<Promise<void> | null>(null);
    const isHoveringRef = useRef(false);
    const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
    const [isLoadingVideo, setIsLoadingVideo] = useState(false);
    const [showImageGrid, setShowImageGrid] = useState(false);
    const [isGridAnimating, setIsGridAnimating] = useState(false); // 网格展开/收起动画中
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState(node.title);
    const [isHovered, setIsHovered] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [isEditingResult, setIsEditingResult] = useState(false); // 编辑已有结果的模式
    const [hideBottomPanelAfterUpload, setHideBottomPanelAfterUpload] = useState(false);
    const [isVideoConfigExpanded, setIsVideoConfigExpanded] = useState(false); // 视频扩展配置展开状态
    const generationMode = node.data.generationMode || 'CONTINUE';
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [localPrompt, setLocalPrompt] = useState(node.data.prompt || '');
    const [isPromptEditing, setIsPromptEditing] = useState(false);
    const [promptContentHeight, setPromptContentHeight] = useState(150);
    const [isPromptContentResizing, setIsPromptContentResizing] = useState(false);
    const [inputHeight, setInputHeight] = useState(CONFIG_PROMPT_MIN_HEIGHT);
    const [promptScrollOffset, setPromptScrollOffset] = useState({ top: 0, left: 0 });
    const isResizingInput = useRef(false);
    const inputStartDragY = useRef(0);
    const inputStartHeight = useRef(0);
    const isResizingPromptContent = useRef(false);
    const promptContentStartDragY = useRef(0);
    const promptContentStartHeight = useRef(0);

    // 组图宫格拖拽状态
    const [gridDragState, setGridDragState] = useState<{
        isDragging: boolean;
        src: string;
        type: 'image' | 'video';
    } | null>(null);

    useEffect(() => { setLocalPrompt(node.data.prompt || ''); }, [node.data.prompt]);
    useEffect(() => {
        setPromptScrollOffset({ top: 0, left: 0 });
    }, [node.id, isPromptEditing]);
    useEffect(() => {
        if (node.type === NodeType.PROMPT_INPUT) return;
        const textarea = promptTextareaRef.current;
        if (!textarea) return;
        const contentHeight = textarea.scrollHeight;
        const nextHeight = Math.max(CONFIG_PROMPT_MIN_HEIGHT, Math.min(contentHeight, CONFIG_PROMPT_MAX_HEIGHT));
        setInputHeight((prev) => (nextHeight > prev ? nextHeight : prev));
    }, [localPrompt, node.type]);
    useEffect(() => {
        if (isSelected) return;
        setHideBottomPanelAfterUpload(false);
    }, [isSelected]);
    useEffect(() => {
        if (node.type !== NodeType.PROMPT_INPUT) return;
        if (!node.height) return;
        const syncedHeight = Math.max(
            PROMPT_CONTENT_MIN_HEIGHT,
            Math.min(node.height - PROMPT_NODE_CHROME_HEIGHT, PROMPT_CONTENT_MAX_HEIGHT)
        );
        setPromptContentHeight(prev => (Math.abs(prev - syncedHeight) < 1 ? prev : syncedHeight));
    }, [node.type, node.height]);

    // 网格展开/收起动画控制：收起时延迟显示底部面板（与尺寸/opacity过渡同步）
    useEffect(() => {
        if (showImageGrid) {
            setIsGridAnimating(true);
        } else {
            const timer = setTimeout(() => setIsGridAnimating(false), 400);
            return () => clearTimeout(timer);
        }
    }, [showImageGrid]);
    const handlePromptScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
        const nextTop = e.currentTarget.scrollTop;
        const nextLeft = e.currentTarget.scrollLeft;
        setPromptScrollOffset((prev) => {
            if (prev.top === nextTop && prev.left === nextLeft) return prev;
            return { top: nextTop, left: nextLeft };
        });
    }, []);
    const commitPrompt = () => { if (localPrompt !== (node.data.prompt || '')) onUpdate(node.id, { prompt: localPrompt }); };
    const isVideoGenNode = node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY;
    const isImageGenNode = node.type === NodeType.IMAGE_GENERATOR || node.type === NodeType.IMAGE_EDITOR || node.type === NodeType.IMAGE_3D_CAMERA;
    const isStoryContinueMode = node.type === NodeType.VIDEO_FACTORY && (generationMode === 'CONTINUE' || generationMode === 'CUT');
    const isViduVideoNode = isVideoGenNode && (node.data.model || '').startsWith('vidu');
    const enableSubjectMentions = isViduVideoNode && !isStoryContinueMode && !!(subjects && subjects.length > 0);
    const hasVideoResult = !!(node.data.videoUri || (node.data.videoUris && node.data.videoUris.length > 0));
    const hasImageResult = !!(node.data.image || (node.data.images && node.data.images.length > 0));
    const estimatedCredits = useMemo(() => estimateNodeCredits(node, inputAssets || []), [node, inputAssets]);
    const currentProvider = useMemo(() => getProviderByModelId(node.data.model || ''), [node.data.model]);
    const videoModeOverride = (node.data.videoModeOverride || 'auto') as VideoGenerationMode | 'auto';
    const hasSelectedSubjects = !isStoryContinueMode && isViduVideoNode && (node.data.selectedSubjects?.length || 0) > 0;
    const promptSubjectReferences = useMemo(() => {
        if (!enableSubjectMentions) return [];
        const promptForDetection = localPrompt || node.data.prompt || '';
        if (!promptForDetection.includes('@')) return [];
        return parseSubjectReferences(promptForDetection, subjects || []);
    }, [enableSubjectMentions, localPrompt, node.data.prompt, subjects]);
    const hasPromptSubjectMentions = !isStoryContinueMode && isViduVideoNode && promptSubjectReferences.length > 0;
    const hasSubjectReferences = hasSelectedSubjects || hasPromptSubjectMentions;
    const hasFirstLastFrameData = !!(node.data.firstLastFrameData?.firstFrame && node.data.firstLastFrameData?.lastFrame);
    const imageInputCount = (inputAssets || []).filter(a => a.type === 'image').length;
    const hasTwoImageInputs = imageInputCount === 2;
    const shouldPreferViduReference = isViduVideoNode && !hasSubjectReferences && !hasFirstLastFrameData && imageInputCount > 2;
    const hasInputImage = !!((inputAssets?.length || 0) > 0 || node.data.image);
    const upstreamImageAssets = useMemo(
        () => (inputAssets || []).filter((asset) => asset.type === 'image' && !!asset.src),
        [inputAssets]
    );
    const upstreamReferenceImages = useMemo(
        () => upstreamImageAssets.map((asset) => asset.src),
        [upstreamImageAssets]
    );
    const promptSubjectPreviewSources = useMemo(
        () => promptSubjectReferences.map((ref) => ({
            subjectId: ref.id,
            imageUrls: ref.subject.images
                .map((img) => getSubjectImageSrc(img))
                .filter(Boolean)
                .slice(0, 3),
        })),
        [promptSubjectReferences]
    );
    const viduReferenceUsage = useMemo(() => {
        if (!isViduVideoNode) return null;
        return analyzeViduReferenceImages(upstreamReferenceImages, promptSubjectPreviewSources);
    }, [isViduVideoNode, upstreamReferenceImages, promptSubjectPreviewSources]);
    const getSubjectMentionDisabledReason = useCallback((subject: Subject): string | undefined => {
        if (!isViduVideoNode) return undefined;
        const currentIds = new Set(promptSubjectPreviewSources.map((item) => item.subjectId));
        if (currentIds.has(subject.id)) return undefined;
        const candidateImages = subject.images
            .map((img) => getSubjectImageSrc(img))
            .filter(Boolean)
            .slice(0, 3);
        if (candidateImages.length === 0) return '主体无可用参考图';
        const usageWithCandidate = analyzeViduReferenceImages(
            upstreamReferenceImages,
            [...promptSubjectPreviewSources, { subjectId: subject.id, imageUrls: candidateImages }]
        );
        if (usageWithCandidate.totalUniqueImages > MAX_VIDU_REFERENCE_IMAGES) {
            return `已达${MAX_VIDU_REFERENCE_IMAGES}张参考图上限`;
        }
        return undefined;
    }, [isViduVideoNode, promptSubjectPreviewSources, upstreamReferenceImages]);
    const viduReferencePreviewAssets = useMemo(() => {
        if (!isViduVideoNode) return [];
        if (promptSubjectPreviewSources.length === 0) return [];

        return buildViduReferencePreviewAssets(
            upstreamImageAssets,
            promptSubjectPreviewSources
        );
    }, [upstreamImageAssets, isViduVideoNode, promptSubjectPreviewSources]);
    const autoInferredVideoMode: VideoGenerationMode = isStoryContinueMode
        ? 'img2video'
        : hasSubjectReferences
            ? 'reference'
            : shouldPreferViduReference
                ? 'reference'
                : (hasFirstLastFrameData || hasTwoImageInputs)
                    ? 'start-end'
                    : hasInputImage
                        ? 'img2video'
                        : 'text2video';
    const inferredVideoMode: VideoGenerationMode = videoModeOverride === 'auto'
        ? autoInferredVideoMode
        : videoModeOverride;
    const viduModeForModelFilter: ViduGenerationMode = isStoryContinueMode
        ? 'img2video'
        : hasSubjectReferences
            ? 'reference-audio'
            : inferredVideoMode;

    // 所有同类厂商的模型，按厂商分组（用于下拉选择）
    const allModelsGrouped = useMemo(() => {
        // 优先用已识别的 provider category；未知模型时按节点类型兜底，保证下拉始终可用
        const category: ModelCategory | undefined =
            currentProvider?.category
            || (isImageGenNode ? 'image' : isVideoGenNode ? 'video' : undefined);
        if (!category) return [];
        return getProvidersByCategory(category).map(p => ({
            provider: p,
            models: (() => {
                if (p.id === 'vidu' && isVideoGenNode) {
                    return p.models.filter(m => isViduModelModeSupported(m.id, viduModeForModelFilter));
                }
                if (p.id === 'seedream' && isImageGenNode) {
                    const hasUpstreamImageInputs = (inputAssets || []).some(asset => asset.type === 'image');
                    const nonAutoModels = p.models.filter(
                        m => m.id !== SEEDREAM_30_T2I_MODEL && m.id !== SEEDEDIT_30_I2I_MODEL
                    );
                    const seedream3Base = p.models.find(
                        m => m.id === SEEDREAM_30_T2I_MODEL || m.id === SEEDEDIT_30_I2I_MODEL
                    );
                    const mergedSeedream3 = seedream3Base
                        ? [{
                            ...seedream3Base,
                            id: resolveSeedream3TextModel(),
                            name: 'Seedream 3.0',
                            disabled: hasUpstreamImageInputs,
                            disabledReason: hasUpstreamImageInputs ? SEEDREAM_3_I2I_DISABLED_REASON : undefined,
                        }]
                        : [];
                    return [...nonAutoModels, ...mergedSeedream3];
                }
                return p.models;
            })(),
        })).filter(g => g.models.length > 0);
    }, [currentProvider, isImageGenNode, isVideoGenNode, viduModeForModelFilter, inputAssets]);
    const videoResolutionOptions = useMemo(
        () => isVideoGenNode ? getVideoResolutions(node.data.model, inferredVideoMode) : [],
        [isVideoGenNode, node.data.model, inferredVideoMode]
    );
    const defaultVideoResolution = useMemo(
        () => isVideoGenNode ? getDefaultVideoResolution(node.data.model) : '720p',
        [isVideoGenNode, node.data.model]
    );
    const videoDurationOptions = useMemo(
        () => isVideoGenNode ? getDurationOptions(node.data.model, inferredVideoMode) : [],
        [isVideoGenNode, node.data.model, inferredVideoMode]
    );
    const defaultVideoDuration = useMemo(
        () => isVideoGenNode ? getDefaultDuration(node.data.model, inferredVideoMode) : 5,
        [isVideoGenNode, node.data.model, inferredVideoMode]
    );

    // Seedream 3.0 在图生图场景不可用：自动切到 4.5，避免触发不可用模型
    useEffect(() => {
        if (!isImageGenNode) return;
        const currentModel = node.data.model || '';
        if (!isSeedream3AutoPair(currentModel)) return;
        const hasUpstreamImageInputs = (inputAssets || []).some(asset => asset.type === 'image');
        const expectedModel = hasUpstreamImageInputs ? SEEDREAM_45_MODEL : SEEDREAM_30_T2I_MODEL;
        if (expectedModel === currentModel) return;
        onUpdate(node.id, { model: expectedModel });
    }, [isImageGenNode, node.data.model, node.id, onUpdate, inputAssets]);

    // Vidu 模式切换时，若当前模型不支持新模式则自动切换到第一个可用模型
    useEffect(() => {
        if (!isVideoGenNode) return;
        if (currentProvider?.id !== 'vidu') return;
        const viduGroup = allModelsGrouped.find(g => g.provider.id === 'vidu');
        if (!viduGroup || viduGroup.models.length === 0) return;
        if (!node.data.model || viduGroup.models.some(m => m.id === node.data.model)) return;
        onUpdate(node.id, { model: viduGroup.models[0].id });
    }, [isVideoGenNode, currentProvider?.id, node.data.model, allModelsGrouped, onUpdate, node.id]);

    useEffect(() => {
        if (!isImageGenNode) return;
        const modelConfig = getImageModelConfig(node.data.model || '');
        if (!modelConfig.supportsResolution) return;
        const availableResolutions = modelConfig.resolutions || IMAGE_RESOLUTIONS;
        if (availableResolutions.length === 0) return;
        const defaultResolution = modelConfig.defaultResolution || availableResolutions[0];
        const currentResolution = node.data.resolution || defaultResolution;
        if (availableResolutions.includes(currentResolution) && node.data.resolution) return;
        onUpdate(node.id, { resolution: defaultResolution });
    }, [isImageGenNode, node.data.model, node.data.resolution, onUpdate, node.id]);

    useEffect(() => {
        if (!isVideoGenNode) return;
        if (videoResolutionOptions.length === 0) return;
        const currentResolution = node.data.resolution || defaultVideoResolution;
        if (videoResolutionOptions.includes(currentResolution)) return;
        onUpdate(node.id, { resolution: defaultVideoResolution });
    }, [isVideoGenNode, videoResolutionOptions, node.data.resolution, defaultVideoResolution, onUpdate, node.id]);

    useEffect(() => {
        if (!isVideoGenNode) return;
        if (videoDurationOptions.length === 0) return;
        const currentDuration = node.data.duration ?? defaultVideoDuration;
        if (videoDurationOptions.includes(currentDuration)) return;
        onUpdate(node.id, { duration: defaultVideoDuration });
    }, [isVideoGenNode, videoDurationOptions, node.data.duration, defaultVideoDuration, onUpdate, node.id]);

    const handleActionClick = () => {
        commitPrompt();
        const shouldReuseCurrentMedia = (isVideoGenNode && hasVideoResult) || (isImageGenNode && hasImageResult);
        if (shouldReuseCurrentMedia) {
            setIsEditingResult(false);
            onAction(node.id, localPrompt);
            return;
        }

        const shouldClearResult = isEditingResult;
        if (shouldClearResult) {
            onUpdate(node.id, {
                image: undefined,
                images: undefined,
                videoUri: undefined,
                videoUris: undefined,
                videoMetadata: undefined,
                error: undefined,
            });
            setIsEditingResult(false);
            setTimeout(() => {
                onAction(node.id, localPrompt);
            }, 50);
        } else {
            onAction(node.id, localPrompt);
        }
    };
    const handleCmdEnter = (e: React.KeyboardEvent) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent;
        if (nativeEvent.isComposing) return;
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            handleActionClick();
        }
    };
    const enterPromptEditMode = useCallback(() => {
        if (node.type !== NodeType.PROMPT_INPUT) return;
        setIsPromptEditing(true);
        requestAnimationFrame(() => {
            const textarea = promptTextareaRef.current;
            if (!textarea) return;
            textarea.focus();
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
        });
    }, [node.type]);

    const handleInputResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        isResizingInput.current = true; inputStartDragY.current = e.clientY; inputStartHeight.current = inputHeight;
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!isResizingInput.current) return;
            setInputHeight(
                Math.max(
                    CONFIG_PROMPT_MIN_HEIGHT,
                    Math.min(inputStartHeight.current + (e.clientY - inputStartDragY.current), CONFIG_PROMPT_MAX_HEIGHT)
                )
            );
        };
        const handleGlobalMouseUp = () => { isResizingInput.current = false; window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
        window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp);
    };
    const handlePromptContentResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        isResizingPromptContent.current = true;
        setIsPromptContentResizing(true);
        promptContentStartDragY.current = e.clientY;
        promptContentStartHeight.current = promptContentHeight;
        let pendingNodeHeight = Math.round(nodeHeight);
        let lastCommittedHeight = Math.round(nodeHeight);
        let rafId: number | null = null;
        const handleGlobalMouseMove = (evt: MouseEvent) => {
            if (!isResizingPromptContent.current) return;
            const nextHeight = promptContentStartHeight.current + (evt.clientY - promptContentStartDragY.current);
            const clampedContentHeight = Math.max(PROMPT_CONTENT_MIN_HEIGHT, Math.min(nextHeight, PROMPT_CONTENT_MAX_HEIGHT));
            setPromptContentHeight(clampedContentHeight);
            pendingNodeHeight = Math.round(clampedContentHeight + PROMPT_NODE_CHROME_HEIGHT);
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                if (pendingNodeHeight === lastCommittedHeight) return;
                lastCommittedHeight = pendingNodeHeight;
                onUpdate(node.id, {}, { height: pendingNodeHeight });
            });
        };
        const handleGlobalMouseUp = () => {
            isResizingPromptContent.current = false;
            setIsPromptContentResizing(false);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (pendingNodeHeight !== lastCommittedHeight) {
                onUpdate(node.id, {}, { height: pendingNodeHeight });
            }
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
    };

    React.useEffect(() => {
        if ((node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY) && node.data.videoUri) {
            if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); setVideoBlobUrl(null); }
            if (node.data.videoUri.startsWith('data:')) { setVideoBlobUrl(node.data.videoUri); return; }
            // 不需要代理的 URL（如 COS 已配置 CORS）直接使用，无需 blob 转换
            if (!needsProxy(node.data.videoUri)) { setVideoBlobUrl(node.data.videoUri); setIsLoadingVideo(false); return; }
            let isActive = true; setIsLoadingVideo(true);
            // Use proxy for Volcengine URLs to bypass CORS
            const fetchUrl = getProxiedUrl(node.data.videoUri);
            fetch(fetchUrl).then(res => res.blob()).then(blob => {
                if (isActive) {
                    // Force video/mp4 for local analysis blob too
                    const mp4Blob = new Blob([blob], { type: 'video/mp4' });
                    setVideoBlobUrl(URL.createObjectURL(mp4Blob));
                    setIsLoadingVideo(false);
                }
            }).catch(err => { if (isActive) setIsLoadingVideo(false); });
            return () => { isActive = false; if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl); };
        }
    }, [node.data.videoUri, node.type]);

    const toggleAudio = (e: React.MouseEvent) => {
        e.stopPropagation();
        const audio = mediaRef.current as HTMLAudioElement;
        if (!audio) return;
        if (audio.paused) { audio.play(); setIsPlayingAudio(true); } else { audio.pause(); setIsPlayingAudio(false); }
    };

    useEffect(() => {
        return () => {
            if (mediaRef.current && (mediaRef.current instanceof HTMLVideoElement || mediaRef.current instanceof HTMLAudioElement)) {
                try { mediaRef.current.pause(); mediaRef.current.src = ""; mediaRef.current.load(); } catch (e) { }
            }
        }
    }, []);

    const handleMouseEnter = () => {
        isHoveringRef.current = true;
        // 移除悬停自动展开宫格，改为点击展开

        // Play Video on Hover
        if (mediaRef.current instanceof HTMLVideoElement) {
            safePlay(mediaRef.current);
        }
    };

    const handleMouseLeave = () => {
        isHoveringRef.current = false;
        // 移除悬停关闭宫格，由点击控制

        // Pause Video on Leave
        if (mediaRef.current instanceof HTMLVideoElement) {
            safePause(mediaRef.current);
        }
    };

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onExpand && mediaRef.current) {
            const rect = mediaRef.current.getBoundingClientRect();
            if (node.type.includes('IMAGE') && node.data.image) {
                onExpand({
                    type: 'image',
                    src: node.data.image,
                    rect,
                    images: node.data.images || [node.data.image],
                    initialIndex: (node.data.images || [node.data.image]).indexOf(node.data.image),
                    nodeId: node.id,
                    originalImage: node.data.originalImage,
                    canvasData: node.data.canvasData,
                    editOriginImage: node.data.editOriginImage,
                });
            } else if (node.type.includes('VIDEO') && node.data.videoUri) {
                const src = node.data.videoUri;
                const videos = node.data.videoUris && node.data.videoUris.length > 0 ? node.data.videoUris : [src];
                const currentIndex = node.data.videoUris ? node.data.videoUris.indexOf(node.data.videoUri) : 0;
                const safeIndex = currentIndex >= 0 ? currentIndex : 0;
                // Pass the URIs directly; ExpandedView will use SecureVideo logic
                onExpand({ type: 'video', src: src, rect, images: videos, initialIndex: safeIndex });
            }
        }
    };
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const src = node.data.image || videoBlobUrl || node.data.audioUri || '';
        if (!src) return;

        try {
            let blobUrl = src;
            // 如果是远程 URL（非 base64/blob），需要 fetch 转 blob
            if (src.startsWith('http')) {
                // Use proxy for Volcengine URLs to bypass CORS
                const fetchUrl = getProxiedUrl(src);
                const response = await fetch(fetchUrl);
                const blob = await response.blob();
                blobUrl = URL.createObjectURL(blob);
            }

            const ext = src.includes('video') || videoBlobUrl ? 'mp4' : src.includes('audio') ? 'wav' : 'png';
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `studio-${Date.now()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 清理临时 blob URL
            if (src.startsWith('http')) URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Download failed:', err);
            // 降级：在新窗口打开
            window.open(src, '_blank');
        }
    };
    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEdit && node.data.image) {
            onEdit(node.id, node.data.image, node.data.originalImage, node.data.canvasData, node.data.editOriginImage);
        }
    };
    const handleCreateSubject = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.data.image && onCreateSubject) {
            onCreateSubject(node.data.image);
        }
    };
    const handleCreate3DCamera = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.data.image && on3DCamera && node.type !== NodeType.IMAGE_3D_CAMERA) {
            on3DCamera(node.data.image, node.id);
        }
    };
    const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.onloadedmetadata = async () => {
                const w = video.videoWidth;
                const h = video.videoHeight;
                const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
                const divisor = gcd(w, h);
                const ratioW = w / divisor;
                const ratioH = h / divisor;
                // 简化常见比例
                let aspectRatio = `${ratioW}:${ratioH}`;
                if (Math.abs(w / h - 16 / 9) < 0.1) aspectRatio = '16:9';
                else if (Math.abs(w / h - 9 / 16) < 0.1) aspectRatio = '9:16';
                else if (Math.abs(w / h - 1) < 0.1) aspectRatio = '1:1';
                else if (Math.abs(w / h - 4 / 3) < 0.1) aspectRatio = '4:3';
                else if (Math.abs(w / h - 3 / 4) < 0.1) aspectRatio = '3:4';

                const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
                const [rw, rh] = aspectRatio.split(':').map(Number);
                const newHeight = (nodeWidth * rh) / rw;
                const useFallback = !onUploadVideoFile;
                try {
                    setHideBottomPanelAfterUpload(true);
                    setIsInputFocused(false);
                    if (!useFallback) {
                        onUpdate(node.id, { uploading: true });
                    }
                    const url = useFallback ? objectUrl : await onUploadVideoFile(file);
                    onUpdate(node.id, { videoUri: url, aspectRatio, uploading: false, mediaOrigin: 'uploaded' }, { height: newHeight });
                } catch (error) {
                    console.warn('[Node] Video upload failed:', error);
                    setHideBottomPanelAfterUpload(false);
                    if (!useFallback) {
                        onUpdate(node.id, { uploading: false });
                    }
                } finally {
                    if (!useFallback) {
                        URL.revokeObjectURL(objectUrl);
                    }
                }
            };
            video.onerror = () => {
                URL.revokeObjectURL(objectUrl);
            };
            video.src = objectUrl;
        }
    };
    const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = async () => {
                const w = img.width;
                const h = img.height;
                const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
                const divisor = gcd(w, h);
                const ratioW = w / divisor;
                const ratioH = h / divisor;
                // 简化常见比例
                let aspectRatio = `${ratioW}:${ratioH}`;
                if (Math.abs(w / h - 16 / 9) < 0.1) aspectRatio = '16:9';
                else if (Math.abs(w / h - 9 / 16) < 0.1) aspectRatio = '9:16';
                else if (Math.abs(w / h - 1) < 0.1) aspectRatio = '1:1';
                else if (Math.abs(w / h - 4 / 3) < 0.1) aspectRatio = '4:3';
                else if (Math.abs(w / h - 3 / 4) < 0.1) aspectRatio = '3:4';

                const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
                const [rw, rh] = aspectRatio.split(':').map(Number);
                const newHeight = (nodeWidth * rh) / rw;
                const useFallback = !onUploadImageFile;
                try {
                    setHideBottomPanelAfterUpload(true);
                    setIsInputFocused(false);
                    if (!useFallback) {
                        onUpdate(node.id, { uploading: true });
                    }
                    const url = useFallback ? objectUrl : await onUploadImageFile(file);
                    onUpdate(node.id, { image: url, aspectRatio, uploading: false, mediaOrigin: 'uploaded' }, { height: newHeight });
                } catch (error) {
                    console.warn('[Node] Image upload failed:', error);
                    setHideBottomPanelAfterUpload(false);
                    if (!useFallback) {
                        onUpdate(node.id, { uploading: false });
                    }
                } finally {
                    if (!useFallback) {
                        URL.revokeObjectURL(objectUrl);
                    }
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
            };
            img.src = objectUrl;
        }
    };
    const handleAspectRatioSelect = (newRatio: string) => {
        const [w, h] = newRatio.split(':').map(Number);
        if (w && h) {
            // 使用默认宽度 420 作为基准，保持节点尺寸一致
            const newWidth = DEFAULT_NODE_WIDTH;
            const newHeight = (DEFAULT_NODE_WIDTH * h) / w;
            onUpdate(node.id, { aspectRatio: newRatio }, { width: newWidth, height: newHeight });
        } else {
            onUpdate(node.id, { aspectRatio: newRatio });
        }
    };
    const handleTitleSave = () => { setIsEditingTitle(false); if (tempTitle.trim() && tempTitle !== node.title) onUpdate(node.id, {}, undefined, tempTitle); else setTempTitle(node.title); };

    const getNodeConfig = () => {
        switch (node.type) {
            case NodeType.PROMPT_INPUT: return { icon: Type, color: 'text-amber-400', border: 'border-amber-500/30' };
            case NodeType.IMAGE_ASSET: return { icon: ImageIcon, color: 'text-blue-400', border: 'border-blue-500/30' };
            case NodeType.VIDEO_ASSET: return { icon: VideoIcon, color: 'text-green-400', border: 'border-green-500/30' };
            case NodeType.IMAGE_GENERATOR: return { icon: ImageIcon, color: 'text-blue-400', border: 'border-blue-500/30' };
            case NodeType.VIDEO_GENERATOR: return { icon: VideoIcon, color: 'text-green-400', border: 'border-green-500/30' };
            case NodeType.VIDEO_FACTORY: return { icon: Film, color: 'text-green-400', border: 'border-green-500/30' };
            case NodeType.AUDIO_GENERATOR: return { icon: Music, color: 'text-red-400', border: 'border-red-500/30' };
            case NodeType.VOICE_GENERATOR: return { icon: Speech, color: 'text-red-400', border: 'border-red-500/30' };
            case NodeType.IMAGE_EDITOR: return { icon: Edit, color: 'text-blue-400', border: 'border-blue-500/30' };
            case NodeType.MULTI_FRAME_VIDEO: return { icon: Film, color: 'text-emerald-400', border: 'border-emerald-500/30' };
            case NodeType.IMAGE_3D_CAMERA: return { icon: Camera, color: 'text-purple-400', border: 'border-purple-500/30' };
            default: return { icon: Type, color: 'text-slate-600', border: 'border-slate-300' };
        }
    };
    const { icon: NodeIcon, color: iconColor } = getNodeConfig();

    const getNodeHeight = () => {
        if (node.height) return node.height;
        if (node.type === NodeType.IMAGE_EDITOR) return DEFAULT_FIXED_HEIGHT;
        if (node.type === NodeType.AUDIO_GENERATOR || node.type === NodeType.VOICE_GENERATOR) return AUDIO_NODE_HEIGHT;
        // 3D 运镜节点：固定高度以容纳 3D 场景和参数滑块
        // 高度包含: TopBar(32px) + 3D场景(~200px) + 参数滑块(~100px) + 圆角边距
        if (node.type === NodeType.IMAGE_3D_CAMERA) return 380;
        // 多帧视频节点：使用 16:9 比例（配置面板在底部悬浮）
        if (node.type === NodeType.MULTI_FRAME_VIDEO) {
            return Math.round((node.width || DEFAULT_NODE_WIDTH) * 9 / 16);
        }
        // 文本节点默认 9:16，素材节点默认 16:9
        if (node.type === NodeType.PROMPT_INPUT || node.type === NodeType.IMAGE_ASSET || node.type === NodeType.VIDEO_ASSET) {
            const defaultRatio = node.type === NodeType.PROMPT_INPUT ? '9:16' : '16:9';
            const ratio = node.data.aspectRatio || defaultRatio;
            const [w, h] = ratio.split(':').map(Number);
            return (node.width || DEFAULT_NODE_WIDTH) * h / w;
        }
        const ratio = node.data.aspectRatio || '16:9';
        const [w, h] = ratio.split(':').map(Number);
        return ((node.width || DEFAULT_NODE_WIDTH) * h / w);
    };
    const nodeHeight = getNodeHeight();
    const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
    const hasFloatingPanel = !suppressFloatingPanels && (isSelected || isHovered || isInputFocused);
    const showPorts = !suppressPorts && (isSelected || isHovered);

    const renderTopBar = () => {
        const showTopBar = !suppressFloatingPanels && Boolean(isSelected);
        const hasMediaActions = Boolean(node.data.image || node.data.videoUri || node.data.audioUri);
        const showPreviewAction = node.type !== NodeType.AUDIO_GENERATOR && node.type !== NodeType.VOICE_GENERATOR;
        const toolbarTransform = showTopBar
            ? `translateX(-50%) scale(${inverseScale})`
            : `translateX(-50%) translateY(${6 * inverseScale}px) scale(${inverseScale})`;

        return (
            <div
                className={`absolute bottom-full left-1/2 z-[120] transition-all duration-300 ${showTopBar ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                style={{
                    paddingBottom: `${8 * inverseScale}px`,
                    transform: toolbarTransform,
                    transformOrigin: 'bottom center'
                }}
            >
                <div className="flex items-center gap-1 px-2 py-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl">
                    {hasMediaActions && (
                        <>
                            <button
                                onClick={handleDownload}
                                className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="下载"
                            >
                                <Download size={14} strokeWidth={2.2} />
                            </button>
                            {node.data.image && onEdit && (
                                <button
                                    onClick={handleEdit}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title="编辑涂鸦"
                                >
                                    <Edit size={14} strokeWidth={2.2} />
                                </button>
                            )}
                            {node.data.image && onCreateSubject && (
                                <button
                                    onClick={handleCreateSubject}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title="创建主体"
                                >
                                    <User size={14} strokeWidth={2.2} />
                                </button>
                            )}
                            {node.data.image && on3DCamera && node.type !== NodeType.IMAGE_3D_CAMERA && (
                                <button
                                    onClick={handleCreate3DCamera}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title="3D 运镜"
                                >
                                    <Camera size={14} strokeWidth={2.2} />
                                </button>
                            )}
                            {showPreviewAction && (
                                <button
                                    onClick={handleExpand}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title="全屏预览"
                                >
                                    <Maximize2 size={14} strokeWidth={2.2} />
                                </button>
                            )}
                            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />
                        </>
                    )}
                    {/* 文本节点：字号/颜色控制 */}
                    {node.type === NodeType.PROMPT_INPUT && (() => {
                        const textStyle = node.data.textStyle || {};
                        const currentFontSize = textStyle.fontSize || 12;
                        const currentColor = textStyle.color || '';
                        const fontSizes = [
                            { label: 'S', value: 10 },
                            { label: 'M', value: 12 },
                            { label: 'L', value: 16 },
                            { label: 'XL', value: 24 },
                        ];
                        const textColors = [
                            { value: '', style: 'bg-slate-700 dark:bg-slate-200' },
                            { value: '#ef4444', style: 'bg-red-500' },
                            { value: '#f97316', style: 'bg-orange-500' },
                            { value: '#22c55e', style: 'bg-green-500' },
                            { value: '#3b82f6', style: 'bg-blue-500' },
                            { value: '#a855f7', style: 'bg-purple-500' },
                            { value: '#ffffff', style: 'bg-white border border-slate-300 dark:border-slate-500' },
                        ];
                        return (
                            <>
                                <div className="flex items-center gap-0.5">
                                    {fontSizes.map(fs => (
                                        <button
                                            key={fs.value}
                                            onClick={() => onUpdate(node.id, { textStyle: { ...textStyle, fontSize: fs.value } })}
                                            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold transition-all ${currentFontSize === fs.value
                                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {fs.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />
                                <div className="flex items-center gap-0.5">
                                    {textColors.map(tc => (
                                        <button
                                            key={tc.value || 'default'}
                                            onClick={() => onUpdate(node.id, { textStyle: { ...textStyle, color: tc.value } })}
                                            className={`w-4 h-4 rounded-full ${tc.style} transition-all ${currentColor === tc.value
                                                ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-800 scale-110'
                                                : 'hover:scale-110'
                                            }`}
                                        />
                                    ))}
                                </div>
                                <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />
                            </>
                        );
                    })()}
                    {isWorking && (
                        <div className="p-2 rounded-xl text-blue-500 dark:text-blue-300 bg-slate-100 dark:bg-slate-700">
                            <Loader2 className="animate-spin w-3.5 h-3.5" />
                        </div>
                    )}
                    <div className="min-w-[84px] max-w-[160px] px-1.5 py-0.5 flex items-center justify-end">
                        {isEditingTitle ? (
                            <input
                                className="bg-transparent border-none outline-none text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider w-32 text-right whitespace-nowrap overflow-hidden text-ellipsis"
                                value={tempTitle}
                                onChange={(e) => setTempTitle(e.target.value)}
                                onBlur={handleTitleSave}
                                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                                onMouseDown={e => e.stopPropagation()}
                                autoFocus
                            />
                        ) : (
                            <span
                                className="inline-block max-w-[150px] truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-text text-right"
                                title={node.title}
                                onClick={() => setIsEditingTitle(true)}
                            >
                                {node.title}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderMediaContent = () => {
        if (node.type === NodeType.PROMPT_INPUT) {
            // 文本节点：纯文本编辑
            const hasContent = localPrompt && localPrompt.trim().length > 0;
            const promptPlaceholder = "在此输入文本内容...\n\n双击节点进入编辑。";
            const fontSize = node.data.textStyle?.fontSize || 12;
            const textColor = node.data.textStyle?.color || '';
            const fontSizeClass = fontSize <= 10 ? 'text-[10px]' : fontSize <= 12 ? 'text-xs' : fontSize <= 14 ? 'text-sm' : fontSize <= 16 ? 'text-base' : fontSize <= 20 ? 'text-lg' : 'text-xl';

            return (
                <div className="w-full h-full p-3 flex flex-col gap-2 group/text bg-amber-50/50 dark:bg-amber-900/10 rounded-[16px] border border-amber-200/50 dark:border-amber-700/30 relative overflow-hidden hover:border-amber-300 dark:hover:border-amber-600 focus-within:border-amber-400 dark:focus-within:border-amber-500 transition-colors">
                    <div className="relative flex-1 min-h-0 group/prompt-input overflow-hidden">
                        {enableSubjectMentions && (
                            <SubjectHighlighter
                                text={localPrompt}
                                subjects={subjects || []}
                                scrollTop={promptScrollOffset.top}
                                scrollLeft={promptScrollOffset.left}
                                className={`absolute inset-0 p-3 ${fontSizeClass} font-medium leading-relaxed overflow-hidden`}
                            />
                        )}
                        {isPromptEditing ? (
                            <>
                                <textarea
                                    ref={promptTextareaRef}
                                    className={`w-full h-full bg-transparent resize-none focus:outline-none ${fontSizeClass} text-slate-700 dark:text-slate-200 placeholder-slate-400/60 dark:placeholder-slate-500/60 p-3 font-medium leading-relaxed custom-scrollbar relative z-10`}
                                    style={{ color: textColor || undefined }}
                                    placeholder={promptPlaceholder}
                                    value={localPrompt}
                                    onChange={(e) => setLocalPrompt(e.target.value)}
                                    onBlur={() => { commitPrompt(); setIsPromptEditing(false); setIsInputFocused(false); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                                            e.preventDefault();
                                            commitPrompt();
                                            setIsPromptEditing(false);
                                            (e.target as HTMLTextAreaElement).blur();
                                        }
                                    }}
                                    onFocus={() => setIsInputFocused(true)}
                                    onScroll={enableSubjectMentions ? handlePromptScroll : undefined}
                                    onWheel={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                />
                                {enableSubjectMentions && (
                                    <SubjectMention
                                        subjects={subjects || []}
                                        textareaRef={promptTextareaRef}
                                        value={localPrompt}
                                        onChange={setLocalPrompt}
                                        getDisabledReason={getSubjectMentionDisabledReason}
                                    />
                                )}
                            </>
                        ) : (
                            <div
                                className={`w-full h-full p-3 ${fontSizeClass} text-slate-700 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-wrap break-words overflow-auto custom-scrollbar cursor-text`}
                                style={{ color: textColor || undefined }}
                            >
                                {hasContent ? localPrompt : (
                                    <span className="text-slate-400/70 dark:text-slate-500/70">{promptPlaceholder}</span>
                                )}
                            </div>
                        )}
                        {hasContent && (
                            <button
                                className="absolute top-2 right-2 p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all opacity-0 group-hover/text:opacity-100 z-20"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(localPrompt); }}
                                title="复制内容"
                            >
                                <Copy size={12} />
                            </button>
                        )}
                    </div>
                    {/* 底部字数统计 */}
                    <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                            {localPrompt.length > 0 ? `${localPrompt.length} 字` : ''}
                        </span>
                    </div>
                    {/* 错误状态 */}
                    {node.status === NodeStatus.ERROR && (
                        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 rounded-[16px]">
                            <AlertCircle className="text-red-500 mb-2" size={24} />
                            <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed max-h-[60%] overflow-y-auto">{node.data.error || '操作失败'}</span>
                            <button
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                            >关闭</button>
                        </div>
                    )}
                </div>
            );
        }

        // 3D 运镜节点：3D 场景可视化 + 参数控制
        if (node.type === NodeType.IMAGE_3D_CAMERA) {
            // 获取输入图片（从上游节点或直接数据）
            const inputImage = inputAssets?.[0]?.src || node.data.image || null;

            // 相机参数（使用默认值或已保存的值）
            const cameraParams: CameraParams = node.data.cameraParams || {
                azimuth: 0,
                elevation: 0,
                distance: 1.0
            };

            // 使用顶层导入的 Camera3DVisualizer

            return (
                <div className="w-full h-full flex flex-col relative overflow-hidden bg-slate-100 dark:bg-slate-900">
                    {/* 3D 场景区域 */}
                    <div className="flex-1 min-h-0 relative">
                        <React.Suspense fallback={
                            <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                                <Loader2 className="animate-spin text-purple-500 dark:text-purple-400" size={24} />
                            </div>
                        }>
                            <Camera3DVisualizer
                                params={cameraParams}
                                imageUrl={inputImage}
                                onParamsChange={(newParams) => {
                                    onUpdate(node.id, {
                                        cameraParams: { ...cameraParams, ...newParams }
                                    });
                                }}
                            />
                        </React.Suspense>

                        {/* 加载状态 */}
                        {isWorking && (
                            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                <Loader2 className="animate-spin text-purple-500 dark:text-purple-400" size={28} />
                                <span className="mt-2 text-xs font-medium text-purple-600 dark:text-purple-300">重绘视角中...</span>
                            </div>
                        )}

                        {/* 错误状态 */}
                        {node.status === NodeStatus.ERROR && (
                            <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                                <AlertCircle className="text-red-500 mb-2" size={24} />
                                <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed max-h-[60%] overflow-y-auto">{node.data.error || '操作失败'}</span>
                                <button
                                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                    onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                                >关闭</button>
                            </div>
                        )}
                    </div>

                    {/* 底部控制面板 */}
                    <div className="flex-shrink-0 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700/50 p-3 space-y-2">
                        {/* 参数滑块 */}
                        <div className="space-y-1.5">
                            {/* 方位角 */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 w-8">方位</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={cameraParams.azimuth}
                                    onChange={(e) => onUpdate(node.id, {
                                        cameraParams: { ...cameraParams, azimuth: parseInt(e.target.value) }
                                    })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 dark:[&::-webkit-slider-thumb]:bg-purple-400"
                                />
                                <span className="text-[10px] text-slate-600 dark:text-slate-300 w-8 text-right">{cameraParams.azimuth}°</span>
                            </div>
                            {/* 俯仰角 */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 w-8">俯仰</span>
                                <input
                                    type="range"
                                    min="-30"
                                    max="60"
                                    value={cameraParams.elevation}
                                    onChange={(e) => onUpdate(node.id, {
                                        cameraParams: { ...cameraParams, elevation: parseInt(e.target.value) }
                                    })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 dark:[&::-webkit-slider-thumb]:bg-purple-400"
                                />
                                <span className="text-[10px] text-slate-600 dark:text-slate-300 w-8 text-right">{cameraParams.elevation}°</span>
                            </div>
                            {/* 焦距 */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 w-8">焦距</span>
                                <input
                                    type="range"
                                    min="0.6"
                                    max="1.5"
                                    step="0.05"
                                    value={cameraParams.distance}
                                    onChange={(e) => onUpdate(node.id, {
                                        cameraParams: { ...cameraParams, distance: parseFloat(e.target.value) }
                                    })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 dark:[&::-webkit-slider-thumb]:bg-purple-400"
                                />
                                <span className="text-[10px] text-slate-600 dark:text-slate-300 w-8 text-right">{cameraParams.distance.toFixed(1)}x</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // 多帧视频节点：预览区域（视频结果或帧预览）
        if (node.type === NodeType.MULTI_FRAME_VIDEO) {
            const frames = node.data.multiFrameData?.frames || [];
            const hasResult = !!node.data.videoUri;

            return (
                <div className="w-full h-full relative group/media overflow-hidden bg-white dark:bg-slate-800" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {hasResult ? (
                        // 有生成结果：显示视频
                        <SecureVideo
                            videoRef={mediaRef}
                            src={node.data.videoUri}
                            className="w-full h-full object-cover bg-white dark:bg-slate-800"
                            loop
                            muted
                            onContextMenu={(e: React.MouseEvent) => onMediaContextMenu?.(e, node.id, 'video', node.data.videoUri!)}
                        />
                    ) : frames.length > 0 ? (
                        // 有帧但无结果：显示选中帧预览（默认第一帧）
                        <div className="w-full h-full relative">
                            <img
                                src={(editingFrameId && frames.find(f => f.id === editingFrameId)?.src) || frames[0].src}
                                className="w-full h-full object-cover opacity-80"
                                alt=""
                                draggable={false}
                            />
                            {/* 帧数量和时长标签 */}
                            <div className="absolute top-3 right-3 px-2.5 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-lg text-[10px] text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-600">
                                {frames.length} 帧 | {frames.reduce((acc, f, i) => i < frames.length - 1 ? acc + (f.transition?.duration || 5) : acc, 0)}s
                            </div>
                            {/* 生成中遮罩 */}
                            {isWorking && (
                                <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
                                    <Loader2 className="animate-spin text-emerald-500" size={32} />
                                    <span className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">{node.data.progress || '生成中...'}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        // 空状态
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/30 dark:bg-emerald-900/10">
                            <IconWithTooltip
                                icon={Film}
                                tooltip={isWorking ? '生成中...' : '添加关键帧'}
                                colorClass="text-emerald-500"
                                isLoading={isWorking}
                            />
                        </div>
                    )}
                    {/* 错误显示 */}
                    {node.status === NodeStatus.ERROR && (
                        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                            <AlertCircle className="text-red-500 mb-2" size={24} />
                            <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed max-h-[60%] overflow-y-auto">{node.data.error || '操作失败'}</span>
                            <button
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                            >关闭</button>
                        </div>
                    )}
                </div>
            );
        }

        // 图片素材节点
        if (node.type === NodeType.IMAGE_ASSET) {
            const hasImage = !!node.data.image;
            const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                // 过滤出有效的图片文件
                const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
                if (imageFiles.length === 0) return;

                // 批量上传：创建多个节点并分组
                if (imageFiles.length > 1 && onBatchUpload) {
                    onBatchUpload(imageFiles, 'image', node.id);
                    // 清空 input 以便再次选择
                    e.target.value = '';
                    return;
                }

                // 单个文件：上传并获取尺寸
                const file = imageFiles[0];
                const objectUrl = URL.createObjectURL(file);
                const img = new window.Image();
                img.onload = async () => {
                    const imgWidth = img.width;
                    const imgHeight = img.height;
                    const ratio = imgWidth / imgHeight;
                    let aspectRatio = '1:1';
                    if (ratio > 1.6) aspectRatio = '16:9';
                    else if (ratio > 1.2) aspectRatio = '4:3';
                    else if (ratio < 0.625) aspectRatio = '9:16';
                    else if (ratio < 0.83) aspectRatio = '3:4';
                    const newWidth = DEFAULT_NODE_WIDTH;
                    const newHeight = DEFAULT_NODE_WIDTH * imgHeight / imgWidth;
                    const useFallback = !onUploadImageFile;
                    try {
                        const url = useFallback ? objectUrl : await onUploadImageFile(file);
                        onUpdate(node.id, { image: url, aspectRatio }, { width: newWidth, height: newHeight });
                    } catch (error: any) {
                        console.warn('[Node] Image upload failed:', error);
                        onUpdate(node.id, { error: error?.message || '图片上传失败' });
                    } finally {
                        if (!useFallback) {
                            URL.revokeObjectURL(objectUrl);
                        }
                    }
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                };
                img.src = objectUrl;
                e.target.value = '';
            };
            return (
                <div className="w-full h-full relative group/asset overflow-hidden bg-white dark:bg-slate-800" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {!hasImage ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/30 dark:bg-blue-900/10 group-hover/asset:bg-blue-50/50 dark:group-hover/asset:bg-blue-900/20 transition-colors">
                            <IconWithTooltip
                                icon={Upload}
                                tooltip="上传图片"
                                colorClass="text-blue-500"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            />
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                        </div>
                    ) : (
                        <>
                            <img
                                ref={mediaRef as any}
                                src={node.data.image}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover/asset:scale-105 bg-white dark:bg-slate-800"
                                draggable={false}
                                onContextMenu={(e) => onMediaContextMenu?.(e, node.id, 'image', node.data.image!)}
                            />
                            <button
                                className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 backdrop-blur-md opacity-0 group-hover/asset:opacity-100 transition-all shadow-lg z-10"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                title="替换图片"
                            >
                                <Upload size={14} />
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </>
                    )}
                    {/* 错误状态 */}
                    {(node.status === NodeStatus.ERROR || node.data.error) && (
                        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                            <AlertCircle className="text-red-500 mb-2" size={24} />
                            <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed">{node.data.error || '上传失败'}</span>
                            <button
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                            >关闭</button>
                        </div>
                    )}
                </div>
            );
        }

        // 视频素材节点
        if (node.type === NodeType.VIDEO_ASSET) {
            const hasVideo = !!node.data.videoUri;
            const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                // 过滤出有效的视频文件
                const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
                if (videoFiles.length === 0) return;

                // 批量上传：创建多个节点并分组
                if (videoFiles.length > 1 && onBatchUpload) {
                    onBatchUpload(videoFiles, 'video', node.id);
                    e.target.value = '';
                    return;
                }

                // 单个文件：上传并设置 URL
                const file = videoFiles[0];
                const objectUrl = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.onloadedmetadata = async () => {
                    const w = video.videoWidth || 0;
                    const h = video.videoHeight || 0;
                    let aspectRatio: string | undefined;
                    if (w && h) {
                        const ratio = w / h;
                        if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
                        else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
                        else if (Math.abs(ratio - 1) < 0.1) aspectRatio = '1:1';
                        else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
                        else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = '3:4';
                    }
                    const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
                    const newHeight = w && h ? (nodeWidth * h) / w : undefined;
                    const useFallback = !onUploadVideoFile;
                    try {
                        const url = useFallback ? objectUrl : await onUploadVideoFile(file);
                        onUpdate(node.id, { videoUri: url, ...(aspectRatio ? { aspectRatio } : {}) }, newHeight ? { height: newHeight } : undefined);
                    } catch (error: any) {
                        console.warn('[Node] Video upload failed:', error);
                        onUpdate(node.id, { error: error?.message || '视频上传失败' });
                    } finally {
                        if (!useFallback) {
                            URL.revokeObjectURL(objectUrl);
                        }
                    }
                };
                video.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                };
                video.src = objectUrl;
                e.target.value = '';
            };
            return (
                <div className="w-full h-full relative group/asset overflow-hidden bg-white dark:bg-slate-800" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {!hasVideo ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/30 dark:bg-emerald-900/10 group-hover/asset:bg-emerald-50/50 dark:group-hover/asset:bg-emerald-900/20 transition-colors">
                            <IconWithTooltip
                                icon={Upload}
                                tooltip="上传视频"
                                colorClass="text-emerald-500"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            />
                            <input type="file" ref={fileInputRef} className="hidden" accept="video/*" multiple onChange={handleVideoUpload} />
                        </div>
                    ) : (
                        <>
                            <SecureVideo
                                videoRef={mediaRef}
                                src={node.data.videoUri}
                                className="w-full h-full object-cover bg-white dark:bg-slate-800"
                                loop
                                muted
                                onContextMenu={(e: React.MouseEvent) => onMediaContextMenu?.(e, node.id, 'video', node.data.videoUri!)}
                            />
                            <button
                                className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 backdrop-blur-md opacity-0 group-hover/asset:opacity-100 transition-all shadow-lg z-10"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                title="替换视频"
                            >
                                <Upload size={14} />
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleVideoUpload} />
                        </>
                    )}
                    {/* 错误状态 */}
                    {(node.status === NodeStatus.ERROR || node.data.error) && (
                        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                            <AlertCircle className="text-red-500 mb-2" size={24} />
                            <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed">{node.data.error || '上传失败'}</span>
                            <button
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                            >关闭</button>
                        </div>
                    )}
                </div>
            );
        }

        if (node.type === NodeType.AUDIO_GENERATOR || node.type === NodeType.VOICE_GENERATOR) {
            const isMusic = node.type === NodeType.AUDIO_GENERATOR;
            const coverImage = node.data.musicConfig?.coverImage;
            const bgColor = 'bg-red-50/30 dark:bg-red-900/10 group-hover/media:bg-red-50/60 dark:group-hover/media:bg-red-900/20';
            const themeColorClass = 'text-red-500';

            return (
                <div className={`w-full h-full p-4 flex flex-col justify-center items-center relative overflow-hidden group/audio ${bgColor} transition-colors`}>

                    {/* 封面图（音乐模式且有封面时显示） */}
                    {isMusic && coverImage && (
                        <div className="absolute inset-0 z-0">
                            <img src={coverImage} className="w-full h-full object-cover opacity-30 blur-sm" alt="" />
                        </div>
                    )}

                    {node.data.audioUri ? (
                        <div className="flex flex-col items-center gap-3 w-full z-10">
                            <audio ref={mediaRef as any} src={node.data.audioUri} onEnded={() => setIsPlayingAudio(false)} onPlay={() => setIsPlayingAudio(true)} onPause={() => setIsPlayingAudio(false)} className="hidden" />

                            {/* 歌曲标题（音乐模式） */}
                            {isMusic && node.data.musicConfig?.title && (
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center truncate max-w-full px-4">
                                    {node.data.musicConfig.title}
                                </div>
                            )}

                            {/* 音频可视化器 */}
                            <div className="w-full px-4"><AudioVisualizer isPlaying={isPlayingAudio} /></div>

                            {/* 播放控制 */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={toggleAudio}
                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50"
                                >
                                    {isPlayingAudio ? <Pause size={18} className="text-slate-900 dark:text-white" /> : <Play size={18} className="text-slate-900 dark:text-white ml-0.5" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center z-10">
                            <IconWithTooltip
                                icon={isMusic ? Music : Speech}
                                tooltip={isWorking ? '生成中...' : (isMusic ? 'Suno 音乐' : 'MiniMax 语音')}
                                colorClass={themeColorClass}
                                isLoading={isWorking}
                            />
                        </div>
                    )}

                    {/* 错误显示 */}
                    {node.status === NodeStatus.ERROR && (
                        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                            <AlertCircle className="text-red-500 mb-2" size={24} />
                            <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed max-h-[60%] overflow-y-auto">{node.data.error || '生成失败'}</span>
                            <button
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                            >关闭</button>
                        </div>
                    )}
                </div>
            )
        }

        // VIDEO_FACTORY 剧情延展模式: croppedFrame 不算作主内容，只在底部缩略图显示
        const hasContent = node.data.image || node.data.videoUri;

        // 剧情延展模式特殊处理：始终显示空状态样式，即使有 croppedFrame（CUT已合并到CONTINUE，保留向后兼容）
        const isCutOrContinueMode = node.type === NodeType.VIDEO_FACTORY && (generationMode === 'CUT' || generationMode === 'CONTINUE');
        // 首尾帧模式检测：显式设置模式 OR 已上传首尾帧数据
        const hasFirstLastFrameData = !!(node.data.firstLastFrameData?.firstFrame || node.data.firstLastFrameData?.lastFrame);
        const isVideoNodeType = node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY;
        const isFirstLastFrameMode = isVideoNodeType && (generationMode === 'FIRST_LAST_FRAME' || hasFirstLastFrameData);
        const shouldForceEmptyState = isWorking && (
            node.type === NodeType.IMAGE_GENERATOR ||
            node.type === NodeType.IMAGE_EDITOR ||
            node.type === NodeType.VIDEO_GENERATOR ||
            node.type === NodeType.VIDEO_FACTORY
        );
        const showEmptyState = shouldForceEmptyState ? true : ((isCutOrContinueMode || isFirstLastFrameMode) ? !hasContent : !hasContent);

        const isVideoNode = node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY;
        const themeColor = isVideoNode ? 'emerald' : 'blue';
        const bgClass = isVideoNode
            ? 'bg-emerald-50/30 dark:bg-emerald-900/10 group-hover/media:bg-emerald-50/60 dark:group-hover/media:bg-emerald-900/20'
            : 'bg-blue-50/30 dark:bg-blue-900/10 group-hover/media:bg-blue-50/60 dark:group-hover/media:bg-blue-900/20';

        return (
            <div className="w-full h-full relative group/media overflow-hidden bg-white dark:bg-slate-800" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                {showEmptyState ? (
                    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-400 transition-colors ${!(isCutOrContinueMode || isFirstLastFrameMode) ? bgClass : ''}`}>
                        {isFirstLastFrameMode ? (
                            // 首尾帧模式：显示首帧和尾帧上传区域
                            (() => {
                                const firstFrame = node.data.firstLastFrameData?.firstFrame;
                                const lastFrame = node.data.firstLastFrameData?.lastFrame;
                                const hasFrames = !!firstFrame && !!lastFrame;

                                const handleFrameUpload = (frameType: 'first' | 'last') => async (e: React.ChangeEvent<HTMLInputElement>) => {
                                    const inputEl = e.target;
                                    const file = inputEl.files?.[0];
                                    if (!file || !file.type.startsWith('image/')) return;
                                    const useFallback = !onUploadImageFile;
                                    try {
                                        if (!useFallback) {
                                            onUpdate(node.id, { uploading: true });
                                        }
                                        const url = onUploadImageFile
                                            ? await onUploadImageFile(file)
                                            : await new Promise<string>((resolve) => {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => resolve(ev.target?.result as string);
                                                reader.readAsDataURL(file);
                                            });
                                        const currentData = node.data.firstLastFrameData || {};
                                        onUpdate(node.id, {
                                            firstLastFrameData: {
                                                ...currentData,
                                                [frameType === 'first' ? 'firstFrame' : 'lastFrame']: url
                                            },
                                            uploading: false
                                        });
                                    } catch (error) {
                                        console.warn('[Node] Frame upload failed:', error);
                                        if (!useFallback) {
                                            onUpdate(node.id, { uploading: false });
                                        }
                                    } finally {
                                        inputEl.value = ''; // 清空以便重复上传相同文件
                                    }
                                };

                                return (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-4 select-none">
                                        {isWorking ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin text-emerald-500" size={28} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 dark:text-emerald-400">
                                                    生成中...
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                {/* 首尾帧上传区域 */}
                                                <div className="flex items-center justify-center gap-3 w-full max-w-[320px]">
                                                    {/* 首帧上传框 */}
                                                    <div className="relative flex-1 aspect-video rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-600 hover:border-emerald-400 dark:hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden transition-all group/first">
                                                        {firstFrame ? (
                                                            <>
                                                                <img src={firstFrame} className="w-full h-full object-cover" alt="首帧" />
                                                                <button
                                                                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 rounded-full text-white opacity-0 group-hover/first:opacity-100 transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const currentData = node.data.firstLastFrameData || {};
                                                                        onUpdate(node.id, {
                                                                            firstLastFrameData: { ...currentData, firstFrame: undefined }
                                                                        });
                                                                    }}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                                                                <Plus size={16} className="text-emerald-400 dark:text-emerald-500" />
                                                                <span className="text-[8px] font-bold text-emerald-500 dark:text-emerald-400 mt-1">首帧</span>
                                                                <input type="file" className="hidden" accept="image/*" onChange={handleFrameUpload('first')} />
                                                            </label>
                                                        )}
                                                    </div>

                                                    {/* 箭头指示 */}
                                                    <div className="flex flex-col items-center gap-0.5 text-emerald-400/60 dark:text-emerald-500/50">
                                                        <ArrowRight size={16} />
                                                        <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">过渡</span>
                                                    </div>

                                                    {/* 尾帧上传框 */}
                                                    <div className="relative flex-1 aspect-video rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-600 hover:border-emerald-400 dark:hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden transition-all group/last">
                                                        {lastFrame ? (
                                                            <>
                                                                <img src={lastFrame} className="w-full h-full object-cover" alt="尾帧" />
                                                                <button
                                                                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 rounded-full text-white opacity-0 group-hover/last:opacity-100 transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const currentData = node.data.firstLastFrameData || {};
                                                                        onUpdate(node.id, {
                                                                            firstLastFrameData: { ...currentData, lastFrame: undefined }
                                                                        });
                                                                    }}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                                                                <Plus size={16} className="text-emerald-400 dark:text-emerald-500" />
                                                                <span className="text-[8px] font-bold text-emerald-500 dark:text-emerald-400 mt-1">尾帧</span>
                                                                <input type="file" className="hidden" accept="image/*" onChange={handleFrameUpload('last')} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 状态提示 */}
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/70 dark:text-emerald-400/70 mt-3">
                                                    {hasFrames ? '准备生成' : '上传首尾帧'}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                );
                            })()
                        ) : isCutOrContinueMode ? (
                            // 剧情延展模式：根据是否已选择关键帧显示不同状态
                            (() => {
                                const upstreamVideo = inputAssets?.find(a => a.type === 'video');
                                const hasCroppedFrame = !!node.data.croppedFrame;

                                return (
                                    <div className="flex flex-col items-center gap-2 select-none">
                                        {isWorking ? (
                                            <Loader2 className="animate-spin text-emerald-500" size={28} />
                                        ) : hasCroppedFrame ? (
                                            <VideoIcon size={28} className="text-emerald-400/60 dark:text-emerald-500/50" />
                                        ) : (
                                            <Film size={28} className="text-emerald-400/60 dark:text-emerald-500/50" />
                                        )}
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 dark:text-emerald-400">
                                            {isWorking ? "生成中..." : (hasCroppedFrame ? "准备生成" : (upstreamVideo ? "可选关键帧" : "连接上游"))}
                                        </span>
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500">
                                            {!isWorking && !hasCroppedFrame && upstreamVideo && "不选取则使用最后一帧"}
                                        </span>
                                        {/* 悬浮按钮 - 选择/重新选择关键帧 */}
                                        {upstreamVideo && !isWorking && (
                                            <div
                                                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-800/90 dark:bg-black/90 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-all opacity-0 group-hover/media:opacity-100 hover:scale-105 shadow-lg"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCrop?.(node.id, upstreamVideo.src, 'video');
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <Film size={12} className="text-white mr-1.5" />
                                                <span className="text-[10px] text-white font-medium tracking-wide">{hasCroppedFrame ? "重新选择" : "选取关键帧"}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()
                        ) : (
                            // 普通生成节点空状态
                            <IconWithTooltip
                                icon={isVideoNode ? VideoIcon : ImageIcon}
                                tooltip={isWorking ? '生成中...' : (isVideoNode ? '视频生成' : '图片生成')}
                                colorClass={isVideoNode ? 'text-emerald-500' : 'text-blue-500'}
                                isLoading={isWorking}
                            />
                        )}
                    </div>
                ) : (
                    <>
                        {node.data.image ? (
                            <img
                                ref={mediaRef as any}
                                src={node.data.image}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-105 bg-white dark:bg-slate-800"
                                draggable={false}
                                style={{ filter: showImageGrid ? 'blur(10px)' : 'none' }}
                                onContextMenu={(e) => onMediaContextMenu?.(e, node.id, 'image', node.data.image!)}
                            />
                        ) : (
                            <SecureVideo
                                videoRef={mediaRef} // Pass Ref to Video
                                src={node.data.videoUri}
                                className="w-full h-full object-cover bg-white dark:bg-slate-800"
                                loop
                                muted
                                // autoPlay removed to rely on hover logic
                                onContextMenu={(e: React.MouseEvent) => onMediaContextMenu?.(e, node.id, 'video', node.data.videoUri!)}
                                style={{ filter: showImageGrid ? 'blur(10px)' : 'none' }} // Pass Style
                            />
                        )}
                        {/* 组图数量徽章 - 右上角显示（图片或视频组） */}
                        {(() => {
                            const badgeItems = node.data.images || node.data.videoUris || [];
                            return badgeItems.length > 1 && !showImageGrid && (
                                <button
                                    className="absolute z-30 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer group/badge"
                                    style={{
                                        top: `${12 * inverseScale}px`,
                                        right: `${12 * inverseScale}px`,
                                        transform: `scale(${inverseScale})`,
                                        transformOrigin: 'top right'
                                    }}
                                    onClick={(e) => { e.stopPropagation(); setShowImageGrid(true); }}
                                    title="点击查看全部结果"
                                >
                                    <Grid3X3 size={12} className="text-slate-500 dark:text-slate-400 group-hover/badge:text-blue-500 dark:group-hover/badge:text-blue-400" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover/badge:text-blue-600 dark:group-hover/badge:text-blue-300">{badgeItems.length}</span>
                                </button>
                            );
                        })()}
                        {node.status === NodeStatus.ERROR && (
                            <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20">
                                <AlertCircle className="text-red-500 mb-2" size={24} />
                                <span className="text-[10px] text-red-500 dark:text-red-400 leading-relaxed max-h-[60%] overflow-y-auto">{node.data.error || '生成失败'}</span>
                                <button
                                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                    onClick={(e) => { e.stopPropagation(); onUpdate(node.id, { error: undefined }); }}
                                >关闭</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    // 复制状态 - 必须在组件顶层声明
    const [promptCopied, setPromptCopied] = useState(false);


    // 多帧视频节点的文件输入引用
    const multiFrameFileInputRef = useRef<HTMLInputElement>(null);

    // 多帧视频节点：拖拽排序状态
    const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
    const [frameDragOffset, setFrameDragOffset] = useState(0);
    const [frameJustDropped, setFrameJustDropped] = useState<string | null>(null); // 刚松开的帧ID，用于禁用过渡动画
    const frameDragStateRef = useRef({ draggingId: null as string | null, startX: 0, originalFrames: [] as any[] });
    const frameDragHandlersRef = useRef<{ move: ((e: MouseEvent) => void) | null; up: ((e: MouseEvent) => void) | null }>({ move: null, up: null });

    // 多帧视频节点：帧间配置编辑状态
    const [editingFrameId, setEditingFrameId] = useState<string | null>(null);

    const renderBottomPanel = () => {
        // 素材节点不需要底部面板
        if (node.type === NodeType.IMAGE_ASSET || node.type === NodeType.VIDEO_ASSET) return null;
        if (suppressFloatingPanels) return null;
        if (hideBottomPanelAfterUpload) return null;
        const isUploadedMediaNode = (node.type === NodeType.IMAGE_GENERATOR || node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY) && node.data.mediaOrigin === 'uploaded';
        if (isUploadedMediaNode) return null;
        if (node.data.hideConfigPanel) return null;

        const isOpen = Boolean(isSelected);

        // 3D 运镜节点：模型选择器 + 画面比例 + 生成按钮
        if (node.type === NodeType.IMAGE_3D_CAMERA) {
            const hasInputImage = !!(inputAssets?.[0]?.src || node.data.image);

            return (
                <div data-config-panel className={`absolute top-full left-1/2 z-50 flex flex-col items-center justify-start transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? `opacity-100 translate-y-0 scale-100` : 'opacity-0 translate-y-[-10px] scale-95 pointer-events-none'}`}
                    style={{
                        width: `${FIXED_CONFIG_PANEL_WIDTH}px`,
                        paddingTop: `${8 * inverseScale}px`,
                        transform: `translateX(-50%) scale(${inverseScale})`,
                        transformOrigin: 'top center'
                    }}
                >
                    <div className={`w-full rounded-[20px] p-1 flex flex-col gap-1 ${GLASS_PANEL} relative z-[100]`} onMouseDown={e => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-2 py-1.5">
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-purple-500 dark:text-purple-400">
                                    <span>Qwen 多角度</span>
                                </div>
                            </div>
                            <GenerateCreditButton
                                estimateLabel={estimatedCredits.label}
                                onClick={handleActionClick}
                                disabled={isWorking || !hasInputImage}
                                working={isWorking}
                                theme="purple"
                                title={isWorking ? '生成中...' : '重绘'}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        // 文本节点：无底部配置面板
        if (node.type === NodeType.PROMPT_INPUT) {
            return null;
        }

        // 音频节点使用专用面板
        if (node.type === NodeType.AUDIO_GENERATOR || node.type === NodeType.VOICE_GENERATOR) {
            return (
                <AudioNodePanel
                    node={node}
                    isOpen={isOpen}
                    isWorking={isWorking}
                    localPrompt={localPrompt}
                    setLocalPrompt={setLocalPrompt}
                    inputHeight={inputHeight}
                    inverseScale={inverseScale}
                    onUpdate={onUpdate}
                    onAction={handleActionClick}
                    onInputFocus={() => setIsInputFocused(true)}
                    onInputBlur={() => { setIsInputFocused(false); commitPrompt(); }}
                    onInputResizeStart={handleInputResizeStart}
                    onCmdEnter={handleCmdEnter}
                />
            );
        }

        // 多帧视频节点：帧列表 + 配置面板
        if (node.type === NodeType.MULTI_FRAME_VIDEO) {
            const frames = node.data.multiFrameData?.frames || [];
            const viduModel = node.data.multiFrameData?.viduModel || 'viduq2-turbo';
            const viduResolution = node.data.multiFrameData?.viduResolution || '720p';
            const hasResult = !!node.data.videoUri;

            // 拖拽排序常量
            const FRAME_WIDTH = 48;
            const FRAME_GAP = 6;
            const ITEM_FULL_WIDTH = FRAME_WIDTH + FRAME_GAP;

            // 帧文件上传处理
            const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
                const inputEl = e.target;
                if (inputEl.files && inputEl.files.length > 0) {
                    const files = Array.from(inputEl.files);
                    try {
                        if (onUploadImageFile) {
                            onUpdate(node.id, { uploading: true });
                        }
                        const uploads = await Promise.all(files.map(async (file) => {
                            const src = onUploadImageFile
                                ? await onUploadImageFile(file)
                                : await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => resolve(ev.target?.result as string);
                                    reader.readAsDataURL(file);
                                });
                            return {
                                id: `mf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                src,
                                transition: { duration: 4, prompt: '' }
                            };
                        }));
                        // 追加模式：只传新帧，handleNodeUpdate 会自动合并到现有帧后面（避免闭包陷阱）
                        onUpdate(node.id, {
                            multiFrameData: {
                                frames: uploads,
                                viduModel,
                                viduResolution,
                                taskId: node.data.multiFrameData?.taskId,
                                _appendFrames: true  // 标记为追加模式
                            },
                            uploading: false
                        });
                    } catch (error) {
                        console.warn('[Node] Multi-frame upload failed:', error);
                        if (onUploadImageFile) {
                            onUpdate(node.id, { uploading: false });
                        }
                    }
                }
                inputEl.value = '';
            };

            // 删除帧
            const handleDeleteFrame = (frameId: string) => {
                onUpdate(node.id, {
                    multiFrameData: {
                        frames: frames.filter(f => f.id !== frameId),
                        viduModel,
                        viduResolution,
                        taskId: node.data.multiFrameData?.taskId
                    }
                });
            };

            // 更新 Vidu 配置
            const updateViduConfig = (config: { model?: 'viduq2-turbo' | 'viduq2-pro'; resolution?: '540p' | '720p' | '1080p' }) => {
                onUpdate(node.id, {
                    multiFrameData: {
                        frames,
                        viduModel: config.model || viduModel,
                        viduResolution: config.resolution || viduResolution,
                        taskId: node.data.multiFrameData?.taskId
                    }
                });
            };

            // 更新帧转场配置
            const updateFrameTransition = (frameId: string, transition: { duration?: number; prompt?: string }) => {
                const newFrames = frames.map(f => f.id === frameId ? {
                    ...f,
                    transition: { ...f.transition, ...transition }
                } : f);
                onUpdate(node.id, {
                    multiFrameData: { frames: newFrames, viduModel, viduResolution, taskId: node.data.multiFrameData?.taskId }
                });
            };

            // 拖拽排序处理
            const handleFrameDragStart = (e: React.MouseEvent, frameId: string) => {
                e.stopPropagation();
                e.preventDefault();
                setDraggingFrameId(frameId);
                setFrameDragOffset(0);
                frameDragStateRef.current = { draggingId: frameId, startX: e.clientX, originalFrames: [...frames] };
                document.body.style.cursor = 'grabbing';

                const handleMove = (ev: MouseEvent) => {
                    if (!frameDragStateRef.current.draggingId) return;
                    const delta = ev.clientX - frameDragStateRef.current.startX;
                    setFrameDragOffset(delta);
                };

                const handleUp = (ev: MouseEvent) => {
                    if (!frameDragStateRef.current.draggingId) return;
                    const { draggingId, startX, originalFrames: origFrames } = frameDragStateRef.current;
                    const currentOffset = ev.clientX - startX;
                    const moveSlots = Math.round(currentOffset / ITEM_FULL_WIDTH);
                    const currentIndex = origFrames.findIndex(f => f.id === draggingId);
                    const newIndex = Math.max(0, Math.min(origFrames.length - 1, currentIndex + moveSlots));

                    // 先清理事件监听和光标
                    window.removeEventListener('mousemove', handleMove);
                    window.removeEventListener('mouseup', handleUp);
                    document.body.style.cursor = '';
                    frameDragStateRef.current.draggingId = null;

                    // 标记刚松开的帧，禁用其过渡动画
                    setFrameJustDropped(draggingId);

                    // 立即清除拖拽状态
                    setDraggingFrameId(null);
                    setFrameDragOffset(0);

                    if (newIndex !== currentIndex) {
                        // 位置变化：更新数据
                        const newFrames = [...origFrames];
                        const [moved] = newFrames.splice(currentIndex, 1);
                        newFrames.splice(newIndex, 0, moved);
                        onUpdate(node.id, {
                            multiFrameData: { frames: newFrames, viduModel, viduResolution, taskId: node.data.multiFrameData?.taskId }
                        });
                    }

                    // 延迟清除 justDropped 状态，恢复过渡动画
                    setTimeout(() => setFrameJustDropped(null), 50);
                };

                frameDragHandlersRef.current = { move: handleMove, up: handleUp };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
            };

            // 计算帧位移
            const getFrameTransform = (frameId: string, index: number) => {
                const isDragging = frameId === draggingFrameId;
                const originalIndex = frames.findIndex(f => f.id === draggingFrameId);
                let translateX = 0;
                let scale = 1;
                let zIndex = 10;

                if (isDragging) {
                    translateX = frameDragOffset;
                    scale = 1.1;
                    zIndex = 100;
                } else if (draggingFrameId) {
                    const virtualIndex = Math.max(0, Math.min(frames.length - 1, originalIndex + Math.round(frameDragOffset / ITEM_FULL_WIDTH)));
                    if (index > originalIndex && index <= virtualIndex) translateX = -ITEM_FULL_WIDTH;
                    else if (index < originalIndex && index >= virtualIndex) translateX = ITEM_FULL_WIDTH;
                }

                return { translateX, scale, zIndex, isDragging };
            };

            // 结果模式：只显示配置信息
            if (hasResult) {
                const viduModelLabel = viduModel === 'viduq2-turbo' ? 'Vidu Turbo' : 'Vidu Pro';
                return (
                    <div className={`absolute top-full left-1/2 z-50 transition-all duration-500 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
                        style={{ width: `${FIXED_CONFIG_PANEL_WIDTH}px`, paddingTop: `${8 * inverseScale}px`, transform: `translateX(-50%) scale(${inverseScale})`, transformOrigin: 'top center' }}
                    >
                        <div className={`rounded-[20px] p-1 ${GLASS_PANEL}`} onMouseDown={e => e.stopPropagation()}>
                            <div className="bg-white dark:bg-slate-800 rounded-[16px] p-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">{viduModelLabel}</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded">{viduResolution}</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded">{frames.length} 帧</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }

            // 获取当前编辑的帧信息
            const editingFrame = editingFrameId ? frames.find(f => f.id === editingFrameId) : null;
            const editingFrameIndex = editingFrameId ? frames.findIndex(f => f.id === editingFrameId) : -1;
            const isEditingTransition = editingFrame && editingFrameIndex < frames.length - 1;

            return (
                <div data-config-panel className={`absolute top-full left-1/2 z-50 flex flex-col items-center justify-start transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? `opacity-100 translate-y-0 scale-100` : 'opacity-0 translate-y-[-10px] scale-95 pointer-events-none'}`}
                    style={{ width: `${FIXED_CONFIG_PANEL_WIDTH}px`, paddingTop: `${8 * inverseScale}px`, transform: `translateX(-50%) scale(${inverseScale})`, transformOrigin: 'top center' }}
                >
                    <div className={`w-full rounded-[20px] p-1 flex flex-col gap-1 ${GLASS_PANEL} relative z-[100]`} onMouseDown={e => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                        <div className="relative group/input bg-white dark:bg-slate-800 rounded-[16px] flex flex-col overflow-hidden">
                            {/* 帧列表 */}
                            <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 overflow-x-auto custom-scrollbar select-none">
                                {frames.map((frame, index) => {
                                    const { translateX, scale, zIndex, isDragging } = getFrameTransform(frame.id, index);
                                    const isLastFrame = index === frames.length - 1;
                                    const isEditing = editingFrameId === frame.id;

                                    return (
                                        <div
                                            key={frame.id}
                                            className={`relative shrink-0 rounded-lg overflow-hidden border ${isEditing ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-slate-300 dark:border-slate-600'} hover:border-emerald-400 bg-slate-50 dark:bg-slate-800 group/frame cursor-grab active:cursor-grabbing`}
                                            style={{
                                                width: `${FRAME_WIDTH}px`,
                                                height: `${FRAME_WIDTH}px`,
                                                transform: `translateX(${translateX}px) scale(${scale})`,
                                                zIndex,
                                                transition: (isDragging || frame.id === frameJustDropped) ? 'none' : 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
                                            }}
                                            onMouseDown={(e) => handleFrameDragStart(e, frame.id)}
                                            onClick={(e) => {
                                                if (!isLastFrame && !isDragging) {
                                                    e.stopPropagation();
                                                    setEditingFrameId(isEditing ? null : frame.id);
                                                }
                                            }}
                                        >
                                            <img src={frame.src} className="w-full h-full object-cover pointer-events-none" alt="" draggable={false} />
                                            {/* 序号 */}
                                            <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-white/95 dark:bg-slate-700/95 rounded-full flex items-center justify-center text-[8px] font-bold text-slate-800 dark:text-slate-200 shadow-sm pointer-events-none">{index + 1}</div>
                                            {/* 删除按钮 */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditingFrameId(null); handleDeleteFrame(frame.id); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center bg-white/95 dark:bg-slate-700/95 hover:bg-red-500 text-slate-700 dark:text-slate-300 hover:text-white transition-colors opacity-0 group-hover/frame:opacity-100 shadow-sm"
                                            >
                                                <X size={8} strokeWidth={3} />
                                            </button>
                                            {/* 转场时长标签 - 非最后一帧显示 */}
                                            {!isLastFrame && (
                                                <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded text-[7px] font-bold ${isEditing ? 'bg-emerald-500 text-white' : 'bg-slate-800/70 text-white'}`}>
                                                    {frame.transition?.duration || 4}s
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* 添加按钮 */}
                                {frames.length < 10 && (
                                    <div
                                        className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95"
                                        onClick={() => multiFrameFileInputRef.current?.click()}
                                    >
                                        <Plus size={12} className="text-slate-400" />
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={multiFrameFileInputRef} className="hidden" accept="image/*" multiple onChange={handleFrameUpload} />

                            {/* 转场提示词输入区（编辑模式显示） */}
                            {isEditingTransition ? (
                                <textarea
                                    value={editingFrame.transition?.prompt || ''}
                                    onChange={(e) => updateFrameTransition(editingFrame.id, { prompt: e.target.value })}
                                    placeholder={`${editingFrameIndex + 1}→${editingFrameIndex + 2} 转场运镜/动作提示词（可选）...`}
                                    className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder-slate-500/60 dark:placeholder-slate-400/60 px-3 py-2 focus:outline-none resize-none custom-scrollbar font-medium leading-relaxed"
                                    style={{ height: '52px' }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    onKeyDown={(e) => {
                                        const nativeEvent = e.nativeEvent as KeyboardEvent;
                                        if (nativeEvent.isComposing) return;
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && frames.length >= 2 && !isWorking) {
                                            e.preventDefault();
                                            handleActionClick();
                                        }
                                    }}
                                />
                            ) : (
                                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                                    点击帧配置转场提示词...
                                </div>
                            )}
                        </div>
                        {/* 底部配置栏 */}
                        <div className="flex items-center justify-between px-2 pb-1 pt-1 relative z-20">
                            <div className="flex items-center gap-2">
                                {/* 模型选择 */}
                                <div className="relative group/model">
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400">
                                        <span>{viduModel === 'viduq2-turbo' ? 'Vidu Turbo' : 'Vidu Pro'}</span><ChevronDown size={10} />
                                    </div>
                                    <div className="absolute bottom-full left-0 pb-2 w-28 opacity-0 translate-y-2 pointer-events-none group-hover/model:opacity-100 group-hover/model:translate-y-0 group-hover/model:pointer-events-auto transition-all duration-200 z-[200]">
                                        <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                            {([{ l: 'Vidu Turbo', v: 'viduq2-turbo' as const }, { l: 'Vidu Pro', v: 'viduq2-pro' as const }]).map(m => (
                                                <div key={m.v} onClick={() => updateViduConfig({ model: m.v })} className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${viduModel === m.v ? 'text-emerald-500 dark:text-emerald-400 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>{m.l}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {/* 分辨率选择 */}
                                <div className="relative group/res">
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400">
                                        <span>{viduResolution}</span><ChevronDown size={10} />
                                    </div>
                                    <div className="absolute bottom-full left-0 pb-2 w-20 opacity-0 translate-y-2 pointer-events-none group-hover/res:opacity-100 group-hover/res:translate-y-0 group-hover/res:pointer-events-auto transition-all duration-200 z-[200]">
                                        <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                            {(['540p', '720p', '1080p'] as const).map(r => (
                                                <div key={r} onClick={() => updateViduConfig({ resolution: r })} className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${viduResolution === r ? 'text-emerald-500 dark:text-emerald-400 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>{r}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {/* 时长滑块（编辑模式显示） */}
                                {isEditingTransition && (
                                    <div className="flex items-center gap-1.5 px-1">
                                        <span className="text-[9px] text-slate-400">{editingFrame.transition?.duration || 4}s</span>
                                        <input
                                            type="range"
                                            min="2"
                                            max="7"
                                            step="1"
                                            value={editingFrame.transition?.duration || 4}
                                            onChange={(e) => updateFrameTransition(editingFrame.id, { duration: parseInt(e.target.value) })}
                                            className="w-16 h-1 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* 关闭编辑按钮 */}
                                {isEditingTransition && (
                                    <button
                                        onClick={() => setEditingFrameId(null)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                                    >
                                        <X size={10} /><span>关闭</span>
                                    </button>
                                )}
                                <GenerateCreditButton
                                    estimateLabel={estimatedCredits.label}
                                    onClick={handleActionClick}
                                    disabled={frames.length < 2 || isWorking}
                                    working={isWorking}
                                    theme="emerald"
                                    title={isWorking ? '生成中...' : '生成'}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // 结果节点：显示提示词+模型信息（只读）
        const hasMediaResult = !!(node.data.image || node.data.videoUri);
        if (hasMediaResult && !isEditingResult && !isVideoGenNode && !isImageGenNode) {
            const promptText = node.data.prompt || '';
            const MODEL_LABELS: Record<string, string> = {
                'doubao-seedream-5-0-260128': 'Seedream 5.0 Lite',
                'doubao-seedream-4-5-251128': 'Seedream 4.5',
                'doubao-seedream-3-0-t2i-250415': 'Seedream 3.0',
                'doubao-seededit-3-0-i2i-250628': 'Seedream 3.0',
                'nano-banana': 'Nano Banana',
                'nano-banana-2': 'Nano Banana 2',
                'veo3.1': 'Veo 3.1',
                'veo3.1-pro': 'Veo 3.1 Pro',
                'doubao-seedance-1-5-pro-251215': 'Seedance 1.5',
            };
            const modelName = MODEL_LABELS[node.data.model || ''] || node.data.model || '默认';
            const tags = [node.data.aspectRatio, node.data.resolution].filter(Boolean);

            const handleCopy = () => { navigator.clipboard.writeText(promptText); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 1500); };

            return (
                <div className={`absolute top-full left-1/2 z-50 transition-all duration-500 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
                    style={{
                        width: `${FIXED_CONFIG_PANEL_WIDTH}px`,
                        paddingTop: `${8 * inverseScale}px`,
                        transform: `translateX(-50%) scale(${inverseScale})`,
                        transformOrigin: 'top center'
                    }}
                >
                    <div className={`rounded-[20px] p-1 ${GLASS_PANEL}`} onMouseDown={e => e.stopPropagation()}>
                        <div className="bg-white dark:bg-slate-800 rounded-[16px] p-3">
                            {/* 模型+配置+复制 */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">{modelName}</span>
                                {tags.map((t, i) => <span key={i} className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded">{t}</span>)}
                                {promptText && (
                                    <button onClick={handleCopy} className={`ml-auto p-1 rounded transition-colors ${promptCopied ? 'text-green-500 dark:text-green-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`} title="复制">
                                        {promptCopied ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                )}
                            </div>
                            {/* 提示词 */}
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{promptText || <span className="text-slate-400 dark:text-slate-500 italic">无提示词</span>}</p>
                        </div>
                    </div>
                </div>
            );
        }

        const providerLogo = currentProvider?.logo;

        // 在所有分组中查找当前模型显示名称
        const currentModelLabel = allModelsGrouped
            .flatMap(g => g.models.map(m => ({ id: m.id, name: m.name })))
            .find(m => m.id === node.data.model)?.name
            || (isSeedream3AutoPair(node.data.model) ? 'Seedream 3.0' : undefined)
            || currentProvider?.name
            || 'AI Model';

        // 剧情延展模式：底部缩略图显示已选取的关键帧而非上游视频
        const isCutOrContinueMode = node.type === NodeType.VIDEO_FACTORY && (generationMode === 'CUT' || generationMode === 'CONTINUE');
        const showMergedReferencePreview = isViduVideoNode && viduReferencePreviewAssets.length > 0;
        const thumbnailAssets: InputAsset[] = isCutOrContinueMode && node.data.croppedFrame
            ? [{ id: 'croppedFrame', type: 'image', src: node.data.croppedFrame }]
            : (showMergedReferencePreview ? viduReferencePreviewAssets : (inputAssets || []));
        const showThumbnails = thumbnailAssets.length > 0;

        return (
            <div data-config-panel className={`absolute top-full left-1/2 z-50 flex flex-col items-center justify-start transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? `opacity-100 translate-y-0 scale-100` : 'opacity-0 translate-y-[-10px] scale-95 pointer-events-none'}`}
                style={{
                    width: `${FIXED_CONFIG_PANEL_WIDTH}px`,
                    paddingTop: `${8 * inverseScale}px`,
                    transform: `translateX(-50%) scale(${inverseScale})`,
                    transformOrigin: 'top center'
                }}
            >
                {/* Glass Panel: Set strict Z-Index to higher layer to overlap thumbnails */}
                <div className={`w-full rounded-[20px] p-1 flex flex-col gap-1 ${GLASS_PANEL} relative z-[100]`} onMouseDown={e => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                    <div className="relative group/input bg-white dark:bg-slate-800 rounded-[16px] flex flex-col">
                        {/* InputThumbnails: CUT/CONTINUE显示croppedFrame，其他模式显示上游输入 */}
                        {showThumbnails && (<div className="w-full px-1 pt-1 z-10"><InputThumbnails assets={thumbnailAssets} onReorder={(isCutOrContinueMode || showMergedReferencePreview) ? () => { } : (newOrder) => onInputReorder?.(node.id, newOrder)} /></div>)}
                        {showMergedReferencePreview && viduReferenceUsage && (
                            <div className="px-3 pb-1 text-[10px] text-slate-500 dark:text-slate-400">
                                参考图 {viduReferenceUsage.mergedImages.length}/{MAX_VIDU_REFERENCE_IMAGES}
                                {viduReferenceUsage.isCapped && (
                                    <span className="ml-1 text-amber-500 dark:text-amber-400">
                                        超出 {viduReferenceUsage.overflowCount} 张（生成前需精简）
                                    </span>
                                )}
                            </div>
                        )}
                        {/* @主体 高亮层 + textarea */}
                        <div className="relative" style={{ height: `${inputHeight}px` }}>
                            {enableSubjectMentions && (
                                <SubjectHighlighter
                                    text={localPrompt}
                                    subjects={subjects || []}
                                    model={node.data.model}
                                    scrollTop={promptScrollOffset.top}
                                    scrollLeft={promptScrollOffset.left}
                                    className="absolute inset-0 p-3 text-xs font-medium leading-relaxed overflow-hidden"
                                />
                            )}
                            <textarea
                                ref={promptTextareaRef}
                                className="w-full h-full bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder-slate-500/60 dark:placeholder-slate-400/60 p-3 focus:outline-none resize-none custom-scrollbar font-medium leading-relaxed relative z-10"
                                placeholder="描述您的修改或生成需求..."
                                value={localPrompt}
                                onChange={(e) => setLocalPrompt(e.target.value)}
                                onBlur={() => { setIsInputFocused(false); commitPrompt(); }}
                                onKeyDown={handleCmdEnter}
                                onFocus={() => setIsInputFocused(true)}
                                onScroll={enableSubjectMentions ? handlePromptScroll : undefined}
                                onWheel={(e) => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                readOnly={isWorking}
                            />
                            {/* resize handle */}
                            <div className="absolute bottom-0 left-0 w-full h-3 cursor-row-resize flex items-center justify-center opacity-0 group-hover/input:opacity-100 transition-opacity z-20" onMouseDown={handleInputResizeStart}><div className="w-8 h-1 rounded-full bg-slate-100 dark:bg-slate-700 group-hover/input:bg-slate-200 dark:group-hover/input:bg-slate-600" /></div>
                        </div>
                        {/* @ 主体提及弹窗 - 放在外层避免被裁剪 */}
                        {enableSubjectMentions && (
                            <SubjectMention
                                subjects={subjects || []}
                                textareaRef={promptTextareaRef}
                                value={localPrompt}
                                onChange={setLocalPrompt}
                                getDisabledReason={getSubjectMentionDisabledReason}
                            />
                        )}
                    </div>
                    {/* 视频扩展配置面板 - 仅视频节点且有支持的厂商时显示 */}
                    {(node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY) && currentProvider?.id && ['vidu', 'seedance', 'veo'].includes(currentProvider.id) && (() => {
                        // 检测是否为首尾帧模式
                        const canConfigureVideoMode = generationMode !== 'CONTINUE' && generationMode !== 'CUT';
                        const currentVideoModeOverride = (node.data.videoModeOverride || 'auto') as VideoGenerationMode | 'auto';
                        const hasFirstLastFrameData = !!(node.data.firstLastFrameData?.firstFrame || node.data.firstLastFrameData?.lastFrame);
                        const isFirstLastFrameMode = (node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY) &&
                            (generationMode === 'FIRST_LAST_FRAME' || hasFirstLastFrameData);
                        const imageInputCount = (inputAssets || []).filter(a => a.type === 'image').length;
                        const hasTwoImageInputs = imageInputCount === 2;
                        const isViduModel = (node.data.model || '').startsWith('vidu');
                        const shouldPreferViduReference = isViduModel && !hasSubjectReferences && !hasFirstLastFrameData && imageInputCount > 2;
                        const autoMode: VideoGenerationMode = hasSubjectReferences
                            ? 'reference'
                            : shouldPreferViduReference
                                ? 'reference'
                                : (hasFirstLastFrameData || hasTwoImageInputs)
                                    ? 'start-end'
                                    : imageInputCount > 0
                                        ? 'img2video'
                                        : 'text2video';
                        const effectiveMode: VideoGenerationMode = currentVideoModeOverride === 'auto' ? autoMode : currentVideoModeOverride;
                        // Vidu 主体参考在生成链路中优先走 reference，这里 UI 显示与真实链路保持一致
                        const displayMode: VideoGenerationMode = (isViduModel && hasSubjectReferences) ? 'reference' : effectiveMode;
                        const showQuickModeSwitch = canConfigureVideoMode && hasTwoImageInputs && !hasSubjectReferences && !hasFirstLastFrameData;
                        const quickMode: 'start-end' | 'reference' = displayMode === 'reference' ? 'reference' : 'start-end';
                        const showFirstLastFrameTag = !showQuickModeSwitch && displayMode === 'start-end' && (isFirstLastFrameMode || effectiveMode === 'start-end');
                        const showReferenceTag = !showQuickModeSwitch && displayMode === 'reference';

                        return (
                        <div className="px-3 pb-1">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">扩展配置</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {showQuickModeSwitch && (
                                        <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => onUpdate(node.id, { videoModeOverride: 'start-end' })}
                                                className={`px-2 py-1 text-[8px] font-bold transition-colors ${
                                                    quickMode === 'start-end'
                                                        ? 'bg-emerald-500 text-white'
                                                        : 'bg-white dark:bg-slate-800 text-emerald-500 dark:text-emerald-400'
                                                }`}
                                                title="切换为首尾帧"
                                            >
                                                首尾帧
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onUpdate(node.id, { videoModeOverride: 'reference' })}
                                                className={`px-2 py-1 text-[8px] font-bold transition-colors ${
                                                    quickMode === 'reference'
                                                        ? 'bg-blue-500 text-white'
                                                        : 'bg-white dark:bg-slate-800 text-blue-500 dark:text-blue-400'
                                                }`}
                                                title="切换为参考"
                                            >
                                                参考
                                            </button>
                                        </div>
                                    )}
                                    {/* 首尾帧标签 - 仅首尾帧模式显示 */}
                                    {showFirstLastFrameTag && (
                                        <span className="text-[8px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                            首尾帧
                                        </span>
                                    )}
                                    {showReferenceTag && (
                                        <span className="text-[8px] font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                            参考
                                        </span>
                                    )}
                                    <ConfigExpandButton
                                        isCollapsed={!isVideoConfigExpanded}
                                        onClick={() => setIsVideoConfigExpanded(!isVideoConfigExpanded)}
                                    />
                                </div>
                            </div>
                            <CollapsibleContent isCollapsed={!isVideoConfigExpanded} maxHeight="200px">
                                <VideoConfigPanel
                                    providerId={currentProvider.id}
                                    model={node.data.model}
                                    config={node.data.videoConfig || {}}
                                    onConfigChange={(config) => onUpdate(node.id, { videoConfig: config })}
                                    viduMode={
                                        inferredVideoMode === 'start-end'
                                            ? 'start-end'
                                            : inferredVideoMode === 'img2video'
                                                ? 'img2video'
                                                : inferredVideoMode === 'reference'
                                                    ? 'reference'
                                                : 'text2video'
                                    }
                                />
                                {/* 主体选择器 - 仅 Vidu 支持 */}
                                {currentProvider.id === 'vidu' && subjects && subjects.length > 0 && !isStoryContinueMode && (
                                    <div className="mt-2">
                                        <SubjectPicker
                                            subjects={subjects}
                                            selected={node.data.selectedSubjects || []}
                                            onChange={(selected) => onUpdate(node.id, {
                                                selectedSubjects: selected,
                                                generationMode: selected.length > 0 ? 'SUBJECT_REF' : node.data.generationMode
                                            })}
                                            onOpenLibrary={onOpenSubjectLibrary}
                                        />
                                    </div>
                                )}
                            </CollapsibleContent>
                        </div>
                        );
                    })()}
                    <div className="flex items-center justify-between px-2 pb-1 pt-1 relative z-20">
                        <div className="flex items-center gap-2">
                            <div className="relative group/model">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-300">
                                    {providerLogo && <img src={providerLogo} alt="" className="w-3.5 h-3.5 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                                    <span>{currentModelLabel}</span>
                                    <ChevronDown size={10} />
                                </div>
                                <div className="absolute bottom-full left-0 pb-2 min-w-[160px] opacity-0 translate-y-2 pointer-events-none group-hover/model:opacity-100 group-hover/model:translate-y-0 group-hover/model:pointer-events-auto transition-all duration-200 z-[200]">
                                    <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                        {allModelsGrouped.map((group, gi) => (
                                            <div key={group.provider.id}>
                                                {/* 厂商分隔头 */}
                                                {(gi > 0 || allModelsGrouped.length > 1) && (
                                                    <div className={`px-3 pt-2 pb-1 flex items-center gap-1.5 ${gi > 0 ? 'border-t border-slate-100 dark:border-slate-700' : ''}`}>
                                                        {group.provider.logo && <img src={group.provider.logo} alt="" className="w-3 h-3 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{group.provider.name}</span>
                                                    </div>
                                                )}
                                                {group.models.map((m) => {
                                                    const isDisabled = Boolean((m as typeof m & { disabled?: boolean }).disabled);
                                                    const disabledReason = (m as typeof m & { disabledReason?: string }).disabledReason;
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            title={isDisabled ? (disabledReason || SEEDREAM_3_I2I_DISABLED_REASON) : undefined}
                                                            onClick={() => {
                                                                if (isDisabled) return;
                                                                onUpdate(node.id, { model: m.id });
                                                            }}
                                                            className={`px-3 py-2 text-[10px] font-bold flex items-center gap-2 ${
                                                                isDisabled
                                                                    ? 'cursor-not-allowed text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-700/30'
                                                                    : `cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${
                                                                        node.data.model === m.id
                                                                            ? 'text-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-700'
                                                                            : 'text-slate-600 dark:text-slate-300'
                                                                    }`
                                                            }`}
                                                        >
                                                            <span>{m.name}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* 比例选择 - 有素材时只读，无素材时可选择 */}
                            {(() => {
                                const isImageNode = node.type.includes('IMAGE');
                                const modelConfig = isImageNode ? getImageModelConfig(node.data.model || '') : null;
                                const showAspectRatio = !isImageNode || modelConfig?.supportsAspectRatio;
                                const aspectRatios = isImageNode && modelConfig?.aspectRatios ? modelConfig.aspectRatios : (node.type.includes('VIDEO') ? VIDEO_ASPECT_RATIOS : IMAGE_ASPECT_RATIOS);
                                const defaultRatio = modelConfig?.defaultAspectRatio || '16:9';
                                // 有素材时比例只读
                                const hasMedia = !!(node.data.image || node.data.videoUri);

                                if (!showAspectRatio) return null;

                                // 有素材时显示只读比例
                                if (hasMedia) {
                                    return (
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                            <Scaling size={12} /><span>{node.data.aspectRatio || defaultRatio}</span>
                                        </div>
                                    );
                                }

                                // 无素材时可选择比例
                                return (
                                    <div className="relative group/ratio">
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-300">
                                            <Scaling size={12} /><span>{node.data.aspectRatio || defaultRatio}</span>
                                        </div>
                                        <div className="absolute bottom-full left-0 pb-2 w-20 opacity-0 translate-y-2 pointer-events-none group-hover/ratio:opacity-100 group-hover/ratio:translate-y-0 group-hover/ratio:pointer-events-auto transition-all duration-200 z-[200]">
                                            <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                                {aspectRatios.map(r => (
                                                    <div key={r} onClick={() => handleAspectRatioSelect(r)} className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${node.data.aspectRatio === r ? 'text-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>{r}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* 分辨率选择 - 根据模型配置和生成模式显示 */}
                            {(() => {
                                const isImageNode = node.type.includes('IMAGE');
                                const modelConfig = isImageNode ? getImageModelConfig(node.data.model || '') : null;
                                const showResolution = isImageNode ? modelConfig?.supportsResolution : isVideoGenNode;

                                // 视频节点：根据当前状态确定生成模式，获取对应的可用分辨率
                                let resolutions: string[];
                                let defaultRes: string;

                                if (isVideoGenNode) {
                                    resolutions = videoResolutionOptions;
                                    defaultRes = defaultVideoResolution;
                                } else if (isImageNode && modelConfig?.resolutions) {
                                    resolutions = modelConfig.resolutions;
                                    defaultRes = modelConfig.defaultResolution || '1k';
                                } else {
                                    resolutions = node.type.includes('IMAGE') ? IMAGE_RESOLUTIONS : VIDEO_RESOLUTIONS;
                                    defaultRes = node.type.includes('IMAGE') ? '1k' : '720p';
                                }

                                // 保底显示：当当前值暂时不在可用选项中时展示默认值
                                const currentRes = node.data.resolution || defaultRes;
                                const displayRes = resolutions.includes(currentRes) ? currentRes : defaultRes;

                                return showResolution && (
                                    <div className="relative group/resolution">
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-300">
                                            <Monitor size={12} /><span>{displayRes}</span>
                                        </div>
                                        <div className="absolute bottom-full left-0 pb-2 w-20 opacity-0 translate-y-2 pointer-events-none group-hover/resolution:opacity-100 group-hover/resolution:translate-y-0 group-hover/resolution:pointer-events-auto transition-all duration-200 z-[200]">
                                            <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                                {resolutions.map(r => (
                                                    <div key={r} onClick={() => onUpdate(node.id, { resolution: r })} className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${node.data.resolution === r ? 'text-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>{r}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* 时长选择 - 仅视频节点显示 */}
                            {(node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY) && (() => {
                                const durationOptions = videoDurationOptions;
                                const defaultDuration = defaultVideoDuration;
                                const currentDuration = node.data.duration ?? defaultDuration;
                                const displayDuration = durationOptions.includes(currentDuration) ? currentDuration : defaultDuration;

                                return (
                                    <div className="relative group/duration">
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-300">
                                            <Clock size={12} />
                                            <span>{displayDuration === -1 ? '自动' : `${displayDuration}s`}</span>
                                        </div>
                                        <div className="absolute bottom-full left-0 pb-2 w-20 opacity-0 translate-y-2 pointer-events-none group-hover/duration:opacity-100 group-hover/duration:translate-y-0 group-hover/duration:pointer-events-auto transition-all duration-200 z-[200]">
                                            <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                                                {durationOptions.map(d => (
                                                    <div
                                                        key={d}
                                                        onClick={() => onUpdate(node.id, { duration: d })}
                                                        className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${displayDuration === d ? 'text-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}
                                                    >
                                                        {d === -1 ? '自动' : `${d}s`}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* 组图数量选择 - 仅图像生成节点显示 */}
                            {node.type === NodeType.IMAGE_GENERATOR && (
                                <div className="relative group/count">
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-300">
                                        <Grid3X3 size={12} /><span>{node.data.imageCount || 1}张</span>
                                    </div>
                                    <div className="absolute bottom-full left-0 pb-2 w-20 opacity-0 translate-y-2 pointer-events-none group-hover/count:opacity-100 group-hover/count:translate-y-0 group-hover/count:pointer-events-auto transition-all duration-200 z-[200]">
                                        <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                            {IMAGE_COUNTS.map(c => (
                                                <div key={c} onClick={() => onUpdate(node.id, { imageCount: c })} className={`px-3 py-2 text-[10px] font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${(node.data.imageCount || 1) === c ? 'text-blue-400 dark:text-blue-300 bg-slate-50 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>{c}张</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* 编辑模式下显示取消按钮 */}
                            {isEditingResult && (
                                <button
                                    onClick={() => setIsEditingResult(false)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-[12px] font-bold text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                                >
                                    <X size={12} />
                                    <span>取消</span>
                                </button>
                            )}
                            <GenerateCreditButton
                                estimateLabel={estimatedCredits.label}
                                onClick={handleActionClick}
                                disabled={isWorking}
                                working={isWorking}
                                theme="blue"
                                title={isWorking ? '生成中...' : '生成'}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const isInteracting = isDragging || isResizing || isGroupDragging || isPromptContentResizing;

    // 根据节点类型获取边框颜色（始终显示，不依赖内容）
    const getContentBorderColor = () => {
        // 文本节点 - 黄色
        if (node.type === NodeType.PROMPT_INPUT) {
            return 'ring-amber-400/80';
        }
        // 图片相关节点 - 蓝色
        if (node.type === NodeType.IMAGE_GENERATOR || node.type === NodeType.IMAGE_ASSET || node.type === NodeType.IMAGE_EDITOR) {
            return 'ring-blue-400/80';
        }
        // 视频相关节点 - 绿色
        if (node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_FACTORY || node.type === NodeType.VIDEO_ASSET) {
            return 'ring-green-400/80';
        }
        // 音频节点 - 红色
        if (node.type === NodeType.AUDIO_GENERATOR || node.type === NodeType.VOICE_GENERATOR) {
            return 'ring-red-400/80';
        }
        // 多帧视频节点 - 绿色（与视频节点统一）
        if (node.type === NodeType.MULTI_FRAME_VIDEO) {
            return 'ring-emerald-400/80';
        }
        // 3D 运镜节点 - 紫色
        if (node.type === NodeType.IMAGE_3D_CAMERA) {
            return 'ring-purple-400/80';
        }
        // 默认
        return 'ring-slate-300/80';
    };
    const contentBorderColor = getContentBorderColor();

    // 组图宫格计算
    const gridItems = node.data.images || node.data.videoUris || [];
    const hasGrid = gridItems.length > 1;
    const gridCols = 2;
    const gridRows = Math.ceil(gridItems.length / gridCols);
    const gap = 4;
    const gridPadding = 4;
    const gridWidth = gridCols * nodeWidth + (gridCols - 1) * gap + gridPadding * 2;
    const gridHeight = gridRows * nodeHeight + (gridRows - 1) * gap + gridPadding * 2;

    // 展开时使用网格尺寸，否则使用节点尺寸
    const displayWidth = (hasGrid && showImageGrid) ? gridWidth : nodeWidth;
    const displayHeight = (hasGrid && showImageGrid) ? gridHeight : nodeHeight;
    const handleNodeDoubleClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, [data-config-panel]')) return;

        // 提示词节点：进入编辑模式（保持原有行为）
        if (node.type === NodeType.PROMPT_INPUT) {
            e.stopPropagation();
            enterPromptEditMode();
            return;
        }

        // 图片/视频节点：有内容时触发全屏预览
        const hasImage = node.type.includes('IMAGE') && node.data.image;
        const hasVideo = node.type.includes('VIDEO') && node.data.videoUri;
        if (hasImage || hasVideo) {
            handleExpand(e);
        }
    };

    return (
        <>
            <div
                ref={nodeRef}
                className={`absolute rounded-[24px] group ring-2 ${contentBorderColor} ${isSelected ? 'ring-[3px] shadow-[0_20px_60px_rgba(59,130,246,0.15)]' : 'hover:ring-[3px]'}`}
                style={{
                    left: 0, top: 0, width: displayWidth, height: displayHeight,
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    zIndex: hasFloatingPanel ? (isHovered ? 95 : 90) : 10,
                    background: isDarkMode
                        ? (isSelected ? 'rgba(30, 41, 59, 0.96)' : 'rgba(15, 23, 42, 0.9)')
                        : (isSelected ? 'rgba(255, 255, 255, 0.96)' : 'rgba(250, 250, 255, 0.9)'),
                    transition: isInteracting ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), width 0.4s cubic-bezier(0.32, 0.72, 0, 1), height 0.4s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.3s',
                    backdropFilter: isInteracting ? 'none' : 'blur(18px)',
                    boxShadow: isInteracting ? 'none' : `0 0 0 ${(isSelected || isHovered ? 3 : 2) * inverseScale}px var(--tw-ring-color)${isSelected ? ', 0 20px 60px rgba(59,130,246,0.15)' : ''}`,
                    willChange: isInteracting ? 'transform' : 'auto'
                }}
                onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                onDoubleClick={handleNodeDoubleClick}
                onMouseEnter={() => !isInteracting && setIsHovered(true)}
                onMouseLeave={() => !isInteracting && setIsHovered(false)}
                onContextMenu={(e) => onNodeContextMenu(e, node.id)}
            >
                {renderTopBar()}
                {isUploading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[24px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Loader2 className="animate-spin text-blue-500 dark:text-blue-400" size={20} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">上传中...</span>
                        </div>
                    </div>
                )}
                {/* 左连接点 - 生成节点/提示词节点可双击/拖拽创建上游节点，素材节点不显示 */}
                {(() => {
                    // 素材节点不需要左连接点
                    const isAssetNode = node.type === NodeType.IMAGE_ASSET || node.type === NodeType.VIDEO_ASSET;
                    if (isAssetNode) return null;

                    // 生成节点（图像/视频/多帧视频/3D运镜）支持左连接点交互创建上游节点
                    const isGeneratorNode = node.type === NodeType.IMAGE_GENERATOR ||
                        node.type === NodeType.VIDEO_GENERATOR ||
                        node.type === NodeType.VIDEO_FACTORY ||
                        node.type === NodeType.MULTI_FRAME_VIDEO ||
                        node.type === NodeType.IMAGE_3D_CAMERA;

                    // 提示词节点也支持左连接点（连接图片/视频进行分析）
                    const isPromptNode = node.type === NodeType.PROMPT_INPUT;
                    const isMultiFrameNode = node.type === NodeType.MULTI_FRAME_VIDEO;
                    const hasInputPortAction = isGeneratorNode || isPromptNode;

                    const handleInputDoubleClick = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (hasInputPortAction && onInputPortAction) {
                            onInputPortAction(node.id, { x: e.clientX, y: e.clientY });
                        }
                    };

                    const handleInputMouseUp = (e: React.MouseEvent) => {
                        // 仅处理连接，不触发操作菜单（双击或拖拽释放到空白区域时由StudioTab处理）
                        onPortMouseUp(e, node.id, 'input');
                    };

                    // 左连接点统一绿色，无状态灰色
                    const portColorClass = hasInputPortAction
                        ? 'w-5 h-5 border-green-400 group-hover/input:bg-green-500 group-hover/input:border-green-500 group-hover/input:scale-110'
                        : 'w-4 h-4 border-slate-300 dark:border-slate-600 group-hover/input:scale-105';
                    const iconColorClass = hasInputPortAction
                        ? 'text-green-400 group-hover/input:text-white'
                        : 'text-slate-400';

                    return (
                        <div
                            className={`absolute top-1/2 z-50 w-8 h-8 flex items-center justify-center cursor-crosshair transition-opacity duration-200 group/input ${showPorts ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                            style={{
                                left: '0px',
                                transform: `translate(-50%, -50%) scale(${inverseScale})`,
                                transformOrigin: 'center center'
                            }}
                            onMouseDown={(e) => onPortMouseDown(e, node.id, 'input')}
                            onMouseUp={handleInputMouseUp}
                            onDoubleClick={handleInputDoubleClick}
                            title={isPromptNode ? "双击添加媒体分析" : isMultiFrameNode ? "双击添加输入图片" : isGeneratorNode ? "双击添加输入节点" : "Input"}
                        >
                            <div
                                className={`rounded-full border bg-white dark:bg-slate-800 flex items-center justify-center transition-all duration-200 shadow-md ${portColorClass} ${isConnecting ? 'ring-2 ring-cyan-400 animate-pulse' : ''}`}
                            >
                                <Plus size={hasInputPortAction ? 12 : 10} strokeWidth={3} className={`transition-colors ${iconColorClass}`} />
                            </div>
                        </div>
                    );
                })()}
                {/* 右连接点 - 有媒体结果或提示词时增强交互，统一蓝色 */}
                {(() => {
                    // 右连接点始终可用于连接，避免空节点阶段无法构建工作流
                    const portColorClass = 'w-5 h-5 border-blue-400 group-hover/output:bg-blue-500 group-hover/output:border-blue-500 group-hover/output:scale-110';
                    const iconColorClass = 'text-blue-400 group-hover/output:text-white';

                    const handleOutputDoubleClick = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (onOutputPortAction) {
                            onOutputPortAction(node.id, { x: e.clientX, y: e.clientY });
                        }
                    };
                    const handleOutputMouseUp = (e: React.MouseEvent) => {
                        // 仅处理连接，不触发操作菜单（双击或拖拽释放到空白区域时由StudioTab处理）
                        onPortMouseUp(e, node.id, 'output');
                    };
                    return (
                        <div
                            className={`absolute top-1/2 z-50 w-8 h-8 flex items-center justify-center cursor-crosshair transition-opacity duration-200 group/output ${showPorts ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                            style={{
                                left: '100%',
                                transform: `translate(-50%, -50%) scale(${inverseScale})`,
                                transformOrigin: 'center center'
                            }}
                            onMouseDown={(e) => onPortMouseDown(e, node.id, 'output')}
                            onMouseUp={handleOutputMouseUp}
                            onDoubleClick={handleOutputDoubleClick}
                            title="双击或拖拽创建下游节点"
                        >
                            <div
                                className={`rounded-full border bg-white dark:bg-slate-800 flex items-center justify-center transition-all duration-200 shadow-md ${portColorClass} ${isConnecting ? 'ring-2 ring-purple-400 animate-pulse' : ''}`}
                            >
                                <Plus size={12} strokeWidth={3} className={`transition-colors ${iconColorClass}`} />
                            </div>
                        </div>
                    );
                })()}
                <div className="w-full h-full flex flex-col relative rounded-[24px] overflow-hidden bg-white dark:bg-slate-800">
                    {/* 单图视图 - 始终渲染，通过opacity控制显示 */}
                    <div
                        className="absolute inset-0"
                        style={{
                            opacity: (hasGrid && showImageGrid) ? 0 : 1,
                            pointerEvents: (hasGrid && showImageGrid) ? 'none' : 'auto',
                            zIndex: (hasGrid && showImageGrid) ? 0 : 1,
                            transition: 'opacity 0.35s ease-out',
                        }}
                    >
                        <div className="w-full h-full relative bg-white dark:bg-slate-800">{renderMediaContent()}</div>
                    </div>
                    {/* 网格视图 - 有多图时始终渲染，通过opacity控制显示 */}
                    {hasGrid && (
                        <div
                            className="absolute inset-0 p-1"
                            style={{
                                opacity: showImageGrid ? 1 : 0,
                                pointerEvents: showImageGrid ? 'auto' : 'none',
                                zIndex: showImageGrid ? 1 : 0,
                                transition: 'opacity 0.35s ease-out',
                            }}
                        >
                            <button
                                className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                                onClick={() => setShowImageGrid(false)}
                            >
                                <X size={14} className="text-white" />
                            </button>
                            <div className="w-full h-full grid grid-cols-2" style={{ gap }}>
                                {node.data.images ? node.data.images.map((img, idx) => {
                                    const isItemSelected = img === node.data.image;
                                    const handleMouseDown = (e: React.MouseEvent) => {
                                        const isCopyDrag = e.ctrlKey || e.metaKey;
                                        if (!isCopyDrag) {
                                            e.stopPropagation();
                                            onUpdate(node.id, { image: img });
                                            setShowImageGrid(false);
                                            return;
                                        }
                                        e.stopPropagation();
                                        e.preventDefault();
                                        const startX = e.clientX, startY = e.clientY;
                                        let hasMoved = false;
                                        const onMove = (me: MouseEvent) => {
                                            if (Math.abs(me.clientX - startX) > 5 || Math.abs(me.clientY - startY) > 5) {
                                                if (!hasMoved) { hasMoved = true; setGridDragState({ isDragging: true, src: img, type: 'image' }); }
                                                onGridDragStateChange?.({ isDragging: true, type: 'image', src: img, screenX: me.clientX, screenY: me.clientY });
                                            }
                                        };
                                        const onUp = (ue: MouseEvent) => {
                                            window.removeEventListener('mousemove', onMove);
                                            window.removeEventListener('mouseup', onUp);
                                            document.body.style.cursor = '';
                                            onGridDragStateChange?.(null);
                                            if (hasMoved && onDragResultToCanvas) { onDragResultToCanvas(node.id, 'image', img, ue.clientX, ue.clientY); setShowImageGrid(false); }
                                            setGridDragState(null);
                                        };
                                        document.body.style.cursor = 'copy';
                                        window.addEventListener('mousemove', onMove);
                                        window.addEventListener('mouseup', onUp);
                                    };
                                    return (
                                        <div
                                            key={idx}
                                            className={`relative overflow-hidden cursor-pointer rounded-[20px] ${isItemSelected ? 'ring-4 ring-blue-500 ring-inset' : 'hover:brightness-95 hover:ring-2 hover:ring-cyan-400'} transition-all group/item`}
                                            onMouseDown={handleMouseDown}
                                        >
                                            <img src={img} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                                            {isItemSelected && (
                                                <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow">
                                                    <CheckCircle size={12} className="text-white" />
                                                </div>
                                            )}
                                            <div className="absolute bottom-2 right-2 opacity-0 group-hover/item:opacity-100 transition-opacity bg-black/50 px-2 py-1 rounded-lg flex items-center gap-1">
                                                <Copy size={10} className="text-white" />
                                                <span className="text-[9px] text-white font-medium">Ctrl+拖拽复制</span>
                                            </div>
                                        </div>
                                    );
                                }) : node.data.videoUris?.map((uri, idx) => {
                                    const isItemSelected = uri === node.data.videoUri;
                                    const handleMouseDown = (e: React.MouseEvent) => {
                                        const isCopyDrag = e.ctrlKey || e.metaKey;
                                        if (!isCopyDrag) {
                                            e.stopPropagation();
                                            onUpdate(node.id, { videoUri: uri });
                                            setShowImageGrid(false);
                                            return;
                                        }
                                        e.stopPropagation();
                                        e.preventDefault();
                                        const startX = e.clientX, startY = e.clientY;
                                        let hasMoved = false;
                                        const onMove = (me: MouseEvent) => {
                                            if (Math.abs(me.clientX - startX) > 5 || Math.abs(me.clientY - startY) > 5) {
                                                if (!hasMoved) { hasMoved = true; setGridDragState({ isDragging: true, src: uri, type: 'video' }); }
                                                onGridDragStateChange?.({ isDragging: true, type: 'video', src: uri, screenX: me.clientX, screenY: me.clientY });
                                            }
                                        };
                                        const onUp = (ue: MouseEvent) => {
                                            window.removeEventListener('mousemove', onMove);
                                            window.removeEventListener('mouseup', onUp);
                                            document.body.style.cursor = '';
                                            onGridDragStateChange?.(null);
                                            if (hasMoved && onDragResultToCanvas) { onDragResultToCanvas(node.id, 'video', uri, ue.clientX, ue.clientY); setShowImageGrid(false); }
                                            setGridDragState(null);
                                        };
                                        document.body.style.cursor = 'copy';
                                        window.addEventListener('mousemove', onMove);
                                        window.addEventListener('mouseup', onUp);
                                    };
                                    return (
                                        <div
                                            key={idx}
                                            className={`relative overflow-hidden cursor-pointer rounded-[20px] ${isItemSelected ? 'ring-4 ring-emerald-500 ring-inset' : 'hover:brightness-95 hover:ring-2 hover:ring-cyan-400'} transition-all group/item`}
                                            onMouseDown={handleMouseDown}
                                        >
                                            <video src={uri} className="w-full h-full object-cover pointer-events-none" muted />
                                            {isItemSelected && (
                                                <div className="absolute top-2 left-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow">
                                                    <CheckCircle size={12} className="text-white" />
                                                </div>
                                            )}
                                            <div className="absolute bottom-2 right-2 opacity-0 group-hover/item:opacity-100 transition-opacity bg-black/50 px-2 py-1 rounded-lg flex items-center gap-1">
                                                <Copy size={10} className="text-white" />
                                                <span className="text-[9px] text-white font-medium">Ctrl+拖拽复制</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                {!isGridAnimating && renderBottomPanel()}
                <div className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize text-slate-500 hover:text-slate-900 transition-colors opacity-0 group-hover:opacity-100 z-50" onMouseDown={(e) => onResizeMouseDown(e, node.id, nodeWidth, nodeHeight)}><div className="w-1.5 h-1.5 rounded-full bg-current" /></div>
            </div>
        </>
    );
};

export const Node = memo(NodeComponent, arePropsEqual);
