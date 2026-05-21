"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  useHoldInvoiceMutation,
  useListInvoicesQuery,
  useMarkInvoicePaidMutation,
  useSoftDeleteInvoiceMutation,
  useUpdateInvoiceMutation,
} from "@/lib/storeApi";
import { formatCurrency, statusBadgeStyles, priorityBadgeStyles } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import { Pencil, Trash2, PauseCircle, PlayCircle, CheckCircle2 } from "lucide-react";

type VendorInvoice = {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  company_name: string | null;
  description: string | null;
  total_amount: number | null;
  currency?: string | null;
  amount?: number | null;
  tax_amount?: number | null;
  status: string | null;
  priority: string | null;
  sheet_status?: string | null;
  due_date: string | null;
  invoice_date?: string | null;
  pay_cycle?: string | null;
};

export default function EmployeeVendorInvoicesPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ company: string; vendor: string }>();
  const router = useRouter();

  const [processingId, setProcessingId] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<VendorInvoice | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<VendorInvoice | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    invoice_number: "",
    company_name: "",
    vendor_name: "",
    description: "",
    total_amount: "",
    invoice_date: "",
    due_date: "",
    pay_cycle: "",
    priority: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  const companyName = useMemo(
    () => decodeURIComponent(params?.company ?? ""),
    [params?.company],
  );
  const vendorName = useMemo(
    () => decodeURIComponent(params?.vendor ?? ""),
    [params?.vendor],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "employee") {
      router.replace("/login");
    }
  }, [authLoading, user, router, vendorName, companyName]);

  const isAccounts = (user?.department || "").toLowerCase() === "accounts";
  const canUseActions = isAccounts;
  const shouldSkip = authLoading || !user || user.role !== "employee" || !vendorName;
  const { data, isFetching } = useListInvoicesQuery(
    {
      page: 1,
      page_size: 100,
      sort_by: "created_at",
      sort_order: "desc",
      vendor: vendorName,
      company_name: companyName || undefined,
    },
    { skip: shouldSkip },
  );
  const invoices = (data?.data ?? []) as VendorInvoice[];
  const loading = isFetching;

  const summary = useMemo(
    () =>
      invoices.reduce(
        (acc, inv) => {
          acc.totalInvoices += 1;
          acc.totalAmount += inv.total_amount ?? 0;
          const status = inv.status || "";
          if (status === "Pending") acc.pending += 1;
          else if (status === "Approved for Release") acc.approved += 1;
          else if (status === "On Hold") acc.onHold += 1;
          else if (status === "Paid") acc.paid += 1;
          return acc;
        },
        {
          totalInvoices: 0,
          totalAmount: 0,
          pending: 0,
          approved: 0,
          onHold: 0,
          paid: 0,
        },
      ),
    [invoices],
  );

  const [updateInvoice] = useUpdateInvoiceMutation();
  const [holdInvoice] = useHoldInvoiceMutation();
  const [markInvoicePaid] = useMarkInvoicePaidMutation();
  const [softDeleteInvoice] = useSoftDeleteInvoiceMutation();

  const openEdit = (inv: VendorInvoice) => {
    setEditingInvoice(inv);
    setEditForm({
      invoice_number: inv.invoice_number || "",
      company_name: inv.company_name || companyName || "",
      vendor_name: inv.vendor_name || vendorName || "",
      description: inv.description || "",
      total_amount: String(inv.total_amount ?? ""),
      invoice_date: (inv.invoice_date || "").toString().slice(0, 10),
      due_date: (inv.due_date || "").toString().slice(0, 10),
      pay_cycle: inv.pay_cycle || "",
      priority: (inv.priority || "").toLowerCase(),
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editingInvoice) return;
    setProcessingId(editingInvoice.id);
    setEditError(null);
    if (!editForm.description.trim()) {
      setEditError("Remark is required.");
      setProcessingId(null);
      return;
    }
    if (isAccounts && !editForm.priority.trim()) {
      setEditError("Priority is required for Accounts.");
      setProcessingId(null);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        invoice_number: editForm.invoice_number || null,
        company_name: editForm.company_name || null,
        vendor_name: editForm.vendor_name || null,
        description: editForm.description.trim(),
        total_amount: editForm.total_amount ? Number(editForm.total_amount) : null,
        invoice_date: editForm.invoice_date || null,
        due_date: editForm.due_date || null,
        pay_cycle: editForm.pay_cycle || null,
      };
      if (isAccounts && editForm.priority.trim()) {
        body.priority = editForm.priority.trim().toLowerCase();
      }
      await updateInvoice({
        id: editingInvoice.id,
        body,
      }).unwrap();
      setEditDialogOpen(false);
      setEditingInvoice(null);
    } catch (err: unknown) {
      const isNetworkError =
        (err as { code?: string; message?: string }).code === "ERR_NETWORK" ||
        (err as { message?: string }).message === "Network Error";
      if (isNetworkError) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        setEditError(
          `Could not connect to the server. Make sure the backend is running at ${apiUrl}. Run from project root: .\\scripts\\start-backend.ps1`
        );
      } else {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setEditError(typeof msg === "string" ? msg : "Failed to save. Please try again.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleHold = async (invoiceId: string) => {
    setProcessingId(invoiceId);
    try {
      await holdInvoice(invoiceId).unwrap();
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaidClick = (invoice: VendorInvoice) => {
    if ((invoice.sheet_status || "") !== "Approved for Release") return;
    setConfirmTarget(invoice);
    setConfirmDialogOpen(true);
  };

  const confirmMarkPaid = async () => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    try {
      await markInvoicePaid(confirmTarget.id).unwrap();
      setConfirmDialogOpen(false);
      setConfirmTarget(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleSoftDelete = async (invoiceId: string) => {
    if (!window.confirm("Delete this invoice from your list?")) return;
    setProcessingId(invoiceId);
    try {
      await softDeleteInvoice(invoiceId).unwrap();
    } finally {
      setProcessingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="w-10 h-10 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              router.push(
                `/employee/invoices/${encodeURIComponent(companyName || "")}`,
              )
            }
          >
            ← Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {vendorName || "Vendor invoices"}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-neutral-600 text-sm">
            {loading
              ? "Loading invoices…"
              : `${summary.totalInvoices} invoices · ${formatCurrency(
                  summary.totalAmount,
                )}`}
          </p>
        </div>
      </div>

      <Card className="bg-white/90 backdrop-blur-sm border-neutral-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-neutral-900">
            Invoice list
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-center py-2 border-b border-neutral-100"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-neutral-600 py-4">
              No invoices for this vendor yet.
            </p>
          ) : (
            <>
              {/* Mobile layout: stacked cards with inline actions */}
              <div className="space-y-2 sm:hidden">
                {invoices.map((inv) => {
                  const status = inv.status || "-";
                  const isProcessing = processingId === inv.id;
                  const sheetStatus = inv.sheet_status || status || "Pending";

                  let statusBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                  const key = sheetStatus.toLowerCase().replaceAll(" ", "_");
                  if (statusBadgeStyles[key]) {
                    statusBadge = statusBadgeStyles[key];
                  } else if (status.toLowerCase() in statusBadgeStyles) {
                    statusBadge = statusBadgeStyles[status.toLowerCase()];
                  }

                  const canHold = sheetStatus !== "Paid";
                  const canMarkPaid = sheetStatus === "Approved for Release";

                  let priorityBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                  if (inv.priority && priorityBadgeStyles[inv.priority]) {
                    priorityBadge = priorityBadgeStyles[inv.priority];
                  }

                  return (
                    <div
                      key={inv.id}
                      className="rounded-lg border border-neutral-200 px-3 py-2.5 bg-white space-y-1.5"
                    >
                      <div className="flex justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-neutral-900">
                            {inv.invoice_number || "(no number)"}
                          </p>
                          <p className="text-[11px] text-neutral-600 line-clamp-2">
                            {inv.description || "—"}
                          </p>
                        </div>
                        <p className="text-xs font-semibold tabular-nums">
                          {formatCurrency(inv.total_amount ?? 0, inv.currency)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge}`}
                          >
                            {sheetStatus}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityBadge}`}
                          >
                            Priority: {inv.priority || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {canUseActions ? (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px]"
                                onClick={() => openEdit(inv)}
                                aria-label="Edit"
                                title="Edit"
                              >
                                <Pencil size={12} />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px]"
                                disabled={isProcessing || !canHold}
                                onClick={() => handleToggleHold(inv.id)}
                                aria-label="On hold"
                                title="On hold"
                              >
                                {sheetStatus === "On Hold" ? (
                                  <PlayCircle size={12} />
                                ) : (
                                  <PauseCircle size={12} />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px]"
                                disabled={isProcessing || !canMarkPaid}
                                onClick={() => handleMarkPaidClick(inv)}
                                aria-label="Mark paid"
                                title="Mark paid"
                              >
                                <CheckCircle2 size={12} />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px] text-red-600 border-red-200"
                                disabled={isProcessing}
                                onClick={() => handleSoftDelete(inv.id)}
                                aria-label="Delete"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </>
                          ) : (
                            <span className="text-[11px] text-neutral-400">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop / tablet layout: table */}
              <div className="hidden sm:block text-xs sm:text-sm w-full overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      <th className="py-2 pr-4 text-left font-medium">
                        Invoice
                      </th>
                      <th className="py-2 px-4 text-left font-medium">
                        Description
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Due date
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Amount
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Status
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Priority
                      </th>
                      <th className="py-2 pl-4 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const status = inv.status || "-";
                      const isProcessing = processingId === inv.id;
                      const sheetStatus = inv.sheet_status || status || "Pending";

                      let statusBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                      const key = sheetStatus.toLowerCase().replaceAll(" ", "_");
                      if (statusBadgeStyles[key]) {
                        statusBadge = statusBadgeStyles[key];
                      } else if (status.toLowerCase() in statusBadgeStyles) {
                        statusBadge = statusBadgeStyles[status.toLowerCase()];
                      }

                      const canHold = sheetStatus !== "Paid";
                      const canMarkPaid = sheetStatus === "Approved for Release";

                      let priorityBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                      if (inv.priority && priorityBadgeStyles[inv.priority]) {
                        priorityBadge = priorityBadgeStyles[inv.priority];
                      }

                      return (
                        <tr
                          key={inv.id}
                          className="border-b border-neutral-100 last:border-0 text-neutral-800"
                        >
                          <td className="py-3 pr-4 align-middle">
                            <span className="truncate">
                              {inv.invoice_number || "(no number)"}
                            </span>
                          </td>
                          <td className="py-3 px-4 align-middle text-neutral-600">
                            <span className="line-clamp-2">
                              {inv.description || "—"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right align-middle text-xs">
                            {inv.due_date || "—"}
                          </td>
                          <td className="py-3 px-4 text-right align-middle">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatCurrency(inv.total_amount ?? 0, inv.currency)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right align-middle text-xs">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full font-medium ${statusBadge}`}
                            >
                              {sheetStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right align-middle text-xs">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full font-medium ${priorityBadge}`}
                            >
                              {inv.priority || "—"}
                            </span>
                          </td>
                          <td className="py-3 pl-4 text-right align-middle">
                            {canUseActions ? (
                              <div className="inline-flex items-center gap-3">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 text-[11px]"
                                  onClick={() => openEdit(inv)}
                                  aria-label="Edit"
                                  title="Edit"
                                >
                                  <Pencil size={12} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 text-[11px]"
                                  disabled={isProcessing || !canHold}
                                  onClick={() => handleToggleHold(inv.id)}
                                  aria-label="On hold"
                                  title="On hold"
                                >
                                  {sheetStatus === "On Hold" ? (
                                    <PlayCircle size={12} />
                                  ) : (
                                    <PauseCircle size={12} />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 text-[11px]"
                                  disabled={isProcessing || !canMarkPaid}
                                  onClick={() => handleMarkPaidClick(inv)}
                                  aria-label="Mark paid"
                                  title="Mark paid"
                                >
                                  <CheckCircle2 size={12} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7 text-[11px] text-red-600 border-red-200"
                                  disabled={isProcessing}
                                  onClick={() => handleSoftDelete(inv.id)}
                                  aria-label="Delete"
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-white border-neutral-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">
              Edit invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Invoice number</Label>
                <Input
                  value={editForm.invoice_number}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, invoice_number: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Amount (₹)</Label>
                <Input
                  type="number"
                  value={editForm.total_amount}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, total_amount: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Company</Label>
                <Input
                  value={editForm.company_name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, company_name: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Vendor</Label>
                <Input
                  value={editForm.vendor_name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, vendor_name: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Invoice date</Label>
                <Input
                  type="date"
                  value={editForm.invoice_date}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, invoice_date: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Due date</Label>
                <Input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, due_date: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-700">Pay cycle</Label>
                <Input
                  value={editForm.pay_cycle}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, pay_cycle: e.target.value }))
                  }
                  className="bg-neutral-50 border-neutral-300"
                  placeholder="e.g. 30"
                />
              </div>
              {isAccounts && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-neutral-700">Priority</Label>
                  <Select
                    value={editForm.priority || "low"}
                    onValueChange={(value) =>
                      setEditForm((f) => ({ ...f, priority: value }))
                    }
                  >
                    <SelectTrigger className="bg-neutral-50 border-neutral-300 w-full">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-neutral-300">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-700">Remark *</Label>
              <Input
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, description: e.target.value }))
                }
                className="bg-neutral-50 border-neutral-300"
              />
            </div>
            {editError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                className="text-neutral-600"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-jojo-orange hover:bg-jojo-orange/90 text-black font-semibold"
                disabled={processingId === editingInvoice?.id || !editForm.description.trim()}
                onClick={() => void saveEdit()}
              >
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm mark paid dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="bg-white border-neutral-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">
              Mark invoice as paid?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              This will change the status of{" "}
              <span className="font-semibold">
                {confirmTarget?.invoice_number || "this invoice"}
              </span>{" "}
              to <span className="font-semibold">Paid</span>.
            </p>
            <p className="text-xs text-neutral-500">
              Amount:{" "}
              <span className="font-semibold">
                {formatCurrency(confirmTarget?.total_amount ?? 0, confirmTarget?.currency)}
              </span>
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                className="text-neutral-600"
                onClick={() => setConfirmDialogOpen(false)}
                disabled={confirmLoading}
              >
                Cancel
              </Button>
              <Button
                className="bg-jojo-orange hover:bg-jojo-orange/90 text-black font-semibold"
                onClick={() => void confirmMarkPaid()}
                disabled={confirmLoading}
              >
                {confirmLoading ? "Marking…" : "Yes, mark as paid"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

