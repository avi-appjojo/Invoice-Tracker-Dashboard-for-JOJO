"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useGetDashboardAllQuery } from "@/lib/storeApi";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/layout/mobile-nav";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, AlertTriangle, Clock, ArrowRight } from "lucide-react";

export function Header() {
    const { user } = useAuth();
    const pathname = usePathname();

    const canSeeNotifications = user && ["admin", "superadmin"].includes(user.role);

    const { data, isFetching } = useGetDashboardAllQuery(undefined, {
        skip: !canSeeNotifications,
    });

    const overdueCount = useMemo(() => data?.summary?.overdue_count ?? 0, [data]);
    const upcomingCount = useMemo(() => data?.upcoming?.length ?? 0, [data]);
    const loading = isFetching;

    const totalNotifications = overdueCount + upcomingCount;

    const title =
        pathname?.startsWith("/admin/dashboard")
            ? "Dashboard"
            : pathname?.startsWith("/employee/dashboard")
                ? "Add Invoice"
                : pathname === "/invoices"
                    ? "Invoices"
                    : "Invoice Tracker";

    return (
        <header className="h-14 sm:h-16 border-b border-neutral-200 bg-white/90 supports-backdrop-filter:backdrop-blur-sm flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">
            <div className="flex items-center gap-2 min-w-0">
                <MobileNav />
                <h1 className="text-base sm:text-lg font-semibold text-neutral-900 truncate">
                    {title}
                </h1>
            </div>
            <div className="flex items-center gap-4">
                {canSeeNotifications ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className="relative p-1.5 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors border-0 bg-transparent cursor-pointer"
                            aria-label={
                                totalNotifications > 0
                                    ? `${totalNotifications} notifications`
                                    : "Notifications"
                            }
                        >
                            <Bell size={20} />
                            {totalNotifications > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
                                    {totalNotifications > 99 ? "99+" : totalNotifications}
                                </span>
                            )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <div className="px-2 py-2 border-b border-neutral-200">
                                <p className="text-sm font-medium text-neutral-900">
                                    Notifications
                                </p>
                            </div>
                            {loading ? (
                                <div className="px-3 py-4 text-sm text-neutral-500">
                                    Loading…
                                </div>
                            ) : totalNotifications === 0 ? (
                                <div className="px-3 py-4 text-sm text-neutral-500">
                                    No new notifications
                                </div>
                            ) : (
                                <>
                                    {overdueCount > 0 && (
                                        <DropdownMenuItem
                                            onClick={() => (window.location.href = "/alerts")}
                                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                                        >
                                                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                                    <AlertTriangle size={16} className="text-red-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-neutral-900">
                                                        {overdueCount} overdue invoice
                                                        {overdueCount !== 1 ? "s" : ""}
                                                    </p>
                                                    <p className="text-xs text-neutral-500">
                                                        Requires attention
                                                    </p>
                                                </div>
                                        </DropdownMenuItem>
                                    )}
                                    {upcomingCount > 0 && (
                                        <DropdownMenuItem
                                            onClick={() => (window.location.href = "/alerts")}
                                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                                        >
                                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                                    <Clock size={16} className="text-amber-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-neutral-900">
                                                        {upcomingCount} upcoming payment
                                                        {upcomingCount !== 1 ? "s" : ""}
                                                    </p>
                                                    <p className="text-xs text-neutral-500">
                                                        Due in next 30 days
                                                    </p>
                                                </div>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => (window.location.href = "/alerts")}
                                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-jojo-orange font-medium cursor-pointer"
                                    >
                                            View all alerts
                                            <ArrowRight size={14} />
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        type="button"
                        className="relative p-1.5 text-neutral-600 hover:text-neutral-900 transition-colors"
                        aria-label="Notifications"
                    >
                        <Bell size={20} />
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-jojo-orange to-orange-500 flex items-center justify-center text-sm font-bold text-black">
                        {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div className="hidden sm:block text-right">
                        <p className="text-sm font-medium text-neutral-900">
                            {user?.name || "User"}
                        </p>
                        <Badge
                            variant="outline"
                            className="text-[10px] capitalize border-jojo-orange/30 text-orange-600"
                        >
                            {user?.role || "employee"}
                        </Badge>
                    </div>
                </div>
            </div>
        </header>
    );
}
