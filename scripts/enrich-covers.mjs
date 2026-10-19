// Add album reference covers only for exact artist + title matches.
// Apple Search results from the existing cache are preferred; Deezer is queried
// with fielded, broad, and artist-catalog searches for exact fallbacks.
// Ambiguous and reused images are left unassigned.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const base = process.cwd();
const productsPath = path.join(base, "data/catalogue-source.json");
const creditsPath = path.join(base, "data/artwork-credits.json");
const coversDirectory = path.join(base, "public/assets/covers");
const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const appleCache = await readJson("data/artwork-cache.json", {});
const appleTitleCache = await readJson("data/artwork-title-cache.json", {});
const deezerCachePath = "data/artwork-deezer-cache.json";
const deezerCache = await readJson(deezerCachePath, {});
const deezerBroadCachePath = "data/artwork-deezer-broad-cache.json";
const deezerBroadCache = await readJson(deezerBroadCachePath, {});
const deezerArtistCachePath = "data/artwork-deezer-artist-cache.json";
const deezerArtistCache = await readJson(deezerArtistCachePath, {});
const appleLiveCachePath = "data/artwork-apple-live-cache.json";
const appleLiveCache = await readJson(appleLiveCachePath, {});

const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\bvarios artistas\b/g, "various artists")
    .replace(/\band\b/g, "y")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const artistKey = (value) => normalize(value).replace(/^the /, "");
const albumKey = (artist, title) => `${artistKey(artist)}|${normalize(title)}`;
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const writeJson = async (file, value) => {
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
};

function appleRows(value) {
  const rows = Array.isArray(value) ? value : value?.results || [];
  return rows
    .filter(
      (row) => row?.collectionId && row?.artistName && row?.collectionName,
    )
    .map((row) => ({
      provider: "apple",
      collectionId: String(row.collectionId),
      artistName: row.artistName,
      collectionName: row.collectionName,
      collectionViewUrl: row.collectionViewUrl || "",
      artworkUrl100: row.artworkUrl100 || row.artworkUrl600 || "",
      ...(row.searchMode ? { searchMode: row.searchMode } : {}),
    }))
    .filter((row) => row.artworkUrl100);
}

const appleByAlbum = new Map();
const cachedAppleArtists = new Set(Object.keys(appleCache).map(artistKey));
for (const value of [
  ...Object.values(appleCache),
  ...Object.values(appleTitleCache),
  ...Object.values(appleLiveCache),
]) {
  for (const row of appleRows(value)) {
    const key = albumKey(row.artistName, row.collectionName);
    const rows = appleByAlbum.get(key) || [];
    rows.push(row);
    appleByAlbum.set(key, rows);
  }
}

await fs.mkdir(coversDirectory, { recursive: true });
const originalProducts = new Map(products.map((product) => [product.id, product]));
const groups = new Map();
for (const product of products) {
  if (product.image && !product.image.includes("/illustrative-")) continue;
  const key = albumKey(product.artist, product.title);
  const group = groups.get(key) || [];
  group.push(product);
  groups.set(key, group);
}

