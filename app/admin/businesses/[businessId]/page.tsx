import AdminBusinessDetail from "@/components/admin/admin-business-detail";

export const metadata = { title: "Business · Insight Admin", robots: { index: false, follow: false } };

export default function Page({ params }: { params: { businessId: string } }) {
  return <AdminBusinessDetail businessId={params.businessId} />;
}
