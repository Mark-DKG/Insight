// Screenshots of real pages against a running build (for visual review).
// BASE, EMAIL, PASSWORD (a business owner) required. Writes PNGs to OUT.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000", OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch();
const errors = [];
async function shot(page, path, name, wait = 1500) {
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name, page.url());
}
for (const [vpName, vp] of [["desktop", { width: 1366, height: 860 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${vpName} ${page.url()} ${e.message}`));
  await shot(page, "/store", `${vpName}-store-home`);
  const first = await page.$("a.st-card[href^='/store/p/']");
  const href = first ? await first.getAttribute("href") : null;
  if (href) {
    await shot(page, href, `${vpName}-store-product`);
    await page.click("text=Add to cart").catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "/store/cart", `${vpName}-store-cart`);
  }
  await shot(page, "/store/search?q=E2E", `${vpName}-store-search`);
  // Owner area
  await page.goto(BASE + "/login");
  await page.fill("input[type=email]", process.env.EMAIL).catch(() => {});
  await page.fill("input[type=password]", process.env.PASSWORD).catch(() => {});
  await page.click("button[type=submit]").catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "/seller?tab=overview", `${vpName}-seller-overview`);
  await shot(page, "/seller?tab=listings", `${vpName}-seller-listings`);
  await shot(page, "/seller?tab=orders", `${vpName}-seller-orders`);
  await shot(page, "/settings?section=store", `${vpName}-settings-store`);
  await shot(page, "/settings?section=mode", `${vpName}-settings-package`);
  await page.goto(BASE + "/inventory"); await page.waitForTimeout(1500);
  await page.click("button[aria-label^='Notifications']").catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${vpName}-notifications.png` });
  await ctx.close();
}
await browser.close();
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "no page errors");
