import { isViduModelModeSupported } from '@/services/providers/viduCapabilities';

// Node constants and model configurations

export const IMAGE_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
export const VIDEO_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
export const IMAGE_RESOLUTIONS = ['1k', '2k', '4k'];
export const VIDEO_RESOLUTIONS = ['540p', '720p', '1080p'];
export const IMAGE_COUNTS = [1, 2, 3, 4];
export const VIDEO_COUNTS = [1, 2, 3, 4];

// Seedream 比例到尺寸映射
export const SEEDREAM_SIZE_MAP: Record<string, string> = {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
};

// 图像模型参数配置映射
export interface ImageModelConfig {
    supportsAspectRatio: boolean;
    supportsResolution: boolean;
    supportsMultiImage: boolean;
    aspectRatios?: string[];
    resolutions?: string[];
    defaultAspectRatio?: string;
    defaultResolution?: string;
    sizeMap?: Record<string, string>;  // 比例到尺寸映射
}

export const IMAGE_MODEL_CONFIG: Record<string, ImageModelConfig> = {
    'doubao-seedream-5-0-260128': {
        supportsAspectRatio: true,
        supportsResolution: false,
        supportsMultiImage: true,
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
        defaultAspectRatio: '1:1',
        sizeMap: SEEDREAM_SIZE_MAP,
    },
    'doubao-seedream-4-5-251128': {
        supportsAspectRatio: true,
        supportsResolution: true,
        supportsMultiImage: true,
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
        resolutions: ['2k', '4k'],
        defaultAspectRatio: '1:1',
        defaultResolution: '2k',
        sizeMap: SEEDREAM_SIZE_MAP,
    },
    'nano-banana': {
        supportsAspectRatio: true,
        supportsResolution: false,
        supportsMultiImage: true,
        aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
        defaultAspectRatio: '1:1',
    },
    'nano-banana-2': {
        supportsAspectRatio: true,
        supportsResolution: true,
        supportsMultiImage: true,
        aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
        resolutions: ['1k', '2k', '4k'],
        defaultAspectRatio: '1:1',
        defaultResolution: '2k',
    },
};

// 获取模型配置
export const getImageModelConfig = (model: string): ImageModelConfig => {
    return IMAGE_MODEL_CONFIG[model] || {
        supportsAspectRatio: true,
        supportsResolution: false,
        supportsMultiImage: false,
        aspectRatios: IMAGE_ASPECT_RATIOS,
        defaultAspectRatio: '1:1',
    };
};

// Glass panel style
export const GLASS_PANEL = "bg-[#ffffff]/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-300 dark:border-slate-700 shadow-2xl";

// Node dimensions
export const DEFAULT_NODE_WIDTH = 420;
export const DEFAULT_FIXED_HEIGHT = 360;
export const AUDIO_NODE_HEIGHT = Math.round(DEFAULT_NODE_WIDTH * 9 / 16); // 16:9 比例 = 236

// 视频模型时长配置
export interface VideoDurationConfig {
    text2video: number[];   // 文生视频可用时长
    img2video: number[];    // 图生视频可用时长
    'start-end': number[];  // 首尾帧可用时长
    reference: number[];    // 参考生视频可用时长
    default: number;    // 默认时长
}

