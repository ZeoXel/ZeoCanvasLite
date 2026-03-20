import React from "react";

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    hoverEffect?: boolean;
}

const GlassCard = ({ children, className = "", hoverEffect = false }: GlassCardProps) => {
    return (
        <div
            className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white/60 p-6 backdrop-blur-xl transition-all dark:border-white/10 dark:bg-white/5 ${hoverEffect ? "hover:-translate-y-1 hover:border-gray-300 hover:shadow-lg dark:hover:border-white/20 dark:hover:bg-white/10" : ""
                } ${className}`}
        >
            {children}
        </div>
    );
};

export default GlassCard;
