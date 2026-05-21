"use client";

export type InvoiceStatus = "Pending" | "Approved for Release" | "Paid" | "On Hold";

export type PayCycle = "15" | "30" | "60" | "90";

export type SheetInvoice = {
  id: string;
  invoiceNumber: string;
  vendor: string;
  amount: number;
  uploadDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  payCycle: PayCycle;
  updatedAt: number;
};

const STORAGE_KEY = "jojo.preview.invoices.v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function listPreviewInvoices(): SheetInvoice[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<SheetInvoice[]>(window.localStorage.getItem(STORAGE_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

export function upsertPreviewInvoice(invoice: Omit<SheetInvoice, "updatedAt">): SheetInvoice {
  if (typeof window === "undefined") {
    return { ...invoice, updatedAt: Date.now() };
  }
  const items = listPreviewInvoices();
  const next: SheetInvoice = { ...invoice, updatedAt: Date.now() };
  const idx = items.findIndex((x) => x.id === invoice.id);
  const updated = idx >= 0 ? items.map((x, i) => (i === idx ? next : x)) : [next, ...items];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return next;
}

export function deletePreviewInvoice(id: string): void {
  if (typeof window === "undefined") return;
  const items = listPreviewInvoices();
  const updated = items.filter((x) => x.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function computePriorityBucket(dueDate: string, today = new Date()): { label: string; daysOverdue: number } {
  const due = new Date(dueDate + "T00:00:00");
  const t = new Date(today.toISOString().slice(0, 10) + "T00:00:00");
  const diffDays = Math.floor((t.getTime() - due.getTime()) / 86_400_000);
  const daysOverdue = Math.max(0, diffDays);
  if (diffDays <= 0) return { label: "Upcoming", daysOverdue: 0 };
  if (diffDays <= 15) return { label: "P1", daysOverdue };
  if (diffDays <= 30) return { label: "P2", daysOverdue };
  if (diffDays <= 60) return { label: "P3", daysOverdue };
  if (diffDays <= 90) return { label: "P4", daysOverdue };
  return { label: "P5", daysOverdue };
}

