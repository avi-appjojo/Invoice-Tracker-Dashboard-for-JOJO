"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Employee landing: Accounts → Pending review (single review page).
 * Non-Accounts → Invoices list.
 */
export default function EmployeeHomePage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (authLoading || !user) return;
        if (user.role !== "employee") {
            router.replace("/login");
            return;
        }
        const dept = (user.department || "").toLowerCase();
        if (dept === "accounts") {
            router.replace("/employee/pending-review");
        } else {
            router.replace("/employee/invoices");
        }
    }, [user, authLoading, router]);

    return (
        <div className="flex items-center justify-center h-full min-h-[200px]">
            <div className="w-10 h-10 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
        </div>
    );
}
