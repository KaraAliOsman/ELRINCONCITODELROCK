// Apply cached, exact Discogs matches only after other source searches finish.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const productsPath = "data/catalogue-source.json";
const creditsPath = "data/artwork-credits.json";
const unmatchedPath = "data/artwork-unmatched.json";
const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
const unmatchedBefore = await readJson(unmatchedPath, []);
const candidates = await readJson("data/artwork-discogs-results.json", {});
function norm(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function key(artist, album) { return `${norm(artist).replace(/^the /, "")}|${norm(album)}`; }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, file);
}
function sql(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }

const groups = new Map();
for (const product of products) {
  const groupKey = key(product.artist, product.title);
  const list = groups.get(groupKey) || [];
  list.push(product);
  groups.set(groupKey, list);
}
const usedHashes = new Map();
for (const product of products.filter((entry) => entry.image?.startsWith("/assets/covers/"))) {
  try {
    const bytes = await fs.readFile(path.join("public", product.image.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owners = usedHashes.get(hash) || new Set();
    owners.add(key(product.artist, product.title));
    usedHashes.set(hash, owners);
  } catch {}
}
let albumsApplied = 0, productsApplied = 0, duplicateCoversSkipped = 0;
for (const [groupKey, candidate] of Object.entries(candidates)) {
  const group = groups.get(groupKey);
  if (!group || group.every((product) => product.image && !product.image.includes("/illustrative-"))) continue;
  let bytes;
  try { bytes = await fs.readFile(path.join("public", candidate.image.slice(1))); }
  catch { continue; }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if ([...(usedHashes.get(hash) || [])].some((owner) => owner !== groupKey)) {
    duplicateCoversSkipped++;
    continue;
  }
  const source = {
    artist: candidate.artist,
    album: candidate.masterTitle,
    collectionUrl: candidate.masterUrl,
    collectionId: String(candidate.masterId),
    image: candidate.image,
    source: "Discogs master release",
    match: "exact artist and album title",
  };
  for (const product of group) {
    if (product.image && !product.image.includes("/illustrative-")) continue;
    product.image = candidate.image;
    credits.push({ sku: product.id, ...source });
    productsApplied++;
  }
  usedHashes.set(hash, new Set([groupKey]));
  albumsApplied++;
}
await writeJson(productsPath, products);
await writeJson(creditsPath, credits);
const oldReasons = new Map(unmatchedBefore.map((entry) => [key(entry.artist, entry.album), entry.reason]));
const missing = new Map();
for (const product of products) if (!product.image || product.image.includes("/illustrative-")) {
  const groupKey = key(product.artist, product.title);
  if (!missing.has(groupKey)) missing.set(groupKey, { artist: product.artist, album: product.title, reason: oldReasons.get(groupKey) || "no unique official cover located in public catalogs" });
}
await writeJson(unmatchedPath, [...missing.values()]);
const updates = products.filter((product) => product.image).map((product) => `UPDATE products SET image=${sql(product.image)} WHERE id=${sql(product.id)} AND (image='' OR image LIKE '/assets/covers/illustrative-%');`);
await fs.writeFile("data/artwork-update.sql", updates.join("\n") + "\n");
console.log(`Discogs aplicó ${albumsApplied} portadas verificadas a ${productsApplied} fichas; ${duplicateCoversSkipped} portadas repetidas fueron descartadas; ${missing.size} grupos siguen sin fuente oficial inequívoca.`);
