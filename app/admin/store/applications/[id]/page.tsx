import { AdminStoreApplication } from "@/components/admin/admin-store";

export const metadata = { title: "Seller application · Insight Admin", robots: { index: false, follow: false } };

export default function Page({ params }: { params: { id: string } }) {
  return <AdminStoreApplication id={params.id} />;
}
