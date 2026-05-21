"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, statusBadgeStyles, priorityBadgeStyles } from "@/lib/format";
import {
    useCreateInvoiceMutation,
    useCreatePaymentMutation,
    useDeleteInvoiceMutation,
    useHoldInvoiceMutation,
    useListInvoicesQuery,
    useListVendorsQuery,
    useListCompaniesQuery,
    useProceedInvoiceMutation,
    useUpdateInvoiceMutation,
} from "@/lib/storeApi";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Pencil, Trash2, PauseCircle, PlayCircle, Send, CreditCard } from "lucide-react";

type InvoiceItem = {
    id: string;
    invoice_number: string | null;
    vendor_name: string | null;
    company_name?: string | null;
    total_amount: number | null;
    currency?: string | null;
    description?: string | null;
    priority?: string | null;
    upload_date?: string | null;
    due_date: string | null;
    sheet_status?: string | null;
    pay_cycle?: string | null;
    approved_at?: string | null;
    paid_at?: string | null;
    accounts_reviewed_at?: string | null;
};

type UploadPageVariant = "full" | "list-only";

type InvoiceFormPayload = {
    invoice_number: string;
    vendor_name: string;
    company_name: string;
    total_amount: number;
    currency: "INR" | "USD";
    due_date: string;
    sheet_status: string;
    pay_cycle: string;
    priority: string;
    description: string;
};

