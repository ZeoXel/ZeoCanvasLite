"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthRequiredNotice({
  className = "",
}: {
  className?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || isAuthenticated) return null;

  return (
    <div className={`w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>当前未登录，无法同步/执行生成任务。请先登录后继续。</span>
        <Link
          href="/auth"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
        >
          去登录
        </Link>
      </div>
    </div>
  );
}
