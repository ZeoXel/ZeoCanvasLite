"use client";

import React from 'react';
import { Edit, Trash2 } from 'lucide-react';
import type { Subject } from '@/types';
import { getSubjectThumbnailSrc } from '@/services/cosStorage';
import { getPrimaryImage } from '@/services/subjectService';

interface SubjectCardProps {
  subject: Subject;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}

export const SubjectCard: React.FC<SubjectCardProps> = ({
  subject,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  onDragStart,
  compact = false,
}) => {
  const thumbnailSrc = getSubjectThumbnailSrc(subject) || getPrimaryImage(subject) || '';
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/subject', JSON.stringify(subject));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(e);
  };

  // 分类标签颜色
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'character': return 'bg-blue-500';
      case 'object': return 'bg-amber-500';
      case 'animal': return 'bg-green-500';
      case 'vehicle': return 'bg-purple-500';
      default: return 'bg-slate-500';
    }
  };

  // 分类中文名
  const getCategoryName = (category?: string) => {
    switch (category) {
      case 'character': return '角色';
      case 'object': return '物体';
      case 'animal': return '动物';
      case 'vehicle': return '载具';
      default: return '其他';
    }
  };

  if (compact) {
    // 紧凑模式 - 用于选择器
    return (
      <div
        onClick={onSelect}
        className={`
          relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer border-2 transition-all
          bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImNoZWNrIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxyZWN0IHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNlNWU3ZWIiLz48cmVjdCB4PSI1IiB5PSI1IiB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZTVlN2ViIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2NoZWNrKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')]
          ${selected
            ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105'
            : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
          }
        `}
        title={subject.name}
      >
        <img
          src={thumbnailSrc}
          alt={subject.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
        {subject.images.length > 1 && (
          <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/60 text-[8px] text-white rounded">
            {subject.images.length}
          </div>
        )}
      </div>
    );
  }

  // 标准模式 - 用于主体库
  return (
    <div
      className={`
        group relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing
        border transition-all duration-200 shadow-sm hover:shadow-lg
        bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImNoZWNrIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxyZWN0IHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNlNWU3ZWIiLz48cmVjdCB4PSI1IiB5PSI1IiB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZTVlN2ViIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2NoZWNrKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')]
        ${selected
          ? 'border-blue-500 ring-2 ring-blue-500/30'
          : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
        }
      `}
      draggable
      onDragStart={handleDragStart}
      onClick={onSelect}
    >
      {/* 缩略图 */}
      <div className="aspect-square">
        <img
          src={thumbnailSrc}
          alt={subject.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* 角度数量指示 */}
      {subject.images.length > 1 && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-blue-500 text-[9px] text-white font-medium rounded-full shadow">
          {subject.images.length} 角度
        </div>
      )}

      {/* 分类标签 */}
      {subject.category && (
        <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 ${getCategoryColor(subject.category)} text-[9px] text-white font-medium rounded-full shadow`}>
          {getCategoryName(subject.category)}
        </div>
      )}

      {/* 底部信息 */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="text-white text-xs font-medium truncate">{subject.name}</div>
        {subject.description && (
          <div className="text-white/60 text-[10px] truncate mt-0.5">{subject.description}</div>
        )}
      </div>

      {/* 悬停操作按钮 */}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-md hover:bg-white dark:hover:bg-slate-700 transition-colors shadow"
            title="编辑"
          >
            <Edit size={12} className="text-slate-600 dark:text-slate-300" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-md hover:bg-red-500 hover:text-white transition-colors shadow group/del"
            title="删除"
          >
            <Trash2 size={12} className="text-slate-600 dark:text-slate-300 group-hover/del:text-white" />
          </button>
        )}
      </div>
    </div>
  );
};

export default SubjectCard;
