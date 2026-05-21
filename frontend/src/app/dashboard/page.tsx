"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useGetDashboardAllQuery } from "@/lib/storeApi";
import { formatCurrency, statusBadgeStyles } from "@/lib/format";
import type { DashboardSummary, PriorityBucket } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    IndianRupee,
    Clock,
    AlertTriangle,
    CheckCircle2,
    FileText,
    TrendingUp,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const CHART_COLORS = ["#f97373", "#fb923c", "#e5e7eb"]; // high, medium, low

function PriorityTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ value: number; payload: PriorityBucket }>;
    label?: string;
}) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0].payload as PriorityBucket;
    return (
        <div className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs shadow-lg">
            <p className="font-medium text-white mb-1">Priority: {label}</p>
            <p className="text-neutral-300">
                Invoices: <span className="font-semibold">{point.count}</span>
            </p>
            <p className="text-neutral-300">
                Total amount: <span className="font-semibold">{formatCurrency(point.amount)}</span>
            </p>
        </div>
    );
}

export default function DashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [retryCount, setRetryCount] = useState(0);

    const canFetch = !authLoading && !!user && ["admin", "superadmin"].includes(user.role);
    const { data, isFetching, error, refetch } = useGetDashboardAllQuery(undefined, {
        skip: !canFetch,
    });

    const summary = useMemo(() => (data?.summary ?? null) as DashboardSummary | null, [data]);
    const priorityData = useMemo(() => {
        const raw = (data?.priority_breakdown ?? []) as PriorityBucket[];
        const order: Array<PriorityBucket["priority"]> = ["high", "medium", "low"];
        const map = new Map(raw.map((p) => [p.priority, p]));
        return order.map((key) => {
            const base = map.get(key) ?? { priority: key, amount: 0, count: 0 };
            return { ...base };
        });
    }, [data]);
    const loading = isFetching;

    useEffect(() => {
        // Wait for auth so API requests include a valid token
        if (authLoading || !user) return;

        if (user.role === "employee") {
            router.push("/employee/invoices");
            return;
        }

        // Retry button uses retryCount to trigger a refetch
        if (retryCount > 0) {
            refetch();
        }
    }, [user, authLoading, router, retryCount, refetch]);

    // RTK Query uses status === "FETCH_ERROR" for network failures
    const networkError =
        typeof (error as { status?: unknown } | undefined)?.status === "string" &&
        (error as { status?: string }).status === "FETCH_ERROR";

    // Only full-page spinner while auth is resolving
    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Data loading: show layout with skeletons for smooth UX
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i} className="bg-white border-neutral-200">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-8 w-20" />
                                    </div>
                                    <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white border-neutral-200">
                        <CardHeader className="pb-2">
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-64 w-full rounded-lg" />
                        </CardContent>
                    </Card>
                    <Card className="bg-white border-neutral-200">
                        <CardHeader className="pb-2">
                            <Skeleton className="h-5 w-28" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-64 w-full rounded-lg" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    // Network error: backend unreachable (e.g. not running)
    if (networkError) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6">
                <p className="text-neutral-600 text-center max-w-md">
                    Could not connect to the server. Make sure the backend is running at{" "}
                    <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-sm">{apiUrl}</code>
                </p>
                <Button
                    onClick={() => {
                        setRetryCount((c) => c + 1);
                    }}
                    className="bg-jojo-orange hover:bg-jojo-orange/90 text-white"
                >
                    Retry
                </Button>
            </div>
        );
    }

    const kpiCards = [
        {
            title: "Total Invoices",
            value: `${summary?.total_invoices ?? 0}`,
            icon: <FileText size={20} />,
            gradient: "from-jojo-orange/20 to-orange-500/20",
            iconColor: "text-jojo-orange",
            subtitle: "All invoices in the system",
            href: "/invoices",
        },
        {
            title: "Due in 7 Days",
            value: `${summary?.upcoming_7_days_count ?? 0}`,
            icon: <Clock size={20} />,
            gradient: "from-yellow-500/20 to-orange-500/20",
            iconColor: "text-yellow-400",
            subtitle: "Invoices to be paid soon",
            href: "/invoices?status=due_soon",
        },
        {
            title: "Critical Pending",
            value: `${summary?.high_priority_pending_count ?? 0}`,
            icon: <AlertTriangle size={20} />,
            gradient: "from-red-500/20 to-pink-500/20",
            iconColor: "text-red-400",
            subtitle: "High- and critical-priority pending invoices",
            href: "/invoices?sheet_status=Pending&priority=high,critical",
        },
        {
            title: "Approved & Paid",
            value: `${summary?.approved_and_paid_count ?? 0}`,
            icon: <CheckCircle2 size={20} />,
            gradient: "from-blue-500/20 to-indigo-500/20",
            iconColor: "text-blue-400",
            subtitle: "Invoices approved for payment or paid",
            href: "/invoices?sheet_status=Approved%20for%20Release,Paid",
        },
    ];

    return (
        <div className="space-y-6">
            {/* KPI Cards — same height and top alignment */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
                {kpiCards.map((card) => {
                    const cardContent = (
                        <CardContent className="p-5 flex flex-col min-h-[120px] justify-between">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-neutral-600 mb-1">{card.title}</p>
                                    <p className="text-2xl font-bold text-neutral-900">{card.value}</p>
                                    {card.subtitle && (
                                        <p className="text-xs text-neutral-600 mt-1">
                                            {card.subtitle}
                                        </p>
                                    )}
                                </div>
                                <div
                                    className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center ${card.iconColor}`}
                                >
                                    {card.icon}
                                </div>
                            </div>
                        </CardContent>
                    );
                    const hoverClass = "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col";
                    if ("href" in card && card.href) {
                        return (
                            <Link key={card.title} href={card.href} className="block h-full">
                                <Card className={`${hoverClass} cursor-pointer flex flex-col flex-1`}>
                                    {cardContent}
                                </Card>
                            </Link>
                        );
                    }
                    return (
                        <Card key={card.title} className={`${hoverClass} cursor-default flex flex-col flex-1`}>
                            {cardContent}
                        </Card>
                    );
                })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Chart */}
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-neutral-900 text-base flex items-center gap-2">
                            <TrendingUp size={18} className="text-jojo-orange" />
                            Priority Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={priorityData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                                    <XAxis
                                        dataKey="priority"
                                        tickFormatter={(v: PriorityBucket["priority"]) =>
                                            v.charAt(0).toUpperCase() + v.slice(1)
                                        }
                                        tick={{ fill: "#a3a3a3", fontSize: 12 }}
                                        axisLine={{ stroke: "#404040" }}
                                    />
                                    <YAxis
                                        tick={{ fill: "#a3a3a3", fontSize: 12 }}
                                        axisLine={{ stroke: "#404040" }}
                                        tickFormatter={(v) => `${v}`}
                                    />
                                    <Tooltip content={<PriorityTooltip />} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {priorityData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Payment Status Pie */}
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-neutral-900 text-base flex items-center gap-2">
                            <FileText size={18} className="text-jojo-orange" />
                            Invoice Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-5xl font-bold text-neutral-900 mb-2">
                                    {summary?.total_invoices || 0}
                                </div>
                                <p className="text-neutral-600 text-sm mb-4">Total Invoices</p>
                                <div className="flex gap-6 justify-center">
                                    <div>
                                        <div className="text-2xl font-bold text-red-400">
                                            {summary?.overdue_count || 0}
                                        </div>
                                        <p className="text-xs text-neutral-600">Overdue</p>
                                    </div>
                                    <div className="w-px bg-neutral-100" />
                                    <div>
                                        <div className="text-2xl font-bold text-jojo-orange">
                                            {formatCurrency(summary?.paid_this_month || 0)}
                                        </div>
                                        <p className="text-xs text-neutral-600">Paid This Month</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
