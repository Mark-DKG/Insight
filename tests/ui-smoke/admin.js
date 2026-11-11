// Renders the platform admin screens in headless Chromium against mocked
// admin API responses and fails on any crash. Scenarios: Super Admin with an
// empty platform, Super Admin with data, Analyst (limited permissions), and
// an admin who must change a temporary password.
//   node tests/ui-smoke/admin.js
const esbuild = require("esbuild");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const T = __dirname, ROOT = path.resolve(T, "../.."), OUT = path.join(T, ".out");
fs.mkdirSync(OUT, { recursive: true });

const SCREENS = {
  "admin-login": `import C from "${ROOT}/components/admin/admin-login.jsx"; export default () => <C />;`,
  "admin-dashboard": `import C from "${ROOT}/components/admin/admin-dashboard.jsx"; export default () => <C />;`,
  "admin-businesses": `import C from "${ROOT}/components/admin/admin-businesses.jsx"; export default () => <C />;`,
  "admin-business-detail": `import C from "${ROOT}/components/admin/admin-business-detail.jsx"; export default () => <C businessId="b1" />;`,
};

const now = new Date().toISOString();
const ALL = ["businesses.read","businesses.manage","users.read","users.manage","transactions.read","inventory.read","inventory.manage","analytics.read","audit.read","system.monitor","settings.manage","administrators.manage","workspace.access"];
const biz = { id: "b1", name: "StylinTiq", createdAt: now, status: "ACTIVE", appMode: "INVENTORY_ONLY", currency: "GHS", owner: { name: "Edem", email: "o@x.com" }, userCount: 1, branchCount: 1, lastActivity: now };
const scenario = (name, perms, opts = {}) => ({
  name,
  me: { admin: { id: "a1", email: "admin@9devs.test", name: "Edem", role: perms === ALL ? "SUPER_ADMIN" : "ANALYST", roleLabel: perms === ALL ? "Super Admin" : "Analyst", mustChangePassword: !!opts.mustChange }, permissions: perms },
  dashboard: {
    range: { days: 30, granularity: "day", since: now },
    businesses: { total: opts.empty ? 0 : 1, active: opts.empty ? 0 : 1, suspended: 0, full: 0, inventoryOnly: opts.empty ? 0 : 1, newInRange: opts.empty ? 0 : 1, branches: opts.empty ? 0 : 1 },
    users: { total: opts.empty ? 0 : 1, active: 1, suspended: 0, newInRange: 1, activeSessions: 1, loggedInLast24h: 1 },
    activity: { transactionsInRange: 0, salesVolumeByCurrency: perms.includes("transactions.read") ? (opts.empty ? [] : [{ currency: "GHS", volume: 216, transactions: 3 }]) : null, activeProducts: 0, customers: 0, suppliers: 0 },
    trends: opts.empty ? { businessRegistrations: [], userRegistrations: [], transactions: [] } : { businessRegistrations: [{ bucket: now, count: 1 }], userRegistrations: [{ bucket: now, count: 1 }], transactions: [] },
    infrastructure: { api: { status: "ok" }, database: { status: "ok", latencyMs: 12, sizeBytes: 10420224 }, authentication: { adminLoginFailures24h: 0, businessLoginFailures24h: 0 }, synchronization: { serverRecords: {}, note: "n" }, backgroundJobs: { status: "none", note: "" }, errorRate: { status: "not_instrumented", note: "" } },
    recentBusinesses: opts.empty ? [] : [{ id: "b1", name: "StylinTiq", createdAt: now, status: "ACTIVE", appMode: "INVENTORY_ONLY", owner: { name: "Edem", email: "o@x.com" } }],
    alerts: opts.empty ? [] : [{ severity: "info", message: "1 business is suspended." }],
  },
  list: { items: opts.empty ? [] : [biz, { ...biz, id: "b2", name: "Suspended Co", status: "SUSPENDED", owner: null, lastActivity: null }], pagination: { page: 1, pageSize: 25, total: opts.empty ? 0 : 2, totalPages: 1 } },
  detail: {
    business: { id: "b1", name: "StylinTiq", address: null, phone: null, email: null, currency: "GHS", taxRate: "0", appMode: "INVENTORY_ONLY", status: opts.suspended ? "SUSPENDED" : "ACTIVE", suspendedAt: opts.suspended ? now : null, suspendedReason: opts.suspended ? "Unpaid" : null, createdAt: now, updatedAt: now },
    owner: { id: "u1", name: "Edem", email: "o@x.com", role: "OWNER" },
    users: [{ id: "u1", name: "Edem", email: "o@x.com", role: "OWNER", isActive: true, lastLoginAt: now, createdAt: now, branch: { name: "Main Branch" } }],
    branches: [{ id: "br1", name: "Main Branch", isMain: true, isActive: true, createdAt: now, _count: { sales: 0, inventoryLevels: 0 } }],
    counts: { users: 1, branches: 1, products: 0, customers: 0, suppliers: 0, purchases: 0, expenses: 0, inventoryMovements: 0 },
    sales: perms.includes("transactions.read") ? { transactions: 0, volume: 0, grossProfit: 0, lastSaleAt: null } : null,
    businessAudit: perms.includes("audit.read") ? [{ id: "x", action: "BUSINESS_REGISTERED", createdAt: now, entityType: "Business" }] : null,
    platformAudit: perms.includes("audit.read") ? [{ id: "y", action: "BUSINESS_SUSPENDED", createdAt: now, actorEmail: "admin@9devs.test", reason: "test" }] : null,
    permissions: perms,
  },
});
const SCENARIOS = [
  scenario("super-empty", ALL, { empty: true }),
  scenario("super-data", ALL, {}),
  scenario("super-suspended", ALL, { suspended: true }),
  scenario("analyst", ["analytics.read", "businesses.read"], {}),
  scenario("must-change-password", ALL, { mustChange: true }),
];

