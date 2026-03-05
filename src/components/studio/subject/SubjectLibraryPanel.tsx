"use client";

import React, { useState, useMemo } from 'react';
import { Plus, Search, X, User } from 'lucide-react';
import type { Subject } from '@/types';
import { SubjectCard } from './SubjectCard';

interface SubjectLibraryPanelProps {
  subjects: Subject[];
  onAddSubject: () => void;
  onEditSubject: (id: string) => void;
  onDeleteSubject: (id: string) => void;
  onClose?: () => void;
}

export const SubjectLibraryPanel: React.FC<SubjectLibraryPanelProps> = ({
  subjects,
  onAddSubject,
  onEditSubject,
  onDeleteSubject,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // 过滤主体列表
  const filteredSubjects = useMemo(() => {
    if (!searchQuery) return subjects;
    return subjects.filter(subject =>
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [subjects, searchQuery]);

  return (
    <>
      {/* 顶部操作栏 */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 bg-slate-50 dark:bg-slate-800">
        <div className="flex justify-between items-center">
          {onClose && (
            <button onClick={onClose}>
              <X size={14} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100" />
            </button>
          )}
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            主体库
          </span>
          <button
            onClick={onAddSubject}
            className="p-1.5 bg-blue-500/20 dark:bg-blue-500/30 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-md transition-colors"
            title="添加主体"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* 搜索框 - 仅当有主体时显示 */}
        {subjects.length > 3 && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              >
                <X size={12} className="text-slate-400" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 主体卡片网格 */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {filteredSubjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400 opacity-60 select-none">
            <User size={48} strokeWidth={1} className="mb-3 opacity-50" />
            <span className="text-[10px] font-medium tracking-widest uppercase text-center">
              {subjects.length === 0
                ? <>暂无主体<br />点击 + 添加新主体</>
                : <>无匹配结果<br />尝试其他关键词</>
              }
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-1">
            {filteredSubjects.map(subject => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                onEdit={() => onEditSubject(subject.id)}
                onDelete={() => onDeleteSubject(subject.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      {subjects.length > 0 && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
            仅在 Vidu 视频模型中，使用 <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded">@主体名称</code> 引用主体
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectLibraryPanel;
