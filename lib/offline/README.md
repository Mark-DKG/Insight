# Offline Sync — how the pieces fit together

**lib/offline/db.ts**
Raw IndexedDB wrapper. One store, `queued_sales`, keyed by `clientTxnId`.
No dependency on an external library on purpose — this is small and stable
enough to own directly.

**lib/offline/sync-engine.ts**
A singleton that:
- listens for `online`/`offline` events,
- walks the pending queue oldest-first whenever it's online,
- POSTs each queued sale to `/api/sales`,
- tells transient failures (network drop, 5xx) apart from genuine rejections
  (insufficient stock, validation) — only genuine rejections are surfaced to
  a person as needing attention; transient ones just retry,
- treats a 409 with `message: "Already recorded."` (the API's idempotency
  response) as success, so a retried sync of an already-synced sale doesn't
  get flagged as an error.

**lib/offline/use-offline-sync.ts**
The hook the POS screen calls. `queueSale(saleInput)` writes to IndexedDB
and returns immediately — the cashier-facing "Complete Sale" button never
waits on a network round trip. `formatSyncStatus(state)` produces the exact
strings from spec section 30 ("Online — Synced", "Offline — 7 transactions
waiting to sync", "Synchronizing — 4/7").

**public/sw.js**
Caches the app shell only — never API responses. Transactional state lives
exclusively in the IndexedDB queue above, so there is one source of truth
for "what still needs to sync," not two caches that could disagree.

## Wiring into the POS screen shown earlier

Replace the local `completeSale` handler in `insight_pos.jsx` with:

```jsx
import { useOfflineSync, formatSyncStatus } from "@/lib/offline/use-offline-sync";

const { queueSale, ...syncState } = useOfflineSync();

const completeSale = async () => {
  if (cart.length === 0) return;
  const clientTxnId = await queueSale({
    branchId: currentBranchId,
    customerId: customer === "Walk-in" ? undefined : customerId,
    paymentMethod: payment.toUpperCase(),
    items: cart.map((i) => ({ productId: i.id, quantity: i.qty })),
    discountPercent: discountPct,
  });
  setCompleted({ id: clientTxnId, /* ...rest of the receipt data for display */ });
  setCart([]);
};
```

The receipt modal can display immediately using the cart data already in
memory — it doesn't need to wait for `queueSale` to resolve against the
server, because it already has.

Render `formatSyncStatus(syncState)` in the header status strip in place of
the static "Online — Synced" text used in the mock screen.
