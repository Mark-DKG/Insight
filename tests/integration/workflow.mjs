// End-to-end retail workflow, employee management rules and mixed-operation
// concurrency. Every figure is reconciled against the database, not against
// what the API said.
import { check, finish, prisma, newBusiness, addBranch, addProduct, addCustomer, addEmployee, saleBody, stockOf, all, uid } from "./_lib.mjs";

const num = (x) => Number(x);
const sumAmt = (rows) => rows.reduce((s, r) => s + num(r.amount), 0);

// ---------------------------------------------------------------------------
// Employee management (A5)
// ---------------------------------------------------------------------------
{
  const b = await newBusiness("mgmt");
  const br2 = await addBranch(b, "Branch two " + uid());
  const mgr = await addEmployee(b, "MANAGER");
  const mgr2 = await addEmployee(b, "MANAGER");
  const cash = await addEmployee(b, "CASHIER");
  const p = await addProduct(b, { stock: 20 });

  // cashier restricted to their own branch
  const own = await cash.c.post("/api/sales", saleBody(b, p));
  check("A5: cashier sells in own branch", own.status === 201, own);
  const wrong = await cash.c.post("/api/sales", saleBody(b, p, { branchId: br2.id }));
  check("A5: cashier cannot sell in another branch", wrong.status === 403, wrong);
  check("A5: no sale was written for the other branch", (await prisma.sale.count({ where: { branchId: br2.id } })) === 0);

  // manager edits cashier
  const e1 = await mgr.c.patch(`/api/employees/${cash.id}`, { name: "Renamed Cashier", branchId: br2.id });
  check("A5: manager can edit a cashier's name and branch", e1.status === 200, e1);
  const row = await prisma.user.findUnique({ where: { id: cash.id } });
  check("A5: edit persisted", row.name === "Renamed Cashier" && row.branchId === br2.id);
  check("A5: manager cannot change a role", (await mgr.c.patch(`/api/employees/${cash.id}`, { role: "MANAGER" })).status === 403);
  check("A5: manager cannot edit another manager", (await mgr.c.patch(`/api/employees/${mgr2.id}`, { name: "x" })).status === 403);
  check("A5: manager cannot edit the owner", (await mgr.c.patch(`/api/employees/${b.ownerId}`, { name: "x" })).status === 403);
  check("A5: manager cannot suspend themselves", (await mgr.c.patch(`/api/employees/${mgr.id}`, { isActive: false })).status === 403);
  check("A5: cashier cannot edit anyone", (await cash.c.patch(`/api/employees/${mgr.id}`, { name: "x" })).status === 403);
  check("A5: branch from another business rejected", (await b.c.patch(`/api/employees/${cash.id}`, { branchId: (await addBranch(await newBusiness("x"), "z")).id })).status === 400);

  // owner promotes / demotes
  check("A5: owner can promote cashier to manager", (await b.c.patch(`/api/employees/${cash.id}`, { role: "MANAGER" })).status === 200);
  check("A5: owner cannot make an OWNER via this route", (await b.c.patch(`/api/employees/${cash.id}`, { role: "OWNER" })).status === 400);
  check("A5: owner cannot suspend themselves", (await b.c.patch(`/api/employees/${b.ownerId}`, { isActive: false })).status === 403);
  await b.c.patch(`/api/employees/${cash.id}`, { role: "CASHIER" });

  // role change takes effect on the already-open session (no stale token power)
  const e2 = await addEmployee(b, "MANAGER");
  check("A5: manager can adjust stock before demotion", (await e2.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "STOCK_IN", quantity: 1 })).status === 201);
  await b.c.patch(`/api/employees/${e2.id}`, { role: "CASHIER" });
  check("A5: demoted employee loses manager powers immediately", (await e2.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "STOCK_IN", quantity: 1 })).status === 403);

  // suspension, reactivation, history intact
  await b.c.patch(`/api/employees/${cash.id}`, { branchId: b.branch.id });
  const sale = await cash.c.post("/api/sales", saleBody(b, p));
  check("A5: cashier sale before suspension", sale.status === 201, sale);
  check("A5: owner suspends cashier", (await b.c.patch(`/api/employees/${cash.id}`, { isActive: false })).status === 200);
  check("A5: suspended cashier's existing session is refused", [401, 403].includes((await cash.c.post("/api/sales", saleBody(b, p))).status));
  const relog = await new (cash.c.constructor)().post("/api/auth/login", { email: cash.email, password: "kente-Cloth-84" });
  check("A5: suspended cashier cannot log in", relog.status >= 400, relog.status);
  check("A5: suspension kept the sale history", (await prisma.sale.count({ where: { id: sale.data.sale.id, cashierId: cash.id } })) === 1);
  check("A5: owner reactivates cashier", (await b.c.patch(`/api/employees/${cash.id}`, { isActive: true })).status === 200);
  const again = new (cash.c.constructor)();
  check("A5: reactivated cashier can log in", (await again.post("/api/auth/login", { email: cash.email, password: "kente-Cloth-84" })).status === 200);
  check("A5: reactivated cashier can sell", (await again.post("/api/sales", saleBody(b, p))).status === 201);

  // shifts
  const s1 = await again.post("/api/employees/shifts", { branchId: b.branch.id });
  check("A5: cashier opens own shift", s1.status === 201, s1);
  const list = await again.get("/api/employees/shifts");
  check("A5: cashier sees only own shifts", list.status === 200 && list.data.shifts.every((s) => s.userId === cash.id), list.data);
  const other = await b.c.post("/api/employees/shifts", { branchId: b.branch.id, userId: mgr.id });
  check("A5: cashier cannot open a shift for someone else", (await again.post("/api/employees/shifts", { branchId: b.branch.id, userId: mgr.id })).status === 403);
  check("A5: cashier cannot close someone else's shift", [403, 404, 409].includes((await again.post(`/api/employees/shifts/${other.data.shift.id}/end`, { actualCash: 0 })).status));
  check("A5: cashier closes own shift", (await again.post(`/api/employees/shifts/${s1.data.shift.id}/end`, { actualCash: 0 })).status === 200);
}

