"use client";

import { useEffect, useState, useCallback } from "react";
import { putQueuedSale, generateClientTxnId } from "./db";
import { syncEngine, type SyncState } from "./sync-engine";

export interface SaleInput {
  branchId: string;
  customerId?: string;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CREDIT" | "OTHER";
  items: { productId: string; quantity: number; discount?: number }[];
  discountPercent?: number;
  creditDueDate?: string;
}

/**
 * The only entry point the POS screen needs. Every sale is written to the
 * local queue first — even when online — and the sync engine takes it from
 * there. This means the POS never blocks the cashier on network latency:
 * "Complete Sale" always succeeds locally and instantly, matching the
 * "instantaneous" requirement in section 41.
 */
export function useOfflineSync() {
  const [state, setState] = useState<SyncState>({
    phase: "idle",
    pending: 0,
    failed: 0,
    syncingIndex: 0,
    syncingTotal: 0,
    lastSyncedAt: null,
  });

  useEffect(() => {
    syncEngine.start();
    return syncEngine.subscribe(setState);
  }, []);

  const queueSale = useCallback(async (sale: SaleInput) => {
    const clientTxnId = generateClientTxnId();
    const now = new Date().toISOString();

    await putQueuedSale({
      clientTxnId,
      payload: { ...sale, clientTxnId },
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    await syncEngine.notifyEnqueued();
    return clientTxnId;
  }, []);

  const retryFailed = useCallback(() => syncEngine.retryFailed(), []);

  return { ...state, queueSale, retryFailed };
}

/** Renders the exact status strings called for in section 30. */
export function formatSyncStatus(state: SyncState): string {
  if (state.phase === "offline") {
    const count = state.pending + state.failed;
    return count > 0 ? `Offline — ${count} transaction${count === 1 ? "" : "s"} waiting to sync` : "Offline";
  }
  if (state.phase === "syncing") {
    return `Synchronizing — ${state.syncingIndex}/${state.syncingTotal}`;
  }
  if (state.failed > 0) {
    return `${state.failed} transaction${state.failed === 1 ? "" : "s"} could not sync — review needed`;
  }
  return "Online — Synced";
}
