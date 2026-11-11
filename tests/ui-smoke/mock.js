// Empty business, exactly as the live API returns it for a brand-new owner.
const MODE = window.__MODE || "FULL";
const user = { id: "u1", name: "Edem", email: "o@x.com", role: "OWNER", businessId: "b1", branchId: "br1",
  business: { name: "StylinTiq", currency: "GHS", logoUrl: null, appMode: MODE }, branch: { name: "Main Branch" } };
const routes = [...(window.__EXTRA_ROUTES || []),
  [/^\/api\/auth\/me/, { user }],
  [/^\/api\/business\/mode/, { mode: MODE, disabledModules: [], canChange: true }],
  [/^\/api\/business$/, { business: { id: "b1", name: "StylinTiq", address: null, phone: null, email: null, currency: "GHS", taxRate: "0" } }],
  [/^\/api\/products/, { items: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }],
  [/^\/api\/sales/, { sales: [] }],
  [/^\/api\/reports\/profit/, { revenue: 0, costOfGoodsSold: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0, netMarginPercent: 0, transactionCount: 0 }],
  [/^\/api\/customers/, { customers: [] }],
  [/^\/api\/suppliers\/[^/]+$/, { supplier: null, priceComparison: [] }],
  [/^\/api\/suppliers/, { suppliers: [] }],
  [/^\/api\/purchases/, { purchases: [] }],
  [/^\/api\/expenses/, { expenses: [], total: 0 }],
  [/^\/api\/employees\/shifts/, { shifts: [] }],
  [/^\/api\/employees/, { employees: [{ id: "u1", name: "Edem", email: "o@x.com", role: "OWNER", isActive: true, branchId: "br1", lastLoginAt: null, branch: { name: "Main Branch" }, shifts: [] }] }],
  [/^\/api\/branches\/[^/]+$/, { branch: { id: "br1", name: "Main Branch" }, summary: { revenue: 0, grossProfit: 0, netProfit: 0, transactionCount: 0, expenses: 0, lowStockCount: 0, outOfStockCount: 0 } }],
  [/^\/api\/branches/, { branches: [{ id: "br1", name: "Main Branch", isMain: true, isActive: true }] }],
  [/^\/api\/inventory\/movements/, { movements: [] }],
];
window.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const hit = routes.find(([re]) => re.test(path.split("?")[0]));
  console.log("[fetch] " + path + (hit ? "" : " (UNMOCKED)"));
  return new Response(JSON.stringify(hit ? hit[1] : { error: "unmocked" }), { status: hit ? 200 : 404, headers: { "Content-Type": "application/json" } });
};