const usedHashes = new Map();
const imageOwnersByCollection = new Map();
for (const product of products.filter((entry) => entry.image && !entry.image.includes("/illustrative-"))) {
  const imagePath = product.image;
  if (!imagePath.startsWith("/assets/covers/")) continue;
  try {
    const bytes = await fs.readFile(path.join(base, "public", imagePath.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owner = albumKey(product.artist, product.title);
    const owners = usedHashes.get(hash) || new Set();
    owners.add(owner);
    usedHashes.set(hash, owners);
  } catch {
    // A missing old image is not treated as a usable or duplicate cover.
  }
}

for (const credit of credits) {
  const product = originalProducts.get(credit.sku);
  const url = String(credit.collectionUrl || "");
  if (!product || !url) continue;
  const appleId = url.match(/music\.apple\.com\/[^/]+\/album\/[^/]+\/(\d+)/)?.[1];
  const deezerId = url.match(/deezer\.com\/album\/(\d+)/)?.[1];
  const provider = deezerId ? "deezer" : appleId ? "apple" : "";
  const id = deezerId || appleId;
  if (!provider || !id) continue;
  const key = `${provider}:${id}`;
  const owner = albumKey(product.artist, product.title);
  const owners = imageOwnersByCollection.get(key) || new Set();
  owners.add(owner);
  imageOwnersByCollection.set(key, owners);
}

const rejected = [];
const sqlStatements = [];
const newCredits = [];
let cursor = 0;
const albumGroups = [...groups.entries()];
let completed = 0;
let albumsAdded = 0;
let productsAdded = 0;
let appleMatches = 0;
let deezerMatches = 0;
let deezerBroadMatches = 0;
let deezerArtistMatches = 0;
let artistSearchesDone = 0;
let appleLiveMatches = 0;
let appleLiveSearchesDone = 0;
let appleRateLimited = false;
let appleRequestAt = 0;
let appleRequestQueue = Promise.resolve();
let cooldownUntil = 0;
const workers = Math.max(
  1,
  Math.min(Number(process.env.COVER_WORKERS) || 5, 6),
);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let cacheWrite = Promise.resolve();
const persistDeezerCache = () => {
  cacheWrite = cacheWrite
    .then(() => writeJson(deezerCachePath, deezerCache))
    .then(() => writeJson(deezerBroadCachePath, deezerBroadCache))
    .then(() => writeJson(deezerArtistCachePath, deezerArtistCache))
    .then(() => writeJson(appleLiveCachePath, appleLiveCache));
  return cacheWrite;
};

function distinctByImage(candidates, getUrl) {
  const byImage = new Map();
  for (const candidate of candidates) {
    const url = getUrl(candidate);
    if (!url) continue;
    const group = byImage.get(url) || [];
    group.push(candidate);
    byImage.set(url, group);
  }
  return byImage;
}

async function queryDeezer(artist, album, mode = "fielded") {
  const quoted = (value) => String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const params = new URLSearchParams({
    q:
      mode === "artist"
        ? artist
        : mode === "broad"
          ? `${artist} ${album}`
          : `artist:"${quoted(artist)}" album:"${quoted(album)}"`,
    limit: "100",
  });
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (Date.now() < cooldownUntil) await pause(cooldownUntil - Date.now());
    try {
      const response = await fetch(`https://api.deezer.com/search/album?${params}`, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)" },
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after")) || 0;
        const wait = Math.max(retryAfter * 1000, 1000 * 2 ** attempt);
        cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
        lastError = new Error(`Deezer Search returned HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`Deezer Search returned HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) {
        if (payload.error.code === 4 || payload.error.code === 700)
          cooldownUntil = Math.max(cooldownUntil, Date.now() + 2000 * 2 ** attempt);
        throw new Error(`Deezer Search error ${payload.error.code}: ${payload.error.message}`);
      }
      return (payload.data || [])
        .filter((row) => row?.id && row?.artist?.name && row?.title)
        .map((row) => ({
          provider: "deezer",
          searchMode: mode,
          collectionId: String(row.id),
          artistName: row.artist.name,
          collectionName: row.title,
          collectionViewUrl: row.link || `https://www.deezer.com/album/${row.id}`,
          artworkUrl100: row.cover_xl || row.cover_big || row.cover_medium || "",
        }));
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        const wait = Math.min(1000 * 2 ** attempt, 15000);
        await pause(wait);
      }
    }
  }
  throw lastError || new Error("Deezer Search retry limit reached");
}

