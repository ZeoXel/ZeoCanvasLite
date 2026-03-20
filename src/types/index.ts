
export enum NodeType {
  PROMPT_INPUT = 'PROMPT_INPUT',
  IMAGE_ASSET = 'IMAGE_ASSET', // 图片素材节点：上传图片素材，传递给下游节点
  VIDEO_ASSET = 'VIDEO_ASSET', // 视频素材节点：上传视频素材，传递给下游节点
  IMAGE_GENERATOR = 'IMAGE_GENERATOR',
  VIDEO_GENERATOR = 'VIDEO_GENERATOR',
  VIDEO_FACTORY = 'VIDEO_FACTORY', // 视频工厂：展示和编辑视频结果
  IMAGE_EDITOR = 'IMAGE_EDITOR',
  AUDIO_GENERATOR = 'AUDIO_GENERATOR', // Suno 音乐生成
  VOICE_GENERATOR = 'VOICE_GENERATOR', // MiniMax 语音合成
  MULTI_FRAME_VIDEO = 'MULTI_FRAME_VIDEO', // 智能多帧视频：多张关键帧+转场生成视频
  IMAGE_3D_CAMERA = 'IMAGE_3D_CAMERA', // 3D 运镜：通过 3D 相机控制重绘图片视角
}

// 3D 相机参数
export interface CameraParams {
  azimuth: number;     // 0-360 水平旋转角（方位角）
  elevation: number;   // -30~60 垂直倾角（俯仰角）
  distance: number;    // 0.6-1.5 焦距倍数（变焦系数）
}

