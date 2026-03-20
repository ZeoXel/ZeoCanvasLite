"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
    X,
    Brush,
    Eraser,
    Undo,
    Redo,
    Trash2,
    Check,
    Minus,
    Plus,
    Crop,
    ChevronLeft,
    ChevronRight,
    Loader2,
} from 'lucide-react';
import { getProxiedUrl } from './shared';
import { CropAspectRatioSelector } from './shared/CropAspectRatioSelector';
import { getCropAspectRatioLabel } from './shared/cropRatios';
import {
    createCenteredCropRect,
    recenterCropRectWithAspect,
    resizeCropRectFromAnchor,
} from './shared/cropGeometry';

interface ImageEditOverlayProps {
    imageSrc: string;
    images?: string[];
    initialIndex?: number;
    initialMode?: 'preview' | 'edit';
    originalImage?: string;
    editOriginImage?: string;
    canvasData?: string;
    nodeId: string;
    onClose: () => void;
    onSave: (nodeId: string, compositeImage: string, originalImage: string, canvasData: string, activeIndex?: number) => void | Promise<void>;
}

type Tool = 'brush' | 'eraser';
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface EditSnapshot {
    baseImageSrc: string;
    overlayData?: string;
}

const PRESET_COLORS = ['#000000', '#ffffff', '#ff3b30', '#007aff', '#4cd964'];
const MAX_HISTORY = 20;
const MIN_CROP_SIZE = 24;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const snapshotsEqual = (a?: EditSnapshot, b?: EditSnapshot) => {
    if (!a || !b) return false;
    return a.baseImageSrc === b.baseImageSrc && (a.overlayData || '') === (b.overlayData || '');
};

const hasCanvasInk = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { width, height } = canvas;
    if (!width || !height) return false;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
    }
    return false;
};

