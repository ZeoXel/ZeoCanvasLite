/**
 * 任务日志类型定义
 * 用于追踪长耗时工作流和视频生成任务的进度
 */

/**
 * 任务类型
 */
export type TaskType = 'workflow' | 'video' | 'audio' | 'image';

/**
 * 任务状态
 */
export type TaskStatus =
  | 'queued'      // 排队中
  | 'submitted'   // 已提交
  | 'running'     // 运行中
  | 'success'     // 成功
  | 'failed'      // 失败
  | 'cancelled';  // 已取消

/**
 * 任务平台/来源
 */
export type TaskPlatform =
  | 'coze'        // Coze 工作流
  | 'vidu'        // Vidu 视频
  | 'seedream'    // Seedream
  | 'veo'         // Google Veo
  | 'suno'        // Suno 音乐
  | 'minimax'     // MiniMax 语音
  | 'other';

/**
 * 任务日志记录
 */
export interface TaskLog {
  id: string;                    // 本地任务 ID
  externalId?: string;           // 外部任务 ID (executeId, taskId 等)
  type: TaskType;                // 任务类型
  platform: TaskPlatform;        // 任务平台
  name: string;                  // 任务名称 (工作流名称等)
  description?: string;          // 任务描述

  // 状态相关
  status: TaskStatus;            // 当前状态
  progress?: number;             // 进度百分比 (0-100)
  progressText?: string;         // 进度文本描述

  // 时间相关
  createdAt: number;             // 创建时间
  startedAt?: number;            // 开始执行时间
  completedAt?: number;          // 完成时间

  // 输入输出
  parameters?: Record<string, unknown>;  // 输入参数
  output?: string;               // 输出结果 (JSON 字符串或文本)
  outputUrls?: {                 // 输出媒体 URLs
    images?: string[];
    videos?: string[];
    audios?: string[];
  };

  // 错误信息
  error?: string;                // 错误信息
  errorCode?: string;            // 错误代码

  // 调试信息
  debugUrl?: string;             // 调试链接 (Coze 工作流调试 URL)

  // 关联信息
  workflowId?: string;           // 关联的工作流 ID
  canvasId?: string;             // 关联的画布 ID
  nodeId?: string;               // 关联的节点 ID

  // 费用相关
  cost?: number;                 // 消耗积分
}

/**
 * 任务日志过滤条件
 */
export interface TaskLogFilter {
  type?: TaskType;
  platform?: TaskPlatform;
  status?: TaskStatus;
  startDate?: number;
  endDate?: number;
  keyword?: string;
}

/**
 * 任务日志分页结果
 */
export interface TaskLogPage {
  logs: TaskLog[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 任务日志存储配置
 */
export interface TaskLogStorageConfig {
  maxLogs: number;               // 最大存储数量
  retentionDays: number;         // 保留天数
}

/**
 * 获取状态显示标签
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    queued: '排队中',
    submitted: '已提交',
    running: '运行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status] || status;
}

/**
 * 获取状态颜色类名
 */
export function getTaskStatusColor(status: TaskStatus): {
  text: string;
  bg: string;
  dot: string;
} {
  const colors: Record<TaskStatus, { text: string; bg: string; dot: string }> = {
    queued: { text: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' },
    submitted: { text: 'text-yellow-600', bg: 'bg-yellow-100', dot: 'bg-yellow-400' },
    running: { text: 'text-blue-600', bg: 'bg-blue-100', dot: 'bg-blue-400' },
    success: { text: 'text-green-600', bg: 'bg-green-100', dot: 'bg-green-400' },
    failed: { text: 'text-red-600', bg: 'bg-red-100', dot: 'bg-red-400' },
    cancelled: { text: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' },
  };
  return colors[status] || colors.queued;
}

/**
 * 获取任务类型标签
 */
export function getTaskTypeLabel(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    workflow: '工作流',
    video: '视频生成',
    audio: '音频生成',
    image: '图片生成',
  };
  return labels[type] || type;
}

/**
 * 获取平台标签
 */
export function getPlatformLabel(platform: TaskPlatform): string {
  const labels: Record<TaskPlatform, string> = {
    coze: 'Coze',
    vidu: 'Vidu',
    seedream: 'Seedream',
    veo: 'Veo',
    suno: 'Suno',
    minimax: 'MiniMax',
    other: '其他',
  };
  return labels[platform] || platform;
}

/**
 * 计算任务耗时（毫秒）
 */
export function getTaskDuration(log: TaskLog): number | null {
  if (!log.startedAt) return null;
  const endTime = log.completedAt || Date.now();
  return endTime - log.startedAt;
}

/**
 * 格式化耗时显示
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1秒';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟${seconds % 60}秒`;
  }
  return `${seconds}秒`;
}

/**
 * 生成任务 ID
 */
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
