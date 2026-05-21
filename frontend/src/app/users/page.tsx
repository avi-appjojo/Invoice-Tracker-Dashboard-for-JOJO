"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCreateUserMutation, useListUsersQuery } from "@/lib/storeApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Users, Plus, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UserItem {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    created_at: string | null;
}

const roleColors: Record<string, string> = {
    superadmin: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    admin: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    employee: "bg-neutral-500/15 text-neutral-600 border-neutral-500/30",
};

export default function UsersPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role_name: "employee",
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (authLoading || !user) return;
        if (user.role === "employee") {
            router.replace("/upload");
            return;
        }
    }, [user, authLoading, router]);

    const shouldSkip = authLoading || !user || user.role === "employee";
    const { data, isFetching } = useListUsersQuery(undefined, { skip: shouldSkip });
    const users = (data?.data ?? []) as UserItem[];
    const loading = isFetching;
    const [createUser] = useCreateUserMutation();

    const handleCreate = async () => {
        if (!formData.name || !formData.email || !formData.password) return;
        setSaving(true);
        try {
            await createUser(formData).unwrap();
            setShowForm(false);
            setFormData({ name: "", email: "", password: "", role_name: "employee" });
        } catch (error) {
            console.error("Failed to create user:", error);
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || user?.role === "employee") {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px]">
                <div className="w-8 h-8 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-36" />
                        <Skeleton className="h-4 w-56" />
                    </div>
                    <Skeleton className="h-10 w-28 rounded-md" />
                </div>
                <Card className="bg-white border-neutral-200">
                    <CardContent className="p-0">
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-10 w-full" />
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Users & Roles</h1>
                    <p className="text-neutral-600 text-sm mt-1">Manage team members and their roles</p>
                </div>
                <Button
                    onClick={() => setShowForm(true)}
                    className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                >
                    <Plus size={16} className="mr-2" />
                    Add User
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-jojo-orange border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <Card className="bg-white border-neutral-200">
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Name</th>
                                    <th className="text-left text-neutral-600 font-medium px-4 py-3">Email</th>
                                    <th className="text-center text-neutral-600 font-medium px-4 py-3">Role</th>
                                    <th className="text-center text-neutral-600 font-medium px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="text-center text-neutral-600 py-8">
                                            No users found
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((u) => (
                                        <tr
                                            key={u.id}
                                            className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors"
                                        >
                                            <td className="px-4 py-3 text-neutral-900 font-medium flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-jojo-orange to-orange-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
                                                    {u.name.charAt(0).toUpperCase()}
                                                </div>
                                                {u.name}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={roleColors[u.role] || roleColors.employee}>
                                                    {u.role}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        u.status === "active"
                                                            ? "bg-jojo-orange/15 text-jojo-orange border-jojo-orange/30"
                                                            : "bg-red-500/15 text-red-400 border-red-500/30"
                                                    }
                                                >
                                                    {u.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            {/* Add User Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-white border-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-neutral-900">Add New User</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Name *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Email *</Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Password *</Label>
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Role</Label>
                            <Select
                                value={formData.role_name}
                                onValueChange={(v) => setFormData({ ...formData, role_name: v ?? "employee" })}
                            >
                                <SelectTrigger className="bg-neutral-50 border-neutral-300 text-neutral-900">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-neutral-300">
                                    <SelectItem value="employee">Employee</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="superadmin">Superadmin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <Button
                                variant="ghost"
                                onClick={() => setShowForm(false)}
                                className="text-neutral-600"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={saving || !formData.name || !formData.email || !formData.password}
                                className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                            >
                                {saving ? "Creating..." : "Create User"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
