import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import crypto from "node:crypto";
const password = crypto.randomBytes(24).toString("hex");
await writeFile(
  ".dev.vars",
  "ADMIN_PASSWORD=" +
    password +
    "\nSESSION_SECRET=" +
    crypto.randomBytes(48).toString("hex") +
    "\n",
);
const server = spawn(
  process.execPath,
  ["node_modules/wrangler/bin/wrangler.js", "dev", "--port", "8787"],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let output = "";
server.stdout.on("data", (d) => (output += d));
server.stderr.on("data", (d) => (output += d));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8787/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error("Local Worker did not start: " + output.slice(-2000));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/test-store.mjs"], {
      stdio: "inherit",
      env: { ...process.env, ADMIN_PASSWORD: password },
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (result !== 0) process.exitCode = result || 1;
} finally {
  server.kill("SIGTERM");
}
