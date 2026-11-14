import type { Prisma } from "@prisma/client";

// ----------------------------------------------------------------------------
// Concurrency-safe stock primitives (Phase A1).
//
// Every code path that changes InventoryLevel.quantity (POS sale, manual
// adjustment, branch transfer, goods received, void/refund, and the Insight
// Store order confirm) uses the same rule: the change is a single conditional
// SQL UPDATE ("quantity >= n" for removals, an increment for additions).
// Postgres takes the row lock for the UPDATE and re-evaluates the condition
// against the committed row, so two concurrent requests can never both
// consume the same units, and nothing is ever written from a stale read.
// The database also enforces quantity >= 0 (CHECK constraint) as a last line
// of defence.
// ----------------------------------------------------------------------------

export class InsufficientStockError extends Error {
  constructor(public productId: string, public branchId: string, public requested: number) {
    super("Insufficient stock");
  }
}

/** Atomically remove `qty` units. Returns false (and changes nothing) when fewer than `qty` are available. */
export async function removeStock(tx: Prisma.TransactionClient, productId: string, branchId: string, qty: number): Promise<boolean> {
  const r = await tx.inventoryLevel.updateMany({
    where: { productId, branchId, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  return r.count === 1;
}

/** Atomically add `qty` units, creating the level row if the branch has none yet. */
export async function addStock(tx: Prisma.TransactionClient, productId: string, branchId: string, qty: number): Promise<void> {
  await tx.inventoryLevel.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: { quantity: { increment: qty } },
    create: { productId, branchId, quantity: qty },
  });
}

/**
 * Apply a signed change atomically (positive adds, negative removes) and
 * return the quantity AFTER the change, read from the same row in the same
 * statement. Returns null when a removal would take stock below zero.
 */
export async function changeStock(tx: Prisma.TransactionClient, productId: string, branchId: string, delta: number): Promise<number | null> {
  if (delta < 0) {
    if (!(await removeStock(tx, productId, branchId, -delta))) return null;
  } else {
    await addStock(tx, productId, branchId, delta);
  }
  const level = await tx.inventoryLevel.findUnique({ where: { productId_branchId: { productId, branchId } } });
  return level?.quantity ?? 0;
}

/**
 * Take the row lock on a product's stock at a branch (creating a zero row if
 * none exists) and return the quantity as of the lock. Use when an operation
 * must make a decision from the current quantity (count corrections, transfers).
 * To avoid deadlocks, lock several rows in a consistent order (e.g. sorted by
 * branchId, then productId).
 */
export async function lockLevel(tx: Prisma.TransactionClient, productId: string, branchId: string): Promise<number> {
  await tx.inventoryLevel.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: {},
    create: { productId, branchId, quantity: 0 },
  });
  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT "quantity" FROM "InventoryLevel" WHERE "productId" = ${productId} AND "branchId" = ${branchId} FOR UPDATE`;
  return rows[0]?.quantity ?? 0;
}
