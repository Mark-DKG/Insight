// Payments, credit, refunds, reversals. Characterisation + regression tests
// for F-022 / F-023 / F-024.
import { check, regression, finish, prisma, newBusiness, addProduct, addCustomer, saleBody, stockOf, all } from "./_lib.mjs";

const b = await newBusiness("fin");
const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount), 0);
const payments = (saleId) => prisma.payment.findMany({ where: { saleId } });

// cash sale characterisation
{
  const p = await addProduct(b, { price: 50, cost: 30, stock: 10 });
  const r = await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 2 }] }));
  const pay = await payments(r.data.sale.id);
  check("cash sale: one payment equal to the total", pay.length === 1 && sum(pay) === 100, pay);
}

// credit sale: no cash should be recorded
let creditSale, cust, prod;
{
  prod = await addProduct(b, { price: 100, cost: 60, stock: 20 });
  cust = await addCustomer(b, 10000);
  const r = await b.c.post("/api/sales", saleBody(b, prod, { paymentMethod: "CREDIT", customerId: cust.id, items: [{ productId: prod.id, quantity: 2 }] }));
  creditSale = r.data.sale;
  check("credit sale: created", r.status === 201, r);
  const acct = await prisma.creditAccount.findUnique({ where: { saleId: creditSale.id } });
  check("credit sale: credit account opened for 200", Number(acct.originalAmount) === 200);
  check("credit sale: customer balance 200", Number((await prisma.customer.findUnique({ where: { id: cust.id } })).creditBalance) === 200);
  regression("F-023", "credit sale records no cash payment (nothing received yet)", sum(await payments(creditSale.id)) === 0, { recorded: sum(await payments(creditSale.id)) });
}

// customer payment collection characterisation
{
  const r = await b.c.post(`/api/customers/${cust.id}/payments`, { amount: 80, method: "CASH" });
  check("credit payment: accepted", r.status === 201, r);
  const acct = await prisma.creditAccount.findUnique({ where: { saleId: creditSale.id } });
  check("credit payment: account amountPaid 80", Number(acct.amountPaid) === 80);
  check("credit payment: customer balance 120", Number((await prisma.customer.findUnique({ where: { id: cust.id } })).creditBalance) === 120);
  const over = await b.c.post(`/api/customers/${cust.id}/payments`, { amount: 500, method: "CASH" });
  check("credit payment: more than owed rejected", over.status === 400);
}

// refund of a credit sale that was part paid: only the 80 received may go out
{
  const r = await b.c.post(`/api/sales/${creditSale.id}/reverse`, { kind: "REFUND", reason: "customer returned goods" });
  check("refund: credit sale refunded 200", r.status === 200, r);
  check("refund: stock returned", (await stockOf(prod, b.branch)) === 20);
  check("refund: customer balance back to 0 (only unpaid credit removed)", Number((await prisma.customer.findUnique({ where: { id: cust.id } })).creditBalance) === 0);
  const pay = await payments(creditSale.id);
  const refunded = -sum(pay.filter((x) => Number(x.amount) < 0));
  regression("F-023", "refund of a credit sale pays out at most what was actually received (80)", refunded <= 80, { refunded });
}

// cash refund + double reversal
{
  const p = await addProduct(b, { price: 40, stock: 5 });
  const s = (await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 2 }] }))).data.sale;
  const r1 = await b.c.post(`/api/sales/${s.id}/reverse`, { kind: "REFUND", reason: "faulty item" });
  const r2 = await b.c.post(`/api/sales/${s.id}/reverse`, { kind: "REFUND", reason: "again" });
  check("refund: first ok, second refused", r1.status === 200 && r2.status === 409, [r1.status, r2.status]);
  const pay = await payments(s.id);
  check("refund: cash sale nets to zero (80 in, 80 out)", sum(pay) === 0, pay.map((x) => Number(x.amount)));
  check("refund: stock restored exactly once", (await stockOf(p, b.branch)) === 5);

  const v = (await b.c.post("/api/sales", saleBody(b, p))).data.sale;
  const vr = await b.c.post(`/api/sales/${v.id}/reverse`, { kind: "VOID", reason: "wrong item" });
  check("void: ok and status VOIDED", vr.status === 200 && vr.data.sale.status === "VOIDED");
}

// F-022 concurrent reversal
{
  let doubleReturn = 0, bothOk = 0;
  for (let round = 0; round < 6; round++) {
    const p = await addProduct(b, { price: 10, stock: 3 });
    const s = (await b.c.post("/api/sales", saleBody(b, p, { items: [{ productId: p.id, quantity: 3 }] }))).data.sale;
    const rs = await all(5, () => b.c.post(`/api/sales/${s.id}/reverse`, { kind: "VOID", reason: "double click" }));
    if (rs.filter((r) => r.status === 200).length > 1) bothOk++;
    if ((await stockOf(p, b.branch)) !== 3) doubleReturn++;
  }
  regression("F-022", "5 parallel voids of one sale: exactly one succeeds (6 rounds)", bothOk === 0, { roundsWithMultipleSuccess: bothOk });
  regression("F-022", "5 parallel voids: stock returned exactly once (6 rounds)", doubleReturn === 0, { roundsWithWrongStock: doubleReturn });
}

// F-024 concurrent credit payments cannot overpay
{
  const p = await addProduct(b, { price: 100, stock: 5 });
  const c = await addCustomer(b, 10000);
  await b.c.post("/api/sales", saleBody(b, p, { paymentMethod: "CREDIT", customerId: c.id }));
  const rs = await all(5, () => b.c.post(`/api/customers/${c.id}/payments`, { amount: 100, method: "CASH" }));
  const bal = Number((await prisma.customer.findUnique({ where: { id: c.id } })).creditBalance);
  const acct = await prisma.creditAccount.findFirst({ where: { customerId: c.id } });
  regression("F-024", "5 parallel payments of the full 100 owed: balance never negative", bal >= 0, { balance: bal });
  check("credit: customer balance equals account outstanding", bal === Number(acct.originalAmount) - Number(acct.amountPaid), { bal, acct });
}

// reconciliation: cash received = sum of payments on completed sales
{
  const sales = await prisma.sale.findMany({ where: { businessId: b.businessId, status: "COMPLETED", paymentMethod: { not: "CREDIT" } }, select: { id: true, totalAmount: true } });
  const pays = await prisma.payment.findMany({ where: { saleId: { in: sales.map((s) => s.id) } } });
  check("reconcile: payments on completed non-credit sales equal their totals", Math.abs(sum(pays) - sales.reduce((s, x) => s + Number(x.totalAmount), 0)) < 0.005);
}

await finish();
