"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Receipt, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const result = await login(email, password);
        if (result.error) {
            setError(result.error);
        } else {
            const role = result.user?.role;
            const department = (result.user?.department || "").toLowerCase();
            if (role === "employee") {
                router.push(department === "accounts" ? "/employee" : "/employee/invoices");
            } else {
                router.push("/admin/dashboard");
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
            {/* Background gradient */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-jojo-orange/20 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
            </div>

            <Card className="relative w-full max-w-md bg-white/80 backdrop-blur-xl border-neutral-200 shadow-2xl">
                <CardHeader className="text-center space-y-4 pb-2">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-jojo-orange to-orange-400 flex items-center justify-center shadow-lg shadow-jojo-orange/20">
                        <Receipt size={28} className="text-black" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">JOJO Invoice Tracker</h1>
                        <p className="text-neutral-600 text-sm mt-1">
                            Sign in to manage your invoices
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-neutral-600">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-jojo-orange focus:ring-jojo-orange/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-neutral-600">
                                Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-jojo-orange focus:ring-jojo-orange/20 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-jojo-orange to-orange-500 hover:from-orange-600 hover:to-orange-600 text-black font-semibold h-11 shadow-lg shadow-jojo-orange/20"
                        >
                            {loading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Signing in...
                                </div>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
