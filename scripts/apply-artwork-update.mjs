// Apply only blank image fields, after the new static covers are deployed.
// Price, stock, product versions, and existing manually assigned photos stay intact.
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  throw new Error("Cloudflare deployment credentials are required.");

const source = await fs.readFile("data/artwork-update.sql", "utf8");
const statements = source
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const safeImageUpdate =
  /^UPDATE products SET image='(?:[^']|'')*' WHERE id='(?:[^']|'')*' AND (?:image=''|\(image='' OR image LIKE '\/assets\/covers\/illustrative-%'\))$/;
for (const statement of statements) {
  if (!safeImageUpdate.test(statement))
    throw new Error(
      "Refusing to run an artwork SQL statement outside the safe image-only form.",
    );
  const imagePath = statement.match(
    /^UPDATE products SET image='([^']*)'/,
  )?.[1];
  if (!imagePath?.startsWith("/assets/covers/"))
    throw new Error(
      "Refusing an artwork path outside the static covers directory.",
    );
  await fs.access(path.join("dist", imagePath.slice(1)));
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const batchSize = 200;
for (let offset = 0; offset < statements.length; offset += batchSize) {
  const batch = statements.slice(offset, offset + batchSize);
  const file = path.join(
    process.env.RUNNER_TEMP || process.env.TEMP || ".",
    `rinconcito-artwork-${process.pid}-${offset}.sql`,
  );
  await fs.writeFile(file, batch.join(";\n") + ";\n");
  try {
    const result = spawnSync(
      executable,
      [
        "wrangler",
        "d1",
        "execute",
        "rinconcito-db",
        "--remote",
        "--file",
        file,
      ],
      { encoding: "utf8", env: process.env, windowsHide: true },
    );
    if (result.status !== 0) {
      if (result.stderr) process.stderr.write(result.stderr);
      throw new Error(
        `Cloudflare D1 artwork update failed in batch ${offset / batchSize + 1}.`,
      );
    }
  } finally {
    await fs.rm(file, { force: true });
  }
}
console.log(
  `Verified cover references applied: ${statements.length} blank product images checked.`,
);
