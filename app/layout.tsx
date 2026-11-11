import type { Metadata } from "next";
import "./globals.css";
import AuthFetch from "@/components/auth-fetch";
import ServiceWorkerRegister from "@/components/sw-register";
import ErrorListener from "@/components/error-listener";

export const metadata: Metadata = {
  title: "Insight by 9DEVs",
  description: "Inventory, sales, profit, and business intelligence for retail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthFetch />
        <ServiceWorkerRegister />
        <ErrorListener />
        {children}
      </body>
    </html>
  );
}