const inflightAppleSearches = new Map();
async function getAppleArtistRows(artist) {
  if (Array.isArray(appleLiveCache[artist])) return appleLiveCache[artist];
  if (appleRateLimited || cachedAppleArtists.has(artistKey(artist))) return [];
  if (!inflightAppleSearches.has(artist)) {
    const search = (appleRequestQueue = appleRequestQueue.then(async () => {
      if (appleRateLimited) return [];
      const delay = 1000 - (Date.now() - appleRequestAt);
      if (delay > 0) await pause(delay);
      if (appleRateLimited) return [];
      const params = new URLSearchParams({
        term: artist,
        entity: "album",
        media: "music",
        limit: "200",
        country: "CL",
      });
      const response = await fetch(`https://itunes.apple.com/search?${params}`, {
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)",
        },
      });
      appleRequestAt = Date.now();
      if (response.status === 429) {
        appleRateLimited = true;
        console.warn("Apple Search rate limit reached; stopping live Apple lookups.");
        return [];
      }
      if (!response.ok)
        throw new Error(`Apple Search returned HTTP ${response.status}`);
      const payload = await response.json();
      const rows = appleRows(payload.results).filter(
        (row) => artistKey(row.artistName) === artistKey(artist),
      );
      appleLiveCache[artist] = rows;
      for (const row of rows) {
        const key = albumKey(row.artistName, row.collectionName);
        const matches = appleByAlbum.get(key) || [];
        matches.push({ ...row, searchMode: "live-artist" });
        appleByAlbum.set(key, matches);
      }
      appleLiveSearchesDone++;
      if (appleLiveSearchesDone % 25 === 0) await persistDeezerCache();
      return rows;
    }).catch((error) => {
      appleLiveCache[artist] = { status: "error", reason: error.message };
      return [];
    }));
    inflightAppleSearches.set(artist, search);
  }
  return inflightAppleSearches.get(artist);
}

const inflightArtistSearches = new Map();
async function getDeezerArtistRows(artist) {
  if (Array.isArray(deezerArtistCache[artist])) return deezerArtistCache[artist];
  if (!inflightArtistSearches.has(artist)) {
    const search = queryDeezer(artist, "", "artist")
      .then(async (rows) => {
        deezerArtistCache[artist] = rows;
        artistSearchesDone++;
        if (artistSearchesDone % 50 === 0) await persistDeezerCache();
        return rows;
      })
      .catch((error) => {
        inflightArtistSearches.delete(artist);
        throw error;
      });
    inflightArtistSearches.set(artist, search);
  }
  return inflightArtistSearches.get(artist);
}

async function downloadCover(candidate, owner) {
  const collectionKey = `${candidate.provider}:${candidate.collectionId}`;
  const existingOwners = imageOwnersByCollection.get(collectionKey);
  if (existingOwners && [...existingOwners].some((entry) => entry !== owner))
    return { reason: "catalog cover is already assigned to a different album" };

  const prefix = candidate.provider === "deezer" ? "deezer" : "album";
  const filename = `${prefix}-${candidate.collectionId}.jpg`;
  const imagePath = `/assets/covers/${filename}`;
  const destination = path.join(coversDirectory, filename);
  let bytes;
  let fetched = false;
  try {
    bytes = await fs.readFile(destination);
  } catch {
    let url = candidate.artworkUrl100;
    if (candidate.provider === "apple")
      url = url.replace(/\d+x\d+bb/, "600x600bb");
    const imageHost = new URL(url).hostname;
    const allowedHost =
      candidate.provider === "deezer"
        ? imageHost.endsWith(".dzcdn.net")
        : imageHost.endsWith(".mzstatic.com");
    if (!allowedHost)
      return { reason: "cover image host did not match its catalogue source" };
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)" },
    });
    if (!response.ok) return { reason: `cover image returned HTTP ${response.status}` };
    bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length < 2048 ||
      bytes.length > 5_000_000 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    )
      return { reason: "catalogue response was not a valid JPEG cover" };
    fetched = true;
  }

  const hash = createHash("sha256").update(bytes).digest("hex");
  const otherOwners = usedHashes.get(hash);
  if (otherOwners && [...otherOwners].some((entry) => entry !== owner))
    return { reason: "identical image bytes already belong to a different album" };
  if (fetched) {
    const temporary = destination + ".tmp";
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, destination);
  }
  return { filename, imagePath, hash, collectionKey };
}

