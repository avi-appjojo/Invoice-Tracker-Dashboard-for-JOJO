"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Upload,
  LogOut,
  Receipt,
  Menu,
  Home,
} from "lucide-react";
import { useState } from "react";

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
    icon: <LayoutDashboard size={18} />,
    roles: ["superadmin", "admin"],
  },
  {
    label: "Home",
    href: "/employee/pending-review",
    icon: <Home size={18} />,
    roles: ["employee"],
    departments: ["accounts"],
  },
  {
    label: "Invoices",
    href: "/employee/invoices",
    icon: <FileText size={18} />,
    roles: ["employee"],
  },
  {
    label: "Invoices",
    href: "/admin/invoices",
    icon: <FileText size={18} />,
    roles: ["superadmin", "admin"],
  },
  {
    label: "Add Invoice",
    href: "/employee/dashboard",
    icon: <Upload size={18} />,
    roles: ["employee"],
  },
  // Legacy sections (Supabase-backed) intentionally hidden in the new Sheets-first flow:
  // Vendors, Users, Alerts
];

export function MobileNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const userRole = user?.role || "employee";
  const userDept = (user?.department || "").toLowerCase();
  const filteredNav = navItems.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (item.departments?.length) {
      return item.departments.some((d) => d.toLowerCase() === userDept);
    }
    return true;
  });

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-neutral-700 hover:text-neutral-900"
            aria-label="Open menu"
          />
        }
      >
        <Menu size={20} />
      </SheetTrigger>
      <SheetContent side="left" className="bg-white border-neutral-200 p-0">
        <SheetHeader className="border-b border-neutral-200">
          <SheetTitle className="flex items-center gap-3 text-neutral-900">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-jojo-orange to-orange-400 flex items-center justify-center flex-shrink-0">
              <Receipt size={16} className="text-black" />
            </span>
            <span className="font-bold tracking-tight">JOJO</span>
          </SheetTitle>
        </SheetHeader>

        <div className="p-3">
          <nav className="space-y-1">
            {filteredNav.map((item) => {
              const isActive = pathname === item.href;
              const key = `${item.href}-${item.label}`;
              return (
                <Link
                  key={key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                    isActive
                      ? "bg-jojo-orange/15 text-jojo-orange"
                      : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 pt-4 border-t border-neutral-200">
            <Button
              onClick={handleLogout}
              className="w-full bg-red-500 hover:bg-red-600 text-white h-10 justify-center"
            >
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

