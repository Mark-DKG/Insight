import type { Metadata } from "next";
import Apply from "@/components/apply";

export const metadata: Metadata = { title: "Seller application · Insight", robots: { index: false, follow: false } };

export default function Page() {
  return <Apply />;
}
