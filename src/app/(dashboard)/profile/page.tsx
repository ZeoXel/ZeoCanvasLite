import { Suspense } from "react";
import UserProfile from "@/components/dashboard/UserProfile";

export const metadata = {
    title: "ZeoCanvas",
};

export default function Page() {
    return (
        <Suspense fallback={<div className="p-8 text-gray-500">Loading...</div>}>
            <UserProfile />
        </Suspense>
    );
}
