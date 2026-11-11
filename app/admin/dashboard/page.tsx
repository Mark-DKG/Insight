import AdminDashboard from "@/components/admin/admin-dashboard";

export const metadata = { title: "Dashboard · Insight Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <AdminDashboard />;
}
