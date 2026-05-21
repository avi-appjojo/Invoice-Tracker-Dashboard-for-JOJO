"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  useCreateCompanyMutation,
  useCreateVendorMutation,
  useListCompaniesQuery,
  useListVendorsQuery,
  useUpdateCompanyMutation,
  useUpdateVendorMutation,
} from "@/lib/storeApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Building2, Plus, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Company = {
  id: string;
  name: string;
  display_name?: string | null;
  is_active: boolean;
};

type Vendor = {
  id: string;
  vendor_name: string;
  category: string | null;
};

// Same options as departments (category and department are different but share the same list)
const DEPARTMENT_OPTIONS = ["Accounts", "Tech", "HR", "Operations"] as const;
const OTHER_VALUE = "Other";

export default function EmployeeCompaniesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    display_name: "",
  });
  const [companySaving, setCompanySaving] = useState(false);

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorForm, setVendorForm] = useState({
    vendor_name: "",
    category: "",
    categoryOther: "",
  });
  const [vendorSaving, setVendorSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.role !== "employee") {
      router.replace("/login");
      return;
    }
    const dept = (user.department || "").toLowerCase();
    if (dept !== "accounts") {
      router.replace("/employee/dashboard");
    }
  }, [user, authLoading, router]);

  const isAccounts = (user?.department || "").toLowerCase() === "accounts";
  const shouldSkip = authLoading || !user || user.role !== "employee" || !isAccounts;
  const { data: companiesData, isFetching: companiesFetching } = useListCompaniesQuery(undefined, {
    skip: shouldSkip,
  });
  const { data: vendorsData, isFetching: vendorsFetching } = useListVendorsQuery(undefined, { skip: shouldSkip });
  const companies = (companiesData ?? []) as unknown as Company[];
  const vendors = (vendorsData?.data ?? []) as Vendor[];
  const loading = companiesFetching || vendorsFetching;

  const [createCompany] = useCreateCompanyMutation();
  const [updateCompany] = useUpdateCompanyMutation();
  const [createVendor] = useCreateVendorMutation();
  const [updateVendor] = useUpdateVendorMutation();

  const openAddCompany = () => {
    setEditingCompany(null);
    setCompanyForm({ name: "", display_name: "" });
    setCompanyDialogOpen(true);
  };

  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    setCompanyForm({
      name: company.name,
      display_name: company.display_name || "",
    });
    setCompanyDialogOpen(true);
  };

  const saveCompany = async () => {
    if (!companyForm.name.trim()) return;
    setCompanySaving(true);
    try {
      if (editingCompany) {
        await updateCompany({
          id: editingCompany.id,
          body: {
          name: companyForm.name.trim(),
          display_name: companyForm.display_name.trim() || null,
          },
        }).unwrap();
      } else {
        await createCompany({
          name: companyForm.name.trim(),
          display_name: companyForm.display_name.trim() || null,
        }).unwrap();
      }
      setCompanyDialogOpen(false);
    } finally {
      setCompanySaving(false);
    }
  };

  const openAddVendor = () => {
    setEditingVendor(null);
    setVendorForm({ vendor_name: "", category: "", categoryOther: "" });
    setVendorDialogOpen(true);
  };

  const openEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    const cat = vendor.category || "";
    const isOther = cat && !DEPARTMENT_OPTIONS.includes(cat as (typeof DEPARTMENT_OPTIONS)[number]);
    setVendorForm({
      vendor_name: vendor.vendor_name,
      category: isOther ? OTHER_VALUE : cat,
      categoryOther: isOther ? cat : "",
    });
    setVendorDialogOpen(true);
  };

  const saveVendor = async () => {
    if (!vendorForm.vendor_name.trim()) return;
    const categoryValue =
      vendorForm.category === OTHER_VALUE
        ? vendorForm.categoryOther.trim() || null
        : vendorForm.category.trim() || null;
    setVendorSaving(true);
    try {
      if (editingVendor) {
        await updateVendor({
          id: editingVendor.id,
          body: {
            vendor_name: vendorForm.vendor_name.trim(),
            category: categoryValue,
          },
        }).unwrap();
      } else {
        await createVendor({
          vendor_name: vendorForm.vendor_name.trim(),
          category: categoryValue,
        }).unwrap();
      }
      setVendorDialogOpen(false);
    } finally {
      setVendorSaving(false);
    }
  };

  if (authLoading || user?.role !== "employee" || !isAccounts) {
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
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Companies & Vendors</h1>
          <p className="text-neutral-600 text-sm mt-1">
            Manage the company and vendor names that appear in your invoice views.
          </p>
        </div>
      </div>

      {/* Companies */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Companies</h2>
          <Button
            onClick={openAddCompany}
            className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
          >
            <Plus size={16} className="mr-2" />
            Add Company
          </Button>
        </div>
        {companies.length === 0 ? (
          <Card className="bg-white border-neutral-200">
            <CardContent className="py-8 text-center text-neutral-600">
              No companies yet. Add your first company.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map((company) => (
              <Card
                key={company.id}
                className="bg-white border-neutral-200 hover:border-neutral-300 transition-all"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                        <Building2 size={20} className="text-jojo-orange" />
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {company.display_name || company.name}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Key: {company.name}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCompany(company)}
                      className="text-neutral-600 hover:text-neutral-900 h-8 w-8 p-0"
                    >
                      <Edit2 size={14} />
                    </Button>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] mt-1 border-neutral-300 ${
                      company.is_active
                        ? "text-green-700 bg-green-50"
                        : "text-neutral-600 bg-neutral-50"
                    }`}
                  >
                    {company.is_active ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Vendors */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Vendors</h2>
          <Button
            onClick={openAddVendor}
            className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
          >
            <Plus size={16} className="mr-2" />
            Add Vendor
          </Button>
        </div>
        {vendors.length === 0 ? (
          <Card className="bg-white border-neutral-200">
            <CardContent className="py-8 text-center text-neutral-600">
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
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {vendor.vendor_name}
                      </p>
                      {vendor.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] mt-1 border-neutral-300 text-neutral-600"
                        >
                          {vendor.category}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditVendor(vendor)}
                      className="text-neutral-600 hover:text-neutral-900 h-8 w-8 p-0"
                    >
                      <Edit2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Company dialog */}
      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="bg-white border-neutral-200">
          <DialogHeader>
            <DialogTitle className="text-neutral-900">
              {editingCompany ? "Edit Company" : "Add Company"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-neutral-600">Company Name *</Label>
              <Input
                value={companyForm.name}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, name: e.target.value }))
                }
                className="bg-neutral-50 border-neutral-300 text-neutral-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-600">Display Name</Label>
              <Input
                value={companyForm.display_name}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, display_name: e.target.value }))
                }
                placeholder="Optional nicer label"
                className="bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="ghost"
                onClick={() => setCompanyDialogOpen(false)}
                className="text-neutral-600"
              >
                Cancel
              </Button>
              <Button
                onClick={saveCompany}
                disabled={companySaving || !companyForm.name.trim()}
                className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
              >
                {companySaving ? "Saving..." : editingCompany ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
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
                value={vendorForm.vendor_name}
                onChange={(e) =>
                  setVendorForm((f) => ({ ...f, vendor_name: e.target.value }))
                }
                className="bg-neutral-50 border-neutral-300 text-neutral-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-600">Category</Label>
              <Select
                value={vendorForm.category || ""}
                onValueChange={(value) =>
                  setVendorForm((f) => ({ ...f, category: value, categoryOther: value === OTHER_VALUE ? f.categoryOther : "" }))
                }
              >
                <SelectTrigger className="bg-neutral-50 border-neutral-300 text-neutral-900">
                  <SelectValue placeholder="Select category (same as departments)" />
                </SelectTrigger>
                <SelectContent className="bg-white border-neutral-300">
                  <SelectItem value="" className="text-neutral-500">
                    None
                  </SelectItem>
                  {DEPARTMENT_OPTIONS.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_VALUE}>Other</SelectItem>
                </SelectContent>
              </Select>
              {vendorForm.category === OTHER_VALUE && (
                <Input
                  value={vendorForm.categoryOther}
                  onChange={(e) =>
                    setVendorForm((f) => ({ ...f, categoryOther: e.target.value }))
                  }
                  placeholder="Enter category name"
                  className="bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 mt-1"
                />
              )}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="ghost"
                onClick={() => setVendorDialogOpen(false)}
                className="text-neutral-600"
              >
                Cancel
              </Button>
              <Button
                onClick={saveVendor}
                disabled={vendorSaving || !vendorForm.vendor_name.trim()}
                className="bg-gradient-to-r from-jojo-orange to-orange-500 text-black font-semibold"
              >
                {vendorSaving ? "Saving..." : editingVendor ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

