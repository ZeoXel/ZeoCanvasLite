"use client";

import React from "react";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import GradientButton from "../ui/GradientButton";
import { useUserData } from "@/contexts/UserDataContext";

const DashboardHero = () => {
    const { creditBalance, user } = useUserData();
    const balanceText = creditBalance?.remaining !== undefined ? creditBalance.remaining.toFixed(2) : '--';
    const displayName = user?.user?.username || user?.user?.name || '创作者';
    return (
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
                <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white lg:text-4xl">
                    欢迎回来，{displayName}
                </h1>
                <p className="max-w-xl text-lg text-gray-500 dark:text-gray-400">
                    使用 AI 工作流进行创作、自动化和激发灵感。
                    您当前拥有 <span className="font-semibold text-blue-600 dark:text-blue-400">{balanceText} 积分</span>。
                </p>
            </div>

            <div className="flex gap-3">
                <Link href="/canvases">
                    <GradientButton variant="secondary" icon={<Plus size={18} />}>
                        新建画布
                    </GradientButton>
                </Link>
                <Link href="/workflow">
                    <GradientButton icon={<Zap size={18} />}>
                        快捷工作流
                    </GradientButton>
                </Link>
            </div>
        </div>
    );
};

export default DashboardHero;
