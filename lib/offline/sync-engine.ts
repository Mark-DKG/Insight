import {
  getAllQueuedSales,
  getQueuedSalesByStatus,
  putQueuedSale,
  deleteQueuedSale,
  type QueuedSale,
} from "./db";

/**
 * Sync engine responsibilities (spec sections 30-31):
 *  1. Detect connectivity changes.
 *  2. Process queued transactions in order, oldest first.
 *  3. Never silently overwrite or lose a transaction: a failure that isn't
 *     "the server already has this" stays in the queue with the reason
 *     attached, and the person is told, not just logged to a console.
 *  4. Report a single, subscribable status object the UI can render as
 *     "Online — Synced" / "Offline — N waiting" / "Synchronizing — X/Y".
 */

export type SyncPhase = "offline" | "idle" | "syncing" | "error";

export interface SyncState {
  phase: SyncPhase;
  pending: number;
  failed: number;
  syncingIndex: number; // 1-based position of the item currently syncing
  syncingTotal: number;
  lastSyncedAt: string | null;
}

type Listener = (state: SyncState) => void;

class SyncEngine {
  private listeners = new Set<Listener>();
  private state: SyncState = {
    phase: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
    pending: 0,
    failed: 0,
    syncingIndex: 0,
    syncingTotal: 0,
    lastSyncedAt: null,
  };
  private processing = false;
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());

    // A sale left in "syncing" means the page closed mid-request. Its outcome
    // is unknown, so put it back to pending: the server's clientTxnId check
    // makes resending it safe (an already-recorded sale is not duplicated).
    getQueuedSalesByStatus("syncing")
      .then((stuck) => Promise.all(stuck.map((s) => putQueuedSale({ ...s, status: "pending" }))))
      .catch(() => null)
      .then(() => this.refreshCounts())
      .then(() => {
        if (navigator.onLine) this.processQueue();
      });

    // Periodic retry for transient failures while the page stays open.
    window.setInterval(() => {
      if (navigator.onLine && this.state.pending > 0) this.processQueue();
    }, 60_000);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l(this.state));
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private async refreshCounts() {
    const all = await getAllQueuedSales();
    this.setState({
      pending: all.filter((s) => s.status === "pending").length,
      failed: all.filter((s) => s.status === "failed").length,
    });
  }

  private handleOnline() {
    this.setState({ phase: "idle" });
    this.processQueue();
  }

  private handleOffline() {
    this.setState({ phase: "offline" });
  }

  /** Called by the POS after writing a new sale to the IndexedDB queue. */
  async notifyEnqueued() {
    await this.refreshCounts();
    if (typeof navigator !== "undefined" && navigator.onLine) {
      this.processQueue();
    }
  }

  async retryFailed() {
    const failed = await getQueuedSalesByStatus("failed");
    for (const sale of failed) {
      await putQueuedSale({ ...sale, status: "pending", lastError: undefined });
    }
    await this.refreshCounts();
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setState({ phase: "offline" });
      return;
    }

    const queue = (await getQueuedSalesByStatus("pending")).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    if (queue.length === 0) {
      await this.refreshCounts();
      this.setState({ phase: "idle", syncingIndex: 0, syncingTotal: 0 });
      return;
    }

    this.processing = true;
    this.setState({ phase: "syncing", syncingTotal: queue.length, syncingIndex: 0 });

    for (let i = 0; i < queue.length; i++) {
      const sale = queue[i];
      this.setState({ syncingIndex: i + 1 });
      await putQueuedSale({ ...sale, status: "syncing" });

      const result = await this.submitSale(sale);

      if (result.outcome === "synced") {
        await deleteQueuedSale(sale.clientTxnId);
      } else if (result.outcome === "rejected") {
        // A definitive business-rule rejection (e.g. insufficient stock at
        // sync time because another device sold the last units). This is a
        // genuine conflict, not a transient network failure: it needs a
        // person's attention, so it's marked failed with the reason kept.
        await putQueuedSale({
          ...sale,
          status: "failed",
          attempts: sale.attempts + 1,
          lastError: result.message,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Transient failure — network drop mid-sync, server error. Leave it
        // pending so the next connectivity event or manual retry picks it
        // back up; never drop a transaction on a transient error.
        await putQueuedSale({
          ...sale,
          status: "pending",
          attempts: sale.attempts + 1,
          lastError: result.message,
          updatedAt: new Date().toISOString(),
        });
        // Stop this pass on the first transient failure rather than
        // hammering a down server for every remaining item.
        break;
      }

      // Re-check connectivity between items in case it dropped mid-batch.
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }

    this.processing = false;
    await this.refreshCounts();

    const stillOnline = typeof navigator === "undefined" || navigator.onLine;
    this.setState({
      phase: stillOnline ? "idle" : "offline",
      syncingIndex: 0,
      syncingTotal: 0,
      lastSyncedAt: new Date().toISOString(),
    });
  }

  private async submitSale(
    sale: QueuedSale
  ): Promise<{ outcome: "synced" | "rejected" | "transient"; message?: string }> {
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale.payload),
      });

      if (response.ok) {
        return { outcome: "synced" };
      }

      // 409 covers both "insufficient stock" conflicts and the idempotent
      // "already recorded" case from the API — either way the sale is
      // resolved and should leave the queue, but a genuine stock conflict
      // should still be surfaced so the business owner sees it happened.
      // Expired session: not the sale's fault. Keep it pending; it syncs
      // after the user signs in again (or the token refreshes).
      if (response.status === 401) {
        return { outcome: "transient", message: "Session expired — sign in again to finish syncing." };
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        if (body?.message === "Already recorded.") {
          return { outcome: "synced" };
        }
        return { outcome: "rejected", message: body?.error ?? "This sale could not be reconciled." };
      }

      if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => ({}));
        return { outcome: "rejected", message: body?.error ?? "This sale was rejected by the server." };
      }

      return { outcome: "transient", message: `Server error (${response.status}).` };
    } catch {
      return { outcome: "transient", message: "No network connection." };
    }
  }
}

export const syncEngine = new SyncEngine();
