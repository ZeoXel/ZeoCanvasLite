export default function CanvasLoading() {
  return (
    <div className="w-full h-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center">
      <div className="relative select-none">
        {/* 氛围背景光 */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-amber-400/10 dark:bg-amber-900/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-400/10 dark:bg-blue-900/10 rounded-full blur-[120px] animate-pulse delay-700" />

        <div className="relative flex flex-col items-center">
          {/* 骨架占位 */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-8 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            </div>
          </div>

          {/* 加载指示器 */}
          <div className="mt-6 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
          <span className="mt-3 text-xs text-slate-400 dark:text-slate-500">正在加载画布...</span>
        </div>
      </div>
    </div>
  );
}
