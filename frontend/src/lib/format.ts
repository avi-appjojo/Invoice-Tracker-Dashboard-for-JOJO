/**
 * Shared formatting utilities for the Invoice Tracker.
 */

/**
 * Format amount with the correct currency symbol (₹ for INR, $ for USD).
 * @param amount - Value to format
 * @param currency - "INR" | "USD" | undefined; defaults to "INR" when omitted (e.g. for aggregates)
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string | null
): string {
  if (amount == null) return "—";
  const code = (currency || "INR").trim().toUpperCase() || "INR";
  const locale = code === "USD" ? "en-US" : "en-IN";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code === "USD" ? "USD" : "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Badge class names for invoice/alert status.
 *
 * Color mapping (per product spec):
 * - Pending  -> red
 * - Approved -> orange
 * - On Hold  -> yellow
 * - Paid     -> green
 */
export const statusBadgeStyles: Record<string, string> = {
  // Aging / computed statuses
  pending: "bg-red-500/10 text-red-600 border-red-500/25",
  due_soon: "bg-orange-500/10 text-orange-500 border-orange-500/25",
  overdue: "bg-red-600/10 text-red-700 border-red-600/30",
  paid: "bg-green-500/10 text-green-600 border-green-500/25",

  // Sheet workflow statuses (normalized keys)
  approved_for_release: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  on_hold: "bg-yellow-400/10 text-yellow-600 border-yellow-400/30",
  paid_workflow: "bg-green-500/10 text-green-600 border-green-500/30",
};

/** Badge class names for priority. */
export const priorityBadgeStyles: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-neutral-500/15 text-neutral-600 border-neutral-500/30",
  critical: "bg-red-600/20 text-red-700 border-red-600/35",
};