export default function UploadPage({ variant = "full" }: { variant?: UploadPageVariant }) {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const role = user?.role ?? "employee";

    useEffect(() => {
        if (authLoading) return;
        // Admins should not use the employee Add Invoice dashboard.
        if (user && user.role !== "employee") {
            router.replace("/admin/dashboard");
        }
    }, [user, authLoading, router]);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [payDialogOpen, setPayDialogOpen] = useState(false);
    const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
    const [payInvoiceCurrency, setPayInvoiceCurrency] = useState<"INR" | "USD">("INR");
    const [payAmount, setPayAmount] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
    const [referenceNumber, setReferenceNumber] = useState("");
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [paymentNotes, setPaymentNotes] = useState("");
    const [payLoading, setPayLoading] = useState(false);

    // Filters (used mainly on employee invoices list page)
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "paid" | "on_hold">("all");

    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [vendor, setVendor] = useState("");
    const [company, setCompany] = useState("");
    const [amount, setAmount] = useState<string>("");
    const [currency, setCurrency] = useState<"INR" | "USD">("INR");
    const [dueDate, setDueDate] = useState(today);
    const [status, setStatus] = useState<string>("Pending");
    const [payCycle, setPayCycle] = useState<string>("30");
    const [priority, setPriority] = useState<string>("low");
    const [remark, setRemark] = useState<string>("");

    const shouldSkipList = authLoading || !user || user.role !== "employee";
    const { data: vendorsData } = useListVendorsQuery(undefined, { skip: shouldSkipList });
    const { data: companiesData } = useListCompaniesQuery(undefined, { skip: shouldSkipList });
    const vendorsList = (vendorsData?.data ?? []).filter((v) => (v as { status?: string }).status !== "inactive");
    const companiesList = (companiesData ?? []).filter((c) => c.is_active);
    // When editing, include current vendor/company in options if not in list (e.g. inactive)
    const vendors = useMemo(() => {
        if (!editingId || !vendor.trim()) return vendorsList;
        if (vendorsList.some((v) => v.vendor_name === vendor)) return vendorsList;
        return [{ id: "__current__", vendor_name: vendor } as const, ...vendorsList];
    }, [editingId, vendor, vendorsList]);
    const companies = useMemo(() => {
        if (!editingId || !company.trim()) return companiesList;
        if (companiesList.some((c) => c.name === company || (c.display_name ?? c.name) === company)) return companiesList;
        return [{ id: "__current__", name: company, display_name: company, is_active: true } as const, ...companiesList];
    }, [editingId, company, companiesList]);

    const { data, isFetching, error: listError, refetch } = useListInvoicesQuery(
        {
            page: 1,
            page_size: 100,
            sort_by: "created_at",
            sort_order: "desc",
        },
        { skip: shouldSkipList },
    );
    const items = (data?.data ?? []) as InvoiceItem[];
    const loading = isFetching;
    const isAccounts = (user?.department || "").toLowerCase() === "accounts";
    // Match Pending review page: only Pending + not yet accounts-reviewed
    const awaitingReviewCount = useMemo(
        () =>
            items.filter(
                (inv) =>
                    !inv.accounts_reviewed_at &&
                    (inv.sheet_status || "").toLowerCase() === "pending",
            ).length,
        [items],
    );

    const resetForm = () => {
        setEditingId(null);
        setInvoiceNumber("");
        setVendor("");
        setCompany("");
        setAmount("");
        setCurrency("INR");
        setDueDate(today);
        setStatus("Pending");
        setPayCycle("30");
        setPriority("low");
        setRemark("");
    };

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmPayload, setConfirmPayload] = useState<InvoiceFormPayload | null>(null);
    const [confirmMode, setConfirmMode] = useState<"create" | "update">("create");
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);

    const canUseActions = role === "admin" || role === "superadmin" || (role === "employee" && isAccounts);
    const canSetOnHold = canUseActions;
    const canAdminProceed = role === "admin" || role === "superadmin";

    const startEdit = (inv: InvoiceItem) => {
        setEditingId(inv.id);
        setInvoiceNumber(inv.invoice_number || "");
        setVendor(inv.vendor_name || "");
        setCompany(inv.company_name || "");
        setAmount(String(inv.total_amount ?? ""));
        setCurrency((inv.currency || "INR") === "USD" ? "USD" : "INR");
        setDueDate(inv.due_date || today);
        setStatus(inv.sheet_status || "Pending");
        setPayCycle(inv.pay_cycle || "30");
        setPriority((inv.priority || "low").toLowerCase());
        setRemark(inv.description || "");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const [updateInvoice] = useUpdateInvoiceMutation();
    const [createInvoice] = useCreateInvoiceMutation();
    const [deleteInvoice] = useDeleteInvoiceMutation();
    const [proceedInvoice] = useProceedInvoiceMutation();
    const [holdInvoice] = useHoldInvoiceMutation();
    const [createPayment] = useCreatePaymentMutation();

    const save = async () => {
        const payCycleNum = Number(payCycle);
        const amountNum = Number(amount);
        const isCreate = !editingId;
        if (
            !invoiceNumber.trim() ||
            !vendor.trim() ||
            !company.trim() ||
            !amount.trim() ||
            !Number.isFinite(amountNum) ||
            amountNum <= 0 ||
            !dueDate ||
            !payCycle.trim() ||
            !Number.isFinite(payCycleNum) ||
            payCycleNum <= 0 ||
            (!isCreate && !priority.trim()) ||
            !remark.trim()
        ) {
            return;
        }
        const payload: InvoiceFormPayload = {
            invoice_number: invoiceNumber.trim(),
            vendor_name: vendor.trim(),
            company_name: company.trim(),
            total_amount: amountNum,
            currency,
            due_date: dueDate,
            sheet_status: status,
            pay_cycle: payCycle,
            priority: isCreate ? "low" : priority,
            description: remark.trim(),
        };
        setConfirmMode(editingId ? "update" : "create");
        setConfirmPayload(payload);
        setConfirmOpen(true);
    };

    const remove = async (id: string) => {
        await deleteInvoice(id).unwrap();
        await refetch();
    };

    const proceed = async (inv: InvoiceItem) => {
        if (!canAdminProceed || (inv.sheet_status || "Pending") !== "Pending") return;
        await proceedInvoice(inv.id).unwrap();
        await refetch();
    };

    const toggleOnHold = async (inv: InvoiceItem) => {
        if (!canSetOnHold) return;
        await holdInvoice(inv.id).unwrap();
        await refetch();
    };

    const markPaid = async (inv: InvoiceItem) => {
        if (role !== "employee" || (inv.sheet_status || "") !== "Approved for Release") return;
        setPayInvoiceId(inv.id);
        setPayInvoiceCurrency((inv.currency || "INR").trim().toUpperCase() === "USD" ? "USD" : "INR");
        setPayAmount(String(inv.total_amount ?? 0));
        setPaymentMethod("bank_transfer");
        setReferenceNumber("");
        setPaymentDate(new Date().toISOString().slice(0, 10));
        setPaymentNotes("");
        setPayDialogOpen(true);
    };

    const submitPayment = async () => {
        if (!payInvoiceId || !payAmount) return;
        setPayLoading(true);
        try {
            await createPayment({
                invoice_id: payInvoiceId,
                amount_paid: Number(payAmount),
                payment_method: paymentMethod || undefined,
                reference_number: referenceNumber.trim() || undefined,
                payment_date: paymentDate || undefined,
                notes: paymentNotes.trim() || undefined,
            }).unwrap();
            setPayDialogOpen(false);
            setPayInvoiceId(null);
            await refetch();
        } finally {
            setPayLoading(false);
        }
    };

    const handleConfirmSave = async () => {
        if (!confirmPayload) return;
        setConfirmLoading(true);
        setConfirmError(null);
        try {
            if (confirmMode === "update" && editingId) {
                await updateInvoice({ id: editingId, body: confirmPayload }).unwrap();
            } else {
                const { priority: _p, ...createBody } = confirmPayload;
                await createInvoice(createBody as InvoiceFormPayload).unwrap();
                setSubmitSuccessMessage("Invoice submitted; it will appear in your list after Accounts review.");
                setTimeout(() => setSubmitSuccessMessage(null), 6000);
            }
            await refetch();
            resetForm();
            setConfirmOpen(false);
            setConfirmPayload(null);
        } catch (err: unknown) {
            const data = (err as { data?: { detail?: string | Array<{ msg?: string }> } })?.data;
            let message: string | null = null;
            if (typeof data?.detail === "string") message = data.detail;
            else if (Array.isArray(data?.detail) && data.detail.length > 0)
                message = data.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
            const msg = (err as Error)?.message;
            setConfirmError(message || msg || "Failed to save invoice. Please try again.");
        } finally {
            setConfirmLoading(false);
        }
    };

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        return items.filter((inv) => {
            const sheetStatus = (inv.sheet_status || "Pending").toLowerCase();
            if (
                statusFilter === "pending" &&
                sheetStatus !== "pending"
            ) {
                return false;
            }
            if (
                statusFilter === "approved" &&
                sheetStatus !== "approved for release"
            ) {
                return false;
            }
            if (statusFilter === "paid" && sheetStatus !== "paid") {
                return false;
            }
            if (statusFilter === "on_hold" && sheetStatus !== "on hold") {
                return false;
            }
            if (!term) return true;
            const vendor = (inv.vendor_name || "").toLowerCase();
            const invoiceNo = (inv.invoice_number || "").toLowerCase();
            return vendor.includes(term) || invoiceNo.includes(term);
        });
    }, [items, search, statusFilter]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[200px]">
                <div className="w-8 h-8 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (listError && !shouldSkipList) {
        const errMsg =
            typeof (listError as { data?: { detail?: string } })?.data?.detail === "string"
                ? (listError as { data: { detail: string } }).data.detail
                : (listError as Error)?.message || "Failed to load invoices.";
        return (
            <div className="max-w-5xl mx-auto space-y-6">
                <Card className="bg-white border-red-200">
                    <CardContent className="py-8 text-center">
                        <p className="text-red-600 font-medium">Could not load invoices</p>
                        <p className="text-sm text-neutral-600 mt-1">{errMsg}</p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => void refetch()}
                        >
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {variant === "full" && (
                <>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-neutral-900">
                                {role === "employee" ? "Add Invoice" : "Invoice Actions"}
                            </h1>
                            <p className="text-neutral-600 text-sm mt-1">
                                {role === "employee"
                                    ? "Enter invoice details. This will save to MongoDB."
                                    : "Review pending invoices and proceed payments from your phone."}
                            </p>
                            {submitSuccessMessage && (
                                <p className="text-sm text-green-600 mt-2 font-medium">{submitSuccessMessage}</p>
                            )}
                        </div>
                        <Badge variant="outline" className="text-[11px] capitalize border-neutral-300 text-neutral-700 bg-white">
                            live
                        </Badge>
                    </div>

                    {role === "employee" && isAccounts && awaitingReviewCount > 0 && (
                        <Button
                            variant="outline"
                            className="w-full sm:w-auto border-jojo-orange text-jojo-orange hover:bg-jojo-orange/10"
                            onClick={() => router.push("/employee/pending-review")}
                        >
                            {awaitingReviewCount} invoice{awaitingReviewCount !== 1 ? "s" : ""} awaiting your review →
                        </Button>
                    )}

                    {/* Entry form (employee-first) */}
                    <Card className="bg-white border-neutral-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-neutral-900 text-base flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-jojo-orange" />
                                {editingId ? "Edit invoice" : "New invoice"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-neutral-600">Invoice Number *</Label>
                                    <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="bg-neutral-50 border-neutral-300" placeholder="INV-001" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-neutral-600">Vendor *</Label>
                                    <Select
                                        value={vendor === "" ? "__empty__" : vendor}
                                        onValueChange={(v) => setVendor(v === "__empty__" ? "" : v)}
                                    >
                                        <SelectTrigger className="bg-neutral-50 border-neutral-300 w-full">
                                            <SelectValue placeholder="Select vendor" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-neutral-300">
                                            <SelectItem value="__empty__">Select vendor</SelectItem>
                                            {vendors.length === 0 ? (
                                                <SelectItem value="__none__" disabled>
                                                    No vendors added yet
                                                </SelectItem>
                                            ) : (
                                                vendors.map((v) => (
                                                    <SelectItem key={v.id} value={v.vendor_name}>
                                                        {v.vendor_name}
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-neutral-600">Company *</Label>
                                    <Select
                                        value={company === "" ? "__empty__" : company}
                                        onValueChange={(v) => setCompany(v === "__empty__" ? "" : v)}
                                    >
                                        <SelectTrigger className="bg-neutral-50 border-neutral-300 w-full">
                                            <SelectValue placeholder="Select company" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-neutral-300">
                                            <SelectItem value="__empty__">Select company</SelectItem>
                                            {companies.length === 0 ? (
                                                <SelectItem value="__none__" disabled>
                                                    No companies added yet
                                                </SelectItem>
                                            ) : (
                                                companies.map((c) => (
                                                    <SelectItem key={c.id} value={c.name}>
                                                        {c.display_name ?? c.name}
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className="text-xs font-medium text-neutral-600">Amount *</Label>
                                        <div className="inline-flex items-center rounded-full bg-neutral-100 p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setCurrency("INR")}
                                                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                                    currency === "INR"
                                                        ? "bg-white text-neutral-900 shadow-sm"
                                                        : "text-neutral-500"
                                                }`}
                                            >
                                                ₹
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCurrency("USD")}
                                                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                                    currency === "USD"
                                                        ? "bg-white text-neutral-900 shadow-sm"
                                                        : "text-neutral-500"
                                                }`}
                                            >
                                                $
                                            </button>
                                        </div>
                                    </div>
                                    <Input
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        type="number"
                                        min={0}
                                        className="bg-neutral-50 border-neutral-300"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-neutral-600">Due Date *</Label>
                                    <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" className="bg-neutral-50 border-neutral-300" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-neutral-600">Pay Cycle *</Label>
                                    <Input
                                        value={payCycle}
                                        onChange={(e) => setPayCycle(e.target.value)}
                                        type="number"
                                        min={1}
                                        className="bg-neutral-50 border-neutral-300"
                                        placeholder="e.g. 30"
                                    />
                                </div>

                                {editingId && (
                                    <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                        <Label className="text-xs font-medium text-neutral-600">Priority</Label>
                                        <Select value={priority} onValueChange={(v) => setPriority((v as string) ?? "low")}>
                                            <SelectTrigger className="bg-neutral-50 border-neutral-300 w-full">
                                                <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border-neutral-300">
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                                <SelectItem value="critical">Critical</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-neutral-500">Set by Accounts when they review.</p>
                                    </div>
                                )}

                                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                    <Label className="text-xs font-medium text-neutral-600">Description (what is this invoice?) *</Label>
                                    <Input
                                        value={remark}
                                        onChange={(e) => setRemark(e.target.value)}
                                        className="bg-neutral-50 border-neutral-300"
                                        placeholder="Brief description of what this invoice is for"
                                    />
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                                {editingId && (
                                    <Button variant="outline" className="border-neutral-300 text-neutral-700" onClick={resetForm}>
                                        Cancel
                                    </Button>
                                )}
                                <Button
                                    onClick={() => void save()}
                                    className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                                    disabled={
                                        !invoiceNumber.trim() ||
                                        !vendor.trim() ||
                                        !company.trim() ||
                                        !amount.trim() ||
                                        !Number.isFinite(Number(amount)) ||
                                        Number(amount) <= 0 ||
                                        !dueDate ||
                                        !payCycle.trim() ||
                                        !Number.isFinite(Number(payCycle)) ||
                                        Number(payCycle) <= 0 ||
                                        (!!editingId && !priority.trim()) ||
                                        !remark.trim()
                                    }
                                >
                                    {editingId ? "Save changes" : "Add invoice"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* List (shared, used on employee invoices page only) */}
            {variant === "list-only" && (
                <Card className="bg-white border-neutral-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-neutral-900 text-base mb-2">Invoices</CardTitle>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <div className="flex-1 min-w-[160px]">
                                <Label className="text-[11px] font-medium text-neutral-600">Search</Label>
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Vendor or invoice no."
                                    className="h-9 text-sm bg-neutral-50 border-neutral-300"
                                />
                            </div>
                            <div className="w-full sm:w-44">
                                <Label className="text-[11px] font-medium text-neutral-600 mb-1 block">
                                    Status
                                </Label>
                                <Select
                                    value={statusFilter}
                                    onValueChange={(v) =>
                                        setStatusFilter((v as typeof statusFilter) || "all")
                                    }
                                >
                                    <SelectTrigger className="h-9 bg-neutral-50 border-neutral-300 text-sm">
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-neutral-300 shadow-lg">
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="paid">Paid</SelectItem>
                                        <SelectItem value="on_hold">On Hold</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {loading ? (
                            <p className="text-sm text-neutral-600 text-center py-10">Loading…</p>
                        ) : filteredItems.length === 0 ? (
                            <p className="text-sm text-neutral-600 text-center py-10">
                                No invoices match your filters.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {filteredItems.map((inv) => {
                                    const sheetStatus = inv.sheet_status || "Pending";
                                    const isPending = sheetStatus === "Pending";
                                    const canProceed = canAdminProceed && isPending;
                                    const canHold = canSetOnHold && sheetStatus !== "Paid";
                                    const canPay = role === "employee" && isAccounts && sheetStatus === "Approved for Release";
                                    return (
                                        <div
                                            key={inv.id}
                                            className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-neutral-900 truncate">
                                                        {inv.vendor_name || "—"}
                                                    </p>
                                                    <p className="text-xs text-neutral-600 mt-0.5 truncate">
                                                        Invoice: <span className="font-medium">{inv.invoice_number || "—"}</span>
                                                    </p>
                                                    <p className="text-xs text-neutral-600 mt-0.5">
                                                        Due: <span className="font-medium">{inv.due_date || "—"}</span>
                                                    </p>
                                                    {(inv.approved_at || inv.paid_at) && (
                                                        <div className="mt-1 space-y-0.5">
                                                            {inv.approved_at && (
                                                                <p className="text-[11px] text-neutral-600">
                                                                    Approved on{" "}
                                                                    <span className="font-medium">
                                                                        {new Date(inv.approved_at).toLocaleString()}
                                                                    </span>
                                                                </p>
                                                            )}
                                                            {inv.paid_at && (
                                                                <p className="text-[11px] text-neutral-600">
                                                                    Paid on{" "}
                                                                    <span className="font-medium">
                                                                        {new Date(inv.paid_at).toLocaleString()}
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-semibold text-neutral-900">
                                                        {formatCurrency(inv.total_amount ?? 0, inv.currency)}
                                                    </p>
                                                    <div className="flex items-center justify-end gap-2 mt-1">
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                sheetStatus === "Approved for Release"
                                                                    ? "bg-blue-500/10 text-blue-700 border-blue-500/20"
                                                                    : sheetStatus === "On Hold"
                                                                        ? "bg-neutral-500/10 text-neutral-700 border-neutral-500/20"
                                                                        : statusBadgeStyles[sheetStatus.toLowerCase().replaceAll(" ", "_")] || statusBadgeStyles.pending
                                                            }
                                                        >
                                                            {sheetStatus}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                                {canUseActions && (
                                                    <Button
                                                        variant="outline"
                                                        className="border-neutral-300 text-neutral-700"
                                                        onClick={() => startEdit(inv)}
                                                    >
                                                        <Pencil size={14} className="mr-1.5" />
                                                        Edit
                                                    </Button>
                                                )}

                                                {canProceed && (
                                                    <Button
                                                        onClick={() => void proceed(inv)}
                                                        className="bg-jojo-orange hover:bg-jojo-orange/90 text-white"
                                                    >
                                                        <Send size={14} className="mr-1.5" />
                                                        Proceed
                                                    </Button>
                                                )}

                                                {canPay && (
                                                    <Button
                                                        onClick={() => void markPaid(inv)}
                                                        className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                                                    >
                                                        Mark Paid
                                                    </Button>
                                                )}

                                                {canHold && (
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => void toggleOnHold(inv)}
                                                        className="border-neutral-300 text-neutral-700"
                                                    >
                                                        {sheetStatus === "On Hold" ? (
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

                                                {canUseActions && (
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => void remove(inv.id)}
                                                        className="border-red-200 text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 size={14} className="mr-1.5" />
                                                        Delete
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Payment entry (EMPLOYEE only) */}
            <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
                <DialogContent className="bg-white border-neutral-200 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-neutral-900 flex items-center gap-2">
                            <CreditCard size={18} className="text-jojo-orange" />
                            Record payment
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-neutral-700">Amount paid ({payInvoiceCurrency === "USD" ? "$" : "₹"}) *</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-700">Payment method</Label>
                            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v || "bank_transfer")}>
                                <SelectTrigger className="bg-neutral-50 border-neutral-300 text-neutral-900">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-neutral-300">
                                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                                    <SelectItem value="upi">UPI</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-700">Reference number (optional)</Label>
                            <Input
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                placeholder="Transaction ID, cheque no., etc."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-700">Payment date</Label>
                            <Input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-700">Notes (optional)</Label>
                            <Input
                                value={paymentNotes}
                                onChange={(e) => setPaymentNotes(e.target.value)}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                placeholder="Any notes"
                            />
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                            <Button
                                variant="ghost"
                                onClick={() => setPayDialogOpen(false)}
                                className="text-neutral-600"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void submitPayment()}
                                disabled={payLoading || !payAmount}
                                className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                            >
                                {payLoading ? "Recording…" : "Record payment"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Confirm save dialog (employee add/edit invoice) */}
            <Dialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    if (!confirmLoading) {
                        setConfirmOpen(open);
                        if (!open) setConfirmError(null);
                    }
                }}
            >
                <DialogContent className="bg-white border-neutral-200 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-neutral-900 text-base">
                            {confirmMode === "update" ? "Confirm changes" : "Confirm new invoice"}
                        </DialogTitle>
                    </DialogHeader>
                    {confirmError && (
                        <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                            {confirmError}
                        </div>
                    )}
                    {confirmPayload && (
                        <div className="mt-2 space-y-1.5 text-sm text-neutral-800">
                            <p>
                                <span className="font-medium">Invoice Number:</span>{" "}
                                {confirmPayload.invoice_number}
                            </p>
                            <p>
                                <span className="font-medium">Vendor:</span>{" "}
                                {confirmPayload.vendor_name}
                            </p>
                            <p>
                                <span className="font-medium">Company:</span>{" "}
                                {confirmPayload.company_name}
                            </p>
                            <p>
                                <span className="font-medium">Amount:</span>{" "}
                                {(confirmPayload.currency === "USD" ? "$" : "₹") +
                                    confirmPayload.total_amount.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                            </p>
                            <p>
                                <span className="font-medium">Due Date:</span>{" "}
                                {confirmPayload.due_date}
                            </p>
                            <p>
                                <span className="font-medium">Pay Cycle:</span>{" "}
                                {confirmPayload.pay_cycle}
                            </p>
                            {confirmMode === "update" && (
                                <p>
                                    <span className="font-medium">Priority:</span>{" "}
                                    {confirmPayload.priority}
                                </p>
                            )}
                            <p>
                                <span className="font-medium">Description:</span>{" "}
                                {confirmPayload.description}
                            </p>
                        </div>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-neutral-600"
                            disabled={confirmLoading}
                            onClick={() => setConfirmOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleConfirmSave()}
                            className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                            disabled={confirmLoading}
                        >
                            {confirmLoading ? "Saving…" : "Confirm & save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
