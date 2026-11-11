const { chromium } = require("playwright");
const fs = require("fs");
const S = __dirname, mode = process.argv[2] || "FULL", data = process.argv[3] || "full";
(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const screens = ["dashboard","pos","sales","inventory","purchases","customers","expenses","reports","advanced","settings"];
  for (const c of screens) {
    const html = `<!doctype html><html><body style="margin:0"><div id="root"></div><script>window.__MODE=${JSON.stringify(mode)};window.open=()=>({document:{open(){},write(){},close(){}}});</script>${data==="full"?"<script>"+fs.readFileSync(S+"/mock-full.js","utf8")+"</script>":""}<script>${fs.readFileSync(S + "/.out/" + c + ".js", "utf8").replace(/<\/script>/g, "<\\/script>")}</script></body></html>`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("http://h.test/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && /\[CRASH\]/.test(m.text())) errs.push(m.text().split("\n").slice(0, 3).join(" | ")); });
    await page.goto("http://h.test/" + c); await page.waitForTimeout(800);
    let clicks = 0;
    for (let round = 0; round < 3; round++) {
      const handles = await page.$$("button, tr, [role=radio], div[style*='cursor: pointer']");
      for (const h of handles) {
        if (clicks > 250) break;
        try {
          const txt = ((await h.innerText()) || "").trim().slice(0, 40);
          if (/^Log out$/.test(txt)) continue;
          if (!(await h.isVisible())) continue;
          await h.click({ timeout: 300, trial: false }).catch(() => {});
          clicks++;
          await page.waitForTimeout(60);
          if (await page.$("#crash")) { errs.push(`after clicking "${txt}"`); await page.goto("http://h.test/" + c); await page.waitForTimeout(500); break; }
          // fill any visible text inputs to exercise validation paths
        } catch {}
      }
      await page.keyboard.press("Escape").catch(() => {});
    }
    const uniq = [...new Set(errs)];
    if (uniq.length) failures++;
    console.log(`${uniq.length ? "FAIL" : "ok  "} ${c} (${clicks} clicks)`);
    uniq.slice(0, 6).forEach((e) => console.log("    " + e.slice(0, 350)));
    await page.close();
  }
  await browser.close();
  process.exitCode = failures ? 1 : 0;
})();
