"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
    useDeleteInvoiceMutation,
    useHoldInvoiceMutation,
    useListInvoicesQuery,
    useProceedInvoiceMutation,
} from "@/lib/storeApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, FileText, Eye, Trash2, Send, PauseCircle, PlayCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { formatCurrency, statusBadgeStyles, priorityBadgeStyles } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

interface Invoice {
    id: string;
    invoice_number: string | null;
    vendor_name: string | null;
    description: string | null;
    department: string | null;
    total_amount: number | null;
    currency?: string | null;
    due_date: string | null;
    status: string;
    payment_status: string;
    priority: string;
    pdf_url: string | null;
    created_at: string;
    sheet_status?: string | null;
    approved_at?: string | null;
    paid_at?: string | null;
    created_by_name?: string | null;
    remarks?: string | null;
}

const SHEET_STATUSES = ["Pending", "Approved for Release", "Paid", "On Hold"] as const;

export default function InvoicesPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    // Sheet/workflow status filter (single or comma-separated, e.g. "Approved for Release,Paid")
    const [statusFilter, setStatusFilter] = useState<string>(() => {
        const raw = searchParams.get("sheet_status");
        if (!raw) return "";
        if (raw.includes(",")) return raw;
        const normalized = raw.toLowerCase();
        const match = SHEET_STATUSES.find((s) => s.toLowerCase() === normalized);
        return match ?? "";
    });
    // Computed aging status filter (pending / due_soon / overdue / paid)
    const [computedStatusFilter, setComputedStatusFilter] = useState<string>(() => {
        const raw = searchParams.get("status");
        if (!raw) return "";
        const normalized = raw.toLowerCase();
        const allowed = ["pending", "due_soon", "overdue", "paid"];
        return allowed.includes(normalized) ? normalized : "";
    });
    const [priorityFilter, setPriorityFilter] = useState<string>(() => {
        const raw = (searchParams.get("priority") || "").toLowerCase();
        if (!raw) return "";
        if (raw.includes(",")) return raw;
        const allowed = ["low", "medium", "high", "critical"];
        return allowed.includes(raw) ? raw : "";
    });

    // Sync filter state from URL when navigating (e.g. from dashboard card link)
    useEffect(() => {
        const sheet = searchParams.get("sheet_status");
        const status = searchParams.get("status");
        const pri = searchParams.get("priority");
        setStatusFilter(
            sheet == null ? "" : sheet.includes(",") ? sheet : (SHEET_STATUSES.find((s) => s.toLowerCase() === sheet.toLowerCase()) ?? "")
        );
        setComputedStatusFilter(
            status == null ? "" : ["pending", "due_soon", "overdue", "paid"].includes(status.toLowerCase()) ? status.toLowerCase() : ""
        );
        setPriorityFilter(
            pri == null ? "" : pri.includes(",") ? pri.toLowerCase() : (["low", "medium", "high", "critical"].includes(pri.toLowerCase()) ? pri.toLowerCase() : "")
        );
    }, [searchParams]);

    const pageSize = 20;

    const queryParams = useMemo(() => {
        const params: Record<string, string | number> = { page, page_size: pageSize };
        if (search) params.search = search;
        if (statusFilter) params.sheet_status = statusFilter;
        if (computedStatusFilter) params.status = computedStatusFilter;
        if (priorityFilter) params.priority = priorityFilter;
        return params;
    }, [page, pageSize, priorityFilter, search, statusFilter, computedStatusFilter]);

    const shouldSkip = authLoading || !user || user.role === "employee";
    const { data, isFetching, refetch } = useListInvoicesQuery(queryParams, { skip: shouldSkip });
    const invoices = (data?.data ?? []) as Invoice[];
    const total = data?.total ?? 0;

    useEffect(() => {
        if (authLoading || !user) return;
        if (user.role === "employee") {
            router.replace("/upload");
        }
    }, [user, authLoading, router]);

    const handleSearch = () => {
        setPage(1);
        refetch();
    };

    const [deleteInvoice] = useDeleteInvoiceMutation();
    const [proceedInvoice] = useProceedInvoiceMutation();
    const [holdInvoice] = useHoldInvoiceMutation();

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this invoice?")) return;
        try {
            await deleteInvoice(id).unwrap();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
        }
    };

    const handleProceed = async (id: string) => {
        try {
            await proceedInvoice(id).unwrap();
        } catch (error) {
            console.error("Failed to approve invoice:", error);
        }
    };

    const handleToggleHold = async (id: string) => {
        try {
            await holdInvoice(id).unwrap();
        } catch (error) {
            console.error("Failed to toggle hold:", error);
        }
    };

    const totalPages = Math.ceil(total / pageSize);

    const getDaysUntilDue = (due: string | null): number | null => {
        if (!due) return null;
        const dueDate = new Date(due);
        if (Number.isNaN(dueDate.getTime())) return null;
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const diffMs = startOfDue.getTime() - startOfToday.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
    };

    const formatDaysLabel = (due: string | null): string => {
        const days = getDaysUntilDue(due);
        if (days === null) return "—";
        if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
        if (days === 0) return "Due today";
        return `${days} day${days === 1 ? "" : "s"} left`;
    };

    if (authLoading || user?.role === "employee") {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px]">
                <div className="w-8 h-8 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => router.push("/admin/dashboard")}
                    >
                        ← Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Invoices</h1>
                        <p className="text-neutral-600 text-sm mt-1">
                            {isFetching ? "Loading…" : `${total} total invoices`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px] max-w-sm">
                    <Label className="text-xs font-medium text-neutral-600">Search</Label>
                    <div className="flex gap-2 h-10">
                        <div className="relative flex-1 min-w-0">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <Input
                                placeholder="Search by invoice # or vendor..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="h-10 pl-9 bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                                aria-label="Search invoices by invoice number or vendor name"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleSearch}
                            className="h-10 shrink-0 border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        >
                            Search
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-neutral-600">Status</Label>
                    <Select
                        value={statusFilter || "all"}
                        onValueChange={(v) => {
                            const val = v ?? "all";
                            setStatusFilter(val === "all" ? "" : val);
                            // When user manually picks a workflow status, clear any computed status filter
                            setComputedStatusFilter("");
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-10 w-[140px] bg-neutral-50 border-neutral-300 text-neutral-900" aria-label="Filter by status">
                            <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-neutral-300">
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved for Release">Approved</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                            <SelectItem value="Approved for Release,Paid">Approved & Paid</SelectItem>
                            <SelectItem value="On Hold">On Hold</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-neutral-600">Priority</Label>
                    <Select
                        value={priorityFilter || "all"}
                        onValueChange={(v) => {
                            const val = v ?? "all";
                            setPriorityFilter(val === "all" ? "" : val);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-10 w-[140px] bg-neutral-50 border-neutral-300 text-neutral-900" aria-label="Filter by priority">
                            <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-neutral-300">
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high,critical">High & Critical</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table */}
            <Card className="bg-white border-neutral-200">
                <CardContent className="p-0">
                    {/* Mobile cards — match level 3 invoice card design */}
                    <div className="md:hidden p-4 space-y-3">
                        {isFetching ? (
                            <>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                                        <Skeleton className="h-5 w-2/3" />
                                        <Skeleton className="h-4 w-1/2 mt-2" />
                                        <Skeleton className="h-8 w-full mt-3" />
                                    </div>
                                ))}
                            </>
                        ) : invoices.length === 0 ? (
                            <p className="text-center text-neutral-600 py-10 text-sm">No invoices found</p>
                        ) : (
                            invoices.map((inv) => {
                                const flow = (inv.sheet_status || "").trim();
                                const hasSheet = !!flow;
                                const agingLabel =
                                    inv.status === "due_soon" ? "Upcoming" : inv.status.replace("_", " ");
                                const statusLabel = hasSheet ? flow : agingLabel;
                                const statusKey = hasSheet
                                    ? flow.toLowerCase().replaceAll(" ", "_")
                                    : inv.status;
                                const statusClass = statusBadgeStyles[statusKey] || statusBadgeStyles.pending;

                                return (
                                    <div
                                        key={inv.id}
                                        className="rounded-2xl border border-neutral-200 bg-white px-3 py-3 space-y-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                                    >
                                        {/* Top row: invoice + amount */}
                                        <div className="flex justify-between gap-3">
                                            <div className="min-w-0 space-y-0.5">
                                                <p className="text-xs font-semibold text-neutral-900 truncate">
                                                    {inv.invoice_number || "(no number)"}
                                                </p>
                                                <p className="text-[11px] text-neutral-600 line-clamp-2">
                                                    {inv.description || "—"}
                                                </p>
                                            </div>
                                            <p className="text-sm font-semibold tabular-nums text-neutral-900">
                                                {formatCurrency(inv.total_amount, inv.currency)}
                                            </p>
                                        </div>

                                        {/* Due date + days */}
                                        <div className="flex items-center justify-between text-[11px] text-neutral-500">
                                            <span>
                                                Due:{" "}
                                                <span className="font-medium text-neutral-700">
                                                    {inv.due_date || "—"}
                                                </span>
                                            </span>
                                            <span>{formatDaysLabel(inv.due_date)}</span>
                                        </div>

                                        <div className="h-px bg-neutral-100" />

                                        {/* Remarks (mobile card) */}
                                        {inv.remarks && (
                                            <p className="text-[11px] text-neutral-500 line-clamp-2">
                                                Remarks: {inv.remarks}
                                            </p>
                                        )}

                                        {/* Status / priority / added by + actions */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex flex-col items-start gap-1">
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                                    <Badge variant="outline" className={statusClass}>
                                                        {statusLabel}
                                                    </Badge>
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            priorityBadgeStyles[inv.priority] ||
                                                            priorityBadgeStyles.low
                                                        }
                                                    >
                                                        {inv.priority}
                                                    </Badge>
                                                </div>
                                                <span className="text-[11px] text-neutral-600">
                                                    Added by:{" "}
                                                    <span className="font-medium">
                                                        {inv.created_by_name || "—"}
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {["admin", "superadmin"].includes(user?.role || "") &&
                                                    (inv.sheet_status || "Pending") === "Pending" && (
                                                        <Button
                                                            size="icon"
                                                            onClick={() => handleProceed(inv.id)}
                                                            className="h-7 w-7 bg-jojo-orange hover:bg-jojo-orange/90 text-white"
                                                            aria-label="Proceed"
                                                        >
                                                            <Send size={14} />
                                                        </Button>
                                                    )}
                                                {["admin", "superadmin"].includes(user?.role || "") &&
                                                    (inv.sheet_status || "Pending") !== "Paid" && (
                                                        <Button
                                                            size="icon"
                                                            variant="outline"
                                                            onClick={() => handleToggleHold(inv.id)}
                                                            className="h-7 w-7 border-neutral-300 text-neutral-700"
                                                            aria-label={
                                                                (inv.sheet_status || "") === "On Hold"
                                                                    ? "Resume"
                                                                    : "On hold"
                                                            }
                                                        >
                                                            {(inv.sheet_status || "") === "On Hold" ? (
                                                                <PlayCircle size={14} />
                                                            ) : (
                                                                <PauseCircle size={14} />
                                                            )}
                                                        </Button>
                                                    )}
                                                {inv.pdf_url && (
                                                    <Button
                                                        size="icon"
                                                        variant="outline"
                                                        onClick={() => window.open(inv.pdf_url!, "_blank")}
                                                        className="h-7 w-7 border-neutral-300 text-neutral-700"
                                                        aria-label="View PDF"
                                                    >
                                                        <Eye size={14} />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Invoice</th>
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Description</th>
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Due date</th>
                                    <th className="text-right text-neutral-600 font-medium px-4 py-3">Amount</th>
                                    <th className="text-center text-neutral-600 font-medium px-4 py-3">Status</th>
                                    <th className="text-center text-neutral-600 font-medium px-4 py-3">Priority</th>
                                    <th className="text-center text-neutral-600 font-medium px-4 py-3">Added by</th>
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Remarks</th>
                                    <th className="text-right text-neutral-600 font-medium px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isFetching ? (
                                    <>
                                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                            <tr key={i} className="border-b border-neutral-200">
                                                <td className="px-4 py-3" colSpan={9}>
                                                    <Skeleton className="h-5 w-full" />
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                ) : invoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center text-neutral-600 py-12">
                                            No invoices found
                                        </td>
                                    </tr>
                                ) : (
                                    invoices.map((inv) => (
                                        <tr
                                            key={inv.id}
                                            className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors"
                                        >
                                            <td className="px-4 py-3 text-neutral-900 font-medium">
                                                {inv.invoice_number || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-700 max-w-xs">
                                                <span className="line-clamp-2">
                                                    {inv.description || "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600">
                                                <div>{inv.due_date || "—"}</div>
                                                <div className="text-[11px] text-neutral-500">
                                                    {formatDaysLabel(inv.due_date)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-neutral-900 font-medium">
                                                {formatCurrency(inv.total_amount, inv.currency)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {(() => {
                                                    const flow = (inv.sheet_status || "").trim();
                                                    const hasSheet = !!flow;
                                                    const agingLabel =
                                                        inv.status === "due_soon"
                                                            ? "Upcoming"
                                                            : inv.status.replace("_", " ");
                                                    const label = hasSheet ? flow : agingLabel;
                                                    const key = hasSheet
                                                        ? flow.toLowerCase().replaceAll(" ", "_")
                                                        : inv.status;
                                                    const cls =
                                                        statusBadgeStyles[key] || statusBadgeStyles.pending;
                                                    return (
                                                        <Badge variant="outline" className={cls}>
                                                            {label}
                                                        </Badge>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={priorityBadgeStyles[inv.priority] || priorityBadgeStyles.low}
                                                >
                                                    {inv.priority}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center text-neutral-700">
                                                {inv.created_by_name || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600 max-w-[180px]">
                                                <span className="line-clamp-2 text-sm" title={inv.remarks || ""}>
                                                    {inv.remarks || "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                    {inv.pdf_url && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => window.open(inv.pdf_url!, "_blank")}
                                                            className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                                                        >
                                                            <Eye size={14} className="mr-1.5" />
                                                            View
                                                        </Button>
                                                    )}
                                                    {["admin", "superadmin"].includes(user?.role || "") &&
                                                        (inv.sheet_status || "Pending") === "Pending" && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleProceed(inv.id)}
                                                                className="bg-jojo-orange hover:bg-jojo-orange/90 text-white"
                                                            >
                                                                <Send size={14} className="mr-1.5" />
                                                                Proceed
                                                            </Button>
                                                        )}
                                                    {["admin", "superadmin"].includes(user?.role || "") &&
                                                        (inv.sheet_status || "Pending") !== "Paid" && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleToggleHold(inv.id)}
                                                                className="border-neutral-300 text-neutral-700"
                                                            >
                                                                {(inv.sheet_status || "") === "On Hold" ? (
                                                                    <>
                                                                        <PlayCircle size={14} className="mr-1.5" />
                                                                        Resume
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <PauseCircle size={14} className="mr-1.5" />
                                                                        On Hold
                                                                    </>
                                                                )}
                                                            </Button>
                                                        )}
                                                    {user?.role === "superadmin" && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDelete(inv.id)}
                                                            className="border-red-200 text-red-600 hover:bg-red-50"
                                                        >
                                                            <Trash2 size={14} className="mr-1.5" />
                                                            Delete
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                            <p className="text-sm text-neutral-600">
                                Page {page} of {totalPages}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage(page - 1)}
                                    className="border-neutral-300 text-neutral-600"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(page + 1)}
                                    className="border-neutral-300 text-neutral-600"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}


