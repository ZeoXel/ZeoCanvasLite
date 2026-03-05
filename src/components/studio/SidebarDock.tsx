"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
    Plus, History, X,
    ImageIcon, Video as VideoIcon, Film,
    Edit, Trash2, Brush, Type,
    Clapperboard, Layers, Sun, Moon,
    Music, Speech, Library, Camera
} from 'lucide-react';
import type { Subject } from '@/types';
import { SubjectLibraryPanel } from './subject';
import CanvasPreview from './CanvasPreview';
import { NodeType, Canvas } from '@/types';

interface SidebarDockProps {
    onAddNode: (type: NodeType) => void;

    // History Props
    assetHistory: any[];
    onHistoryItemClick: (item: any) => void;
    onDeleteAsset: (id: string) => void;

    // Canvas Management
    canvases: Canvas[];
    currentCanvasId: string | null;
    onNewCanvas: () => void;
    onSelectCanvas: (id: string) => void;
    onDeleteCanvas: (id: string) => void;
    onRenameCanvas: (id: string, title: string) => void;

    // Theme
    theme: 'light' | 'dark';
    onSetTheme: (theme: 'light' | 'dark') => void;

    // Subject Library
    subjects?: Subject[];
    onAddSubject?: () => void;
    onEditSubject?: (id: string) => void;
    onDeleteSubject?: (id: string) => void;

    // External panel control
    externalOpenPanel?: 'subjects' | null;
    onExternalPanelHandled?: () => void;
}

// Helper Helpers
const getNodeNameCN = (t: string) => {
    switch (t) {
        case NodeType.PROMPT_INPUT: return '提示词';
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
        case NodeType.VIDEO_FACTORY: return Clapperboard;
        case NodeType.AUDIO_GENERATOR: return Music;
        case NodeType.VOICE_GENERATOR: return Speech;
        case NodeType.IMAGE_EDITOR: return Brush;
        case NodeType.MULTI_FRAME_VIDEO: return Layers;
        case NodeType.IMAGE_3D_CAMERA: return Camera;
        default: return Plus;
    }
};