export enum NodeStatus {
  IDLE = 'IDLE',
  WORKING = 'WORKING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export type VideoGenerationMode = 'DEFAULT' | 'CONTINUE' | 'CUT' | 'FIRST_LAST_FRAME' | 'CHARACTER_REF' | 'SUBJECT_REF';
export type VideoRequestMode = 'text2video' | 'img2video' | 'start-end' | 'reference';

// ==================== 主体系统类型 ====================

/** 主体图片 - 单张去背景后的主体图 */
export interface SubjectImage {
  id: string;               // 图片唯一ID
  base64?: string;          // 去背景后的图片 (PNG with transparency) [废弃，使用 url]
  url?: string;             // COS URL (优先使用)
  originalBase64?: string;  // 原始图片 [废弃，使用 originalUrl]
  originalUrl?: string;     // 原始图片 COS URL
  angle?: 'front' | 'side' | 'back' | '3/4' | string;  // 角度标签
  createdAt: number;
}

/** 主体定义 - 全局主体库中的单个主体 */
export interface Subject {
  id: string;               // 唯一ID，用于在 prompt 中引用 @id
  name: string;             // 主体名称 (如 "机器人角色A")
  category?: string;        // 分类: 'character' | 'object' | 'animal' | 'vehicle' | 自定义
  description?: string;     // 描述信息
  thumbnail?: string;       // 缩略图 [废弃，使用 thumbnailUrl]
  thumbnailUrl?: string;    // 缩略图 COS URL (优先使用)
  images: SubjectImage[];   // 多角度图片集合 (1-3张最优, Vidu最多3张)
  voiceId?: string;         // 关联的音色ID (用于 Vidu 音视频直出)
  tags?: string[];          // 自定义标签
  createdAt: number;
  updatedAt: number;
}

/** 主体选择结果 - 用于生成时传递 */
export interface SelectedSubject {
  id: string;
  images?: string[];        // 选中的图片 Base64 数组 [废弃，使用 imageUrls]
  imageUrls?: string[];     // 选中的图片 COS URL 数组 (优先使用)
  voiceId?: string;
}

// 音频生成模式
export type AudioGenerationMode = 'music' | 'voice';

// Suno 音乐生成配置
export interface MusicGenerationConfig {
  title?: string;               // 歌曲标题
  tags?: string;                // 风格标签 "pop, electronic"
  negativeTags?: string;        // 排除风格 "sad, slow"
  instrumental?: boolean;       // 纯音乐（无人声）
  mv?: string;                  // Suno 模型版本
  taskIds?: string[];           // 异步任务 ID 列表
  status?: 'pending' | 'processing' | 'complete' | 'error';
  coverImage?: string;          // 封面图 URL
}

// MiniMax 语音合成配置
export interface VoiceSynthesisConfig {
  voiceId?: string;             // 音色 ID
  speed?: number;               // 语速 [0.5, 2]
  volume?: number;              // 音量 (0, 10]
  pitch?: number;               // 语调 [-12, 12]
  emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm' | 'fluent';
  // 声音效果器
  voiceModify?: {
    pitch?: number;             // 音高 [-100, 100]
    intensity?: number;         // 强度 [-100, 100]
    timbre?: number;            // 音色 [-100, 100]
    soundEffect?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic' | '';
  };
}

export interface AppNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width?: number; // Custom width
  height?: number; // Custom height
  title: string;
  status: NodeStatus;
  data: {
    prompt?: string; // 文本内容（用于下游节点）
    userInput?: string; // 用户的简短想法（旧字段，保留兼容）
    model?: string; // Selected AI model
    textStyle?: {
      fontSize?: number;   // 字号: 10 | 12 | 14 | 16 | 20 | 24
      color?: string;      // 文字颜色 (CSS color)
    };
    image?: string; // URL (COS) or legacy Base64
    originalImage?: string; // URL (COS) or legacy Base64 (Original image before doodles)
    editOriginImage?: string; // 首次进入编辑时的基准底图，用于“重置初始”
    canvasData?: string; // Base64 PNG (Doodle layer only, transparent background)
    images?: string[]; // Array of URLs (legacy Base64 supported)
    imageCount?: number; // Number of images to generate (1-4)
    videoCount?: number; // Number of videos to generate (1-4)
    videoUri?: string; // URL
    videoUris?: string[]; // Array of URLs (for multiple video generations)

    videoMetadata?: any; // Stores the raw Video object from Gemini API for extension
    audioUri?: string; // Base64 or Blob URL for Audio Node
    audioUris?: string[]; // 多个音频（Suno 会生成两首）
    analysis?: string; // Video analysis result
    error?: string;
    progress?: string;
    uploading?: boolean; // UI: 上传中状态
    mediaOrigin?: 'uploaded' | 'generated' | 'edited'; // 媒体来源（上传素材/模型生成/本地编辑）
    estimatedCredits?: number; // UI: 按钮积分预估（展示态）
    estimateKey?: string; // UI: 预估缓存键（展示态）

    // 音频节点扩展配置
    audioMode?: AudioGenerationMode;    // 'music' | 'voice'
    musicConfig?: MusicGenerationConfig; // Suno 音乐配置
    voiceConfig?: VoiceSynthesisConfig;  // MiniMax 语音配置
    aspectRatio?: string; // e.g., '16:9', '4:3'
    resolution?: string; // e.g., '1080p', '4k'
    duration?: number; // Duration in seconds (for Audio/Video)
    videoModeOverride?: 'auto' | VideoRequestMode; // 手动覆盖视频请求模式（默认 auto）
    
    // Video Strategies (StoryContinuator, SceneDirector, FrameWeaver, CharacterRef)
    generationMode?: VideoGenerationMode; 
    selectedFrame?: string; // URL (COS) or legacy Base64
    croppedFrame?: string; // URL (COS) or legacy Base64
    
    // Input Management
    sortedInputIds?: string[]; // Order of input nodes for multi-image composition

    // Reference Images (用户上传的参考图，区别于生成结果)
    referenceImages?: string[]; // URLs (legacy Base64 supported)

    // Multi-Frame Video (智能多帧视频节点数据)
    multiFrameData?: {
      frames: SmartSequenceItem[];  // 关键帧列表
      viduModel?: 'viduq2-turbo' | 'viduq2-pro';  // Vidu 模型
      viduResolution?: '540p' | '720p' | '1080p'; // Vidu 分辨率
      taskId?: string;              // Vidu 任务 ID (用于轮询)
      _appendFrames?: boolean;      // 内部标志：追加模式（避免闭包陷阱）
    };

    // First-Last Frame (首尾帧视频生成)
    firstLastFrameData?: {
      firstFrame?: string;  // URL (COS) or legacy Base64
      lastFrame?: string;   // URL (COS) or legacy Base64
    };

    // Video Provider Extended Config (视频厂商扩展配置)
    videoConfig?: {
      // Vidu Q2 系列 (注：Q2 不支持 style 参数)
      movement_amplitude?: 'auto' | 'small' | 'medium' | 'large';  // 图生/首尾帧
      bgm?: boolean;           // 背景音乐 (首尾帧/文生)
      audio?: boolean;         // 音视频直出 (仅图生)
      voice_id?: string;       // 音色 ID (audio=true 时)
      // Seedance
      return_last_frame?: boolean;  // 返回尾帧
      generate_audio?: boolean;     // 有声视频 (1.5 pro)
      camera_fixed?: boolean;       // 固定摄像头
      watermark?: boolean;          // 水印
      service_tier?: 'default' | 'flex';  // 服务等级
      seed?: number;                // 随机种子
      // Veo
      enhance_prompt?: boolean;     // 增强提示词
    };

    // 主体参考（Subject Reference）
    selectedSubjects?: SelectedSubject[];  // 选中的主体列表
    subjectAudioMode?: boolean;            // 是否启用音视频直出 (reference-audio)

    // 3D 相机参数
    cameraParams?: CameraParams;           // 相机视角参数
    hideConfigPanel?: boolean;             // 隐藏底部配置面板
  };
  inputs: string[]; // IDs of nodes this node connects FROM
  modifiedAt?: number;
}

export interface Group {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  nodeIds?: string[]; // 分组包含的节点ID列表
  modifiedAt?: number;
}

export interface Connection {
  from: string;
  to: string;
  isAuto?: boolean; // 自动生成的连接（批量生产时），虚线显示且不传递上游参数
  id?: string;
  modifiedAt?: number;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  id?: string;
}

export interface Workflow {
  id: string;
  title: string;
  thumbnail: string;
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
  modifiedAt?: number;
}

// Canvas 画布 - 用于保存和恢复工作状态
export interface Canvas {
  id: string;
  title: string;
  thumbnail?: string;
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
  createdAt: number;
  updatedAt: number;
  // 视口状态
  pan?: { x: number; y: number };
  scale?: number;
}

// New Smart Sequence Types
export interface SmartSequenceItem {
    id: string;
    src: string; // URL (COS) or legacy Base64
    transition: {
        duration: number; // 1-6s
        prompt: string;
    };
}

// Window interface for Google AI Studio key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
