"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useGetDashboardAllQuery } from "@/lib/storeApi";
import { formatCurrency, statusBadgeStyles } from "@/lib/format";
import type { OverdueAlert, UpcomingPayment } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlertsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const canFetch = !authLoading && !!user && user.role !== "employee";
    const { data, isFetching } = useGetDashboardAllQuery(undefined, { skip: !canFetch });
    const overdue = useMemo(() => (data?.overdue ?? []) as OverdueAlert[], [data]);
    const upcoming = useMemo(() => (data?.upcoming ?? []) as UpcomingPayment[], [data]);
    const loading = isFetching;

    if (!authLoading && user?.role === "employee") {
        router.replace("/upload");
        return null;
    }

    if (authLoading || (!authLoading && user?.role === "employee")) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-56" />
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-3">
                        <Skeleton className="h-5 w-40" />
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-10 w-full" />
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-3">
                        <Skeleton className="h-5 w-44" />
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-10 w-full" />
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-neutral-900">Alerts & Reminders</h1>

            {/* Overdue */}
            <Card className="bg-white border-neutral-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-neutral-900 text-base flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-400" />
                        Overdue Invoices
                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 ml-2">
                            {overdue.length}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Mobile cards */}
                    <div className="md:hidden p-4 space-y-3">
                        {overdue.length === 0 ? (
                            <p className="text-center text-neutral-600 py-6 text-sm">
                                No overdue invoices
                            </p>
                        ) : (
                            overdue.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-neutral-900 truncate">
                                                {item.vendor_name}
                                            </p>
                                            <p className="text-xs text-neutral-600 mt-0.5 truncate">
                                                Invoice: {item.invoice_number || "—"}
                                            </p>
                                            <p className="text-xs text-red-600 mt-0.5">
                                                <span className="font-medium">{item.days_overdue}d</span> overdue
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-neutral-900">
                                                {formatCurrency(item.total_amount, item.currency)}
                                            </p>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    item.priority === "high"
                                                        ? statusBadgeStyles.overdue
                                                        : statusBadgeStyles.pending
                                                }
                                            >
                                                {item.priority}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop table */}
                    <table className="hidden md:table w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th className="text-left text-neutral-600 font-medium px-4 py-3">Vendor</th>
                                <th className="text-left text-neutral-600 font-medium px-4 py-3">Invoice #</th>
                                <th className="text-right text-neutral-600 font-medium px-4 py-3">Amount</th>
                                <th className="text-right text-neutral-600 font-medium px-4 py-3">Days Overdue</th>
                                <th className="text-center text-neutral-600 font-medium px-4 py-3">Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overdue.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center text-neutral-600 py-8">
                                        No overdue invoices 🎉
                                    </td>
                                </tr>
                            ) : (
                                overdue.map((item) => (
                                    <tr key={item.id} className="border-b border-neutral-200 hover:bg-neutral-100">
                                        <td className="px-4 py-3 text-neutral-900">{item.vendor_name}</td>
                                        <td className="px-4 py-3 text-neutral-600">{item.invoice_number || "—"}</td>
                                        <td className="px-4 py-3 text-right text-neutral-900 font-medium">
                                            {formatCurrency(item.total_amount, item.currency)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-400 font-medium">
                                            {item.days_overdue} days
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge
                                                variant="outline"
                                                className={
                                                    item.priority === "high"
                                                        ? statusBadgeStyles.overdue
                                                        : statusBadgeStyles.pending
                                                }
                                            >
                                                {item.priority}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Upcoming */}
            <Card className="bg-white border-neutral-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-neutral-900 text-base flex items-center gap-2">
                        <Clock size={18} className="text-yellow-400" />
                        Upcoming Payments
                        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 ml-2">
                            {upcoming.length}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Mobile cards */}
                    <div className="md:hidden p-4 space-y-3">
                        {upcoming.length === 0 ? (
                            <p className="text-center text-neutral-600 py-6 text-sm">
                                No upcoming payments
                            </p>
                        ) : (
                            upcoming.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-neutral-900 truncate">
                                                {item.vendor_name}
                                            </p>
                                            <p className="text-xs text-neutral-600 mt-0.5 truncate">
                                                Invoice: {item.invoice_number || "—"}
                                            </p>
                                            <p className="text-xs text-yellow-700 mt-0.5">
                                                Due in <span className="font-medium">{item.days_left}d</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-neutral-900">
                                                {formatCurrency(item.total_amount, item.currency)}
                                            </p>
                                            <p className="text-xs text-neutral-600 mt-0.5">{item.due_date}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop table */}
                    <table className="hidden md:table w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th className="text-left text-neutral-600 font-medium px-4 py-3">Vendor</th>
                                <th className="text-left text-neutral-600 font-medium px-4 py-3">Invoice #</th>
                                <th className="text-right text-neutral-600 font-medium px-4 py-3">Amount</th>
                                <th className="text-right text-neutral-600 font-medium px-4 py-3">Due Date</th>
                                <th className="text-right text-neutral-600 font-medium px-4 py-3">Days Left</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcoming.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center text-neutral-600 py-8">
                                        No upcoming payments
                                    </td>
                                </tr>
                            ) : (
                                upcoming.map((item) => (
                                    <tr key={item.id} className="border-b border-neutral-200 hover:bg-neutral-100">
                                        <td className="px-4 py-3 text-neutral-900">{item.vendor_name}</td>
                                        <td className="px-4 py-3 text-neutral-600">{item.invoice_number || "—"}</td>
                                        <td className="px-4 py-3 text-right text-neutral-900 font-medium">
                                            {formatCurrency(item.total_amount, item.currency)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-neutral-600">{item.due_date}</td>
                                        <td className="px-4 py-3 text-right text-yellow-400 font-medium">
                                            {item.days_left} days
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
