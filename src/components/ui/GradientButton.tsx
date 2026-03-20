import React from "react";

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    variant?: "primary" | "secondary";
    icon?: React.ReactNode;
}

const GradientButton = ({ children, variant = "primary", icon, className = "", ...props }: GradientButtonProps) => {
    const baseStyles = "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/30 hover:brightness-110",
        secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10",
    };

    return (
        <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
            {icon}
            {children}
        </button>
    );
};

export default GradientButton;
