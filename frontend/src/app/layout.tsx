import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/layout/client-layout";

const poppins = Poppins({
  subsets: ["latin"],
  weight: [
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
  ],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "JOJO Invoice Tracker",
  description:
    "Invoice Tracker Dashboard for JOJO — Manage invoices, vendors, and payments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${poppins.variable} font-sans antialiased bg-neutral-50 text-neutral-900`}
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