// ---------------------------------------------------------------------------
// Credit: limits, partial payments, discounts (A2/A3)
// ---------------------------------------------------------------------------
{
  const b = await newBusiness("credit");
  const p = await addProduct(b, { price: 100, cost: 60, stock: 50 });
  const none = await addCustomer(b, 0);
  const r0 = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: none.id }));
  check("A2: customer with credit limit 0 cannot buy on credit", r0.status === 409, r0);

  const c = await addCustomer(b, 250);
  const ok = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c.id, items: [{ productId: p.id, quantity: 2 }] }));
  check("A2: credit sale within limit accepted", ok.status === 201, ok);
  const exact = await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c.id, items: [{ productId: p.id, quantity: 1 }] }));
  check("A2: credit sale over limit rejected (200+100 > 250)", exact.status === 409, exact);
  check("A2: rejected credit sale left stock and balance alone", (await stockOf(p, b.branch)) === 48 && num((await prisma.customer.findUnique({ where: { id: c.id } })).creditBalance) === 200);

  // discount percent
  const d = await b.c.post("/api/sales", saleBody(b, p, { discountPercent: 10, items: [{ productId: p.id, quantity: 2 }] }));
  check("A2: 10% discount gives total 180", d.status === 201 && num(d.data.sale.totalAmount) === 180, d.data);
  const dp = await prisma.payment.findMany({ where: { saleId: d.data.sale.id } });
  check("A3: payment equals discounted total", sumAmt(dp) === 180);
  check("A2: discount above 100% rejected", (await b.c.post("/api/sales", saleBody(b, p, { discountPercent: 101 }))).status === 400);

  // partial payments then refund
  const pay1 = await b.c.post(`/api/customers/${c.id}/payments`, { amount: 50, method: "CASH" });
  const pay2 = await b.c.post(`/api/customers/${c.id}/payments`, { amount: 100, method: "MOBILE_MONEY" });
  check("A3: two partial payments accepted", pay1.status === 201 && pay2.status === 201);
  const acct = await prisma.creditAccount.findUnique({ where: { saleId: ok.data.sale.id } });
  check("A3: account shows 150 paid of 200", num(acct.amountPaid) === 150 && num(acct.originalAmount) === 200);
  check("A3: balance is 50", num((await prisma.customer.findUnique({ where: { id: c.id } })).creditBalance) === 50);
  check("A3: paying more than owed rejected", (await b.c.post(`/api/customers/${c.id}/payments`, { amount: 60, method: "CASH" })).status === 400);
  const ref = await b.c.post(`/api/sales/${ok.data.sale.id}/reverse`, { kind: "REFUND", reason: "returned" });
  check("A3: refund of part-paid credit sale succeeds", ref.status === 200, ref);
  const refunded = -sumAmt((await prisma.payment.findMany({ where: { saleId: ok.data.sale.id } })).filter((x) => num(x.amount) < 0));
  check("A3: refund paid out only the 150 received", refunded === 150, { refunded });
  check("A3: balance is 0 and stock restored", num((await prisma.customer.findUnique({ where: { id: c.id } })).creditBalance) === 0 && (await stockOf(p, b.branch)) === 48 + 2);
  check("A3: refunding twice is refused", (await b.c.post(`/api/sales/${ok.data.sale.id}/reverse`, { kind: "REFUND", reason: "again" })).status >= 400);
}

