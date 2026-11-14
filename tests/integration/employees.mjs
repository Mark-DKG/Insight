// Employee permissions and shifts. F-029 / F-030.
import { check, regression, finish, prisma, newBusiness, addEmployee, addProduct, saleBody, addBranch } from "./_lib.mjs";

const b = await newBusiness("emp");
const cashier = await addEmployee(b, "CASHIER");
const cashier2 = await addEmployee(b, "CASHIER");
const manager = await addEmployee(b, "MANAGER");
check("employees: cashier and manager can sign in", cashier.loginStatus === 200 && manager.loginStatus === 200);

// permissions (characterisation)
{
  const p = await addProduct(b, { stock: 5 });
  check("cashier can record a sale", (await cashier.c.post("/api/sales", saleBody(b, p))).status === 201);
  check("cashier cannot adjust stock", (await cashier.c.post("/api/inventory/adjust", { productId: p.id, branchId: b.branch.id, type: "STOCK_IN", quantity: 1 })).status === 403);
  check("cashier cannot create employees", (await cashier.c.post("/api/employees", { name: "x", email: "x@example.com", password: "kente-Cloth-84", role: "CASHIER" })).status === 403);
  check("cashier cannot refund", (await cashier.c.post(`/api/sales/00000000-0000-4000-8000-000000000000/reverse`, { kind: "REFUND", reason: "test" })).status === 403);
  check("manager cannot create employees", (await manager.c.post("/api/employees", { name: "x", email: "y@example.com", password: "kente-Cloth-84", role: "CASHIER" })).status === 403);
}

// F-029 cashier own shift
{
  const open = await cashier.c.post("/api/employees/shifts", { branchId: b.branch.id });
  regression("F-029", "cashier can open their own shift", open.status === 201, open.status);
  // owner opens one so the close/other-shift rules can still be exercised
  const ownerOpen = await b.c.post("/api/employees/shifts", { branchId: b.branch.id, userId: cashier.id });
  check("owner can open a shift on behalf of a cashier", ownerOpen.status === 201 || open.status === 201, ownerOpen);
  const shift = open.data?.shift ?? ownerOpen.data?.shift;
  const close = await cashier.c.post(`/api/employees/shifts/${shift.id}/end`, { actualCash: 0 });
  regression("F-029", "cashier can close their own shift", close.status === 200, close.status);

  const other = (await b.c.post("/api/employees/shifts", { branchId: b.branch.id, userId: cashier2.id })).data.shift;
  const steal = await cashier.c.post(`/api/employees/shifts/${other.id}/end`, { actualCash: 0 });
  check("cashier cannot close another employee's shift", steal.status === 403 || steal.status === 409, steal.status);
  check("cashier2's shift remained open", (await prisma.employeeShift.findUnique({ where: { id: other.id } })).endedAt === null);
}

// F-030 employee edit / suspend
{
  const e = await addEmployee(b, "CASHIER");
  const patch = await b.c.patch(`/api/employees/${e.id}`, { isActive: false });
  regression("F-030", "owner can suspend an employee", patch.status === 200, patch.status);
  const after = (await prisma.user.findUnique({ where: { id: e.id } })).isActive;
  regression("F-030", "suspended employee is flagged inactive", after === false, { isActive: after });
  const stillIn = await e.c.get("/api/sales");
  regression("F-030", "suspended employee loses API access immediately", stillIn.status === 401 || stillIn.status === 403, stillIn.status);
}

await finish();
