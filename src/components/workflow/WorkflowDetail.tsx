"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
    ChevronLeft,
    Play,
    Share2,
    Copy,
    Download,
    Maximize2,
    Terminal,
    Clock,
    Sparkles,
    X,
    Image as ImageIcon,
    Video,
    Music,
    FileText,
    Loader2,
    CheckCircle2,
    AlertCircle,
    StopCircle,
    RefreshCw
} from "lucide-react";
import Link from "next/link";
import GradientButton from "@/components/ui/GradientButton";
import GlassCard from "@/components/ui/GlassCard";
import {
    fetchWorkflowDetail,
    parseMediaUrls,
    formatBalanceCost,
    formatDuration,
    getStatusLabel,
    getStatusColor
} from "@/services/coze/workflowClientService";
import { useAsyncWorkflow } from "@/hooks/useAsyncWorkflow";
import type { CozeWorkflow, CozeWorkflowInput, CozeWorkflowParameters } from "@/types/coze";

/**
 * 文件上传输入组件
 */
const FileUploadInput: React.FC<{
    input: CozeWorkflowInput;
    value: string;
    onChange: (value: string) => void;
}> = ({ input, value, onChange }) => {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getAcceptType = () => {
        switch (input.type) {
            case 'image': return 'image/*';
            case 'video': return 'video/*';
            case 'audio': return 'audio/*';
            default: return '*/*';
        }
    };

    const getIcon = () => {
        switch (input.type) {
            case 'image': return <ImageIcon size={20} />;
            case 'video': return <Video size={20} />;
            case 'audio': return <Music size={20} />;
            default: return <FileText size={20} />;
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);

        try {
            // 创建预览 URL
            if (input.type === 'image') {
                setPreview(URL.createObjectURL(file));
            }

            // 这里应该调用 COS STS 上传
            // 暂时使用本地预览URL作为占位
            const fakeUrl = URL.createObjectURL(file);
            onChange(fakeUrl);

        } catch (error) {
            console.error('文件上传失败:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleClear = () => {
        onChange('');
        setPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div>
            <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                {input.label}
                {input.required && <span className="text-red-500">*</span>}
            </label>

            {value ? (
                <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    {preview && input.type === 'image' && (
                        <img src={preview} alt="预览" className="mb-2 h-32 w-full rounded object-cover" />
                    )}
                    <div className="flex items-center justify-between">
                        <span className="truncate text-sm text-gray-600 dark:text-gray-400">
                            已选择文件
                        </span>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/10"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                >
                    {uploading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    ) : (
                        <>
                            <div className="mb-2 rounded-full bg-gray-100 p-3 dark:bg-white/10">
                                {getIcon()}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                点击上传{input.type === 'image' ? '图片' : input.type === 'video' ? '视频' : input.type === 'audio' ? '音频' : '文件'}
                            </p>
                        </>
                    )}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptType()}
                onChange={handleFileSelect}
                className="hidden"
            />
        </div>
    );
};

/**
 * 动态参数表单
 */
const ParameterForm: React.FC<{
    inputs: CozeWorkflowInput[];
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
}> = ({ inputs, values, onChange }) => {
    const renderInput = (input: CozeWorkflowInput) => {
        const value = values[input.key] || input.defaultValue || '';

        // 文件类型输入
        if (['image', 'video', 'audio', 'file', 'other'].includes(input.type)) {
            return (
                <FileUploadInput
                    key={input.key}
                    input={input}
                    value={value}
                    onChange={(v) => onChange(input.key, v)}
                />
            );
        }

        // 选项类型输入
        if (input.type === 'option' && input.options) {
            return (
                <div key={input.key}>
                    <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {input.label}
                        {input.required && <span className="text-red-500">*</span>}
                    </label>
                    <select
                        value={value}
                        onChange={(e) => onChange(input.key, e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-black/20 dark:text-white"
                    >
                        {!input.required && <option value="">请选择</option>}
                        {input.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            );
        }

        // 判断是否需要多行输入
        const needsTextarea = input.key.includes('text') ||
            input.key.includes('script') ||
            input.key === 'input' && input.label.includes('剧本');

        // 文本类型输入
        return (
            <div key={input.key}>
                <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {input.label}
                    {input.required && <span className="text-red-500">*</span>}
                </label>
                {needsTextarea ? (
                    <textarea
                        value={value}
                        onChange={(e) => onChange(input.key, e.target.value)}
                        placeholder={input.placeholder || `请输入${input.label}`}
                        rows={4}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-blue-500"
                    />
                ) : (
                    <input
                        type={input.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => onChange(input.key, e.target.value)}
                        placeholder={input.placeholder || `请输入${input.label}`}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-blue-500"
                    />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {inputs.map(renderInput)}
        </div>
    );
};

/**
 * 输出内容渲染
 */
const OutputRenderer: React.FC<{
    content: string;
    isComplete: boolean;
}> = ({ content, isComplete }) => {
    const { imageUrls, videoUrls, audioUrls } = parseMediaUrls(content);

    // 移除已显示的媒体URL后的文本
    let textContent = content;
    [...imageUrls, ...videoUrls, ...audioUrls].forEach(url => {
        textContent = textContent.replace(url, '');
    });
    textContent = textContent.trim();

    return (
        <div className="space-y-4">
            {/* 图片展示 */}
            {imageUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {imageUrls.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                                src={url}
                                alt={`输出图片 ${idx + 1}`}
                                className="w-full rounded-lg border border-gray-200 dark:border-white/10"
                            />
                        </a>
                    ))}
                </div>
            )}

            {/* 视频展示 */}
            {videoUrls.length > 0 && (
                <div className="space-y-3">
                    {videoUrls.map((url, idx) => (
                        <video
                            key={idx}
                            src={url}
                            controls
                            className="w-full rounded-lg"
                        />
                    ))}
                </div>
            )}

            {/* 音频展示 */}
            {audioUrls.length > 0 && (
                <div className="space-y-3">
                    {audioUrls.map((url, idx) => (
                        <audio key={idx} src={url} controls className="w-full" />
                    ))}
                </div>
            )}

            {/* 文本内容 */}
            {textContent && (
                <div className="whitespace-pre-wrap text-base leading-relaxed text-gray-600 dark:text-gray-300">
                    {textContent}
                    {!isComplete && <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-blue-500" />}
                </div>
            )}
        </div>
    );
};

/**
 * 工作流详情页组件
 */
const WorkflowDetail = () => {
    const params = useParams();
    const workflowId = params.id as string;

    const [workflow, setWorkflow] = useState<CozeWorkflow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [validationError, setValidationError] = useState<string | null>(null);

    const outputRef = useRef<HTMLDivElement>(null);

    // 异步工作流 Hook
    const {
        execution,
        isExecuting,
        isPolling,
        messages,
        execute,
        stopPolling,
        queryStatus,
        reset
    } = useAsyncWorkflow({
        pollingInterval: 10000,
        maxPollingAttempts: 60,
        onComplete: (record) => {
            console.log('工作流执行完成:', record);
        },
        onError: (error, record) => {
            console.error('工作流执行失败:', error, record);
        }
    });

    // 加载工作流详情
    useEffect(() => {
        async function loadWorkflow() {
            setLoading(true);
            setError(null);

            const result = await fetchWorkflowDetail(workflowId);

            if (result.success && result.data) {
                setWorkflow(result.data);
                // 初始化表单默认值
                const defaults: Record<string, string> = {};
                result.data.inputs.forEach(input => {
                    if (input.defaultValue) {
                        defaults[input.key] = input.defaultValue;
                    }
                });
                setFormValues(defaults);
            } else {
                setError(result.error?.message || '加载失败');
            }

            setLoading(false);
        }

        if (workflowId) {
            loadWorkflow();
        }
    }, [workflowId]);

    // 处理表单值变化
    const handleFormChange = useCallback((key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    }, []);

    // 执行工作流
    const handleRun = async () => {
        if (!workflow) return;

        // 验证必填项
        const missingFields = workflow.inputs
            .filter(input => input.required && !formValues[input.key])
            .map(input => input.label);

        if (missingFields.length > 0) {
            setValidationError(`请填写必填项: ${missingFields.join(', ')}`);
            return;
        }

        setValidationError(null);
        await execute(workflow, formValues as CozeWorkflowParameters);
    };

    // 停止执行
    const handleStop = () => {
        stopPolling();
    };

    // 手动刷新状态
    const handleRefresh = () => {
        queryStatus();
    };

    // 复制输出内容
    const handleCopy = () => {
        if (execution?.output) {
            navigator.clipboard.writeText(execution.output);
        }
    };

    // 计算执行耗时
    const executionDuration = execution?.startTime && execution?.endTime
        ? ((execution.endTime - execution.startTime) / 1000).toFixed(1)
        : null;

    // 获取执行状态显示
    const getExecutionStatusDisplay = () => {
        if (!execution) return null;

        switch (execution.status) {
            case 'submitted':
            case 'running':
                return (
                    <span className="flex items-center gap-1 text-xs text-blue-500">
                        <Loader2 size={12} className="animate-spin" />
                        {getStatusLabel(execution.status)}
                        {isPolling && <span className="text-gray-400">（轮询中）</span>}
                    </span>
                );
            case 'success':
                return (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 size={12} />
                        完成
                    </span>
                );
            case 'error':
                return (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle size={12} />
                        失败
                    </span>
                );
            default:
                return (
                    <span className={`flex items-center gap-1 text-xs ${getStatusColor(execution.status)}`}>
                        {getStatusLabel(execution.status)}
                    </span>
                );
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !workflow) {
        return (
            <div className="flex h-64 flex-col items-center justify-center">
                <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
                <p className="text-red-500">{error || '工作流不存在'}</p>
                <Link href="/workflow" className="mt-4 text-blue-500 hover:underline">
                    返回工作流库
                </Link>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-6rem)] flex-col gap-6 lg:flex-row">
            {/* Left: Configuration Panel */}
            <GlassCard className="flex w-full flex-col overflow-y-auto border-0 bg-transparent p-0 shadow-none backdrop-blur-none lg:w-1/3">
                <div className="mb-6">
                    <Link
                        href="/workflow"
                        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                        <ChevronLeft size={16} /> 返回库
                    </Link>
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-2xl">
                            {workflow.icon || '⚡'}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{workflow.name}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
                        </div>
                    </div>

                    {/* Meta Info */}
                    <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{formatDuration(workflow.duration)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="font-medium text-blue-600 dark:text-blue-400">
                                {formatBalanceCost(workflow.balanceCost)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Cover Video */}
                {workflow.coverVideo && (
                    <div className="mb-6 overflow-hidden rounded-xl">
                        <video
                            src={workflow.coverVideo}
                            controls
                            className="w-full"
                            poster={workflow.coverImage}
                        />
                    </div>
                )}

                {/* Parameter Form */}
                <div className="flex-1 space-y-6">
                    {workflow.inputs.length > 0 ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                            <ParameterForm
                                inputs={workflow.inputs}
                                values={formValues}
                                onChange={handleFormChange}
                            />
                        </div>
                    ) : (
                        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
                            <p className="text-gray-500 dark:text-gray-400">此工作流无需输入参数</p>
                        </div>
                    )}

                    {/* Error Message */}
                    {(validationError || execution?.error) && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                            {validationError || execution?.error}
                        </div>
                    )}

                    {/* Run Button */}
                    <div className="sticky bottom-0 bg-gray-50 py-4 dark:bg-black">
                        {isExecuting ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleStop}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
                                >
                                    <StopCircle size={18} />
                                    停止轮询
                                </button>
                                <button
                                    onClick={handleRefresh}
                                    className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                                    title="手动刷新状态"
                                >
                                    <RefreshCw size={18} className={isPolling ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        ) : (
                            <GradientButton
                                onClick={handleRun}
                                disabled={isExecuting}
                                className="w-full justify-center py-3 text-base"
                                icon={<Play size={18} fill="currentColor" />}
                            >
                                运行工作流
                            </GradientButton>
                        )}
                        <p className="mt-3 text-center text-xs text-gray-400">
                            消耗：每次运行{" "}
                            <span className="font-medium text-gray-600 dark:text-gray-300">
                                {formatBalanceCost(workflow.balanceCost)}
                            </span>
                        </p>
                    </div>
                </div>
            </GlassCard>

            {/* Right: Output Panel */}
            <div className="flex w-full flex-col lg:w-2/3">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal size={18} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">输出控制台</span>
                        {getExecutionStatusDisplay()}
                    </div>

                    <div className="flex gap-2">
                        <button
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            title="历史记录"
                        >
                            <Clock size={18} />
                        </button>
                        <button
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
                            title="全屏"
                        >
                            <Maximize2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900">
                    {/* 消息日志 */}
                    {messages.length > 0 && (
                        <div className="border-b border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-white/5">
                            <div className="space-y-1 text-xs">
                                {messages.slice(-5).map((msg, idx) => (
                                    <div
                                        key={idx}
                                        className={`${
                                            msg.type === 'error' ? 'text-red-500' :
                                            msg.type === 'success' ? 'text-green-500' :
                                            msg.type === 'warning' ? 'text-yellow-500' :
                                            'text-gray-500'
                                        }`}
                                    >
                                        {msg.content}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {execution?.output ? (
                        <div className="flex h-full flex-col">
                            <div ref={outputRef} className="flex-1 overflow-y-auto p-8">
                                <OutputRenderer
                                    content={execution.output}
                                    isComplete={execution.status === 'success'}
                                />
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/5 dark:bg-white/5">
                                <div className="text-xs text-gray-400">
                                    {executionDuration && `耗时 ${executionDuration}s`}
                                    {execution.debugUrl && (
                                        <a
                                            href={execution.debugUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-3 text-blue-500 hover:underline"
                                        >
                                            查看调试信息
                                        </a>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                                    >
                                        <Copy size={14} /> 复制
                                    </button>
                                    <button className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">
                                        <Download size={14} /> 导出
                                    </button>
                                    <button className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">
                                        <Share2 size={14} /> 分享
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center p-8 text-center text-gray-400">
                            {isExecuting ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="h-12 w-12 animate-pulse rounded-full bg-blue-500/20 p-3 text-blue-500">
                                        <Sparkles size={24} />
                                    </div>
                                    <p>AI 正在施展魔法...</p>
                                    <p className="text-xs text-gray-400">
                                        {execution?.progress || '异步执行中，请耐心等待'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-white/5">
                                        <Play size={24} className="ml-1 opacity-50" />
                                    </div>
                                    <p className="max-w-xs text-sm">
                                        在左侧配置参数，点击"运行"即可在此处查看结果。
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkflowDetail;
