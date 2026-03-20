import React from 'react';
import { CROP_ASPECT_RATIO_OPTIONS } from './cropRatios';

interface CropAspectRatioSelectorProps {
  value: number | null;
  onChange: (value: number | null) => void;
  compact?: boolean;
  className?: string;
}

export const CropAspectRatioSelector: React.FC<CropAspectRatioSelectorProps> = ({
  value,
  onChange,
  compact = false,
  className = '',
}) => {
  const buttonClass = compact ? 'px-2 py-1 text-[10px]' : 'px-4 py-2 text-xs';
  return (
    <div className={`flex items-center gap-2 p-1 bg-white border border-slate-300 rounded-xl shadow-lg overflow-x-auto custom-scrollbar max-w-full ${className}`}>
      {CROP_ASPECT_RATIO_OPTIONS.map((ratio) => (
        <button
          key={ratio.label}
          onClick={() => onChange(ratio.value)}
          className={`
            relative ${buttonClass} rounded-lg font-bold transition-all whitespace-nowrap
            ${value === ratio.value
              ? 'bg-blue-500 text-black shadow-md scale-105 z-10'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }
          `}
        >
          {ratio.label}
        </button>
      ))}
    </div>
  );
};
