import type { Metadata } from "next";
import ChoosePackage from "@/components/choose-package";

export const metadata: Metadata = { title: "Choose your package · Insight", robots: { index: false, follow: false } };

export default function Page() {
  return <ChoosePackage />;
}
