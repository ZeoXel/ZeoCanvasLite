"use client";

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { X, Plus, Trash2, Loader2, ImagePlus } from 'lucide-react';
import type { Subject, SubjectImage } from '@/types';
import { generateSubjectId, generateThumbnail, uploadSubjectImage, uploadSubjectThumbnail } from '@/services/subjectService';
import { getSubjectImageSrc, getSubjectThumbnailSrc, isCosUrl } from '@/services/cosStorage';
import {
  createDraftSubjectImage,
  seedSubjectImages,
  tryAppendSubjectImage,
  type SubjectImageAppendError,
  uniqueNonEmptyImageSources,
} from './subjectEditorUtils';

interface SubjectEditorProps {
  subject?: Subject | null;  // 编辑模式传入，新建模式为 null
  initialImage?: string;     // 初始图片（从画布创建主体时传入）
  canvasImageSources?: string[]; // 当前画布可用图片素材
  onSave: (subject: Subject) => void;
  onCancel: () => void;
}

export const SubjectEditor: React.FC<SubjectEditorProps> = ({
  subject,
  initialImage,
  canvasImageSources = [],
  onSave,
  onCancel,
}) => {
  const isEditing = !!subject;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 表单状态
  const [name, setName] = useState(subject?.name || '');
  const [description, setDescription] = useState(subject?.description || '');
  const [images, setImages] = useState<SubjectImage[]>(() =>
    seedSubjectImages(subject?.images || [], initialImage, createDraftSubjectImage)
  );

  // UI 状态
  const [isCanvasPickerOpen, setIsCanvasPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const appendImageSource = useCallback((source: string): SubjectImageAppendError | undefined => {
    let appendError: SubjectImageAppendError | undefined;
    setImages((prev) => {
      const result = tryAppendSubjectImage(prev, source, createDraftSubjectImage);
      appendError = result.error;
      return result.images;
    });
    return appendError;
  }, []);

  const handleAppendError = useCallback((error?: SubjectImageAppendError) => {
    if (error === 'limit') {
      alert('最多支持 3 张主体图片');
      return;
    }
    if (error === 'duplicate') {
      alert('该图片已添加');
    }
  }, []);

  const availableCanvasImages = useMemo(() => {
    const existingSources = new Set(images.map((img) => getSubjectImageSrc(img)).filter(Boolean));
    return uniqueNonEmptyImageSources(canvasImageSources).filter((src) => !existingSources.has(src));
  }, [canvasImageSources, images]);

  // 处理文件上传
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const appendError = appendImageSource(base64);
        handleAppendError(appendError);
        setIsUploading(false);
      };
      reader.onerror = () => {
        console.error('文件读取失败');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('文件处理失败:', err);
      setIsUploading(false);
    }

    // 清空 input 以允许重复选择同一文件
    e.target.value = '';
  }, [appendImageSource, handleAppendError]);

  // 删除图片
  const handleRemoveImage = useCallback((imageId: string) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  const handleAddCanvasImage = useCallback((imageSource: string) => {
    const appendError = appendImageSource(imageSource);
    handleAppendError(appendError);
    if (!appendError) {
      setIsCanvasPickerOpen(false);
    }
  }, [appendImageSource, handleAppendError]);

  // 保存主体
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      alert('请输入主体名称');
      return;
    }

    if (images.length === 0) {
      alert('请至少添加一张主体图片');
      return;
    }

    setIsSaving(true);

    try {
      const subjectId = subject?.id || generateSubjectId();
      const now = Date.now();

      // 上传图片到 COS（仅跳过已在 COS 上的图片，外部临时 URL 需转存）
      const uploadedImages = await Promise.all(
        images.map(async (img) => {
          // 已是 COS URL，无需重新上传
          if (img.url && isCosUrl(img.url)) return img;
          // 外部 URL（如 fal.ai 临时链接）或 base64，都需上传到 COS
          const source = img.url || img.base64;
          if (source) {
            const uploaded = await uploadSubjectImage(subjectId, source, img.angle);
            return uploaded;
          }
          return img;
        })
      );

      // 生成并上传缩略图
      const firstImageSrc = getSubjectImageSrc(uploadedImages[0]);
      let thumbnailUrl = subject?.thumbnailUrl || getSubjectThumbnailSrc(subject || {});

      if (firstImageSrc) {
        try {
          const thumbnailBase64 = await generateThumbnail(firstImageSrc, 200);
          thumbnailUrl = await uploadSubjectThumbnail(subjectId, thumbnailBase64);
        } catch (err) {
          console.error('生成缩略图失败:', err);
          thumbnailUrl = firstImageSrc; // 回退使用原图
        }
      }

      const newSubject: Subject = {
        id: subjectId,
        name: name.trim(),
        description: description.trim() || undefined,
        thumbnailUrl,
        images: uploadedImages,
        createdAt: subject?.createdAt || now,
        updatedAt: now,
      };

      onSave(newSubject);
    } catch (err) {
      console.error('保存主体失败:', err);
      alert('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  }, [name, description, images, subject, onSave]);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isEditing ? '编辑主体' : '添加主体'}
            </h3>
            <button
              onClick={onCancel}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={16} className="text-slate-500" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* 名称 */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                名称 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="如：机器人角色、红色跑车..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 transition-colors"
                autoFocus
              />
            </div>

            {/* 主体图片 */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                主体图片 * <span className="text-slate-400">（最多3张，支持多角度）</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group"
                    style={{
                      backgroundImage: `url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImNoZWNrIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxyZWN0IHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNlNWU3ZWIiLz48cmVjdCB4PSI1IiB5PSI1IiB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZTVlN2ViIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2NoZWNrKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')`
                    }}
                  >
                    <img
                      src={getSubjectImageSrc(img)}
                      alt={`角度 ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                    {img.angle && (
                      <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 bg-black/60 text-[8px] text-white rounded">
                        {img.angle}
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveImage(img.id)}
                      className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}

                {images.length < 3 && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500 disabled:opacity-60"
                    >
                      {isUploading ? (
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus size={16} />
                          <span className="text-[9px]">上传</span>
                        </>
                      )}
                    </button>
                    {availableCanvasImages.length > 0 && (
                      <button
                        onClick={() => setIsCanvasPickerOpen(true)}
                        className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500"
                      >
                        <ImagePlus size={16} />
                        <span className="text-[9px]">画布</span>
                      </button>
                    )}
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* 描述 */}
            <div>
              <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                描述 <span className="text-slate-400">（可选）</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="简单描述这个主体的特征..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || images.length === 0 || isSaving}
              className="px-4 py-2 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              {isSaving ? '保存中...' : (isEditing ? '保存修改' : '创建主体')}
            </button>
          </div>
        </div>
      </div>

      {/* 画布素材选择器 */}
      {isCanvasPickerOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setIsCanvasPickerOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">从画布添加辅助参考图</h3>
              <button
                onClick={() => setIsCanvasPickerOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {availableCanvasImages.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">暂无可添加的画布图片素材</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {availableCanvasImages.map((source) => (
                    <button
                      key={source}
                      onClick={() => handleAddCanvasImage(source)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                      title="添加为辅助参考图"
                    >
                      <img src={source} alt="画布素材" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectEditor;