const alias = { name: "alias", setup(b) {
  b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(T, "stubs/lucide.js") }));
  b.onResolve({ filter: /^recharts$/ }, () => ({ path: path.join(T, "stubs/recharts.js") }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(T, "stubs/next-navigation.js") }));
}};

(async () => {
  // Make sure the lucide stub exports every admin icon too.
  const names = new Set(fs.readFileSync(path.join(T, "stubs/lucide.js"), "utf8").match(/export const (\w+)/g).map((s) => s.slice(13)));
  for (const f of fs.readdirSync(path.join(ROOT, "components/admin"))) {
    const src = fs.readFileSync(path.join(ROOT, "components/admin", f), "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) m[1].split(",").map((x) => x.trim().split(" as ")[0]).filter(Boolean).forEach((n) => names.add(n));
  }
  const charts = new Set(fs.readFileSync(path.join(T, "stubs/recharts.js"), "utf8").match(/export const (\w+)/g).map((s) => s.slice(13)));
  for (const f of fs.readdirSync(path.join(ROOT, "components/admin"))) {
    const src = fs.readFileSync(path.join(ROOT, "components/admin", f), "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"recharts"/g)) m[1].split(",").map((x) => x.trim().split(" as ")[0]).filter(Boolean).forEach((n) => charts.add(n));
  }
  fs.writeFileSync(path.join(T, "stubs/recharts.js"), "import React from 'react';\nconst Box=(p)=>React.createElement('div',{'data-chart':'1'},typeof p.children==='function'?null:p.children);\n" + [...charts].sort().map((n) => `export const ${n}=Box;`).join("\n") + "\n");
  fs.writeFileSync(path.join(T, "stubs/lucide.js"), "import React from 'react';\nconst Icon=(p)=>React.createElement('span',{'data-icon':'1'});\n" + [...names].sort().map((n) => `export const ${n}=Icon;`).join("\n") + "\n");

  for (const [name, src] of Object.entries(SCREENS)) {
    const entry = path.join(OUT, `entry-${name}.jsx`);
    fs.writeFileSync(entry, `import React from "react"; import { createRoot } from "react-dom/client"; ${src.replace("export default", "const Screen =")}
class B extends React.Component { constructor(p){super(p);this.state={e:null}} static getDerivedStateFromError(e){return {e}} componentDidCatch(e){console.error("[CRASH] "+e.message+"\\n"+(e.stack||"").split("\\n").slice(0,5).join("\\n"))} render(){return this.state.e?React.createElement("pre",{id:"crash"},String(this.state.e)):this.props.children} }
createRoot(document.getElementById("root")).render(<B><Screen /></B>);`);
    await esbuild.build({ entryPoints: [entry], bundle: true, outfile: path.join(OUT, name + ".js"), format: "iife", jsx: "automatic", loader: { ".js": "jsx" },
      define: { "process.env.NODE_ENV": '"development"' }, plugins: [alias], logLevel: "error",
      nodePaths: (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean) });
  }

  const browser = await chromium.launch();
  let failures = 0;
  for (const sc of SCENARIOS) {
    for (const screen of Object.keys(SCREENS)) {
      for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errs = [];
        page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
        page.on("console", (m) => { if (m.type() === "error" && /\[CRASH\]/.test(m.text())) errs.push(m.text().split("\n").slice(0, 3).join(" | ")); });
        const mock = `window.fetch=async(input,init)=>{const u=typeof input==="string"?input:input.url;const p=u.split("?")[0];const S=${JSON.stringify(sc)};
          const body=p==="/api/admin/auth/me"?S.me:p==="/api/admin/dashboard"?S.dashboard:p==="/api/admin/businesses"?S.list:p.startsWith("/api/admin/businesses/")?S.detail:p==="/api/admin/auth/login"?{step:"enroll",enrollment:{secret:"JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",uri:"otpauth://totp/x"}}:{ok:true};
          return new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}});};`;
        const html = `<!doctype html><html><body style="margin:0"><div id="root"></div><script>${mock}</script><script>${fs.readFileSync(path.join(OUT, screen + ".js"), "utf8").replace(/<\/script>/g, "<\\/script>")}</script></body></html>`;
        await page.route("http://h.test/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
        await page.goto("http://h.test/" + screen);
        await page.waitForTimeout(600);
        // Exercise the screen: click every button, row tab and link-like control.
        if (width === 1440) {
          if (screen === "admin-login") { await page.fill("#adm-email", "a@b.com").catch(() => {}); await page.fill("#adm-password", "x").catch(() => {}); }
          for (let round = 0; round < 2; round++) {
            for (const h of await page.$$("button, [role=tab]")) {
              try { if (await h.isVisible()) { await h.click({ timeout: 300 }); await page.waitForTimeout(40); } } catch {}
              if (await page.$("#crash")) break;
            }
            await page.keyboard.press("Escape").catch(() => {});
          }
        }
        const crashed = await page.$("#crash");
        const uniq = [...new Set(errs)];
        if (crashed || uniq.length) failures++;
        console.log(`${crashed || uniq.length ? "FAIL" : "ok  "} ${sc.name.padEnd(22)} ${screen.padEnd(22)} @${width}`);
        uniq.slice(0, 3).forEach((e) => console.log("      " + e.slice(0, 300)));
        if (width === 1440 && sc.name === "super-data") await page.screenshot({ path: path.join(OUT, `${screen}.png`), fullPage: true });
        await page.close();
      }
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
