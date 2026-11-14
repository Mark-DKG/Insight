// Bundles and runs every tests/unit/*.test.ts with esbuild + node:test.
// No database or network is needed. email.test.ts gets the fake Prisma client
// (as its header documents); the others run against the real modules.
import { createRequire } from "node:module";
import { readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(process.env.ESBUILD_FROM ?? import.meta.url);
const esbuild = require("esbuild");
const root = resolve(new URL("..", import.meta.url).pathname);
const out = mkdtempSync(join(tmpdir(), "insight-unit-"));
const only = process.argv[2];
let failed = 0;

for (const f of readdirSync(join(root, "tests/unit")).filter((n) => n.endsWith(".test.ts")).sort()) {
  if (only && !f.includes(only)) continue;
  const outfile = join(out, f.replace(/\.ts$/, ".cjs"));
  const alias = f === "email.test.ts"
    ? { "@/lib/prisma": join(root, "tests/unit/fake-prisma.ts"), "@prisma/client": join(root, "tests/unit/fake-prisma.ts") }
    : {};
  await esbuild.build({
    entryPoints: [join(root, "tests/unit", f)], bundle: true, platform: "node", format: "cjs",
    outfile, alias, absWorkingDir: root, logLevel: "error",
    // Resolve the repo's "@/..." imports.
    tsconfig: join(root, "tsconfig.json"),
  });
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
if (failed) { console.error(`\n${failed} unit test file(s) failed`); process.exit(1); }