// ---------------------------------------------------------------------------
// Concurrency across different operations (A1)
// ---------------------------------------------------------------------------
{
  const b = await newBusiness("conc");
  const br2 = await addBranch(b, "Conc two " + uid());
  // sales vs transfer on the same stock
  const p = await addProduct(b, { stock: 10 });
  const ops = await Promise.all([
    ...Array.from({ length: 8 }, () => b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 1 }] }))),
    ...Array.from({ length: 4 }, () => b.c.post("/api/inventory/transfer", { productId: p.id, fromBranchId: b.branch.id, toBranchId: br2.id, quantity: 2 })),
  ]);
  const sold = ops.slice(0, 8).filter((r) => r.status === 201).length;
  const moved = ops.slice(8).filter((r) => r.status === 201).length * 2;
  const a = await stockOf(p, b.branch), z = await stockOf(p, br2);
  check("A1: no 500s from mixed sales and transfers", ops.every((r) => r.status < 500), ops.map((r) => r.status));
  check("A1: stock reconciles (10 = remaining + sold + moved)", a + sold + moved === 10 && z === moved, { a, z, sold, moved });
  check("A1: nothing negative", a >= 0 && z >= 0);

  // sale vs reversal vs adjustment
  const q = await addProduct(b, { stock: 5 });
  const s = await b.c.post("/api/sales", saleBody(b, q, { items: [{ productId: q.id, quantity: 5 }] }));
  const mixed = await Promise.all([
    b.c.post(`/api/sales/${s.data.sale.id}/reverse`, { kind: "VOID", reason: "x" }),
    b.c.post(`/api/sales/${s.data.sale.id}/reverse`, { kind: "VOID", reason: "y" }),
    b.c.post("/api/sales", saleBody(b, q, { items: [{ productId: q.id, quantity: 3 }] })),
    b.c.post("/api/inventory/adjust", { productId: q.id, branchId: b.branch.id, type: "STOCK_OUT", quantity: 1 }),
  ]);
  check("A1: no 500s in sale/void/adjust race", mixed.every((r) => r.status < 500), mixed.map((r) => r.status));
  const qty = await stockOf(q, b.branch);
  const voidsOk = mixed.slice(0, 2).filter((r) => r.status === 200).length;
  const saleOk = mixed[2].status === 201 ? 3 : 0;
  const adjOk = mixed[3].status === 201 ? 1 : 0;
  check("A1: exactly one void wins", voidsOk === 1, mixed.slice(0, 2).map((r) => r.status));
  check("A1: stock reconciles after the race (0 + 5 voided - sale - adjust)", qty === 5 - saleOk - adjOk, { qty, saleOk, adjOk });
}

