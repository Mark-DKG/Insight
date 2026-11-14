// Runs every integration test file in sequence; fails if any fails.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
let bad = 0;
for (const f of ["stock-sales.mjs", "finance.mjs", "employees.mjs", "workflow.mjs"]) {
  console.log(`\n===== ${f}`);
  if (spawnSync(process.execPath, [join(dir, f)], { stdio: "inherit", env: process.env }).status !== 0) bad++;
}
process.exit(bad ? 1 : 0);
