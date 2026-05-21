"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCreateVendorMutation, useListVendorsQuery, useUpdateVendorMutation } from "@/lib/storeApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Vendor {
    id: string;
    vendor_name: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    gst_number: string | null;
    category: string | null;
    status: string;
}

export default function VendorsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [formData, setFormData] = useState({
        vendor_name: "",
        contact_person: "",
        email: "",
        phone: "",
        gst_number: "",
        category: "",
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
    const { data, isFetching } = useListVendorsQuery(undefined, { skip: shouldSkip });
    const vendors = (data?.data ?? []) as Vendor[];
    const loading = isFetching;

    const [createVendor] = useCreateVendorMutation();
    const [updateVendor] = useUpdateVendorMutation();

    const openAddForm = () => {
        setEditingVendor(null);
        setFormData({ vendor_name: "", contact_person: "", email: "", phone: "", gst_number: "", category: "" });
        setShowForm(true);
    };

    const openEditForm = (vendor: Vendor) => {
        setEditingVendor(vendor);
        setFormData({
            vendor_name: vendor.vendor_name,
            contact_person: vendor.contact_person || "",
            email: vendor.email || "",
            phone: vendor.phone || "",
            gst_number: vendor.gst_number || "",
            category: vendor.category || "",
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!formData.vendor_name.trim()) return;
        setSaving(true);
        try {
            if (editingVendor) {
                await updateVendor({ id: editingVendor.id, body: formData }).unwrap();
            } else {
                await createVendor(formData).unwrap();
            }
            setShowForm(false);
        } catch (error) {
            console.error("Failed to save vendor:", error);
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
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-10 w-32 rounded-md" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Card key={i} className="bg-white border-neutral-200">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-10 w-10 rounded-xl" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-5 w-32" />
                                            <Skeleton className="h-4 w-16" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Vendors</h1>
                    <p className="text-neutral-600 text-sm mt-1">
                        Manage your vendor directory
                    </p>
                </div>
                <Button
                    onClick={openAddForm}
                    className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                >
                    <Plus size={16} className="mr-2" />
                    Add Vendor
                </Button>
            </div>

            {/* Vendor Cards */}
            {vendors.length === 0 ? (
                <Card className="bg-white border-neutral-200">
                    <CardContent className="py-12 text-center text-neutral-600">
                        No vendors yet. Add your first vendor.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {vendors.map((vendor) => (
                        <Card
                            key={vendor.id}
                            className="bg-white border-neutral-200 hover:border-neutral-300 transition-all"
                        >
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                                            <Building2 size={20} className="text-jojo-orange" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-neutral-900">{vendor.vendor_name}</p>
                                            {vendor.category && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] mt-1 border-neutral-300 text-neutral-600"
                                                >
                                                    {vendor.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEditForm(vendor)}
                                        className="text-neutral-600 hover:text-neutral-900 h-8 w-8 p-0"
                                    >
                                        <Edit2 size={14} />
                                    </Button>
                                </div>
                                <div className="space-y-1.5 text-sm">
                                    {vendor.contact_person && (
                                        <p className="text-neutral-600">
                                            <span className="text-neutral-600 w-16 inline-block">Contact:</span>{" "}
                                            {vendor.contact_person}
                                        </p>
                                    )}
                                    {vendor.email && (
                                        <p className="text-neutral-600">
                                            <span className="text-neutral-600 w-16 inline-block">Email:</span>{" "}
                                            {vendor.email}
                                        </p>
                                    )}
                                    {vendor.gst_number && (
                                        <p className="text-neutral-600">
                                            <span className="text-neutral-600 w-16 inline-block">GST:</span>{" "}
                                            {vendor.gst_number}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-white border-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-neutral-900">
                            {editingVendor ? "Edit Vendor" : "Add Vendor"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Vendor Name *</Label>
                            <Input
                                value={formData.vendor_name}
                                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                                className="bg-neutral-50 border-neutral-300 text-neutral-900"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="text-neutral-600">Contact Person</Label>
                                <Input
                                    value={formData.contact_person}
                                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                    className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-neutral-600">Email</Label>
                                <Input
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="text-neutral-600">Phone</Label>
                                <Input
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-neutral-600">GST Number</Label>
                                <Input
                                    value={formData.gst_number}
                                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                                    className="bg-neutral-50 border-neutral-300 text-neutral-900"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-600">Category</Label>
                            <Input
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                placeholder="e.g., Cloud, Production, Marketing"
                                className="bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                            />
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
                                onClick={handleSave}
                                disabled={saving || !formData.vendor_name.trim()}
                                className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
                            >
                                {saving ? "Saving..." : editingVendor ? "Update" : "Create"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
