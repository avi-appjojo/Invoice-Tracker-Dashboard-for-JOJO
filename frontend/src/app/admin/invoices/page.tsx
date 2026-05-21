"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useListInvoicesQuery } from "@/lib/storeApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";

type AdminInvoice = {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  company_name?: string | null;
  total_amount: number | null;
  sheet_status?: string | null;
};

type CompanyMetrics = {
  company: string;
  totalInvoices: number;
  totalAmount: number;
  pending: number;
  approved: number;
  onHold: number;
  paid: number;
};

export default function AdminInvoicesCompaniesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user || !["admin", "superadmin"].includes(user.role)) {
      router.replace("/login");
    }
  }, [authLoading, router, user]);

  const shouldSkip = authLoading || !user || !["admin", "superadmin"].includes(user.role);
  const { data, isFetching } = useListInvoicesQuery(
    { page: 1, page_size: 100, sort_by: "created_at", sort_order: "desc" },
    { skip: shouldSkip },
  );
  const invoices = (data?.data ?? []) as AdminInvoice[];
  const loading = isFetching;

  const companies = useMemo<CompanyMetrics[]>(() => {
    const map = new Map<string, CompanyMetrics>();

    for (const inv of invoices) {
      const name =
        (inv.company_name || "Unassigned").trim() || "Unassigned";
      const sheet = (inv.sheet_status || "Pending") as string;
      const key = name;

      if (!map.has(key)) {
        map.set(key, {
          company: name,
          totalInvoices: 0,
          totalAmount: 0,
          pending: 0,
          approved: 0,
          onHold: 0,
          paid: 0,
        });
      }
      const m = map.get(key)!;
      m.totalInvoices += 1;
      m.totalAmount += inv.total_amount ?? 0;
      if (sheet === "Pending") m.pending += 1;
      else if (sheet === "Approved for Release") m.approved += 1;
      else if (sheet === "On Hold") m.onHold += 1;
      else if (sheet === "Paid") m.paid += 1;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.company.localeCompare(b.company),
    );
  }, [invoices]);

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
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Invoices
          </h1>
          <p className="text-neutral-600 text-sm">
            {loading
              ? "Loading latest invoices…"
              : `${invoices.length} invoices across ${companies.length} compan${
                  companies.length === 1 ? "y" : "ies"
                }`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="bg-white border-neutral-200">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white py-12">
          <p className="text-sm font-medium text-neutral-800">
            No invoices yet.
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            New invoices will appear here as they are uploaded.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map((c) => (
            <Card
              key={c.company}
              role="button"
              tabIndex={0}
              onClick={() =>
                router.push(
                  `/admin/invoices/${encodeURIComponent(c.company)}`,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(
                    `/admin/invoices/${encodeURIComponent(c.company)}`,
                  );
                }
              }}
              className="bg-white border border-neutral-200 hover:border-jojo-orange/70 hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              <CardHeader className="px-4 py-3 pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-neutral-900 text-base font-semibold">
                      {c.company}
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                      Total amount
                    </p>
                    <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                      {formatCurrency(c.totalAmount)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-2 pb-3 text-xs text-neutral-700">
                <p className="font-medium mb-1.5">
                  Total invoices:{" "}
                  <span className="font-semibold tabular-nums">
                    {c.totalInvoices}
                  </span>
                </p>
                <div className="space-y-0.5">
                  <p>
                    Pending:{" "}
                    <span className="font-semibold tabular-nums">
                      {c.pending}
                    </span>
                  </p>
                  <p>
                    Approved:{" "}
                    <span className="font-semibold tabular-nums">
                      {c.approved}
                    </span>
                  </p>
                  <p>
                    On hold:{" "}
                    <span className="font-semibold tabular-nums">
                      {c.onHold}
                    </span>
                  </p>
                  <p>
                    Paid:{" "}
                    <span className="font-semibold tabular-nums">
                      {c.paid}
                    </span>
                  </p>
                </div>
                <div className="flex justify-end mt-3 text-[11px] text-jojo-orange font-medium">
                  Tap to view vendors →
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