export const ImageEditOverlay: React.FC<ImageEditOverlayProps> = ({
    imageSrc,
    images,
    initialIndex = 0,
    originalImage,
    editOriginImage,
    canvasData,
    nodeId,
    onClose,
    onSave,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasWrapRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);

    const cropInteractionRef = useRef<{
        active: boolean;
        type: 'move' | 'resize';
        handle?: ResizeHandle;
        startPoint: { x: number; y: number };
        startRect: CropRect;
    } | null>(null);

    const gallery = useMemo(() => ((images && images.length > 0) ? images : [imageSrc]), [images, imageSrc]);
    const safeInitialIndex = Math.min(Math.max(0, initialIndex), Math.max(0, gallery.length - 1));

    const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
    const [tool, setTool] = useState<Tool>('brush');
    const [brushColor, setBrushColor] = useState('#ff3b30');
    const [brushSize, setBrushSize] = useState(8);
    const [eraserSize, setEraserSize] = useState(30);

    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [canvasInitialized, setCanvasInitialized] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [baseImageSrc, setBaseImageSrc] = useState('');
    const [overlayData, setOverlayData] = useState<string | undefined>(undefined);

    const [history, setHistory] = useState<EditSnapshot[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const historyRef = useRef<EditSnapshot[]>([]);
    const historyIndexRef = useRef(-1);

    const draftsRef = useRef<Record<number, EditSnapshot>>({});

    const [isCanvasMode, setIsCanvasMode] = useState(false);
    const [isCropMode, setIsCropMode] = useState(false);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [cropAspectRatio, setCropAspectRatio] = useState<number | null>(null);
    const resetOrigin = useMemo(() => {
        const activeSrc = gallery[currentIndex] || imageSrc;
        if (activeSrc === imageSrc) {
            return editOriginImage || imageSrc;
        }
        return activeSrc;
    }, [currentIndex, editOriginImage, gallery, imageSrc]);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        historyIndexRef.current = historyIndex;
    }, [historyIndex]);

    const captureOverlayFromCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return overlayData;
        if (!hasCanvasInk(canvas)) return undefined;
        return canvas.toDataURL('image/png');
    }, [overlayData]);

    const createInitialSnapshot = useCallback((index: number): EditSnapshot => {
        const selectedSrc = gallery[index] || imageSrc;
        const isCurrentMain = selectedSrc === imageSrc;
        const initBase = isCurrentMain ? (originalImage || selectedSrc) : selectedSrc;
        const initOverlay = isCurrentMain ? canvasData : undefined;
        return { baseImageSrc: initBase, overlayData: initOverlay || undefined };
    }, [gallery, imageSrc, originalImage, canvasData]);

    const applySnapshot = useCallback((snapshot: EditSnapshot, nextIndex?: number) => {
        if (typeof nextIndex === 'number') {
            setCurrentIndex(nextIndex);
        }
        setBaseImageSrc(snapshot.baseImageSrc);
        setOverlayData(snapshot.overlayData);
        setCanvasInitialized(false);
        setIsCropMode(false);
        setCropRect(null);
    }, []);

    const resetHistory = useCallback((snapshot: EditSnapshot) => {
        const entries = [snapshot];
        historyRef.current = entries;
        historyIndexRef.current = 0;
        setHistory(entries);
        setHistoryIndex(0);
    }, []);

    const pushHistory = useCallback((snapshot: EditSnapshot) => {
        const prev = historyRef.current;
        const prevIndex = historyIndexRef.current;
        const last = prev[prevIndex];
        if (snapshotsEqual(last, snapshot)) return;

        const truncated = prev.slice(0, prevIndex + 1);
        const next = [...truncated, snapshot].slice(-MAX_HISTORY);
        const nextIndex = next.length - 1;
        historyRef.current = next;
        historyIndexRef.current = nextIndex;
        setHistory(next);
        setHistoryIndex(nextIndex);
    }, []);

    const restoreHistory = useCallback((targetIndex: number) => {
        const snapshot = historyRef.current[targetIndex];
        if (!snapshot) return;
        historyIndexRef.current = targetIndex;
        setHistoryIndex(targetIndex);
        applySnapshot(snapshot);
        draftsRef.current[currentIndex] = snapshot;
    }, [applySnapshot, currentIndex]);

    const commitSnapshot = useCallback((snapshot: EditSnapshot) => {
        draftsRef.current[currentIndex] = snapshot;
        setBaseImageSrc(snapshot.baseImageSrc);
        setOverlayData(snapshot.overlayData);
        setCanvasInitialized(false);
        pushHistory(snapshot);
    }, [currentIndex, pushHistory]);

    const switchToIndex = useCallback((nextIndex: number) => {
        if (nextIndex < 0 || nextIndex >= gallery.length) return;

        const currentOverlay = captureOverlayFromCanvas();
        draftsRef.current[currentIndex] = { baseImageSrc, overlayData: currentOverlay };

        const draft = draftsRef.current[nextIndex] || createInitialSnapshot(nextIndex);
        draftsRef.current[nextIndex] = draft;
        applySnapshot(draft, nextIndex);
        resetHistory(draft);
    }, [applySnapshot, baseImageSrc, captureOverlayFromCanvas, createInitialSnapshot, currentIndex, gallery.length, overlayData, resetHistory]);

    useEffect(() => {
        const nextSafeIndex = Math.min(Math.max(0, initialIndex), Math.max(0, gallery.length - 1));
        const initSnapshot = createInitialSnapshot(nextSafeIndex);
        draftsRef.current = { [nextSafeIndex]: initSnapshot };
        applySnapshot(initSnapshot, nextSafeIndex);
        resetHistory(initSnapshot);
        setIsCanvasMode(false);
    }, [gallery, initialIndex, imageSrc, originalImage, canvasData, createInitialSnapshot, applySnapshot, resetHistory]);

    useEffect(() => {
        if (!baseImageSrc) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            setBgImage(img);
            setCanvasInitialized(false);
            const maxW = window.innerWidth * 0.85;
            const maxH = window.innerHeight * 0.75;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            setCanvasSize({
                width: Math.max(1, img.width * scale),
                height: Math.max(1, img.height * scale),
            });
        };
        img.onerror = () => {
            console.error('[ImageEditOverlay] Failed to load image:', baseImageSrc);
        };
        img.src = getProxiedUrl(baseImageSrc);
    }, [baseImageSrc]);

    useEffect(() => {
        if (!canvasSize.width || !canvasSize.height || canvasInitialized) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.round(canvasSize.width);
        canvas.height = Math.round(canvasSize.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (!overlayData) {
            setCanvasInitialized(true);
            return;
        }

        const existing = new Image();
        existing.crossOrigin = 'anonymous';
        existing.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(existing, 0, 0, canvas.width, canvas.height);
            setCanvasInitialized(true);
        };
        existing.onerror = () => setCanvasInitialized(true);
        existing.src = overlayData;
    }, [canvasSize, overlayData, canvasInitialized]);

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isCropMode) return;
        e.stopPropagation();
        e.preventDefault();
        isDrawingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);

        const { x, y } = getPos(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(x, y);
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = eraserSize;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = brushColor;
            ctx.lineWidth = brushSize;
        }
    };

    const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || isCropMode) return;
        const { x, y } = getPos(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;

        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.closePath();
            ctx.globalCompositeOperation = 'source-over';
        }

        if (e && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }

        const nextOverlay = captureOverlayFromCanvas();
        commitSnapshot({ baseImageSrc, overlayData: nextOverlay });
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        commitSnapshot({ baseImageSrc, overlayData: undefined });
    };

    const getCompositeDataURL = (): string => {
        const canvas = canvasRef.current;
        if (!canvas || !bgImage) return baseImageSrc;

        const osc = document.createElement('canvas');
        osc.width = bgImage.width;
        osc.height = bgImage.height;
        const ctx = osc.getContext('2d');
        if (!ctx) return baseImageSrc;

        ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height);
        ctx.drawImage(canvas, 0, 0, bgImage.width, bgImage.height);

        return osc.toDataURL('image/png');
    };

    const getCanvasDataURL = (): string => {
        const canvas = canvasRef.current;
        if (!canvas || !bgImage) return '';

        const osc = document.createElement('canvas');
        osc.width = bgImage.width;
        osc.height = bgImage.height;
        const ctx = osc.getContext('2d');
        if (!ctx) return '';

        ctx.drawImage(canvas, 0, 0, bgImage.width, bgImage.height);
        if (!hasCanvasInk(osc)) return '';
        return osc.toDataURL('image/png');
    };

    const startCropMode = () => {
        if (!canvasSize.width || !canvasSize.height) return;
        setIsCanvasMode(true);
        setCropRect(createCenteredCropRect({
            boundsWidth: canvasSize.width,
            boundsHeight: canvasSize.height,
            aspectRatio: cropAspectRatio,
            coverage: 0.72,
            minSize: MIN_CROP_SIZE,
        }));
        setIsCropMode(true);
    };

    const handleCropCancel = () => {
        setIsCropMode(false);
        setCropRect(null);
        cropInteractionRef.current = null;
    };

    const disableCanvasMode = () => {
        setIsCanvasMode(false);
        setIsCropMode(false);
        setCropRect(null);
        cropInteractionRef.current = null;
    };

    const handleBrushToggle = () => {
        if (isCanvasMode && tool === 'brush') {
            disableCanvasMode();
            return;
        }
        setIsCanvasMode(true);
        setTool('brush');
    };

    const handleSelectEraser = () => {
        if (!isCanvasMode) return;
        setTool('eraser');
    };

    const handleResetToOrigin = () => {
        if (!resetOrigin) return;
        setIsCropMode(false);
        setCropRect(null);
        cropInteractionRef.current = null;
        commitSnapshot({ baseImageSrc: resetOrigin, overlayData: undefined });
    };

    const handleCropConfirm = () => {
        const canvas = canvasRef.current;
        if (!cropRect || !bgImage || !canvas) return;

        const sx = bgImage.width / canvasSize.width;
        const sy = bgImage.height / canvasSize.height;

        const sourceX = cropRect.x * sx;
        const sourceY = cropRect.y * sy;
        const sourceW = cropRect.width * sx;
        const sourceH = cropRect.height * sy;

        const baseOut = document.createElement('canvas');
        baseOut.width = Math.max(1, Math.round(sourceW));
        baseOut.height = Math.max(1, Math.round(sourceH));
        const baseCtx = baseOut.getContext('2d');
        if (!baseCtx) return;

        baseCtx.drawImage(bgImage, sourceX, sourceY, sourceW, sourceH, 0, 0, baseOut.width, baseOut.height);
        const nextBase = baseOut.toDataURL('image/png');

        const overlayOut = document.createElement('canvas');
        overlayOut.width = Math.max(1, Math.round(cropRect.width));
        overlayOut.height = Math.max(1, Math.round(cropRect.height));
        const overlayCtx = overlayOut.getContext('2d');

        let nextOverlay: string | undefined = undefined;
        if (overlayCtx) {
            overlayCtx.drawImage(canvas, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, overlayOut.width, overlayOut.height);
            if (hasCanvasInk(overlayOut)) {
                nextOverlay = overlayOut.toDataURL('image/png');
            }
        }

        setIsCropMode(false);
        setCropRect(null);
        cropInteractionRef.current = null;
        commitSnapshot({ baseImageSrc: nextBase, overlayData: nextOverlay });
    };

    const getRelativePoint = useCallback((clientX: number, clientY: number) => {
        const rect = canvasWrapRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: clamp(clientX - rect.left, 0, canvasSize.width),
            y: clamp(clientY - rect.top, 0, canvasSize.height),
        };
    }, [canvasSize.height, canvasSize.width]);

    const beginCropMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!cropRect) return;
        e.stopPropagation();
        e.preventDefault();
        const point = getRelativePoint(e.clientX, e.clientY);
        cropInteractionRef.current = {
            active: true,
            type: 'move',
            startPoint: point,
            startRect: cropRect,
        };
    };

    const beginCropResize = (handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
        if (!cropRect) return;
        e.stopPropagation();
        e.preventDefault();
        const point = getRelativePoint(e.clientX, e.clientY);
        cropInteractionRef.current = {
            active: true,
            type: 'resize',
            handle,
            startPoint: point,
            startRect: cropRect,
        };
    };

    useEffect(() => {
        if (!isCropMode || !cropRect) return;
        const next = recenterCropRectWithAspect({
            rect: cropRect,
            boundsWidth: canvasSize.width,
            boundsHeight: canvasSize.height,
            aspectRatio: cropAspectRatio,
            minSize: MIN_CROP_SIZE,
        });
        const unchanged =
            Math.abs(next.x - cropRect.x) < 0.5 &&
            Math.abs(next.y - cropRect.y) < 0.5 &&
            Math.abs(next.width - cropRect.width) < 0.5 &&
            Math.abs(next.height - cropRect.height) < 0.5;
        if (!unchanged) {
            setCropRect(next);
        }
    }, [cropAspectRatio, isCropMode, cropRect, canvasSize.width, canvasSize.height]);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const interaction = cropInteractionRef.current;
            if (!interaction || !interaction.active || !cropRect) return;

            const point = getRelativePoint(e.clientX, e.clientY);
            const { startPoint, startRect } = interaction;

            if (interaction.type === 'move') {
                const dx = point.x - startPoint.x;
                const dy = point.y - startPoint.y;
                const nextRect: CropRect = {
                    x: clamp(startRect.x + dx, 0, canvasSize.width - startRect.width),
                    y: clamp(startRect.y + dy, 0, canvasSize.height - startRect.height),
                    width: startRect.width,
                    height: startRect.height,
                };
                setCropRect(nextRect);
                return;
            }

            const handle = interaction.handle;
            if (!handle) return;

            const anchorX = handle.includes('w') ? startRect.x + startRect.width : startRect.x;
            const anchorY = handle.includes('n') ? startRect.y + startRect.height : startRect.y;
            setCropRect(
                resizeCropRectFromAnchor({
                    anchorX,
                    anchorY,
                    currentX: point.x,
                    currentY: point.y,
                    boundsWidth: canvasSize.width,
                    boundsHeight: canvasSize.height,
                    aspectRatio: cropAspectRatio,
                    minSize: MIN_CROP_SIZE,
                })
            );
        };

        const onUp = () => {
            if (!cropInteractionRef.current) return;
            cropInteractionRef.current = null;
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [canvasSize.height, canvasSize.width, cropRect, cropAspectRatio, getRelativePoint]);

    const handleUndo = () => {
        if (historyIndexRef.current <= 0) return;
        restoreHistory(historyIndexRef.current - 1);
    };

    const handleRedo = () => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        restoreHistory(historyIndexRef.current + 1);
    };

    const hasEdits = historyIndex > 0 || overlayData;

    const handleSave = async () => {
        if (isSaving) return;
        if (!hasEdits) { onClose(); return; }
        setIsSaving(true);
        try {
            const compositeImage = getCompositeDataURL();
            const canvasDataUrl = getCanvasDataURL();
            await onSave(nodeId, compositeImage, baseImageSrc, canvasDataUrl, currentIndex);
        } finally {
            setIsSaving(false);
        }
    };

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isCropMode) {
                    handleCropCancel();
                    return;
                }
                if (isCanvasMode) {
                    disableCanvasMode();
                    return;
                }
                onClose();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                handleRedo();
                return;
            }

            if (gallery.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                switchToIndex(e.key === 'ArrowRight'
                    ? (currentIndex + 1) % gallery.length
                    : (currentIndex - 1 + gallery.length) % gallery.length
                );
                return;
            }

            if (isCropMode && e.key === 'Enter') {
                e.preventDefault();
                handleCropConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, gallery.length, handleRedo, isCanvasMode, isCropMode, onClose, switchToIndex]);

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95 dark:bg-slate-950/95"
            onClick={onClose}
        >
            <div
                className="mb-4 flex items-center gap-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-[200]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-1 px-2 border-r border-slate-200 dark:border-slate-700">
                    <button
                        onClick={handleBrushToggle}
                        className={`p-2.5 rounded-xl ${(isCanvasMode && tool === 'brush') ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        title={(isCanvasMode && tool === 'brush') ? '退出涂鸦模式' : '进入涂鸦模式'}
                    >
                        <Brush size={18} />
                    </button>
                    <button
                        onClick={handleSelectEraser}
                        disabled={!isCanvasMode}
                        className={`p-2.5 rounded-xl ${(isCanvasMode && tool === 'eraser') ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'} disabled:opacity-30 disabled:cursor-not-allowed`}
                        title="橡皮擦"
                    >
                        <Eraser size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-1.5 px-2 border-r border-slate-200 dark:border-slate-700">
                    {PRESET_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => { setBrushColor(c); setTool('brush'); }}
                            disabled={!isCanvasMode}
                            className={`w-5 h-5 rounded-full flex-shrink-0 ${brushColor === c ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : 'border border-slate-300 dark:border-slate-600'}`}
                            style={{ backgroundColor: c }}
                            title={c}
                        />
                    ))}
                </div>

                <div className="flex items-center gap-2 px-2 border-r border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => tool === 'eraser' ? setEraserSize(Math.max(10, eraserSize - 5)) : setBrushSize(Math.max(2, brushSize - 2))}
                        disabled={!isCanvasMode}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <Minus size={14} />
                    </button>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-8 text-center">
                        {tool === 'eraser' ? eraserSize : brushSize}
                    </span>
                    <button
                        onClick={() => tool === 'eraser' ? setEraserSize(Math.min(80, eraserSize + 5)) : setBrushSize(Math.min(30, brushSize + 2))}
                        disabled={!isCanvasMode}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <Plus size={14} />
                    </button>
                </div>

                <div className="flex items-center gap-1 px-2 border-r border-slate-200 dark:border-slate-700">
                    {!isCropMode ? (
                        <button
                            onClick={startCropMode}
                            className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="裁切"
                        >
                            <Crop size={18} />
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={handleCropCancel}
                                className="px-3 py-2 text-xs rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                                取消裁切
                            </button>
                            <button
                                onClick={handleCropConfirm}
                                className="px-3 py-2 text-xs rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
                            >
                                确认裁切
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="撤销"
                    >
                        <Undo size={18} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="重做"
                    >
                        <Redo size={18} />
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={!isCanvasMode}
                        className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                        title="清除涂鸦"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>

                <button
                    onClick={handleResetToOrigin}
                    disabled={!resetOrigin || (baseImageSrc === resetOrigin && !overlayData)}
                    className="px-3 py-2 text-xs rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="重置到初始状态"
                >
                    重置初始
                </button>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {isSaving ? '保存中...' : hasEdits ? '完成' : '关闭'}
                </button>
            </div>

            {gallery.length > 1 && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            switchToIndex((currentIndex - 1 + gallery.length) % gallery.length);
                        }}
                        className="absolute left-4 md:left-8 top-1/2 z-[210] -translate-y-1/2 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            switchToIndex((currentIndex + 1) % gallery.length);
                        }}
                        className="absolute right-4 md:right-8 top-1/2 z-[210] -translate-y-1/2 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md"
                    >
                        <ChevronRight size={18} />
                    </button>
                </>
            )}

            <div
                ref={canvasWrapRef}
                className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                style={{ width: canvasSize.width, height: canvasSize.height }}
                onClick={(e) => e.stopPropagation()}
            >
                {bgImage && (
                    <img
                        src={baseImageSrc}
                        className={`absolute inset-0 w-full h-full object-contain ${isCanvasMode || isCropMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
                        alt="Background"
                        draggable={false}
                    />
                )}

                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 w-full h-full touch-none ${isCropMode || !isCanvasMode ? 'pointer-events-none' : 'cursor-crosshair pointer-events-auto'}`}
                    style={{ width: canvasSize.width, height: canvasSize.height }}
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerCancel={stopDrawing}
                    onPointerLeave={stopDrawing}
                />

                {isCropMode && cropRect && (
                    <div className="absolute inset-0 z-20">
                        <div
                            className="absolute border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                            style={{
                                left: cropRect.x,
                                top: cropRect.y,
                                width: cropRect.width,
                                height: cropRect.height,
                            }}
                        >
                            <div
                                className="absolute inset-0 cursor-move"
                                onPointerDown={beginCropMove}
                            />

                            {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map(handle => (
                                <div
                                    key={handle}
                                    className="absolute h-4 w-4 rounded-full bg-white border-2 border-blue-500"
                                    style={{
                                        left: handle.includes('w') ? -8 : 'auto',
                                        right: handle.includes('e') ? -8 : 'auto',
                                        top: handle.includes('n') ? -8 : 'auto',
                                        bottom: handle.includes('s') ? -8 : 'auto',
                                        cursor: `${handle}-resize`,
                                    }}
                                    onPointerDown={(e) => beginCropResize(handle, e)}
                                />
                            ))}

                            <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-blue-500 text-white text-[10px] font-medium">
                                {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
                            </div>
                            {cropAspectRatio && (
                                <div className="absolute -top-7 left-[120px] px-2 py-0.5 rounded bg-white text-blue-500 border border-blue-500/30 text-[10px] font-medium">
                                    {getCropAspectRatioLabel(cropAspectRatio)}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isCropMode && (
                <div className="mt-4 w-full max-w-2xl px-4 flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <CropAspectRatioSelector
                        value={cropAspectRatio}
                        onChange={setCropAspectRatio}
                    />
                </div>
            )}

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                {!isCanvasMode
                    ? '当前为预览模式，可直接右键图片使用浏览器菜单。点击画笔进入涂鸦。'
                    : (isCropMode ? '拖动选区并确认裁切，支持撤销。' : '画布模式已开启：支持涂鸦、裁切、撤销/重做；完成后立即本地更新。')}
            </p>

            {gallery.length > 1 && (
                <div className="mt-2 flex gap-2">
                    {gallery.map((_, i) => (
                        <button
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                switchToIndex(i);
                            }}
                            className={`h-2.5 w-2.5 rounded-full ${i === currentIndex ? 'bg-cyan-500' : 'bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500'}`}
                        />
                    ))}
                </div>
            )}

            <button
                onClick={onClose}
                className="absolute top-6 right-6 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300 shadow-md z-[110]"
            >
                <X size={24} />
            </button>
        </div>
    );
};
