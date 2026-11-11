import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { platformAudit, requireAdmin } from "@/lib/admin/session";
import { notifyBusiness } from "@/lib/notify";

const Schema = z.object({ action: z.enum(["suspend", "reinstate", "feature", "unfeature"]), reason: z.string().trim().max(1000).optional() });

// PATCH — suspend/reinstate selling (listings disappear from the marketplace
// while suspended; nothing is deleted) or feature a seller on the home page.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin("marketplace.manage");
  if (ctx instanceof NextResponse) return ctx;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { action } = parsed.data;
  const reason = parsed.data.reason ?? "";
  if ((action === "suspend" || action === "reinstate") && reason.length < 5) return NextResponse.json({ error: "Give a reason (at least 5 characters)." }, { status: 400 });
  const seller = await prisma.storeSeller.findUnique({ where: { id: params.id }, include: { business: { select: { name: true } } } });
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  if (action === "suspend" && seller.status === "SUSPENDED") return NextResponse.json({ error: "This seller is already suspended." }, { status: 409 });
  if (action === "reinstate" && seller.status === "ACTIVE") return NextResponse.json({ error: "This seller is already active." }, { status: 409 });

  const data =
    action === "suspend" ? { status: "SUSPENDED" as const, suspendedAt: new Date(), suspendedReason: reason }
    : action === "reinstate" ? { status: "ACTIVE" as const, suspendedAt: null, suspendedReason: null }
    : { isFeatured: action === "feature" };
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.storeSeller.update({ where: { id: seller.id }, data });
    await platformAudit(ctx, { action: `STORE_SELLER_${action.toUpperCase()}`, targetBusinessId: seller.businessId, targetType: "StoreSeller", targetId: seller.id, reason: reason || null, before: { status: seller.status, isFeatured: seller.isFeatured }, after: { status: s.status, isFeatured: s.isFeatured } }, tx);
    if (action === "suspend" || action === "reinstate") {
      await notifyBusiness({
        businessId: seller.businessId, type: "STORE_SELLER", roles: ["OWNER", "MANAGER"],
        title: action === "suspend" ? "Insight Store selling suspended" : "Insight Store selling reinstated",
        message: action === "suspend" ? `Your listings are hidden from Insight Store. Reason: ${reason}` : "Your live listings are visible on Insight Store again.",
        link: "/seller", dedupeKey: `seller:${seller.id}:${action}:${Date.now()}`,
      }, tx);
    }
    return s;
  });
  return NextResponse.json({ seller: updated });
}
