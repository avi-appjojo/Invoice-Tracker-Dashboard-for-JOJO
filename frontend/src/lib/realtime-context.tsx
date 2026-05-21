"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { clearDashboardCache } from "@/lib/api";

/** Keys for entities we sync in realtime (must match Supabase table names). */
export type RealtimeEntity = "invoices" | "vendors" | "users" | "payments";

/** Version per entity; when it changes, pages refetch. */
export type RealtimeVersions = Record<RealtimeEntity, number>;

const initialVersions: RealtimeVersions = {
    invoices: 0,
    vendors: 0,
    users: 0,
    payments: 0,
};

type RealtimeContextValue = {
    versions: RealtimeVersions;
    /** Bump version for an entity (so subscribers refetch). */
    invalidate: (entity: RealtimeEntity) => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({
    versions: initialVersions,
    invalidate: () => {},
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
    const [versions, setVersions] = useState<RealtimeVersions>(initialVersions);

    const invalidate = useCallback((entity: RealtimeEntity) => {
        clearDashboardCache();
        setVersions((prev) => ({ ...prev, [entity]: Date.now() }));
    }, []);

    // Supabase Realtime: live updates when DB rows change (no refresh needed)
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase) return;
        const channel = supabase
            .channel("db-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "invoices" },
                () => invalidate("invoices")
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "vendors" },
                () => invalidate("vendors")
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "users" },
                () => invalidate("users")
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "payments" },
                () => invalidate("payments")
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    console.debug("[Realtime] Subscribed to db-changes");
                }
                if (status === "CHANNEL_ERROR") {
                    console.warn("[Realtime] Channel error – ensure tables are in Supabase Realtime publication.");
                }
            });

        return () => {
            supabase?.removeChannel(channel);
        };
    }, [invalidate]);

    // Polling fallback intentionally disabled to avoid automatic API calls.
    // If you need it in future (e.g., without Supabase Realtime), re-enable with an explicit feature flag.

    return (
        <RealtimeContext.Provider value={{ versions, invalidate }}>
            {children}
        </RealtimeContext.Provider>
    );
}

export function useRealtime() {
    return useContext(RealtimeContext);
}
