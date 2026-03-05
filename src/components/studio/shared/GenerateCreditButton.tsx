"use client";

import React from 'react';
import { Coins, Loader2, Send } from 'lucide-react';

type ButtonTheme = 'blue' | 'purple' | 'emerald' | 'red';

interface GenerateCreditButtonProps {
  estimateLabel: string;
  disabled?: boolean;
  working?: boolean;
  onClick: () => void;
  theme?: ButtonTheme;
  actionIcon?: React.ElementType;
  title?: string;
}

const THEME_STYLES: Record<ButtonTheme, { shell: string; circle: string; estimate: string }> = {
  blue: {
    shell: 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/20',
    circle: 'bg-white/20 text-white',
    estimate: 'text-white/95',
  },
  purple: {
    shell: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/20',
    circle: 'bg-white/20 text-white',
    estimate: 'text-white/95',
  },
  emerald: {
    shell: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:shadow-lg hover:shadow-emerald-500/20',
    circle: 'bg-white/20 text-white',
    estimate: 'text-white/95',
  },
  red: {
    shell: 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:shadow-lg hover:shadow-red-500/20',
    circle: 'bg-white/20 text-white',
    estimate: 'text-white/95',
  },
};

export const GenerateCreditButton: React.FC<GenerateCreditButtonProps> = ({
  estimateLabel,
  disabled = false,
  working = false,
  onClick,
  theme = 'blue',
  actionIcon: ActionIcon = Send,
  title = '生成',
}) => {
  const themeStyle = THEME_STYLES[theme];
  const isDisabled = disabled || working;
  const hoverTitle = isDisabled ? title : `${title}（⌘/Ctrl + Enter）`;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={hoverTitle}
      className={`inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-1 text-[10px] font-bold tracking-wide transition-all duration-300 ${
        isDisabled
          ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          : `${themeStyle.shell} hover:scale-105 active:scale-95`
      }`}
    >
      <span className={`inline-flex items-center gap-1 px-1 ${isDisabled ? 'text-slate-500' : themeStyle.estimate}`}>
        <Coins size={11} />
        <span>{estimateLabel}</span>
      </span>
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          isDisabled ? 'bg-slate-200 dark:bg-slate-600 text-slate-400' : themeStyle.circle
        }`}
      >
        {working ? <Loader2 size={11} className="animate-spin" /> : <ActionIcon size={11} />}
      </span>
    </button>
  );
};

export default GenerateCreditButton;
