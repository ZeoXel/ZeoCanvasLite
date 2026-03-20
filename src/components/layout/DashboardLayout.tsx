import React from "react";
import DashboardSidebar from "../dashboard/DashboardSidebar";
import AuthRequiredNotice from "@/components/common/AuthRequiredNotice";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen overflow-auto bg-gray-50 text-gray-900 dark:bg-black dark:text-gray-100">
            <DashboardSidebar />
            <main className="ml-64 min-h-screen p-8">
                <div className="mx-auto max-w-6xl">
                    <AuthRequiredNotice className="mb-6" />
                    {children}
                </div>
            </main>
        </div>
    );
}
