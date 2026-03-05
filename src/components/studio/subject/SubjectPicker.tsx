"use client";

import React, { useMemo } from 'react';
import { User, Plus } from 'lucide-react';
import type { Subject, SelectedSubject } from '@/types';
import { getSubjectImageSrc } from '@/services/cosStorage';
import { SubjectCard } from './SubjectCard';

interface SubjectPickerProps {
  subjects: Subject[];
  selected: SelectedSubject[];
  maxSubjects?: number;
  onChange: (selected: SelectedSubject[]) => void;
  onOpenLibrary?: () => void;
}

export const SubjectPicker: React.FC<SubjectPickerProps> = ({
  subjects,
  selected,
  maxSubjects = 7,  // Vidu 最多 7 个主体
  onChange,
  onOpenLibrary,
}) => {
  // 选中的主体 ID 集合
  const selectedIds = useMemo(() => new Set(selected.map(s => s.id)), [selected]);

  // 切换选择状态
  const handleToggle = (subject: Subject) => {
    if (selectedIds.has(subject.id)) {
      // 取消选择
      onChange(selected.filter(s => s.id !== subject.id));
    } else if (selected.length < maxSubjects) {
      // 添加选择（优先使用 URL，兼容 Base64）
      const imageUrls = subject.images.map(img => getSubjectImageSrc(img));
      onChange([...selected, {
        id: subject.id,
        imageUrls,
        voiceId: subject.voiceId,
      }]);
    }
  };

  // 构建 @id 引用提示
  const refHints = useMemo(() => {
    if (selected.length === 0) return '';
    return selected.map(s => `@${s.id}`).join(' ');
  }, [selected]);

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <User size={12} className="text-slate-500 dark:text-slate-400" />
          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            选择主体
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">
            {selected.length}/{maxSubjects}
          </span>
          {onOpenLibrary && (
            <button
              onClick={onOpenLibrary}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              title="打开主体库"
            >
              <Plus size={12} className="text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* 主体列表 */}
      {subjects.length === 0 ? (
        <div className="py-4 text-center">
          <User size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            暂无主体
          </p>
          {onOpenLibrary && (
            <button
              onClick={onOpenLibrary}
              className="mt-2 px-3 py-1.5 text-[10px] font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
            >
              前往添加
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {subjects.map(subject => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              selected={selectedIds.has(subject.id)}
              onSelect={() => handleToggle(subject)}
              compact
            />
          ))}
        </div>
      )}

      {/* @id 引用提示 */}
      {selected.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[9px] text-slate-500 dark:text-slate-400">
            <span className="font-medium">提示词引用：</span>
            <code className="ml-1 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-blue-600 dark:text-blue-400">
              {refHints}
            </code>
          </div>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">
            在提示词中使用上述 @ID 来引用对应主体
          </p>
        </div>
      )}
    </div>
  );
};

export default SubjectPicker;
