import axios from "axios";
import type { DashboardAll } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_STORAGE_KEY = "jojo.auth.token";

const api = axios.create({
    baseURL: API_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use(async (config) => {
    if (typeof window !== "undefined") {
        const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
        if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// On 401 (Unauthorized), clear token and redirect to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            if (typeof window !== "undefined") {
                window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                window.location.href = "/login";
            }
        }
        return Promise.reject(error);
    }
);

// Dashboard cache: avoid refetching on every page visit (90s TTL)
const DASHBOARD_CACHE_TTL_MS = 90_000;
let dashboardCache: { data: DashboardAll; expiresAt: number } | null = null;

export function clearDashboardCache(): void {
    dashboardCache = null;
}

// ─── Auth ───────────────────────────────────────────────────
export const authApi = {
    login: (email: string, password: string) =>
        api.post("/api/auth/login", { email, password }),
};

// ─── Upload ─────────────────────────────────────────────────
export const uploadApi = {
    /** Analyze PDF only; returns extracted data. Does not store in DB. */
    analyzeInvoice: (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        return api.post<{ extracted_data: Record<string, unknown> }>("/api/upload/analyze", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },
    /** Store PDF and create invoice. Pass extracted_data from analyze step to avoid re-extraction. */
    uploadInvoice: (file: File, extractedData?: Record<string, unknown>) => {
        const formData = new FormData();
        formData.append("file", file);
        if (extractedData) {
            formData.append("extracted_data", JSON.stringify(extractedData));
        }
        return api.post("/api/upload/invoice", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },
};

// ─── Invoices ───────────────────────────────────────────────
export const invoicesApi = {
    list: (params?: Record<string, string | number>) =>
        api.get("/api/invoices", { params }),
    get: (id: string) => api.get(`/api/invoices/${id}`),
    create: (data: Record<string, unknown>) => api.post("/api/invoices", data),
    update: (id: string, data: Record<string, unknown>) =>
        api.put(`/api/invoices/${id}`, data),
    delete: (id: string) => api.delete(`/api/invoices/${id}`),
    proceed: (id: string) => api.post(`/api/invoices/${id}/proceed`),
    approveAll: (data: { company_name: string; vendor_name: string }) =>
        api.post("/api/invoices/approve-all", data),
    hold: (id: string) => api.post(`/api/invoices/${id}/hold`),
    markPaid: (id: string) => api.post(`/api/invoices/${id}/mark-paid`),
    softDelete: (id: string) => api.post(`/api/invoices/${id}/soft-delete`),
};

// ─── Vendors ────────────────────────────────────────────────
export const vendorsApi = {
    list: () => api.get("/api/vendors"),
    get: (id: string) => api.get(`/api/vendors/${id}`),
    create: (data: Record<string, unknown>) => api.post("/api/vendors", data),
    update: (id: string, data: Record<string, unknown>) =>
        api.put(`/api/vendors/${id}`, data),
};

// ─── Companies ───────────────────────────────────────────────
export const companiesApi = {
    list: () => api.get("/api/companies"),
    create: (data: Record<string, unknown>) =>
        api.post("/api/companies", data),
    update: (id: string, data: Record<string, unknown>) =>
        api.put(`/api/companies/${id}`, data),
    delete: (id: string) => api.delete(`/api/companies/${id}`),
};

// ─── Payments ───────────────────────────────────────────────
export const paymentsApi = {
    markAsPaid: (data: Record<string, unknown>) =>
        api.post("/api/payments", data),
    getForInvoice: (invoiceId: string) =>
        api.get(`/api/payments/${invoiceId}`),
};

// ─── Dashboard ──────────────────────────────────────────────
export const dashboardApi = {
    getSummary: () => api.get("/api/dashboard/summary"),
    getAging: () => api.get("/api/dashboard/aging"),
    getUpcomingPayments: () => api.get("/api/dashboard/upcoming-payments"),
    getOverdueAlerts: () => api.get("/api/dashboard/overdue-alerts"),
    /** Single request for all dashboard data; uses cache when fresh (faster load). */
    getAll: async (): Promise<{ data: DashboardAll }> => {
        const now = Date.now();
        if (dashboardCache && dashboardCache.expiresAt > now) {
            return { data: dashboardCache.data };
        }
        const res = await api.get<DashboardAll>("/api/dashboard/all");
        dashboardCache = { data: res.data, expiresAt: now + DASHBOARD_CACHE_TTL_MS };
        return res;
    },
    /** Get cached dashboard data only (no request). Returns null if cache empty or stale. */
    getCached: (): DashboardAll | null => {
        if (dashboardCache && dashboardCache.expiresAt > Date.now()) return dashboardCache.data;
        return null;
    },
};

// ─── Users ──────────────────────────────────────────────────
export const usersApi = {
    list: () => api.get("/api/users"),
    create: (data: Record<string, unknown>) => api.post("/api/users", data),
    update: (id: string, data: Record<string, unknown>) =>
        api.put(`/api/users/${id}`, data),
};

export default api;

export function setAuthToken(token: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}
