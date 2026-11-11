import { OrderStatus } from "@/components/store/store-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order status", robots: { index: false } };

export default function OrderPage({ params }: { params: { reference: string } }) {
  return <OrderStatus reference={params.reference.slice(0, 20)} />;
}
