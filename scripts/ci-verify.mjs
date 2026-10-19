import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import crypto from "node:crypto";
const probe = createServer();
const port = await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    if (address && typeof address !== "string") resolve(address.port);
    else reject(new Error("Could not allocate a local test port."));
  });
});
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
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
  ["node_modules/wrangler/bin/wrangler.js", "dev", "--port", String(port)],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let output = "";
server.stdout.on("data", (d) => (output += d));
server.stderr.on("data", (d) => (output += d));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
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
      env: {
        ...process.env,
        ADMIN_PASSWORD: password,
        TEST_URL: `http://127.0.0.1:${port}`,
      },
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (result !== 0) process.exitCode = result || 1;
} finally {
  server.kill("SIGTERM");
}
