"use client";

import React, { useState, useEffect, useRef } from 'react';
import { User, Settings, CreditCard, LogOut, Coins } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/contexts/UserDataContext';
import { UserAvatar } from './UserAvatar';

interface UserInfoWidgetProps {
  onOpenModal: (tab: 'account' | 'credits') => void;
  onOpenLogin?: () => void;
}

export const UserInfoWidget: React.FC<UserInfoWidgetProps> = ({
  onOpenModal,
  onOpenLogin,
}) => {
  const { user: authUser, logout, isLoading } = useAuth();
  const { creditBalance, refreshCredits } = useUserData();
  const [isHovered, setIsHovered] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 初始加载余额：仅在无本地余额时延后触发，避免与画布首屏关键请求竞争
  useEffect(() => {
    if (isLoading || !authUser || creditBalance) {
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let idleId: number | null = null;

    const run = () => {
      if (cancelled) return;
      refreshCredits({ scope: 'balance' });
    };

    timeoutId = setTimeout(() => {
      const requestIdle = (window as typeof window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }).requestIdleCallback;

      if (requestIdle) {
        idleId = requestIdle(run, { timeout: 1500 });
      } else {
        run();
      }
    }, 800);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, [isLoading, authUser, creditBalance, refreshCredits]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };

  const handleLogout = async () => {
    if (confirm('确定要退出登录吗?')) {
      await logout();
    }
  };

  const totalCredits = creditBalance?.remaining || 0;

  return (
    <div
      ref={widgetRef}
      className="relative group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 入口按钮 - 与右下角缩放控制保持一致高度 */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl">
        {/* 头像 */}
        <div className="relative p-1">
          <UserAvatar
            name={authUser?.name ?? undefined}
            size={24}
            showOnlineIndicator={!!authUser}
          />
        </div>

        {/* 分隔线 - 与右下角一致 */}
        <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />

        {authUser ? (
          <div className="flex items-center gap-1 px-1">
            <Coins size={12} className="text-slate-500 dark:text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
              {totalCredits.toFixed(2)}
            </span>
          </div>
        ) : (
          <button
            onClick={() => onOpenLogin?.()}
            className="px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500"
          >
            登录
          </button>
        )}
      </div>

      {/* 悬浮菜单 - 与画布双击弹框样式统一 */}
      {isHovered && (
        <div className="absolute bottom-full left-0 mb-2 w-48 bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-200 origin-bottom-left z-[100]">
          {/* 用户信息 */}
          <div className="px-2.5 py-2 mb-1 rounded-xl bg-slate-100/60 dark:bg-slate-800/60">
            <div className="flex items-center gap-2.5">
              <UserAvatar
                name={authUser?.name ?? undefined}
                size={32}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {authUser?.name || '未登录'}
                </div>
                {authUser && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <Coins size={10} className="text-slate-400 dark:text-slate-500" />
                    <span className="font-medium">{totalCredits.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {authUser ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHovered(false);
                  onOpenModal('account');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Settings size={12} className="text-blue-600 dark:text-blue-400" />
                <span>账户管理</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHovered(false);
                  onOpenModal('credits');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <CreditCard size={12} className="text-amber-600 dark:text-amber-400" />
                <span>积分明细</span>
              </button>

              <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHovered(false);
                    handleLogout();
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <LogOut size={12} />
                  <span>退出登录</span>
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsHovered(false);
                onOpenLogin?.();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
            >
              <Settings size={12} />
              <span>登录</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UserInfoWidget;