async function assignAlbum(owner, group, candidate) {
  let downloaded;
  try {
    downloaded = await downloadCover(candidate, owner);
  } catch (error) {
    return { reason: "cover download failed: " + error.message };
  }
  if (downloaded.reason) return downloaded;

  usedHashes.set(downloaded.hash, new Set([owner]));
  imageOwnersByCollection.set(downloaded.collectionKey, new Set([owner]));
  for (const product of group) {
    product.image = downloaded.imagePath;
    newCredits.push({
      sku: product.id,
      artist: candidate.artistName,
      album: candidate.collectionName,
      collectionUrl: candidate.collectionViewUrl,
      collectionId: candidate.collectionId,
      image: downloaded.imagePath,
      match: "exact artist and album title",
      source:
        candidate.provider === "deezer"
          ? candidate.searchMode === "artist"
            ? "Deezer artist catalog (exact metadata match)"
            : candidate.searchMode === "broad"
              ? "Deezer Search API (broad query; exact metadata match)"
              : "Deezer Search API (fielded query; exact metadata match)"
          : candidate.searchMode === "live-artist"
            ? "Apple Music/iTunes Search API (live Chile artist catalog)"
            : "Apple Music/iTunes Search API (cached catalog)",
    });
    sqlStatements.push(
      `UPDATE products SET image=${sql(downloaded.imagePath)} WHERE id=${sql(product.id)} AND image='';`,
    );
    productsAdded++;
  }
  albumsAdded++;
  if (candidate.provider === "deezer") {
    deezerMatches++;
    if (candidate.searchMode === "broad") deezerBroadMatches++;
    if (candidate.searchMode === "artist") deezerArtistMatches++;
  } else appleMatches++;
  if (candidate.provider === "apple" && candidate.searchMode === "live-artist")
    appleLiveMatches++;
  return { ok: true };
}

