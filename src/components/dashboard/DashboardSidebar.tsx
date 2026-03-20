"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Palette,
    LayoutGrid,
    Sun,
    Moon,
    Settings,
    Coins,
    LogIn,
    ListTodo
} from "lucide-react";
import React, { useMemo, useState, useEffect } from "react";
import { UserAvatar } from "@/components/studio/UserAvatar";
import { useUserData } from "@/contexts/UserDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskLogs } from "@/contexts/TaskLogContext";
import { brand } from "@/config/brand";

const AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true';

const SidebarLogo = React.memo(function SidebarLogo() {
    return (
        <div className="mb-8 flex h-12 items-center px-2">
            <Link href="/canvases" className="group flex flex-col">
                <span className="text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
                    {brand.namePrefix}
                    <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
                        {brand.nameHighlight}
                    </span>
                </span>
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wide">
                    {brand.slogan}
                </span>
            </Link>
        </div>
    );
});

const DashboardSidebar = () => {
    const pathname = usePathname();

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') return 'light';
        const savedTheme = localStorage.getItem('lsai-theme') as 'light' | 'dark' | null;
        if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
        if (document.documentElement.classList.contains('dark')) return 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    const { user, creditBalance } = useUserData();
    const { isAuthenticated, isLoading } = useAuth();
    const { runningTasks } = useTaskLogs();
    const runningCount = runningTasks.length;

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('lsai-theme', theme);
    }, [theme]);

    // Listen for theme changes from other components/tabs
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'lsai-theme' && e.newValue) {
                const newTheme = e.newValue as 'light' | 'dark';
                setTheme(newTheme);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const userName = user?.user?.username || user?.user?.name || 'Guest';
    const balanceText = creditBalance?.remaining !== undefined ? creditBalance.remaining.toFixed(2) : '--';

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    };

    const navItems = useMemo(() => ([
        { icon: <Palette size={20} />, label: "画布", href: "/canvases" },
        { icon: <LayoutGrid size={20} />, label: "工作流", href: "/workflow" },
        { icon: <ListTodo size={20} />, label: "任务日志", href: "/tasks", badge: runningCount },
        { icon: <Coins size={20} />, label: "积分明细", href: "/credits" },
    ]), [runningCount]);

    const isActive = (path: string) => pathname.startsWith(path);

        return (
        <aside className="fixed left-0 top-0 h-screen w-64 border-r border-gray-200 bg-white/80 px-4 py-6 backdrop-blur-xl dark:border-gray-800 dark:bg-black/80 flex flex-col">
            <SidebarLogo />

            {/* Navigation */}
            <nav className="flex flex-1 flex-col gap-1">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive(item.href)
                            ? "bg-gray-100 text-blue-600 dark:bg-white/10 dark:text-white"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                            }`}
                    >
                        {item.icon}
                        <span className="flex-1">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white animate-pulse">
                                {item.badge}
                            </span>
                        )}
                    </Link>
                ))}
            </nav>

            {/* User Widget at Bottom */}
            <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-800">
                <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${isAuthenticated ? 'hover:bg-gray-50 dark:hover:bg-white/5' : ''}`}>
                    {AUTH_ENABLED && (
                        isAuthenticated ? (
                            <Link
                                href="/profile"
                                className="flex flex-1 min-w-0 items-center gap-3"
                                aria-label="账户设置"
                            >
                                <UserAvatar name={userName} size={36} />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {userName}
                                    </p>
                                    <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                        <Coins size={12} className="flex-shrink-0" />
                                        <span>{isLoading ? '--' : balanceText}</span>
                                    </p>
                                </div>
                            </Link>
                        ) : (
                            <Link
                                href="/auth"
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                                aria-label="登录"
                            >
                                <LogIn size={16} />
                                登录/注册
                            </Link>
                        )
                    )}
                    <div className="flex gap-1">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleTheme();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
                            suppressHydrationWarning
                        >
                            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                        {AUTH_ENABLED && isAuthenticated && (
                            <Link
                                href="/profile"
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                title="账户设置"
                            >
                                <Settings size={16} />
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default DashboardSidebar;
