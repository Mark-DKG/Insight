// Stock and sales integrity: characterisation of current behaviour (check)
// plus regression tests for audit findings that currently FAIL (defect).
//   BASE=http://localhost:3000 DATABASE_URL=<disposable db> node tests/integration/stock-sales.mjs
import { check, defect, finish, prisma, newBusiness, addBranch, addProduct, addCustomer, saleBody, stockOf, all, setStock, uid } from "./_lib.mjs";

const b = await newBusiness("stock");
const b2 = await newBusiness("other");

// ---- characterisation ------------------------------------------------------
{
  const p = await addProduct(b, { price: 10, cost: 6, stock: 5 });
  const r = await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 2 }] }));
  check("sale: created 201", r.status === 201, r);
  check("sale: stock deducted", (await stockOf(p, b.branch)) === 3);
  const mv = await prisma.inventoryMovement.findMany({ where: { referenceId: r.data.sale.id } });
  check("sale: STOCK_OUT movement written", mv.length === 1 && mv[0].quantity === -2 && mv[0].type === "STOCK_OUT");
  check("sale: total 20, profit 8", Number(r.data.sale.totalAmount) === 20 && Number(r.data.sale.grossProfit) === 8, r.data.sale);
  check("sale: receipt number set", /^RCT-\d{5}$/.test(r.data.sale.receiptNumber));

  const low = await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 99 }] }));
  check("sale: insufficient stock rejected 409", low.status === 409, low);
  check("sale: rejected sale leaves stock unchanged", (await stockOf(p, b.branch)) === 3);

  const txn = uid("dup");
  const s1 = await b.c.post("/api/sales", saleBody(b, p, { clientTxnId: txn }));
  const s2 = await b.c.post("/api/sales", saleBody(b, p, { clientTxnId: txn }));
  check("retry: second submit returns the same sale", s1.status === 201 && s2.status === 200 && s2.data.sale.id === s1.data.sale.id, [s1.status, s2.status]);
  check("retry: stock deducted once", (await stockOf(p, b.branch)) === 2);

  const bad = await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 0 }] }));
  check("sale: zero quantity rejected 400", bad.status === 400);
  const foreignProduct = await addProduct(b2, { stock: 5 });
  const fp = await b.c.post("/api/sales", saleBody(b, foreignProduct));
  check("sale: other business's product rejected", fp.status === 409, fp);
}

// adjust / transfer characterisation
{
  const p = await addProduct(b, { stock: 4 });
  const neg = await b.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "STOCK_OUT", quantity: 9 });
  check("adjust: cannot remove more than held (409)", neg.status === 409, neg);
  const cc = await b.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "COUNT_CORRECTION", countedQuantity: 7 });
  check("adjust: count correction sets stock to 7", cc.status === 201 && (await stockOf(p, b.branch)) === 7, cc);

  const br2 = await addBranch(b, "Second " + uid());
  const t = await b.c.post("/api/inventory/transfer", { productId: p.id, fromBranchId: b.branch.id, toBranchId: br2.id, quantity: 3 });
  check("transfer: ok", t.status === 201, t);
  check("transfer: source 4, destination 3", (await stockOf(p, b.branch)) === 4 && (await stockOf(p, br2)) === 3);
  const mv = await prisma.inventoryMovement.findMany({ where: { productId: p.id, type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } });
  check("transfer: both movements share a reference", mv.length === 2 && mv[0].referenceId === mv[1].referenceId);
  const tl = await b.c.post("/api/inventory/transfer", { productId: p.id, fromBranchId: b.branch.id, toBranchId: br2.id, quantity: 50 });
  check("transfer: insufficient stock rejected", tl.status === 409);
  const tf = await b.c.post("/api/inventory/transfer", { productId: p.id, fromBranchId: b.branch.id, toBranchId: (await addBranch(b2, "x")).id, quantity: 1 });
  check("transfer: other business's branch rejected", tf.status === 409, tf);
}

// receive purchase characterisation
{
  const sup = (await b.c.post("/api/suppliers", { name: "Sup " + uid() })).data.supplier;
  const p = await addProduct(b, { cost: 5, stock: 0 });
  const po = await b.c.post("/api/purchases", { branchId: b.branch.id, supplierId: sup.id, items: [{ productId: p.id, quantityOrdered: 10, unitCost: 7 }] });
  check("purchase: created", po.status === 201, po);
  const full = await prisma.purchase.findUnique({ where: { id: po.data.purchase.id }, include: { items: true } });
  const rcv = await b.c.post(`/api/purchases/${full.id}/receive`, { lines: [{ purchaseItemId: full.items[0].id, quantityReceived: 4 }] });
  check("receive: partial receive ok", rcv.status === 200, rcv);
  check("receive: stock +4", (await stockOf(p, b.branch)) === 4);
  const over = await b.c.post(`/api/purchases/${full.id}/receive`, { lines: [{ purchaseItemId: full.items[0].id, quantityReceived: 9 }] });
  check("receive: cannot receive more than ordered", over.status >= 400 && over.status < 500, over.status);
}

// ---- F-016 POS stock race --------------------------------------------------
{
  const p = await addProduct(b, { stock: 5 });
  const rs = await all(15, () => b.c.post("/api/sales", saleBody(b, p)));
  const ok = rs.filter((r) => r.status === 201).length;
  const stock = await stockOf(p, b.branch);
  defect("F-016", "15 parallel 1-unit sales against 5 in stock: at most 5 succeed", ok <= 5, { ok });
  defect("F-016", "stock never goes negative under parallel sales", stock >= 0, { stock });
  check("parallel sales: stock + sold units reconcile with the 5 received", stock + ok === 5, { stock, ok });
}

