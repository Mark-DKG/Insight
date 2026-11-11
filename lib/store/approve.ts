import type { Prisma } from "@prisma/client";
import { slugify } from "./core";

type Tx = Prisma.TransactionClient;

/** Creates the seller record for an approved application (inside the approval transaction). */
export async function createSellerFromApplication(tx: Tx, app: { id: string; businessId: string; data: Prisma.JsonValue }) {
  const d = (app.data ?? {}) as Record<string, unknown>;
  const business = await tx.business.findUnique({ where: { id: app.businessId }, select: { name: true, phone: true, email: true } });
  const base = slugify(String(d.tradingName || d.registeredName || business?.name || "seller"));
  let slug = base;
  for (let i = 2; await tx.storeSeller.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`.slice(0, 70);
  const s = (k: string, max = 300) => (typeof d[k] === "string" && (d[k] as string).trim() ? (d[k] as string).trim().slice(0, max) : null);
  return tx.storeSeller.create({
    data: {
      businessId: app.businessId, slug, approvedApplicationId: app.id,
      description: s("description", 2000), city: s("city", 80), region: s("region", 80), country: s("country", 80),
      publicPhone: s("phone", 40) ?? business?.phone ?? null, publicEmail: s("email", 160) ?? business?.email ?? null,
      offersDelivery: d.offersDelivery === true, offersCollection: d.offersCollection !== false || d.offersDelivery !== true,
    },
  });
}