export const VIDEO_DURATION_CONFIG: Record<string, VideoDurationConfig> = {
    // Seedance
    'doubao-seedance-1-5-pro-251215': {
        text2video: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        img2video: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        'start-end': [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        reference: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        default: 5,
    },
    // Veo
    'veo3.1': {
        text2video: [5, 6, 7, 8],
        img2video: [5, 6, 7, 8],
        'start-end': [5, 6, 7, 8],
        reference: [5, 6, 7, 8],
        default: 8,
    },
    'veo3.1-pro': {
        text2video: [5, 6, 7, 8],
        img2video: [5, 6, 7, 8],
        'start-end': [5, 6, 7, 8],
        reference: [5, 6, 7, 8],
        default: 8,
    },
    'veo3.1-components': {
        text2video: [5, 6, 7, 8],
        img2video: [5, 6, 7, 8],
        'start-end': [],
        reference: [5, 6, 7, 8],
        default: 8,
    },
    // Vidu Q3/Q2 系列
    'viduq3-pro': {
        text2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        img2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        'start-end': [],
        reference: [],
        default: 5,
    },
    'viduq2-pro': {
        text2video: [],
        img2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'start-end': [1, 2, 3, 4, 5, 6, 7, 8],
        reference: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        default: 5,
    },
    'viduq2-turbo': {
        text2video: [],
        img2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'start-end': [1, 2, 3, 4, 5, 6, 7, 8],
        reference: [],
        default: 5,
    },
    'viduq2-pro-fast': {
        text2video: [],
        img2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'start-end': [1, 2, 3, 4, 5, 6, 7, 8],
        reference: [],
        default: 5,
    },
    'viduq2': {
        text2video: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        img2video: [],
        'start-end': [],
        reference: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        default: 5,
    },
};

const resolveVideoDurationKey = (model?: string): string | undefined => {
    if (!model) return undefined;
    if (VIDEO_DURATION_CONFIG[model]) return model;
    // Seedance 模型可能出现不同别名，兜底到 1.5 Pro 配置
    if (model.includes('seedance') || model.includes('doubao-seedance')) {
        return 'doubao-seedance-1-5-pro-251215';
    }
    return undefined;
};

// 获取模型时长选项
export const getDurationOptions = (model?: string, mode: VideoGenerationMode = 'text2video'): number[] => {
    const key = resolveVideoDurationKey(model);
    if (!key) return [5, 8];
    const config = VIDEO_DURATION_CONFIG[key];
    if (!config) return [5, 8];
    const byMode = config[mode] || [];
    if (byMode.length > 0) return byMode;
    return [config.default];
};

// 获取模型默认时长
export const getDefaultDuration = (model?: string, mode: VideoGenerationMode = 'text2video'): number => {
    const key = resolveVideoDurationKey(model);
    if (!key) return 5;
    const config = VIDEO_DURATION_CONFIG[key];
    if (!config) return 5;
    const byMode = config[mode] || [];
    return byMode.length > 0 ? byMode[0] : (config.default || 5);
};

// 检查模型是否支持首尾帧
export const supportsFirstLastFrame = (model?: string): boolean => {
    const key = resolveVideoDurationKey(model);
    return key ? (VIDEO_DURATION_CONFIG[key]?.['start-end']?.length || 0) > 0 : false;
};

// 视频生成模式
export type VideoGenerationMode = 'text2video' | 'img2video' | 'start-end' | 'reference';

// 视频模型分辨率配置
export interface VideoResolutionConfig {
    text2video: string[];    // 文生视频可用分辨率
    img2video: string[];     // 图生视频可用分辨率
    'start-end': string[];   // 首尾帧可用分辨率
    reference: string[];     // 参考生视频可用分辨率
    default: string;         // 默认分辨率
}

export const VIDEO_RESOLUTION_CONFIG: Record<string, VideoResolutionConfig> = {
    // Vidu Q3/Q2 系列
    'viduq3-pro': {
        text2video: ['540p', '720p', '1080p'],
        img2video: ['540p', '720p', '1080p'],
        'start-end': [],
        reference: [],
        default: '720p',
    },
    'viduq2-pro': {
        text2video: [],
        img2video: ['540p', '720p', '1080p'],
        'start-end': ['540p', '720p', '1080p'],
        reference: ['540p', '720p', '1080p'],
        default: '720p',
    },
    'viduq2-turbo': {
        text2video: [],
        img2video: ['540p', '720p', '1080p'],
        'start-end': ['540p', '720p', '1080p'],
        reference: [],
        default: '720p',
    },
    'viduq2-pro-fast': {
        text2video: [],
        img2video: ['720p', '1080p'],       // 不支持 540p
        'start-end': ['720p', '1080p'],     // 不支持 540p
        reference: [],
        default: '720p',
    },
    'viduq2': {
        text2video: ['540p', '720p', '1080p'],
        img2video: [],
        'start-end': [],
        reference: ['540p', '720p', '1080p'],
        default: '720p',
    },
    // Seedance - 支持 480p/720p/1080p（API 不支持 540p）
    'doubao-seedance-1-5-pro-251215': {
        text2video: ['480p', '720p', '1080p'],
        img2video: ['480p', '720p', '1080p'],
        'start-end': ['480p', '720p', '1080p'],
        reference: ['480p', '720p', '1080p'],
        default: '720p',
    },
    // Veo - 主要用 720p/1080p
    'veo3.1': {
        text2video: ['720p', '1080p'],
        img2video: ['720p', '1080p'],
        'start-end': ['720p', '1080p'],
        reference: ['720p', '1080p'],
        default: '720p',
    },
    'veo3.1-pro': {
        text2video: ['720p', '1080p'],
        img2video: ['720p', '1080p'],
        'start-end': ['720p', '1080p'],
        reference: ['720p', '1080p'],
        default: '1080p',
    },
};

// 获取模型在指定模式下的可用分辨率
export const getVideoResolutions = (model?: string, mode?: VideoGenerationMode): string[] => {
    const config = VIDEO_RESOLUTION_CONFIG[model || ''];
    if (!config) return VIDEO_RESOLUTIONS;  // 默认全部分辨率
    const byMode = config[mode || 'text2video'] || [];
    if (byMode.length > 0) return byMode;
    return [config.default];
};

// 获取模型的默认分辨率
export const getDefaultVideoResolution = (model?: string): string => {
    return VIDEO_RESOLUTION_CONFIG[model || '']?.default || '720p';
};

// 检查模型是否支持当前视频模式（当前仅对 Vidu 做强约束）
export const isVideoModelModeSupported = (model?: string, mode: VideoGenerationMode = 'text2video'): boolean => {
    if (!model || !model.startsWith('vidu')) return true;
    return isViduModelModeSupported(model, mode);
};
