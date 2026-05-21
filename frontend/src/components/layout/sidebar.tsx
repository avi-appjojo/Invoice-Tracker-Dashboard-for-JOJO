"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
    LayoutDashboard,
    FileText,
    Upload,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Receipt,
    Building2,
    ClipboardList,
    Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

type SidebarProps = {
    className?: string;
};

interface NavItem {
    label: string;
    href: string;
    icon: React.ReactNode;
    roles: string[];
    departments?: string[];
}

const navItems: NavItem[] = [
    {
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: <LayoutDashboard size={20} />,
        roles: ["superadmin", "admin"],
    },
    {
        label: "Invoices",
        href: "/admin/invoices",
        icon: <FileText size={20} />,
        roles: ["superadmin", "admin"],
    },
    {
        label: "Home",
        href: "/employee/pending-review",
        icon: <Home size={20} />,
        roles: ["employee"],
        departments: ["accounts"],
    },
    {
        label: "Invoices",
        href: "/employee/invoices",
        icon: <FileText size={20} />,
        roles: ["employee"],
    },
    {
        label: "Add Invoice",
        href: "/employee/dashboard",
        icon: <Upload size={20} />,
        roles: ["employee"],
    },
    {
        label: "Companies & Vendors",
        href: "/employee/companies",
        icon: <Building2 size={20} />,
        roles: ["employee"],
        departments: ["accounts"],
    },
    // Legacy sections (Supabase-backed) intentionally hidden in the new Sheets-first flow:
    // Vendors, Users, Alerts
];

export function Sidebar({ className }: SidebarProps) {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);

    const userRole = user?.role || "employee";
    const userDept = (user?.department || "").toLowerCase();

    const filteredNav = navItems.filter((item) => {
        if (!item.roles.includes(userRole)) return false;
        if (item.departments && item.departments.length > 0) {
            return item.departments.some((d) => d.toLowerCase() === userDept);
        }
        return true;
    });

    const handleLogout = async () => {
        await logout();
        router.push("/login");
    };

    return (
        <aside
            className={cn(
                "h-screen bg-neutral-50 text-neutral-900 flex flex-col border-r border-neutral-200 transition-all duration-300",
                collapsed ? "w-[68px]" : "w-[250px]",
                className
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-neutral-200">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-jojo-orange to-orange-400 flex items-center justify-center flex-shrink-0">
                    <Receipt size={18} className="text-black" />
                </div>
                {!collapsed && (
                    <span className="font-bold text-lg tracking-tight">JOJO</span>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
                {filteredNav.map((item) => {
                    const isActive = pathname === item.href;
                    const key = `${item.href}-${item.label}`;
                    return (
                        <Link key={key} href={item.href}>
                            <div
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                                    isActive
                                        ? "bg-jojo-orange/15 text-jojo-orange"
                                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                                )}
                            >
                                <span className="flex-shrink-0">{item.icon}</span>
                                {!collapsed && <span>{item.label}</span>}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Logout + collapse */}
            <div className="border-t border-neutral-200 p-3">
                <div
                    className={cn(
                        "flex items-center gap-2",
                        collapsed && "flex-col"
                    )}
                >
                    <Button
                        size="sm"
                        onClick={handleLogout}
                        className={cn(
                            "bg-red-500 hover:bg-red-600 text-white h-8",
                            collapsed ? "w-full justify-center px-0" : "flex-1"
                        )}
                    >
                        <LogOut size={16} />
                        {!collapsed && <span className="ml-2">Logout</span>}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCollapsed(!collapsed)}
                        className="text-neutral-600 hover:text-neutral-900 h-8 w-8 flex-shrink-0"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </Button>
                </div>
            </div>
        </aside>
    );
}
