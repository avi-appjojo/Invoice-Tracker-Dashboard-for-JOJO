/**
 * Shared types for dashboard, alerts, and invoices.
 */

export interface UpcomingPayment {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  total_amount: number;
  currency?: string;
  due_date: string;
  days_left: number;
  status: string;
}

export interface OverdueAlert {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  total_amount: number;
  currency?: string;
  due_date: string;
  days_overdue: number;
  priority: string;
}

export interface DashboardSummary {
  total_payables: number;
  due_in_7_days: number;
  overdue_amount: number;
  paid_this_month: number;
  total_invoices: number;
  overdue_count: number;
  pending_amount?: number;
  pending_count?: number;
  upcoming_7_days_count?: number;
  high_priority_pending_count?: number;
  approved_and_paid_count?: number;
}

export interface AgingBucket {
  bucket: string;
  amount: number;
  count: number;
}

export interface PriorityBucket {
  priority: "high" | "medium" | "low";
  amount: number;
  count: number;
}

export interface DashboardAll {
  summary: DashboardSummary;
  aging: AgingBucket[];
  priority_breakdown: PriorityBucket[];
  upcoming: UpcomingPayment[];
  overdue: OverdueAlert[];
}