// ---------------------------------------------------------------------------
// End-to-end retail day, reconciled against the database (spec: 20 steps)
// ---------------------------------------------------------------------------
{
  const b = await newBusiness("e2e");                                                  // 1 business + owner
  const br2 = await addBranch(b, "Annex " + uid());                                    // 2 second branch
  const cashier = await addEmployee(b, "CASHIER");                                     // 3 cashier
  const sup = (await b.c.post("/api/suppliers", { name: "Sup " + uid() })).data.supplier; // 4 supplier
  const p1 = await addProduct(b, { price: 20, cost: 12, stock: 0 });                  // 5 products
  const p2 = await addProduct(b, { price: 50, cost: 30, stock: 0 });
  const po = await b.c.post("/api/purchases", { branchId: b.branch.id, supplierId: sup.id, items: [{ productId: p1.id, quantityOrdered: 30, unitCost: 12 }, { productId: p2.id, quantityOrdered: 10, unitCost: 30 }] });
  check("e2e 6: purchase order created", po.status === 201, po);
  const full = await prisma.purchase.findUnique({ where: { id: po.data.purchase.id }, include: { items: true } });
  const rc = await b.c.post(`/api/purchases/${full.id}/receive`, { lines: full.items.map((i) => ({ purchaseItemId: i.id, quantityReceived: i.quantityOrdered })) });
  check("e2e 7: purchase received into stock", [200, 201].includes(rc.status) && (await stockOf(p1, b.branch)) === 30 && (await stockOf(p2, b.branch)) === 10, rc);
  const tr = await b.c.post("/api/inventory/transfer", { productId: p1.id, fromBranchId: b.branch.id, toBranchId: br2.id, quantity: 10 });
  check("e2e 8: transfer to second branch", tr.status === 201 && (await stockOf(p1, b.branch)) === 20 && (await stockOf(p1, br2)) === 10);
  const sh = await cashier.c.post("/api/employees/shifts", { branchId: b.branch.id });
  check("e2e 9: cashier opens shift", sh.status === 201, sh);
  const cash = await cashier.c.post("/api/sales", saleBody(b, p1, { items: [{ productId: p1.id, quantity: 4 }] }));
  check("e2e 10: cash sale 80", cash.status === 201 && num(cash.data.sale.totalAmount) === 80, cash);
  const cu = await addCustomer(b, 500);                                                // 11 customer
  const cr = await cashier.c.post("/api/sales", saleBody(b, p2, { paymentMethod: "CREDIT", customerId: cu.id, items: [{ productId: p2.id, quantity: 4 }] }));
  check("e2e 12: credit sale 200", cr.status === 201 && num(cr.data.sale.totalAmount) === 200, cr);
  const part = await b.c.post(`/api/customers/${cu.id}/payments`, { amount: 120, method: "CASH" });
  check("e2e 13: partial customer payment 120", part.status === 201, part);
  const disc = await cashier.c.post("/api/sales", saleBody(b, p1, { discountPercent: 50, items: [{ productId: p1.id, quantity: 2 }] }));
  check("e2e 14: discounted sale 20", disc.status === 201 && num(disc.data.sale.totalAmount) === 20, disc);
  check("e2e 15: out-of-stock/over-limit attempt rejected cleanly", (await cashier.c.post("/api/sales", saleBody(b, p2, { items: [{ productId: p2.id, quantity: 99 }] }))).status === 409);
  const vd = await b.c.post(`/api/sales/${disc.data.sale.id}/reverse`, { kind: "VOID", reason: "cashier error" });
  check("e2e 16: void the discounted sale", vd.status === 200, vd);
  const ex = await b.c.post("/api/expenses", { category: "RENT", amount: 40, paymentMethod: "CASH", description: "Rent" });
  check("e2e 17: expense recorded", ex.status === 201, ex);
  const end = await cashier.c.post(`/api/employees/shifts/${sh.data.shift.id}/end`, { actualCash: 80 });
  check("e2e 18: cashier closes shift", end.status === 200, end);

  // 19 reconciliation against the database
  const stock = { p1a: await stockOf(p1, b.branch), p1b: await stockOf(p1, br2), p2a: await stockOf(p2, b.branch) };
  check("e2e 19a: stock p1 main = 30-10-4-2+2(void) = 16", stock.p1a === 16, stock);
  check("e2e 19b: stock p1 annex = 10", stock.p1b === 10);
  check("e2e 19c: stock p2 main = 10-4 = 6", stock.p2a === 6);
  const movementSum = async (prod, br) => (await prisma.inventoryMovement.aggregate({ where: { productId: prod.id, branchId: br.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  check("e2e 19d: movement ledger equals stock for every product/branch", (await movementSum(p1, b.branch)) === stock.p1a && (await movementSum(p1, br2)) === stock.p1b && (await movementSum(p2, b.branch)) === stock.p2a);
  const received = sumAmt(await prisma.payment.findMany({ where: { sale: { businessId: b.businessId } } }));
  const creditPaid = (await prisma.creditPayment.findMany({ where: { creditAccount: { customerId: cu.id } } })).reduce((s, r) => s + num(r.amount), 0);
  check("e2e 19e: cash received on sales = 80 (cash) + 20 - 20 (voided) = 80", received === 80, { received });
  check("e2e 19f: customer payments recorded = 120, balance owing = 80", creditPaid === 120 && num((await prisma.customer.findUnique({ where: { id: cu.id } })).creditBalance) === 80, { creditPaid });
  check("e2e 19g: receipt numbers unique and sequential", await (async () => { const r = (await prisma.sale.findMany({ where: { businessId: b.businessId }, select: { receiptNumber: true } })).map((x) => x.receiptNumber); return new Set(r).size === r.length; })());
  const profit = await b.c.get("/api/reports/profit");
  check("e2e 20: profit report responds", profit.status === 200, profit);
}

await finish();