// ---- F-017 adjust overwrites concurrent sale ------------------------------
{
  let lost = 0;
  for (let round = 0; round < 8; round++) {
    const p = await addProduct(b, { stock: 20 });
    const [a, ...s] = await Promise.all([
      b.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "STOCK_IN", quantity: 5 }),
      ...Array.from({ length: 4 }, () => b.c.post("/api/sales", saleBody(b, p))),
    ]);
    const sold = s.filter((r) => r.status === 201).length;
    const expected = 20 + (a.status === 201 ? 5 : 0) - sold;
    if ((await stockOf(p, b.branch)) !== expected) lost++;
  }
  defect("F-017", "stock adjustment racing with sales never loses an update (8 rounds)", lost === 0, { roundsWithLostUpdate: lost });
}

// ---- F-018 transfer race ----------------------------------------------------
{
  const br2 = await addBranch(b, "T2 " + uid());
  const p = await addProduct(b, { stock: 5 });
  const rs = await all(10, () => b.c.post("/api/inventory/transfer", { productId: p.id, fromBranchId: b.branch.id, toBranchId: br2.id, quantity: 1 }));
  const ok = rs.filter((r) => r.status === 201).length;
  const src = await stockOf(p, b.branch), dst = await stockOf(p, br2);
  defect("F-018", "10 parallel 1-unit transfers of 5 units: at most 5 succeed", ok <= 5, { ok });
  defect("F-018", "source branch never negative after parallel transfers", src >= 0, { src });
  check("transfers: total stock conserved", src + dst === 5, { src, dst });
}

// ---- F-016 database floor ---------------------------------------------------
{
  const p = await addProduct(b, { stock: 1 });
  let rejected = false;
  try { await prisma.inventoryLevel.update({ where: { productId_branchId: { productId: p.id, branchId: b.branch.id } }, data: { quantity: -1 } }); }
  catch { rejected = true; }
  defect("F-016", "database rejects negative inventory quantity (CHECK quantity >= 0)", rejected);
  // restore so later checks are unaffected
  await prisma.inventoryLevel.update({ where: { productId_branchId: { productId: p.id, branchId: b.branch.id } }, data: { quantity: 1 } }).catch(() => {});
}

// ---- F-021 duplicate concurrent txn ---------------------------------------
{
  const p = await addProduct(b, { stock: 10 });
  const txn = uid("race");
  const rs = await all(6, () => b.c.post("/api/sales", saleBody(b, p, { clientTxnId: txn })));
  const sales = await prisma.sale.count({ where: { businessId: b.businessId, clientTxnId: txn } });
  check("concurrent duplicate txn: exactly one sale row", sales === 1, { sales });
  check("concurrent duplicate txn: stock deducted once", (await stockOf(p, b.branch)) === 9);
  defect("F-021", "concurrent duplicate txn: no 500s, all callers get the one sale", rs.every((r) => [200, 201].includes(r.status) && r.data?.sale?.id), rs.map((r) => r.status));
}

// ---- F-020 receipt numbers under concurrency ------------------------------
{
  const p = await addProduct(b, { stock: 30 });
  const rs = await all(10, () => b.c.post("/api/sales", saleBody(b, p)));
  const ok = rs.filter((r) => r.status === 201);
  const nums = new Set(ok.map((r) => r.data.sale.receiptNumber));
  check("receipts: numbers unique across sales that succeeded", nums.size === ok.length);
  defect("F-020", "10 parallel sales all succeed with unique receipt numbers", ok.length === 10, { succeeded: ok.length, statuses: rs.map((r) => r.status) });
}

// ---- F-001 / F-002 ownership ------------------------------------------------
{
  const p = await addProduct(b, { stock: 5 });
  const foreignCustomer = await addCustomer(b2, 1000);
  const before = Number((await prisma.customer.findUnique({ where: { id: foreignCustomer.id } })).creditBalance);
  const r = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: foreignCustomer.id }));
  const after = Number((await prisma.customer.findUnique({ where: { id: foreignCustomer.id } })).creditBalance);
  defect("F-001", "sale with another business's customer is rejected", r.status >= 400 && r.status < 500, r.status);
  defect("F-001", "another business's customer balance is untouched", after === before, { before, after });

  const foreignBranch = b2.branch;
  const r2 = await b.c.post("/api/sales", saleBody(b, p, { branchId: foreignBranch.id }));
  defect("F-002", "sale into another business's branch is rejected", r2.status >= 400 && r2.status < 500, r2.status);
  const nsale = await prisma.sale.count({ where: { businessId: b.businessId, branchId: foreignBranch.id } });
  defect("F-002", "no sale row references another business's branch", nsale === 0, { nsale });
}

// ---- F-019 credit limit ------------------------------------------------------
{
  const p = await addProduct(b, { price: 100, stock: 10 });
  const c = await addCustomer(b, 150);
  const first = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c.id }));
  check("credit: first 100 sale within limit 150 accepted", first.status === 201, first);
  const second = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c.id }));
  defect("F-019", "credit sale pushing balance to 200 over limit 150 is rejected", second.status === 409 || second.status === 400 || second.status === 422, second.status);
  const c2 = await addCustomer(b, 150);
  const par = await all(5, () => b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c2.id })));
  const bal = Number((await prisma.customer.findUnique({ where: { id: c2.id } })).creditBalance);
  defect("F-019", "parallel credit sales cannot exceed the limit (balance <= 150)", bal <= 150, { balance: bal, accepted: par.filter((r) => r.status === 201).length });
}

// ---- discount validation ----------------------------------------------------
{
  const p = await addProduct(b, { price: 10, stock: 5 });
  const r = await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 1, discount: 500 }] }));
  defect("A2", "line discount larger than the line total is rejected (no negative sale)", r.status >= 400 && r.status < 500, { status: r.status, total: r.data?.sale?.totalAmount });
}

await finish();
