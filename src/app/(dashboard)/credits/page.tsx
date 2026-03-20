import { Suspense } from "react";
import CreditsDashboard from "@/components/dashboard/CreditsDashboard";

export const metadata = {
    title: "ZeoCanvas",
};

export default function Page() {
    return (
        <Suspense fallback={<div className="p-8 text-gray-500">Loading...</div>}>
            <CreditsDashboard />
        </Suspense>
    );
}
