import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { DashboardAll as DashboardAllType } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_STORAGE_KEY = "jojo.auth.token";

type InvoiceListParams = Record<string, string | number | undefined>;
type PaymentCreate = Record<string, unknown>;

export type DashboardAll = DashboardAllType;

export type VendorItem = {
  id: string;
  vendor_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
};

export type CompanyItem = {
  id: string;
  name: string;
  display_name?: string | null;
  is_active: boolean;
};

export type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department: string;
  created_at?: string | null;
};

export type InvoiceItem = {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  department: string | null;
  company_name?: string | null;
  description?: string | null;
  total_amount: number | null;
  currency?: string | null;
  due_date: string | null;
  status: string;
  payment_status: string;
  priority: string | null;
  pdf_url: string | null;
  created_at: string;
  created_by_name?: string | null;
  sheet_status?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  remarks?: string | null;
  accounts_reviewed_at?: string | null;
  accounts_reviewed_by?: string | null;
};

export type InvoiceListResponse = {
  data: InvoiceItem[];
  total: number;
  page: number;
  page_size: number;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers) => {
      if (typeof window !== "undefined") {
        const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
        if (token) headers.set("authorization", `Bearer ${token}`);
      }
      headers.set("content-type", "application/json");
      return headers;
    },
  }),
  tagTypes: ["Invoices", "Dashboard", "Vendors", "Companies", "Users", "Payments"],
  endpoints: (build) => ({
    listInvoices: build.query<InvoiceListResponse, InvoiceListParams>({
      query: (params) => ({ url: "/api/invoices", params }),
      providesTags: (result) =>
        result && Array.isArray(result.data)
          ? [
              { type: "Invoices", id: "LIST" },
              ...result.data.map((i) => ({ type: "Invoices" as const, id: i.id })),
            ]
          : [{ type: "Invoices", id: "LIST" }],
    }),
    deleteInvoice: build.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/api/invoices/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Invoices", id: "LIST" }],
    }),
    proceedInvoice: build.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/api/invoices/${id}/proceed`, method: "POST" }),
      invalidatesTags: (result, error, id) => [{ type: "Invoices", id }, { type: "Invoices", id: "LIST" }],
    }),
    holdInvoice: build.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/api/invoices/${id}/hold`, method: "POST" }),
      invalidatesTags: (result, error, id) => [{ type: "Invoices", id }, { type: "Invoices", id: "LIST" }],
    }),
    approveAllInvoices: build.mutation<unknown, { company_name: string; vendor_name: string }>({
      query: (body) => ({ url: "/api/invoices/approve-all", method: "POST", body }),
      invalidatesTags: [{ type: "Invoices", id: "LIST" }],
    }),
    createInvoice: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "/api/invoices", method: "POST", body }),
      invalidatesTags: [{ type: "Invoices", id: "LIST" }, { type: "Dashboard", id: "ALL" }],
    }),
    updateInvoice: build.mutation<unknown, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/invoices/${id}`, method: "PUT", body }),
      invalidatesTags: (r, e, { id }) => [
        { type: "Invoices", id },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),
    softDeleteInvoice: build.mutation<unknown, string>({
      query: (id) => ({ url: `/api/invoices/${id}/soft-delete`, method: "POST" }),
      invalidatesTags: (r, e, id) => [
        { type: "Invoices", id },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),
    markInvoicePaid: build.mutation<unknown, string>({
      query: (id) => ({ url: `/api/invoices/${id}/mark-paid`, method: "POST" }),
      invalidatesTags: (r, e, id) => [
        { type: "Invoices", id },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),
    submitAccountsReview: build.mutation<
      unknown,
      { invoiceId: string; priority: string; remarks?: string }
    >({
      query: ({ invoiceId, priority, remarks }) => ({
        url: `/api/invoices/${invoiceId}/accounts-review`,
        method: "POST",
        body: { priority, remarks: remarks ?? "" },
      }),
      invalidatesTags: (r, e, { invoiceId }) => [
        { type: "Invoices", id: invoiceId },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),
    rejectAccountsInvoice: build.mutation<
      { message: string },
      { invoiceId: string; remarks?: string }
    >({
      query: ({ invoiceId, remarks }) => ({
        url: `/api/invoices/${invoiceId}/accounts-reject`,
        method: "POST",
        body: { remarks: remarks?.trim() || null },
      }),
      invalidatesTags: (r, e, { invoiceId }) => [
        { type: "Invoices", id: invoiceId },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),

    // Payments
    createPayment: build.mutation<unknown, PaymentCreate>({
      query: (body) => ({ url: "/api/payments", method: "POST", body }),
      invalidatesTags: [
        { type: "Payments", id: "LIST" },
        { type: "Invoices", id: "LIST" },
        { type: "Dashboard", id: "ALL" },
      ],
    }),

    // Dashboard — refetch when admin opens dashboard so KPIs match DB
    getDashboardAll: build.query<DashboardAll, void>({
      query: () => ({ url: "/api/dashboard/all" }),
      providesTags: [{ type: "Dashboard", id: "ALL" }],
      keepUnusedDataFor: 60,
      refetchOnMountOrArgChange: true,
    }),

    // Vendors
    listVendors: build.query<{ data: VendorItem[] }, void>({
      query: () => ({ url: "/api/vendors" }),
      providesTags: (result) =>
        result && Array.isArray(result.data)
          ? [{ type: "Vendors", id: "LIST" }, ...result.data.map((v) => ({ type: "Vendors" as const, id: v.id }))]
          : [{ type: "Vendors", id: "LIST" }],
    }),
    createVendor: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "/api/vendors", method: "POST", body }),
      invalidatesTags: [{ type: "Vendors", id: "LIST" }],
    }),
    updateVendor: build.mutation<unknown, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/vendors/${id}`, method: "PUT", body }),
      invalidatesTags: (r, e, { id }) => [{ type: "Vendors", id }, { type: "Vendors", id: "LIST" }],
    }),

    // Companies
    listCompanies: build.query<CompanyItem[], void>({
      query: () => ({ url: "/api/companies" }),
      providesTags: (result) =>
        result && Array.isArray(result)
          ? [{ type: "Companies", id: "LIST" }, ...result.map((c) => ({ type: "Companies" as const, id: c.id }))]
          : [{ type: "Companies", id: "LIST" }],
    }),
    createCompany: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "/api/companies", method: "POST", body }),
      invalidatesTags: [{ type: "Companies", id: "LIST" }],
    }),
    updateCompany: build.mutation<unknown, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/companies/${id}`, method: "PUT", body }),
      invalidatesTags: (r, e, { id }) => [{ type: "Companies", id }, { type: "Companies", id: "LIST" }],
    }),
    deleteCompany: build.mutation<unknown, string>({
      query: (id) => ({ url: `/api/companies/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Companies", id: "LIST" }],
    }),

    // Users
    listUsers: build.query<{ data: UserItem[] }, void>({
      query: () => ({ url: "/api/users" }),
      providesTags: (result) =>
        result && Array.isArray(result.data)
          ? [{ type: "Users", id: "LIST" }, ...result.data.map((u) => ({ type: "Users" as const, id: u.id }))]
          : [{ type: "Users", id: "LIST" }],
    }),
    createUser: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "/api/users", method: "POST", body }),
      invalidatesTags: [{ type: "Users", id: "LIST" }],
    }),
    updateUser: build.mutation<unknown, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/users/${id}`, method: "PUT", body }),
      invalidatesTags: (r, e, { id }) => [{ type: "Users", id }, { type: "Users", id: "LIST" }],
    }),
  }),
});

export const {
  useListInvoicesQuery,
  useDeleteInvoiceMutation,
  useProceedInvoiceMutation,
  useHoldInvoiceMutation,
  useApproveAllInvoicesMutation,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useSoftDeleteInvoiceMutation,
  useMarkInvoicePaidMutation,
  useSubmitAccountsReviewMutation,
  useRejectAccountsInvoiceMutation,
  useCreatePaymentMutation,
  useGetDashboardAllQuery,
  useListVendorsQuery,
  useCreateVendorMutation,
  useUpdateVendorMutation,
  useListCompaniesQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useDeleteCompanyMutation,
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
} = api;

