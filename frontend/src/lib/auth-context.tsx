"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import api, { authApi, clearAuthToken, setAuthToken } from "@/lib/api";

interface UserProfile {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    department?: string;
}

interface AuthContextType {
    user: UserProfile | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<{ error?: string; user?: UserProfile }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: async () => ({}),
    logout: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user profile from our API
    const fetchUserProfile = async () => {
        try {
            const { data } = await api.get("/api/users/me");
            const newUser = {
                id: data.id,
                name: data.name,
                email: data.email,
                role: data.role,
                status: data.status,
                department: data.department,
            };
            setUser(newUser);
            return newUser;
        } catch {
            return null;
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await fetchUserProfile();
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const login = async (email: string, password: string) => {
        try {
            const res = await authApi.login(email, password);
            const token = res.data?.access_token;
            const u = res.data?.user;
            if (!token || !u) return { error: "Login failed" };
            setAuthToken(token);
            const newUser: UserProfile = {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                status: u.status,
                department: u.department,
            };
            setUser(newUser);
            return { user: newUser };
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                (e as { message?: string })?.message ||
                "Login failed";
            return { error: msg };
        }
    };

    const logout = async () => {
        clearAuthToken();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
