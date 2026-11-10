// Receipt helpers: print (thermal 80mm or standard printer; the browser's
// print dialog also offers "Save as PDF") and share (Web Share / WhatsApp).

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n, cur) => `${cur ? cur + " " : ""}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_LABELS = {
  CASH: "Cash", MOBILE_MONEY: "Mobile Money", BANK_TRANSFER: "Bank Transfer",
  CARD: "Card", CREDIT: "Credit", OTHER: "Other",
};

/**
 * Normalises the pieces we have (a /api/sales/[id] response, or the POS's
 * just-completed sale) into one shape the renderers use.
 * data: { business, receiptNumber, date, branch, cashier, customer, items:[{name,qty,unitPrice}],
 *         subtotal, discount, total, paymentMethod, status }
 */
export function buildReceiptFromSale({ sale, business }) {
  return {
    business: business ?? {},
    receiptNumber: sale.receiptNumber,
    date: sale.createdAt,
    branch: sale.branch?.name ?? "",
    cashier: sale.cashier?.name ?? "",
    customer: sale.customer?.name ?? "Walk-in",
    items: (sale.items ?? []).map((i) => ({
      name: i.product?.name ?? "Item",
      qty: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discountAmount),
    total: Number(sale.totalAmount),
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    voidedReason: sale.voidedReason,
  };
}

export function receiptText(r) {
  const cur = r.business?.currency;
  const lines = [
    r.business?.name || "Receipt",
    r.branch ? `Branch: ${r.branch}` : null,
    `Receipt: ${r.receiptNumber}`,
    `Date: ${new Date(r.date).toLocaleString()}`,
    r.cashier ? `Cashier: ${r.cashier}` : null,
    `Customer: ${r.customer}`,
    "",
    ...r.items.map((i) => `${i.qty} x ${i.name}  ${money(i.qty * i.unitPrice, cur)}`),
    "",
    r.discount > 0 ? `Discount: -${money(r.discount, cur)}` : null,
    `TOTAL: ${money(r.total, cur)}`,
    `Paid by: ${METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}`,
    "",
    "Thank you for your business.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function printReceipt(r) {
  const cur = r.business?.currency;
  const rows = r.items
    .map(
      (i) =>
        `<tr><td>${esc(i.qty)} x ${esc(i.name)}</td><td class="r">${esc(money(i.qty * i.unitPrice, cur))}</td></tr>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.receiptNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .r { text-align: right; } .m { color: #333; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .t td { font-weight: bold; font-size: 14px; }
  .void { text-align:center; font-weight:bold; border:1px solid #000; margin:6px 0; padding:2px; }
</style></head><body>
<h1>${esc(r.business?.name || "Receipt")}</h1>
<div class="c m">${esc(r.branch)}${r.business?.address ? "<br>" + esc(r.business.address) : ""}${r.business?.phone ? "<br>" + esc(r.business.phone) : ""}</div>
<hr>
<div class="m">Receipt: ${esc(r.receiptNumber)}<br>${esc(new Date(r.date).toLocaleString())}${r.cashier ? "<br>Cashier: " + esc(r.cashier) : ""}<br>Customer: ${esc(r.customer)}</div>
${r.status && r.status !== "COMPLETED" ? `<div class="void">${esc(r.status)}${r.voidedReason ? ": " + esc(r.voidedReason) : ""}</div>` : ""}
<hr><table>${rows}</table><hr>
<table>
${r.discount > 0 ? `<tr><td>Discount</td><td class="r">-${esc(money(r.discount, cur))}</td></tr>` : ""}
<tr class="t"><td>TOTAL</td><td class="r">${esc(money(r.total, cur))}</td></tr>
<tr><td>Paid by</td><td class="r">${esc(METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod)}</td></tr>
</table><hr>
<div class="c">Thank you for your business.</div>
<div class="c m">Insight by 9DEVs</div>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export async function shareReceipt(r) {
  const text = receiptText(r);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: `Receipt ${r.receiptNumber}`, text });
      return true;
    } catch {
      return false; // user cancelled
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return true;
}
