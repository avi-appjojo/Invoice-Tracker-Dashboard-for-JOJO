"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useApproveAllInvoicesMutation, useListInvoicesQuery, useListVendorsQuery } from "@/lib/storeApi";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type CompanyInvoice = {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  status: string | null;
  payment_status: string | null;
  due_date: string | null;
  company_name?: string | null;
  sheet_status?: string | null;
};

type VendorMetrics = {
  vendorName: string;
  category: string | null;
  totalInvoices: number;
  totalAmount: number;
  pending: number;
  approved: number;
  onHold: number;
  paid: number;
};

export default function AdminCompanyInvoicesPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ company: string }>();
  const router = useRouter();

  const [vendorCategoryByName, setVendorCategoryByName] = useState<Record<string, string>>({});
  const [approvingVendor, setApprovingVendor] = useState<string | null>(null);
  const [approveAllDialogOpen, setApproveAllDialogOpen] = useState(false);
  const [approveAllTarget, setApproveAllTarget] = useState<VendorMetrics | null>(null);

  const companyName = useMemo(
    () => decodeURIComponent(params?.company ?? ""),
    [params?.company],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user || !["admin", "superadmin"].includes(user.role)) {
      router.replace("/login");
    }
  }, [authLoading, router, user]);

  const shouldSkip = authLoading || !user || !["admin", "superadmin"].includes(user.role) || !companyName;
  const { data: invoicesData, isFetching: invoicesFetching } = useListInvoicesQuery(
    {
      page: 1,
      page_size: 100,
      sort_by: "created_at",
      sort_order: "desc",
      company_name: companyName || undefined,
    },
    { skip: shouldSkip },
  );
  const { data: vendorsData } = useListVendorsQuery(undefined, { skip: shouldSkip });
  const invoices = (invoicesData?.data ?? []) as CompanyInvoice[];
  const loading = invoicesFetching;

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const v of (vendorsData?.data ?? []) as Array<{ vendor_name?: string; category?: string | null }>) {
      const name = (v.vendor_name || "").trim().toLowerCase();
      const cat = (v.category || "").trim();
      if (name && cat) map[name] = cat;
    }
    setVendorCategoryByName(map);
  }, [vendorsData]);

  const vendorMetrics = useMemo<VendorMetrics[]>(() => {
    const map = new Map<string, VendorMetrics>();
    for (const inv of invoices) {
      const vendorName = (inv.vendor_name || "Unassigned").trim() || "Unassigned";
      const status = inv.status || "";
      const category =
        vendorName.toLowerCase() === "unassigned"
          ? null
          : vendorCategoryByName[vendorName.trim().toLowerCase()] || null;

      if (!map.has(vendorName)) {
        map.set(vendorName, {
          vendorName,
          category,
          totalInvoices: 0,
          totalAmount: 0,
          pending: 0,
          approved: 0,
          onHold: 0,
          paid: 0,
        });
      }
      const m = map.get(vendorName)!;
      m.totalInvoices += 1;
      m.totalAmount += inv.total_amount ?? 0;
      if (status === "Pending") m.pending += 1;
      else if (status === "Approved for Release") m.approved += 1;
      else if (status === "On Hold") m.onHold += 1;
      else if (status === "Paid") m.paid += 1;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.vendorName.localeCompare(b.vendorName),
    );
  }, [invoices, vendorCategoryByName]);

  const overallSummary = useMemo(
    () =>
      vendorMetrics.reduce(
        (acc, v) => {
          acc.totalInvoices += v.totalInvoices;
          acc.totalAmount += v.totalAmount;
          return acc;
        },
        { totalInvoices: 0, totalAmount: 0 },
      ),
    [vendorMetrics],
  );

  const openApproveAllDialog = (vendor: VendorMetrics) => {
    setApproveAllTarget(vendor);
    setApproveAllDialogOpen(true);
  };

  const confirmApproveAll = async () => {
    if (!approveAllTarget) return;
    setApprovingVendor(approveAllTarget.vendorName);
    try {
      await approveAllInvoices({
        company_name: companyName,
        vendor_name: approveAllTarget.vendorName,
      }).unwrap();
      setApproveAllDialogOpen(false);
      setApproveAllTarget(null);
    } finally {
      setApprovingVendor(null);
    }
  };

  const [approveAllInvoices] = useApproveAllInvoicesMutation();

  const nonPaidCount = (v: VendorMetrics) => v.totalInvoices - v.paid;

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
            onClick={() => router.push("/admin/invoices")}
          >
            ← Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {companyName || "Invoices"}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-neutral-600 text-sm">
            {loading
              ? "Loading vendors…"
              : `${overallSummary.totalInvoices} invoices · ${formatCurrency(
                  overallSummary.totalAmount,
                )}`}
          </p>
        </div>
      </div>

      <Card className="bg-white border border-neutral-200">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-semibold text-neutral-900">
            Vendors
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-4 items-center py-3 border-b border-neutral-100"
                >
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-36" />
                </div>
              ))}
            </div>
          ) : vendorMetrics.length === 0 ? (
            <p className="text-sm text-neutral-600 py-4">
              No vendors for this company yet.
            </p>
          ) : (
            <>
              {/* Mobile layout: stacked cards with inline actions */}
              <div className="space-y-2 sm:hidden">
                {vendorMetrics.map((v) => (
                  <div
                    key={v.vendorName}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(
                        `/admin/invoices/${encodeURIComponent(
                          companyName,
                        )}/${encodeURIComponent(v.vendorName)}`,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(
                          `/admin/invoices/${encodeURIComponent(
                            companyName,
                          )}/${encodeURIComponent(v.vendorName)}`,
                        );
                      }
                    }}
                    className="flex items-start justify-between rounded-lg border border-neutral-200 px-3 py-2 bg-white cursor-pointer hover:border-jojo-orange/70 hover:shadow-sm transition"
                  >
                    <div className="space-y-0.5">
                      <p className="text-left truncate font-medium text-neutral-900">
                        {v.vendorName}
                      </p>
                      <p className="text-[11px] text-neutral-600">
                        {v.totalInvoices} invoice
                        {v.totalInvoices === 1 ? "" : "s"} ·{" "}
                        {formatCurrency(v.totalAmount)}
                      </p>
                      {v.category && (
                        <p className="text-[11px] text-neutral-500">
                          Category: <span className="font-medium text-neutral-700">{v.category}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px] text-neutral-500">
                      {nonPaidCount(v) > 0 && (
                        <Button
                          size="xs"
                          variant="outline"
                          className="text-[10px] px-2 py-1 h-7"
                          disabled={approvingVendor === v.vendorName}
                          onClick={(e) => {
                            e.stopPropagation();
                            openApproveAllDialog(v);
                          }}
                        >
                          {approvingVendor === v.vendorName
                            ? "Approving…"
                            : "Approve all"}
                        </Button>
                      )}
                      <span>Tap to manage →</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / tablet layout: table */}
              <div className="hidden sm:block text-xs sm:text-sm w-full overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      <th className="py-2 pr-4 text-left font-medium">
                        Vendor
                      </th>
                      <th className="py-2 px-4 text-left font-medium">
                        Category
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Invoices
                      </th>
                      <th className="py-2 px-4 text-right font-medium">
                        Total
                      </th>
                      <th className="py-2 pl-4 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorMetrics.map((v) => (
                      <tr
                        key={v.vendorName}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          router.push(
                            `/admin/invoices/${encodeURIComponent(
                              companyName,
                            )}/${encodeURIComponent(v.vendorName)}`,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(
                              `/admin/invoices/${encodeURIComponent(
                                companyName,
                              )}/${encodeURIComponent(v.vendorName)}`,
                            );
                          }
                        }}
                        className="border-b border-neutral-100 last:border-0 text-neutral-800 hover:bg-neutral-50 cursor-pointer"
                      >
                        <td className="py-2.5 pr-4 align-middle">
                          <button
                            type="button"
                            className="text-left truncate font-medium text-neutral-900 hover:underline"
                            onClick={() =>
                              router.push(
                                `/admin/invoices/${encodeURIComponent(
                                  companyName,
                                )}/${encodeURIComponent(v.vendorName)}`,
                              )
                            }
                          >
                            {v.vendorName}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-left align-middle text-neutral-700">
                          {v.category || "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right align-middle font-semibold tabular-nums">
                          {v.totalInvoices}
                        </td>
                        <td className="py-2.5 px-4 text-right align-middle font-semibold tabular-nums">
                          {formatCurrency(v.totalAmount)}
                        </td>
                        <td className="py-2.5 pl-4 text-right align-middle">
                          <div className="inline-flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[11px] px-3"
                              disabled={
                                approvingVendor === v.vendorName ||
                                nonPaidCount(v) === 0
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                openApproveAllDialog(v);
                              }}
                            >
                              {approvingVendor === v.vendorName
                                ? "Approving…"
                                : "Approve all"}
                            </Button>
                            <span className="text-[11px] text-neutral-500 self-center">
                              Click row to view →
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={approveAllDialogOpen}
        onOpenChange={(open) => {
          if (!approvingVendor) {
            setApproveAllDialogOpen(open);
            if (!open) setApproveAllTarget(null);
          }
        }}
      >
        <DialogContent className="bg-white border-neutral-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">
              Approve all invoices
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600">
            Approve all invoices for <strong>{approveAllTarget?.vendorName}</strong>?
            All non-paid invoices (Pending, On Hold, etc.) will be set to{" "}
            <strong>Approved for Release</strong>. Already paid invoices are not changed.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveAllDialogOpen(false)}
              disabled={!!approvingVendor}
            >
              Cancel
            </Button>
            <Button
              className="bg-jojo-orange hover:bg-jojo-orange/90 text-black"
              onClick={() => void confirmApproveAll()}
              disabled={!!approvingVendor}
            >
              {approvingVendor ? "Approving…" : "Yes, approve all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

