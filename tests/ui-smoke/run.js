const { chromium } = require("playwright");
const fs = require("fs");
const S = __dirname;
const mode = process.argv[2] || "FULL";
(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  const screens = require("./screens.json");
  for (const c of screens) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: vp });
      const errs = [];
      page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
      page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && /\[CRASH\]|Error|Warning: Each child|Cannot|undefined/.test(t)) errs.push(t.split("\n").slice(0,4).join(" | ")); if (/UNMOCKED/.test(t)) errs.push(t); });
      const html = `<!doctype html><html><body style="margin:0"><div id="root"></div><script>window.__MODE=${JSON.stringify(mode)}</script>${process.argv[3]==="full" ? "<script>"+fs.readFileSync(S+"/mock-full.js","utf8")+"</script>" : ""}<script>${fs.readFileSync(S + "/.out/" + c + ".js", "utf8").replace(/<\/script>/g, "<\\/script>")}</script></body></html>`;
      await page.route("http://h.test/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
      await page.goto("http://h.test/" + c + "?t=tok");
      await page.waitForTimeout(1500);
      const crashed = await page.$("#crash");
      const uniq = [...new Set(errs)].filter((e) => !/Each child in a list|validateDOMNesting|Received `true` for a non-boolean/.test(e));
      if (crashed) failures++;
      console.log(`${crashed ? "CRASH" : uniq.length ? "WARN " : "ok   "} ${c} @${vp.width}`);
      uniq.slice(0, 4).forEach((e) => console.log("    " + e.slice(0, 400)));
      
      await page.close();
    }
  }
  await browser.close();
  process.exitCode = failures ? 1 : 0;
})();