async function processAlbum(owner, group) {
  const representative = group[0];
  let appleExact = (appleByAlbum.get(owner) || []).filter(
    (candidate) =>
      artistKey(candidate.artistName) === artistKey(representative.artist) &&
      normalize(candidate.collectionName) === normalize(representative.title),
  );
  if (!appleExact.length) {
    await getAppleArtistRows(representative.artist);
    appleExact = (appleByAlbum.get(owner) || []).filter(
      (candidate) =>
        artistKey(candidate.artistName) === artistKey(representative.artist) &&
        normalize(candidate.collectionName) === normalize(representative.title),
    );
  }
  const appleByCover = distinctByImage(appleExact, (candidate) =>
    candidate.artworkUrl100.replace(/\d+x\d+bb/, "600x600bb"),
  );
  let appleReason = "no exact match in cached Apple catalog";
  if (appleByCover.size === 1) {
    const candidate = appleByCover.values().next().value[0];
    const result = await assignAlbum(owner, group, candidate);
    if (result.ok) return;
    appleReason = result.reason;
  } else if (appleByCover.size > 1) {
    appleReason = "multiple exact Apple editions have different covers";
  }

  let deezerRows = Array.isArray(deezerCache[owner]) ? deezerCache[owner] : [];
  let deezerExact = deezerRows.filter(
    (candidate) =>
      candidate.artworkUrl100 &&
      artistKey(candidate.artistName) === artistKey(representative.artist) &&
      normalize(candidate.collectionName) === normalize(representative.title),
  );
  if (!deezerExact.length) {
    deezerRows = Array.isArray(deezerBroadCache[owner])
      ? deezerBroadCache[owner]
      : [];
  }
  if (!deezerExact.length && !Array.isArray(deezerBroadCache[owner])) {
    try {
      deezerRows = await queryDeezer(
        representative.artist,
        representative.title,
        "broad",
      );
      deezerBroadCache[owner] = deezerRows;
    } catch (error) {
      rejected.push({
        artist: representative.artist,
        album: representative.title,
        reason: `${appleReason}; Deezer search failed: ${error.message}`,
      });
      return;
    }
  }

  deezerExact = deezerRows.filter(
    (candidate) =>
      candidate.artworkUrl100 &&
      artistKey(candidate.artistName) === artistKey(representative.artist) &&
      normalize(candidate.collectionName) === normalize(representative.title),
  );
  const deezerByCover = distinctByImage(deezerExact, (candidate) => candidate.artworkUrl100);
  if (deezerByCover.size > 1) {
    rejected.push({
      artist: representative.artist,
      album: representative.title,
      reason: "multiple exact Deezer editions have different covers",
    });
    return;
  }
  if (deezerByCover.size === 1) {
    const candidate = deezerByCover.values().next().value[0];
    if (
      Array.isArray(deezerBroadCache[owner]) &&
      deezerBroadCache[owner] === deezerRows
    )
      candidate.searchMode = "broad";
    const result = await assignAlbum(owner, group, candidate);
    if (result.ok) return;
    rejected.push({
      artist: representative.artist,
      album: representative.title,
      reason: `${appleReason}; ${result.reason}`,
    });
    return;
  }

  let artistRows;
  try {
    artistRows = await getDeezerArtistRows(representative.artist);
  } catch (error) {
    rejected.push({
      artist: representative.artist,
      album: representative.title,
      reason: `${appleReason}; no exact title in album search; Deezer artist search failed: ${error.message}`,
    });
    return;
  }
  const artistExact = artistRows.filter(
    (entry) =>
      entry.artworkUrl100 &&
      artistKey(entry.artistName) === artistKey(representative.artist) &&
      normalize(entry.collectionName) === normalize(representative.title),
  );
  const artistByCover = distinctByImage(artistExact, (entry) => entry.artworkUrl100);
  if (artistByCover.size === 1) {
    const artistCandidate = artistByCover.values().next().value[0];
    artistCandidate.searchMode = "artist";
    const artistResult = await assignAlbum(owner, group, artistCandidate);
    if (artistResult.ok) return;
    rejected.push({
      artist: representative.artist,
      album: representative.title,
      reason: `${appleReason}; ${artistResult.reason}`,
    });
    return;
  }
  rejected.push({
    artist: representative.artist,
    album: representative.title,
    reason:
      artistByCover.size > 1
        ? "multiple exact artist-catalog editions have different covers"
        : `${appleReason}; no exact Deezer album or artist-catalog title match`,
  });
}

async function worker() {
  while (cursor < albumGroups.length) {
    const [owner, group] = albumGroups[cursor++];
    await processAlbum(owner, group);
    completed++;
    if (completed % 50 === 0) {
      await persistDeezerCache();
      console.log(
        `Portadas: ${completed}/${albumGroups.length} álbumes · ${albumsAdded} álbumes asignados · ${productsAdded} fichas · Apple ${appleMatches} (live ${appleLiveMatches}), Deezer ${deezerMatches} (amplia ${deezerBroadMatches}, artista ${deezerArtistMatches}), pendientes ${rejected.length}`,
      );
    }
    await pause(100);
  }
}

await Promise.all(Array.from({ length: workers }, worker));
await persistDeezerCache();
const allImageUpdates = products
  .filter((product) => product.image)
  .map(
    (product) =>
      `UPDATE products SET image=${sql(product.image)} WHERE id=${sql(product.id)} AND (image='' OR image LIKE '/assets/covers/illustrative-%');`,
  );
await fs.writeFile("data/artwork-update.sql", allImageUpdates.join("\n") + "\n");
if (newCredits.length) await writeJson(creditsPath, [...credits, ...newCredits]);
await writeJson(productsPath, products);
await writeJson("data/artwork-unmatched.json", rejected);
console.log(
  `Carátulas añadidas: ${albumsAdded} álbumes, ${productsAdded} fichas. ` +
    `${rejected.length} álbumes quedaron sin asignar. Apple: ${appleMatches}; Deezer: ${deezerMatches}.`,
);
