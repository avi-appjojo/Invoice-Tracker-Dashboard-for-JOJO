"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useHoldInvoiceMutation, useListInvoicesQuery, useProceedInvoiceMutation } from "@/lib/storeApi";
import { formatCurrency, priorityBadgeStyles } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PauseCircle, PlayCircle } from "lucide-react";

type VendorInvoice = {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  description: string | null;
  total_amount: number | null;
  currency?: string | null;
  status: string | null;
  priority: string | null;
  due_date?: string | null;
  created_by_name?: string | null;
  sheet_status?: string | null;
  remarks?: string | null;
};

export default function AdminVendorInvoicesPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ company: string; vendor: string }>();
  const router = useRouter();

  const [processingId, setProcessingId] = useState<string | null>(null);

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
    if (!user || !["admin", "superadmin"].includes(user.role)) {
      router.replace("/login");
    }
  }, [authLoading, router, user]);

  const shouldSkip = authLoading || !user || !["admin", "superadmin"].includes(user.role) || !vendorName;
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

  const [proceedInvoice] = useProceedInvoiceMutation();
  const [holdInvoice] = useHoldInvoiceMutation();

  const handleProceed = async (invoiceId: string) => {
    if (
      !window.confirm(
        "Approve this invoice for payment? This will move it to 'Approved for Release'.",
      )
    ) {
      return;
    }
    setProcessingId(invoiceId);
    try {
      await proceedInvoice(invoiceId).unwrap();
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleHold = async (invoice: VendorInvoice) => {
    const current = invoice.status || "Pending";
    const goingOnHold = current !== "On Hold";
    const message = goingOnHold
      ? "Put this invoice On Hold? It will move out of the normal approval flow."
      : "Resume this invoice from On Hold back to Pending?";

    if (!window.confirm(message)) return;

    setProcessingId(invoice.id);
    try {
      await holdInvoice(invoice.id).unwrap();
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
                `/admin/invoices/${encodeURIComponent(companyName || "")}`,
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
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-neutral-600 py-4">
              No invoices for this vendor yet.
            </p>
          ) : (
            <>
              {/* Mobile layout: stacked invoice cards with inline actions */}
              <div className="space-y-2 sm:hidden">
                {invoices.map((inv) => {
                  const status = inv.status || "-";
                  const isProcessing = processingId === inv.id;
                  const isOnHold = status === "On Hold";

                  let priorityBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                  if (inv.priority && priorityBadgeStyles[inv.priority]) {
                    priorityBadge = priorityBadgeStyles[inv.priority];
                  }

                  let statusBadge = "bg-neutral-100 text-neutral-700";
                  if (status === "Pending")
                    statusBadge = "bg-red-100 text-red-800";
                  else if (status === "Approved for Release")
                    statusBadge = "bg-orange-100 text-orange-800";
                  else if (status === "On Hold")
                    statusBadge = "bg-yellow-100 text-yellow-800";
                  else if (status === "Paid")
                    statusBadge = "bg-green-100 text-green-800";

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
                          {inv.remarks && (
                            <p className="text-[11px] text-neutral-500 line-clamp-1">
                              Remarks: {inv.remarks}
                            </p>
                          )}
                          <p className="text-[11px] text-neutral-500">
                            Due:{" "}
                            <span className="font-medium">
                              {inv.due_date || "—"}
                            </span>
                          </p>
                        </div>
                        <p className="text-xs font-semibold tabular-nums">
                          {formatCurrency(inv.total_amount ?? 0, inv.currency)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge}`}
                          >
                            {status}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                            <Badge
                              variant="outline"
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityBadge}`}
                            >
                              {inv.priority || "low"}
                            </Badge>
                            <span className="text-neutral-600">
                              Added by:{" "}
                              <span className="font-medium">
                                {inv.created_by_name || "—"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-[11px]"
                            disabled={isProcessing || status !== "Pending"}
                            onClick={() => handleProceed(inv.id)}
                            aria-label="Approve"
                            title="Approve"
                          >
                            ✔
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-[11px]"
                            disabled={isProcessing || status === "Paid"}
                            onClick={() => handleToggleHold(inv)}
                            aria-label={isOnHold ? "Resume" : "On hold"}
                            title={isOnHold ? "Resume" : "On hold"}
                          >
                            {isOnHold ? (
                              <PlayCircle size={14} />
                            ) : (
                              <PauseCircle size={14} />
                            )}
                          </Button>
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
                      <th className="py-2 px-4 text-right font-medium">
                        Added by
                      </th>
                      <th className="py-2 px-4 text-left font-medium">
                        Remarks
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
                      const isOnHold = status === "On Hold";

                      let priorityBadge = "bg-neutral-100 text-neutral-700 border border-neutral-200";
                      if (inv.priority && priorityBadgeStyles[inv.priority]) {
                        priorityBadge = priorityBadgeStyles[inv.priority];
                      }

                      let statusBadge = "bg-neutral-100 text-neutral-700";
                      if (status === "Pending")
                        statusBadge = "bg-red-100 text-red-800";
                      else if (status === "Approved for Release")
                        statusBadge = "bg-orange-100 text-orange-800";
                      else if (status === "On Hold")
                        statusBadge = "bg-yellow-100 text-yellow-800";
                      else if (status === "Paid")
                        statusBadge = "bg-green-100 text-green-800";

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
                              {status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right align-middle text-xs">
                            <Badge
                              variant="outline"
                              className={`px-2 py-0.5 rounded-full font-medium ${priorityBadge}`}
                            >
                              {inv.priority || "low"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right align-middle text-xs text-neutral-600">
                            {inv.created_by_name || "—"}
                          </td>
                          <td className="py-3 px-4 align-middle text-xs text-neutral-600 max-w-[180px]">
                            <span className="line-clamp-2" title={inv.remarks || ""}>
                              {inv.remarks || "—"}
                            </span>
                          </td>
                          <td className="py-3 pl-4 text-right align-middle">
                            <div className="inline-flex items-center gap-3">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px]"
                                disabled={isProcessing || status !== "Pending"}
                                onClick={() => handleProceed(inv.id)}
                                aria-label="Approve"
                                title="Approve"
                              >
                                ✔
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-[11px]"
                                disabled={isProcessing || status === "Paid"}
                                onClick={() => handleToggleHold(inv)}
                                aria-label={isOnHold ? "Resume" : "On hold"}
                                title={isOnHold ? "Resume" : "On hold"}
                              >
                                {isOnHold ? (
                                  <PlayCircle size={14} />
                                ) : (
                                  <PauseCircle size={14} />
                                )}
                              </Button>
                            </div>
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
    </div>
  );
}

