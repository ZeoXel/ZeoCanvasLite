// Coze Workflow Types

/**
 * 工作流输入参数类型
 */
export type CozeInputType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'option' | 'other' | 'number';

/**
 * 工作流输入参数选项
 */
export interface CozeInputOption {
  value: string;
  label: string;
}

/**
 * 工作流输入参数定义
 */
export interface CozeWorkflowInput {
  key: string;
  type: CozeInputType;
  label: string;
  placeholder?: string;
  required: boolean;
  defaultValue?: string;
  options?: CozeInputOption[];
}

/**
 * 工作流分类
 */
export interface CozeWorkflowCategory {
  id: string;
  name: string;
  icon: string;
}

/**
 * 工作流状态
 */
export type CozeWorkflowStatus = 'active' | 'inactive' | 'deprecated';

/**
 * 工作流输出格式
 */
export type CozeOutputFormat = 'text' | 'json' | 'image' | 'video' | 'audio' | 'mixed';

/**
 * 工作流配置
 */
export interface CozeWorkflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  coverVideo?: string;
  coverImage?: string;
  inputs: CozeWorkflowInput[];
  outputFormat: CozeOutputFormat;
  duration: number; // 预计耗时(分钟)
  balanceCost: number; // 消耗积分
  status?: CozeWorkflowStatus;
  popular?: boolean;
}

/**
 * 工作流执行参数
 */
export interface CozeWorkflowParameters {
  [key: string]: string | number | boolean | undefined;
}

/**
 * 工作流执行状态
 */
export type CozeExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * 工作流执行记录
 */
export interface CozeExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  userId: string;
  parameters: CozeWorkflowParameters;
  status: CozeExecutionStatus;
  result?: CozeExecutionResult;
  error?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  balanceCost: number;
}

/**
 * 工作流执行结果
 */
export interface CozeExecutionResult {
  type: 'text' | 'image' | 'video' | 'audio' | 'json' | 'mixed';
  content: string;
  metadata?: {
    imageUrls?: string[];
    videoUrls?: string[];
    audioUrls?: string[];
    [key: string]: unknown;
  };
}

/**
 * SSE 流式事件类型
 */
export type CozeStreamEventType = 'Message' | 'Error' | 'Done' | 'Interrupt' | 'PING';

/**
 * SSE 流式事件
 */
export interface CozeStreamEvent {
  event: CozeStreamEventType;
  data: {
    content?: string;
    status?: string;
    error_message?: string;
    error_code?: string;
    [key: string]: unknown;
  };
}

/**
 * 网关配置
 */
export interface CozeGatewayConfig {
  USE_GATEWAY: boolean;
  GATEWAY_BASE_URL: string;
  GATEWAY_API_KEY: string;
  GATEWAY_MODEL: string;
  DEFAULT_WORKFLOW_ID: string;
}

/**
 * 区域配置
 */
export interface CozeRegionConfig {
  COZE_BASE_URL: string;
  auth: {
    oauth_jwt: {
      COZE_APP_ID: string;
      COZE_KEY_ID: string;
      COZE_AUD: string;
    };
    pat: {
      COZE_API_PAT_TOKEN: string;
    };
  };
}

/**
 * 完整 Coze 配置
 */
export interface CozeConfig {
  cn: CozeRegionConfig;
  en: CozeRegionConfig;
  gateway: CozeGatewayConfig;
  server: {
    BASE_URL: string;
    PORT: number;
  };
}

/**
 * 文件上传结果
 */
export interface CozeFileUploadResult {
  fileId?: string;
  localPath?: string;
  url?: string;
  compressionInfo?: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
  };
}

/**
 * API 响应包装
 */
export interface CozeApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
