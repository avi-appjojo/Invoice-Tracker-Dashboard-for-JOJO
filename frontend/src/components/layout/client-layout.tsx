"use client";

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { RealtimeProvider } from "@/lib/realtime-context";
import { ReduxProvider } from "@/lib/redux-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

function LayoutInner({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    const isLoginPage = pathname === "/login";

    useEffect(() => {
        if (!loading && !user && !isLoginPage) {
            router.push("/login");
        }
    }, [loading, user, isLoginPage, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
                    <p className="text-neutral-600 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // Login page: no sidebar/header
    if (isLoginPage) {
        return <>{children}</>;
    }

    // Authenticated layout
    if (!user) {
        return null;
    }

    return (
        <RealtimeProvider>
            <div className="flex h-screen overflow-hidden">
                <Sidebar className="hidden lg:flex" />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50">
                        {children}
                    </main>
                </div>
            </div>
        </RealtimeProvider>
    );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <ReduxProvider>
            <AuthProvider>
                <LayoutInner>{children}</LayoutInner>
            </AuthProvider>
        </ReduxProvider>
    );
}
