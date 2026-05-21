"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useListInvoicesQuery, useSubmitAccountsReviewMutation, useRejectAccountsInvoiceMutation } from "@/lib/storeApi";
import type { InvoiceItem } from "@/lib/storeApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { ClipboardList, XCircle } from "lucide-react";

export default function PendingReviewPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [reviewInvoice, setReviewInvoice] = useState<InvoiceItem | null>(null);
    const [priority, setPriority] = useState<string>("low");
    const [remarks, setRemarks] = useState("");
    const [submitLoading, setSubmitLoading] = useState(false);
    const [rejectLoading, setRejectLoading] = useState(false);
    const [dialogError, setDialogError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (!user || user.role !== "employee") {
            router.replace("/login");
            return;
        }
        if ((user.department || "").toLowerCase() !== "accounts") {
            router.replace("/employee/invoices");
        }
    }, [authLoading, user, router]);

    const isAccounts = (user?.department || "").toLowerCase() === "accounts";
    const shouldSkip = authLoading || !user || user.role !== "employee" || !isAccounts;

    const { data, isFetching } = useListInvoicesQuery(
        {
            page: 1,
            page_size: 100,
            sort_by: "created_at",
            sort_order: "desc",
            awaiting_accounts_review: true,
        },
        { skip: shouldSkip },
    );

    const pendingInvoices = (data?.data ?? []) as InvoiceItem[];

    const [submitReview] = useSubmitAccountsReviewMutation();
    const [rejectInvoice] = useRejectAccountsInvoiceMutation();

    const openReview = (inv: InvoiceItem) => {
        setReviewInvoice(inv);
        setPriority("low");
        setRemarks("");
        setDialogError(null);
    };

    const handleSubmitReview = async () => {
        if (!reviewInvoice) return;
        const trimmedRemarks = remarks.trim();
        if (!trimmedRemarks) {
            setDialogError("Remarks are required.");
            return;
        }
        setDialogError(null);
        setSubmitLoading(true);
        try {
            await submitReview({
                invoiceId: reviewInvoice.id,
                priority,
                remarks: trimmedRemarks,
            }).unwrap();
            setReviewInvoice(null);
        } catch (err: unknown) {
            const data = (err as { data?: { detail?: string | Array<{ msg?: string }> } })?.data;
            let msg: string | null = null;
            if (typeof data?.detail === "string") msg = data.detail;
            else if (Array.isArray(data?.detail) && data.detail.length > 0)
                msg = data.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
            setDialogError(msg || (err as Error)?.message || "Failed to submit review.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleReject = async () => {
        if (!reviewInvoice) return;
        setDialogError(null);
        setRejectLoading(true);
        try {
            await rejectInvoice({
                invoiceId: reviewInvoice.id,
                remarks: remarks.trim() || undefined,
            }).unwrap();
            setReviewInvoice(null);
        } catch (err: unknown) {
            const data = (err as { data?: { detail?: string | Array<{ msg?: string }> } })?.data;
            let msg: string | null = null;
            if (typeof data?.detail === "string") msg = data.detail;
            else if (Array.isArray(data?.detail) && data.detail.length > 0)
                msg = data.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
            setDialogError(msg || (err as Error)?.message || "Failed to reject invoice.");
        } finally {
            setRejectLoading(false);
        }
    };

    if (authLoading || shouldSkip) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px]">
                <div className="w-10 h-10 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                        Pending Accounts Review
                    </h1>
                    <p className="text-neutral-600 text-sm">
                        {isFetching
                            ? "Loading…"
                            : `${pendingInvoices.length} invoice${pendingInvoices.length !== 1 ? "s" : ""} awaiting your review`}
                    </p>
                </div>
            </div>

            {pendingInvoices.length === 0 ? (
                <Card className="bg-white border-neutral-200">
                    <CardContent className="py-12 text-center text-neutral-500">
                        <ClipboardList className="mx-auto h-12 w-12 text-neutral-300 mb-3" />
                        <p>No invoices awaiting review.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-neutral-900 text-base">Review and set priority + remarks</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 bg-neutral-50/80">
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Invoice #</th>
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Vendor</th>
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Company</th>
                                        <th className="text-right py-3 px-4 font-medium text-neutral-700">Amount</th>
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Due date</th>
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Description</th>
                                        <th className="text-left py-3 px-4 font-medium text-neutral-700">Created by</th>
                                        <th className="text-right py-3 px-4 font-medium text-neutral-700">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingInvoices.map((inv) => (
                                        <tr key={inv.id} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                                            <td className="py-3 px-4 text-neutral-900">{inv.invoice_number || "—"}</td>
                                            <td className="py-3 px-4 text-neutral-700">{inv.vendor_name || "—"}</td>
                                            <td className="py-3 px-4 text-neutral-700">{inv.company_name || "—"}</td>
                                            <td className="py-3 px-4 text-right font-medium">
                                                {formatCurrency(inv.total_amount, inv.currency)}
                                            </td>
                                            <td className="py-3 px-4 text-neutral-700">{inv.due_date || "—"}</td>
                                            <td className="py-3 px-4 text-neutral-600 max-w-[200px] truncate" title={inv.description || ""}>
                                                {inv.description || "—"}
                                            </td>
                                            <td className="py-3 px-4 text-neutral-600">{inv.created_by_name || "—"}</td>
                                            <td className="py-3 px-4 text-right">
                                                <Button
                                                    size="sm"
                                                    className="bg-jojo-orange hover:bg-jojo-orange/90 text-black font-medium"
                                                    onClick={() => openReview(inv)}
                                                >
                                                    Review
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog
                open={!!reviewInvoice}
                onOpenChange={(open) => {
                    if (!open) {
                        setReviewInvoice(null);
                        setDialogError(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            Set priority & remarks
                            {reviewInvoice && (
                                <span className="text-neutral-500 font-normal ml-2">
                                    {reviewInvoice.invoice_number || reviewInvoice.id}
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    {dialogError && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                            {dialogError}
                        </div>
                    )}
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Priority *</Label>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger className="bg-neutral-50 border-neutral-300">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Remarks *</Label>
                            <textarea
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="Review notes..."
                                className="flex w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm min-h-[80px]"
                                rows={3}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 flex-wrap">
                        <Button variant="outline" onClick={() => setReviewInvoice(null)} disabled={submitLoading || rejectLoading}>
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => void handleReject()}
                            disabled={submitLoading || rejectLoading}
                        >
                            <XCircle size={14} className="mr-1.5" />
                            {rejectLoading ? "Rejecting…" : "Reject"}
                        </Button>
                        <Button
                            className="bg-jojo-orange hover:bg-jojo-orange/90 text-black font-medium"
                            onClick={() => void handleSubmitReview()}
                            disabled={submitLoading || rejectLoading || !remarks.trim()}
                        >
                            {submitLoading ? "Saving…" : "Submit review"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
