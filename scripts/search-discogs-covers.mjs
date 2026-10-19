// Search Discogs independently from the local catalog so it can run beside
// other provider lookups. Applying results to products is a separate step.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const products = JSON.parse(await fs.readFile("data/catalogue-source.json", "utf8"));
const cache = await readJson("data/artwork-discogs-cache.json", {});
const previousResults = await readJson("data/artwork-discogs-results.json", {});
const aliases = await readJson("data/artwork-artist-aliases.json", []);
const artistAliases = new Map(aliases.map((entry) => [artistKey(entry.inventoryArtist), entry.catalogArtist]));

function normalize(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " y ").replace(/[^a-z0-9]+/g, " ")
    .replace(/\bvolumen\b/g, "vol").trim().replace(/\s+/g, " ");
}
function artistKey(value) { return normalize(value).replace(/^the /, ""); }
function albumKey(artist, title) { return `${artistKey(artist)}|${normalize(title)}`; }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, file);
}
function splitMasterTitle(value) {
  const separator = String(value).indexOf(" - ");
  return separator < 0 ? ["", String(value)] : [String(value).slice(0, separator), String(value).slice(separator + 3)];
}

const albumsByArtist = new Map();
for (const product of products) {
  if (product.image && !product.image.includes("/illustrative-")) continue;
  const key = artistKey(product.artist);
  const artist = albumsByArtist.get(key) || { artist: product.artist, albums: new Map() };
  const album = albumKey(product.artist, product.title);
  artist.albums.set(album, artist.albums.get(album) || product);
  albumsByArtist.set(key, artist);
}
const usedHashes = new Map();
for (const product of products.filter((item) => item.image?.startsWith("/assets/covers/") && !item.image.includes("/illustrative-"))) {
  try {
    const bytes = await fs.readFile(path.join("public", product.image.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owners = usedHashes.get(hash) || new Set();
    owners.add(albumKey(product.artist, product.title));
    usedHashes.set(hash, owners);
  } catch {}
}
await fs.mkdir("public/assets/covers", { recursive: true });

let lastRequestAt = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function discogsGet(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = 2500 - (Date.now() - lastRequestAt);
    if (wait > 0) await pause(wait);
    lastRequestAt = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)" } });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Discogs HTTP ${response.status}`);
        const retry = Number(response.headers.get("retry-after")) || 0;
        await pause(Math.max(retry * 1000, Math.min(30000, 5000 * 2 ** attempt)));
        continue;
      }
      if (!response.ok) throw new Error(`Discogs HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await pause(Math.min(30000, 2500 * 2 ** attempt));
    }
  }
  throw lastError;
}
async function mastersForArtist(artist, page = 1) {
  const catalogArtist = artistAliases.get(artistKey(artist)) || artist;
  const key = artistKey(catalogArtist);
  cache.artists ||= {};
  cache.artists[key] ||= { pages: 0, results: {} };
  const saved = cache.artists[key];
  if (saved.results[page]) return { ...saved.results[page], cached: true };
  const params = new URLSearchParams({ type: "master", artist: catalogArtist, per_page: "100", page: String(page) });
  const payload = await discogsGet(`https://api.discogs.com/database/search?${params}`);
  const value = { results: payload.results || [], pages: payload.pagination?.pages || 1 };
  saved.results[page] = value;
  saved.pages = value.pages;
  return value;
}
async function masterDetails(id) {
  cache.masters ||= {};
  if (cache.masters[id]) return cache.masters[id];
  const value = await discogsGet(`https://api.discogs.com/masters/${id}`);
  cache.masters[id] = value;
  return value;
}
async function savePrimaryImage(master) {
  const primary = (master.images || []).find((image) => image.type === "primary") || (master.images || [])[0];
  if (!primary?.uri) return null;
  try {
    const response = await fetch(primary.uri, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) return null;
    const hash = createHash("sha256").update(bytes).digest("hex");
    const filename = `discogs-${master.id}.jpg`;
    const file = path.join("public/assets/covers", filename);
    try { await fs.access(file); } catch { await fs.writeFile(`${file}.tmp`, bytes); await fs.rename(`${file}.tmp`, file); }
    return { image: `/assets/covers/${filename}`, hash };
  } catch { return null; }
}

let done = 0, albumsFound = 0, noMatch = 0, noCover = 0, duplicate = 0;
const artistEntries = [...albumsByArtist.values()];
for (const entry of artistEntries) {
  const catalogArtist = artistAliases.get(artistKey(entry.artist)) || entry.artist;
  let first;
  try { first = await mastersForArtist(entry.artist, 1); }
  catch (error) {
    noMatch += entry.albums.size;
    console.log(`Discogs sin respuesta: ${entry.artist} · ${error.message}`);
    done++;
    continue;
  }
  let results = first.results;
  for (const [owner, product] of entry.albums) {
    if (previousResults[owner]) { albumsFound++; continue; }
    const isMatch = (result) => {
      const [artist, title] = splitMasterTitle(result.title);
      return normalize(title) === normalize(product.title) && artistKey(artist) === artistKey(catalogArtist);
    };
    let candidates = results.filter(isMatch);
    if (!candidates.length && first.pages > 1 && first.pages <= 5) {
      try {
        for (let page = 2; page <= first.pages; page++) {
          const next = await mastersForArtist(entry.artist, page);
          results = results.concat(next.results);
          candidates = candidates.concat(next.results.filter(isMatch));
          if (candidates.length) break;
        }
      } catch {}
    }
    if (!candidates.length) { noMatch++; continue; }
    candidates.sort((a, b) => String(a.year || "9999").localeCompare(String(b.year || "9999")));
    let selected = null;
    for (const candidate of candidates) {
      try {
        const master = await masterDetails(candidate.id);
        const masterArtists = (master.artists || []).map((artist) => artist.name);
        if (masterArtists.length && !masterArtists.some((name) => artistKey(name) === artistKey(catalogArtist))) continue;
        const image = await savePrimaryImage(master);
        if (!image) continue;
        if ([...(usedHashes.get(image.hash) || [])].some((other) => other !== owner)) { duplicate++; continue; }
        selected = { artist: catalogArtist, album: product.title, masterId: master.id, masterTitle: master.title, masterUrl: master.uri || `https://www.discogs.com/master/${master.id}`, image: image.image, hash: image.hash };
        usedHashes.set(image.hash, new Set([owner]));
        break;
      } catch {}
    }
    if (!selected) { noCover++; continue; }
    previousResults[owner] = selected;
    albumsFound++;
  }
  done++;
  if (done % 20 === 0) {
    await writeJson("data/artwork-discogs-cache.json", cache);
    await writeJson("data/artwork-discogs-results.json", previousResults);
    console.log(`Discogs ${done}/${artistEntries.length} artistas · ${albumsFound} portadas encontradas · ${noCover} sin archivo · ${duplicate} imágenes ya usadas`);
  }
}
await writeJson("data/artwork-discogs-cache.json", cache);
await writeJson("data/artwork-discogs-results.json", previousResults);
console.log(`Discogs listo: ${albumsFound} portadas candidatas para combinar; ${noMatch} sin coincidencia, ${noCover} sin imagen.`);
