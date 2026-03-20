"use client";

import React from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  ExternalLink,
  Copy,
  Video,
  Music,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import type { TaskLog } from '@/types/taskLog';
import {
  getTaskStatusLabel,
  getTaskStatusColor,
  getTaskTypeLabel,
  getPlatformLabel,
  getTaskDuration,
  formatDuration,
} from '@/types/taskLog';

interface TaskDetailModalProps {
  log: TaskLog;
  onClose: () => void;
}

export default function TaskDetailModal({ log, onClose }: TaskDetailModalProps) {
  // 格式化完整时间
  const formatFullTime = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 解析输出内容
  const parseOutput = (output?: string) => {
    if (!output) return null;
    try {
      const parsed = JSON.parse(output);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return output;
    }
  };

  const duration = getTaskDuration(log);
  const statusColors = getTaskStatusColor(log.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full ${statusColors.bg} ${statusColors.text}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusColors.dot}`} />
              {getTaskStatusLabel(log.status)}
            </span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate max-w-[300px]">
              {log.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
          {/* 基本信息 */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              基本信息
            </h3>
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <InfoItem label="任务类型" value={getTaskTypeLabel(log.type)} />
              <InfoItem label="平台来源" value={getPlatformLabel(log.platform)} />
              <InfoItem label="任务 ID" value={log.id} copyable />
              {log.externalId && (
                <InfoItem
                  label="外部 ID"
                  value={log.externalId}
                  copyable
                />
              )}
              {log.workflowId && (
                <InfoItem label="工作流 ID" value={log.workflowId} copyable />
              )}
              {log.cost !== undefined && (
                <InfoItem label="消耗积分" value={`${log.cost} 积分`} />
              )}
            </div>
          </section>

          {/* 时间信息 */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              时间信息
            </h3>
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <InfoItem label="创建时间" value={formatFullTime(log.createdAt)} />
              <InfoItem label="开始时间" value={formatFullTime(log.startedAt)} />
              <InfoItem label="完成时间" value={formatFullTime(log.completedAt)} />
              <InfoItem
                label="执行耗时"
                value={duration !== null ? formatDuration(duration) : '-'}
              />
            </div>
          </section>

          {/* 进度信息 (仅运行中显示) */}
          {(log.status === 'running' || log.status === 'submitted') && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                执行进度
              </h3>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${log.progress ?? 0}%` }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* 错误信息 (失败时显示) */}
          {log.status === 'failed' && log.error && (
            <section>
              <h3 className="text-sm font-medium text-red-500 mb-3">错误信息</h3>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                  {log.error}
                </p>
                {log.errorCode && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                    错误代码: {log.errorCode}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* 输入参数 */}
          {log.parameters && Object.keys(log.parameters).length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                输入参数
              </h3>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(log.parameters, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* 输出结果 */}
          {log.output && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                输出结果
              </h3>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                  {parseOutput(log.output)}
                </pre>
              </div>
            </section>
          )}

          {/* 输出媒体 */}
          {log.outputUrls && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                输出媒体
              </h3>
              <div className="space-y-4">
                {/* 图片 */}
                {log.outputUrls.images && log.outputUrls.images.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        图片 ({log.outputUrls.images.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {log.outputUrls.images.map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={url}
                            alt={`输出图片 ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 视频 */}
                {log.outputUrls.videos && log.outputUrls.videos.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Video size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        视频 ({log.outputUrls.videos.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {log.outputUrls.videos.map((url, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
                        >
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 mr-3">
                            视频 {index + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            >
                              <ExternalLink size={16} />
                            </a>
                            <a
                              href={url}
                              download
                              className="p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              <Download size={16} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 音频 */}
                {log.outputUrls.audios && log.outputUrls.audios.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Music size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        音频 ({log.outputUrls.audios.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {log.outputUrls.audios.map((url, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg"
                        >
                          <audio
                            controls
                            className="flex-1 h-8"
                            src={url}
                          />
                          <a
                            href={url}
                            download
                            className="ml-3 p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 调试链接 */}
          {log.debugUrl && (
            <section>
              <a
                href={log.debugUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-xl transition-colors"
              >
                <ExternalLink size={16} />
                查看调试日志
              </a>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// 信息项组件
function InfoItem({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</dt>
      <dd className="flex items-center gap-2">
        <span
          className="text-sm text-gray-900 dark:text-white truncate"
          title={value}
        >
          {value}
        </span>
        {copyable && (
          <button
            onClick={copyToClipboard}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="复制"
          >
            <Copy size={12} />
          </button>
        )}
      </dd>
    </div>
  );
}
