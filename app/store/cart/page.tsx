import { CartPage } from "@/components/store/store-client";
import { storeIsOpen } from "@/lib/store/public";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your cart", robots: { index: false } };

export default async function Cart() {
  const status = await storeIsOpen();
  return (
    <>
      <h1 className="st-h1" style={{ marginBottom: 14 }}>Your cart</h1>
      <CartPage storeOpen={status.isOpen} announcement={status.announcement} />
    </>
  );
}
