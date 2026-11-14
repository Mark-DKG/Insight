// Shared helpers for the Phase A integration tests.
//
// These tests drive a REAL running Insight server (BASE) that is backed by a
// DISPOSABLE Postgres database (DATABASE_URL, which this process also uses to
// assert on stored rows). Never point them at production: they register
// businesses and create sales/stock. See tests/integration/README.md.
import { PrismaClient } from "@prisma/client";

export const BASE = process.env.BASE ?? "http://localhost:3000";
export const RUN = Date.now().toString(36);
export const prisma = new PrismaClient();

// STRICT=1: a known defect that still fails is an error (use once fixed).
const STRICT = process.env.STRICT === "1";
let passed = 0, failed = 0, xfail = 0, xpass = 0;

export const check = (name, cond, extra) => {
  if (cond) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 600) : "")); }
};

// A regression test for an audit finding that is expected to FAIL until the
// fix lands. XFAIL = defect still present. XPASS = defect fixed (promote it).
export const defect = (id, name, cond, extra) => {
  if (cond) { xpass++; console.log(`XPASS [${id}] ${name}`); }
  else if (STRICT) { failed++; console.log(`FAIL [${id}] ${name}` + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 600) : "")); }
  else { xfail++; console.log(`XFAIL [${id}] ${name} (known defect)` + (extra !== undefined ? "  :: " + JSON.stringify(extra).slice(0, 300) : "")); }
};

export async function finish() {
  console.log(`\n${passed} passed, ${failed} failed, ${xfail} known-defect (expected fail), ${xpass} known-defect now passing`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

export class Client {
  constructor() { this.jar = new Map(); }
  async req(method, path, body) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";"); const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b); }
  patch(p, b) { return this.req("PATCH", p, b); }
}

const PASSWORD = "kente-Cloth-84";
let seq = 0;
export const uid = (p = "x") => `${p}-${RUN}-${++seq}`;

// A fresh business (FULL package) with its owner signed in and one main branch.
export async function newBusiness(tag) {
  const c = new Client();
  const email = `phasea-${tag}-${RUN}-${++seq}@example.com`;
  const r = await c.post("/api/auth/register", { businessName: `PhaseA ${tag} ${RUN}`, ownerName: "Ama Tester", email, password: PASSWORD });
  if (r.status >= 300) throw new Error("register failed " + r.status + " " + JSON.stringify(r.data));
  const l = await c.post("/api/auth/login", { email, password: PASSWORD });
  if (l.status !== 200) throw new Error("login failed " + l.status + " " + JSON.stringify(l.data));
  const user = await prisma.user.findUnique({ where: { email } });
  const branches = (await c.get("/api/branches")).data.branches;
  return { c, email, businessId: user.businessId, ownerId: user.id, branch: branches[0], branches };
}

export async function addBranch(b, name) {
  const r = await b.c.post("/api/branches", { name });
  if (r.status !== 201) throw new Error("branch " + r.status + JSON.stringify(r.data));
  return r.data.branch;
}

export async function addProduct(b, { price = 10, cost = 6, stock = 0, branch = b.branch } = {}) {
  const sku = uid("sku");
  const r = await b.c.post("/api/products", { name: "Item " + sku, sku, costPrice: cost, sellingPrice: price });
  if (r.status !== 201) throw new Error("product " + r.status + JSON.stringify(r.data));
  const product = r.data.product;
  if (stock > 0) await setStock(b, product, stock, branch);
  return product;
}

export async function setStock(b, product, qty, branch = b.branch) {
  const r = await b.c.post("/api/inventory/adjust", { productId: product.id, branchId: branch.id, type: "STOCK_IN", quantity: qty });
  if (r.status !== 201) throw new Error("stock " + r.status + JSON.stringify(r.data));
}

export async function addCustomer(b, creditLimit = 0) {
  const r = await b.c.post("/api/customers", { name: "Cust " + uid("c"), creditLimit });
  if (r.status !== 201) throw new Error("customer " + r.status + JSON.stringify(r.data));
  return r.data.customer;
}

export async function addEmployee(b, role = "CASHIER", branch = b.branch) {
  const email = `phasea-emp-${RUN}-${++seq}@example.com`;
  const r = await b.c.post("/api/employees", { name: "Emp " + seq, email, password: PASSWORD, role, branchId: branch.id });
  if (r.status !== 201) throw new Error("employee " + r.status + JSON.stringify(r.data));
  const c = new Client();
  const l = await c.post("/api/auth/login", { email, password: PASSWORD });
  const user = await prisma.user.findUnique({ where: { email } });
  return { c, email, id: user.id, loginStatus: l.status };
}

export function saleBody(b, product, over = {}) {
  return {
    clientTxnId: uid("txn"), branchId: b.branch.id, paymentMethod: "CASH",
    items: [{ productId: product.id, quantity: 1 }], ...over,
  };
}

export const stockOf = async (product, branch) =>
  (await prisma.inventoryLevel.findUnique({ where: { productId_branchId: { productId: product.id, branchId: branch.id } } }))?.quantity ?? 0;

export const all = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
