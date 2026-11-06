/**
 * Thin IndexedDB wrapper around a single object store: queued_sales.
 *
 * Every sale made while offline (or even online — the POS always writes
 * here first) lands in this store keyed by its clientTxnId. The sync engine
 * (sync-engine.ts) is the only thing that reads/mutates status; the POS UI
 * only ever calls `queueSale`.
 *
 * No external dependency (idb, dexie, etc.) is used deliberately — this is
 * small enough to keep dependency-free so it survives long-term without
 * needing to track a library's breaking changes.
 */

export type QueuedSaleStatus = "pending" | "syncing" | "synced" | "failed";

export interface QueuedSale {
  clientTxnId: string;
  payload: unknown; // the CreateSaleSchema-shaped body from app/api/sales/route.ts
  status: QueuedSaleStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = "insight-offline";
const DB_VERSION = 1;
const STORE = "queued_sales";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientTxnId" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function putQueuedSale(sale: QueuedSale): Promise<void> {
  await withStore("readwrite", (store) => store.put(sale));
}

export async function getQueuedSale(clientTxnId: string): Promise<QueuedSale | undefined> {
  return withStore("readonly", (store) => store.get(clientTxnId));
}

export async function getAllQueuedSales(): Promise<QueuedSale[]> {
  return withStore("readonly", (store) => store.getAll());
}

export async function getQueuedSalesByStatus(status: QueuedSaleStatus): Promise<QueuedSale[]> {
  const all = await getAllQueuedSales();
  return all.filter((s) => s.status === status);
}

export async function deleteQueuedSale(clientTxnId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(clientTxnId));
}

/** Generates a locally-unique transaction id. Stable across retries of the
 *  same sale — the caller creates this once, before the first sync attempt,
 *  and reuses it for every retry so the server can deduplicate. */
export function generateClientTxnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