// 动画曲线
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export const SidebarDock: React.FC<SidebarDockProps> = ({
    onAddNode,
    assetHistory,
    onHistoryItemClick,
    onDeleteAsset,
    canvases,
    currentCanvasId,
    onNewCanvas,
    onSelectCanvas,
    onDeleteCanvas,
    onRenameCanvas,
    theme,
    onSetTheme,
    // Subject Library
    subjects = [],
    onAddSubject,
    onEditSubject,
    onDeleteSubject,
    // External panel control
    externalOpenPanel,
    onExternalPanelHandled,
}) => {
    const [activePanel, setActivePanel] = useState<'history' | 'add' | 'canvas' | 'subjects' | null>(null);

    // Handle external panel opening
    useEffect(() => {
        if (externalOpenPanel) {
            setActivePanel(externalOpenPanel);
            setIsPanelVisible(true);
            onExternalPanelHandled?.();
        }
    }, [externalOpenPanel, onExternalPanelHandled]);
    const [activeHistoryTab, setActiveHistoryTab] = useState<'image' | 'video'>('image');
    const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, id: string, type: 'history' | 'canvas' } | null>(null);
    const [isPanelVisible, setIsPanelVisible] = useState(false); // 控制面板可见性动画
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hover Handlers - 优化动效：使用两阶段动画
    const handleSidebarHover = (id: string) => {
        if (['history', 'workflow', 'canvas', 'subjects'].includes(id)) {
            // 清除所有定时器
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);

            // 立即设置面板类型
            setActivePanel(id as any);
            // 短暂延迟后显示面板（让 DOM 先更新）
            openTimeoutRef.current = setTimeout(() => setIsPanelVisible(true), 10);
        } else {
            // 悬停到非面板按钮时，快速关闭
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = setTimeout(() => {
                setIsPanelVisible(false);
                // 等动画完成后再清除面板内容
                setTimeout(() => setActivePanel(null), 200);
            }, 80);
        }
    };

    const handleSidebarLeave = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setIsPanelVisible(false);
            setTimeout(() => setActivePanel(null), 200);
        }, 250); // 缩短延迟，更灵敏
    };

    const handlePanelEnter = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
        setIsPanelVisible(true);
    };

    const handlePanelLeave = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setIsPanelVisible(false);
            setTimeout(() => setActivePanel(null), 200);
        }, 200); // 离开面板后快速关闭
    };

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
        };
    }, []);

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const renderPanelContent = () => {
        // 主体库面板
        if (activePanel === 'subjects') {
            return (
                <SubjectLibraryPanel
                    subjects={subjects}
                    onAddSubject={onAddSubject || (() => {})}
                    onEditSubject={onEditSubject || (() => {})}
                    onDeleteSubject={onDeleteSubject || (() => {})}
                    onClose={() => setActivePanel(null)}
                />
            );
        }

        if (activePanel === 'history') {
            const filteredAssets = assetHistory.filter(a => {
                if (activeHistoryTab === 'image') return a.type === 'image' || a.type.includes('image') || a.type.includes('image_generator');
                if (activeHistoryTab === 'video') return a.type === 'video' || a.type.includes('video');
                return false;
            });

            return (
                <>
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3 bg-slate-50 dark:bg-slate-800">
                        <div className="flex justify-between items-center">
                            <button onClick={() => setActivePanel(null)}><X size={14} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100" /></button>
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">历史记录</span>
                        </div>
                        {/* Tabs */}
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveHistoryTab('image')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeHistoryTab === 'image' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <ImageIcon size={12} /> 图片
                            </button>
                            <button
                                onClick={() => setActiveHistoryTab('video')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeHistoryTab === 'video' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <VideoIcon size={12} /> 视频
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2 relative">
                        {filteredAssets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400 opacity-60 select-none">
                                {activeHistoryTab === 'image' ? <ImageIcon size={48} strokeWidth={1} className="mb-3 opacity-50" /> : <Film size={48} strokeWidth={1} className="mb-3 opacity-50" />}
                                <span className="text-[10px] font-medium tracking-widest uppercase">暂无{activeHistoryTab === 'image' ? '图片' : '视频'}</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2 p-1">
                                {filteredAssets.map(a => (
                                    <div
                                        key={a.id}
                                        className="aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing border border-slate-200 dark:border-slate-700 hover:border-blue-500/50 dark:hover:border-blue-400/50 transition-colors group relative shadow-md bg-slate-100 dark:bg-slate-800"
                                        draggable={true}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify(a));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onClick={() => onHistoryItemClick(a)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: a.id, type: 'history' });
                                        }}
                                    >
                                        {a.type.includes('image') ? (
                                            <img src={a.src} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" draggable={false} />
                                        ) : (
                                            <video src={a.src} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" draggable={false} />
                                        )}
                                        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-md text-[8px] font-bold text-slate-700 dark:text-slate-300">
                                            {a.type.includes('image') ? 'IMG' : 'MOV'}
                                        </div>
                                        <div className="absolute bottom-0 left-0 w-full p-1.5 bg-gradient-to-t from-white/90 dark:from-slate-900/90 to-transparent text-[9px] text-slate-900 dark:text-slate-100 truncate font-medium">
                                            {a.title || 'Untitled'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            );
        }

        if (activePanel === 'canvas') {
            const formatDate = (timestamp: number) => {
                const date = new Date(timestamp);
                return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            };

            return (
                <>
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            画布管理
                        </span>
                        <button onClick={onNewCanvas} className="p-1.5 bg-blue-500/20 dark:bg-blue-500/30 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-md transition-colors" title="新建画布">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-3 relative">
                        {canvases.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400 opacity-60 select-none">
                                <Layers size={48} strokeWidth={1} className="mb-3 opacity-50" />
                                <span className="text-[10px] font-medium tracking-widest uppercase text-center">暂无画布<br />点击 + 创建新画布</span>
                            </div>
                        ) : (
                            canvases.map(canvas => (
                                <div
                                    key={canvas.id}
                                    className={`
                                        relative p-2 rounded-xl border bg-slate-50 dark:bg-slate-800 group transition-all duration-300 cursor-pointer hover:bg-white dark:hover:bg-slate-700
                                        ${currentCanvasId === canvas.id ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/20 dark:ring-blue-400/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}
                                    `}
                                    onClick={(e) => { e.stopPropagation(); onSelectCanvas(canvas.id); }}
                                    onDoubleClick={(e) => { e.stopPropagation(); setEditingCanvasId(canvas.id); }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: canvas.id, type: 'canvas' });
                                    }}
                                >
                                    <div className="aspect-[2/1] bg-slate-100 dark:bg-slate-900 rounded-lg mb-2 overflow-hidden relative">
                                        <CanvasPreview nodes={canvas.nodes} groups={canvas.groups} connections={canvas.connections} canvasId={canvas.id} />
                                        {currentCanvasId === canvas.id && (
                                            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-blue-500 dark:bg-blue-400 text-[8px] font-bold text-white">
                                                当前
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between px-1">
                                        {editingCanvasId === canvas.id ? (
                                            <input
                                                className="bg-white dark:bg-slate-700 border border-blue-500/50 dark:border-blue-400/50 rounded px-1 text-xs text-slate-900 dark:text-slate-100 w-full outline-none"
                                                defaultValue={canvas.title}
                                                autoFocus
                                                onBlur={(e) => { onRenameCanvas(canvas.id, e.target.value); setEditingCanvasId(null); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { onRenameCanvas(canvas.id, e.currentTarget.value); setEditingCanvasId(null); } }}
                                            />
                                        ) : (
                                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate select-none group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{canvas.title}</span>
                                        )}
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">{canvas.nodes.length} 节点</span>
                                    </div>
                                    <div className="px-1 mt-1">
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500">{formatDate(canvas.updatedAt)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            );
        }

        // 不再显示添加节点面板，仅保留双击画布创建入口
        return null;
    };

    return (
        <>
            {/* Left Vertical Dock */}
            <div
                data-sidebar
                className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 p-2 bg-[#ffffff]/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-left-10 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                onMouseLeave={handleSidebarLeave}
            >
                {[
                    { id: 'history', icon: History, tooltip: '历史记录' },
                    { id: 'subjects', icon: Library, tooltip: '主体库' },
                    {
                        id: 'theme_toggle',
                        icon: theme === 'light' ? Sun : Moon,
                        action: () => onSetTheme(theme === 'light' ? 'dark' : 'light'),
                        tooltip: theme === 'light' ? '切换暗色' : '切换亮色'
                    },
                ].map(item => {
                    const isActive = activePanel === item.id || ('active' in item && Boolean(item.active));
                    const hasPanel = ['history', 'canvas', 'subjects'].includes(item.id);
                    return (
                        <div key={item.id} className="relative group">
                            <button
                                onMouseEnter={() => handleSidebarHover(item.id)}
                                onClick={() => item.action ? item.action() : setActivePanel(item.id as any)}
                                className={`
                                    relative w-10 h-10 rounded-xl flex items-center justify-center
                                    transition-all duration-150 ease-out
                                    hover:scale-105 active:scale-95
                                    ${isActive
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-lg'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
                                    }
                                `}
                            >
                                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                            </button>
                            {/* Tooltip - 仅在非面板按钮悬停时显示，或面板关闭时显示 */}
                            {(!hasPanel || !isPanelVisible) && (
                                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-md border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 shadow-sm">
                                    {item.tooltip}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Spacer & Canvas Manager */}
                <div className="w-8 h-px bg-slate-100 my-1"></div>

                <div className="relative group">
                    <button
                        onMouseEnter={() => handleSidebarHover('canvas')}
                        onClick={() => setActivePanel('canvas')}
                        className={`
                            relative w-10 h-10 rounded-xl flex items-center justify-center
                            transition-all duration-150 ease-out
                            hover:scale-105 active:scale-95
                            ${activePanel === 'canvas'
                                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-lg'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
                            }
                        `}
                    >
                        <Layers size={20} strokeWidth={activePanel === 'canvas' ? 2.5 : 2} />
                    </button>
                    {/* Tooltip - 仅在面板关闭时显示 */}
                    {!isPanelVisible && (
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-md border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 shadow-sm">
                            画布管理
                        </div>
                    )}
                </div>

            </div>

            {/* Slide-out Panels */}
            <div
                data-sidebar
                className={`
                    fixed left-24 top-1/2 -translate-y-1/2 max-h-[75vh] h-auto w-72
                    bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-2xl
                    z-40 flex flex-col overflow-hidden
                    transition-all duration-200 ease-[${EASE_OUT}]
                    ${isPanelVisible && activePanel
                        ? 'translate-x-0 opacity-100 scale-100'
                        : '-translate-x-3 opacity-0 pointer-events-none scale-[0.98]'
                    }
                `}
                style={{
                    transitionProperty: 'transform, opacity',
                    willChange: 'transform, opacity',
                }}
                onMouseEnter={handlePanelEnter}
                onMouseLeave={handlePanelLeave}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                {activePanel && renderPanelContent()}
            </div>

            {/* Global Context Menu (Rendered outside the transformed panel to fix positioning) */}
            {contextMenu && (
                <div
                    className="fixed z-[100] bg-[#ffffff] dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-200 min-w-[120px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseLeave={() => setContextMenu(null)}
                >
                    {contextMenu.type === 'history' && (
                        <button className="w-full text-left px-3 py-2 text-xs text-red-400 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/30 rounded-md flex items-center gap-2" onClick={() => { onDeleteAsset(contextMenu.id); setContextMenu(null); }}>
                            <Trash2 size={12} /> 删除
                        </button>
                    )}
                    {contextMenu.type === 'canvas' && (
                        <>
                            <button className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md flex items-center gap-2" onClick={() => { setEditingCanvasId(contextMenu.id); setContextMenu(null); }}>
                                <Edit size={12} /> 重命名
                            </button>
                            <button className="w-full text-left px-3 py-2 text-xs text-red-400 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/30 rounded-md flex items-center gap-2" onClick={() => { onDeleteCanvas(contextMenu.id); setContextMenu(null); }}>
                                <Trash2 size={12} /> 删除
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
};
