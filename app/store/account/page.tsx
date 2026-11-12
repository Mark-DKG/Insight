import type { Metadata } from "next";
import { AccountPage } from "@/components/store/shopper";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <>
      <h1 style={{ margin: "0 0 16px", fontSize: 24 }}>My account</h1>
      <AccountPage />
    </>
  );
}
