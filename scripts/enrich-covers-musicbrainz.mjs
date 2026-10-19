// Find official album-cover references in MusicBrainz and the Cover Art
// Archive. Cache full artist discographies to make reruns resumable.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const productsPath = "data/catalogue-source.json";
const creditsPath = "data/artwork-credits.json";
const unmatchedPath = "data/artwork-unmatched.json";
const cachePath = "data/artwork-musicbrainz-cache.json";
const coversDirectory = "public/assets/covers";
const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
const unmatchedBefore = await readJson(unmatchedPath, []);
const cache = await readJson(cachePath, {});
const aliases = await readJson("data/artwork-artist-aliases.json", []);
const artistAliases = new Map(
  aliases.map((entry) => [artistKey(entry.inventoryArtist), entry.catalogArtist]),
);

function normalize(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " y ").replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}
function artistKey(value) { return normalize(value).replace(/^the /, ""); }
function albumKey(artist, title) { return `${artistKey(artist)}|${normalize(title)}`; }
function titleCore(value) {
  return normalize(value).replace(/\b(?:deluxe|expanded|anniversary|remastered|remaster|stereo|mono|edition|bonus tracks?)\b/g, " ").replace(/\s+/g, " ").trim();
}
function distance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[right.length];
}
function titleMatch(target, candidate, allGroups) {
  const left = titleCore(target);
  const right = titleCore(candidate);
  if (left === right) return "exact";
  if (left.length >= 9 && right.startsWith(`${left} `) && allGroups.filter((group) => titleCore(group.title).startsWith(`${left} `)).length === 1) return "abbreviated";
  if (Math.min(left.length, right.length) >= 8 && !/\d/.test(left + right) && !/\b(?:greatest|best|hits|anthology|live|unplugged|essential|collection|singles|compilation|volume|vol)\b/.test(`${left} ${right}`) && distance(left, right) <= (Math.min(left.length, right.length) < 12 ? 1 : 2)) return "typo";
  return null;
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, file);
}
function creditsOf(group) {
  return (group["artist-credit"] || []).map((credit) => credit.name || credit.artist?.name).filter(Boolean);
}

const albumGroupsByArtist = new Map();
for (const product of products) {
  if (product.image && !product.image.includes("/illustrative-")) continue;
  const key = artistKey(product.artist);
  const artist = albumGroupsByArtist.get(key) || { artist: product.artist, albums: new Map() };
  const albumKeyValue = albumKey(product.artist, product.title);
  const album = artist.albums.get(albumKeyValue) || [];
  album.push(product);
  artist.albums.set(albumKeyValue, album);
  albumGroupsByArtist.set(key, artist);
}
const usedHashes = new Map();
for (const product of products.filter((entry) => entry.image?.startsWith("/assets/covers/") && !entry.image.includes("/illustrative-"))) {
  try {
    const bytes = await fs.readFile(path.join("public", product.image.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owners = usedHashes.get(hash) || new Set();
    owners.add(albumKey(product.artist, product.title));
    usedHashes.set(hash, owners);
  } catch {}
}
await fs.mkdir(coversDirectory, { recursive: true });

let lastMusicBrainzAt = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchMusicBrainz(url) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = 1200 - (Date.now() - lastMusicBrainzAt);
    if (wait > 0) await pause(wait);
    lastMusicBrainzAt = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: {
        "User-Agent": "ElRinconcitoDelRock/1.0 (album artwork lookup; https://github.com/KaraAliOsman/ELRINCONCITODELROCK)",
        Accept: "application/json",
      } });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`MusicBrainz HTTP ${response.status}`);
        await pause(Math.min(30000, 3000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (/MusicBrainz HTTP (?:400|404)/.test(String(error?.message))) throw error;
      if (attempt < 5) await pause(Math.min(30000, 1500 * 2 ** attempt));
    }
  }
  throw lastError;
}
async function getArtistGroups(inventoryArtist) {
  const requestedArtist = artistAliases.get(artistKey(inventoryArtist)) || inventoryArtist;
  const cacheKey = artistKey(requestedArtist);
  if (cache[cacheKey]?.complete) return cache[cacheKey].groups;
  const groups = [];
  let offset = 0;
  let total = 0;
  do {
    const params = new URLSearchParams({
      query: `artist:"${requestedArtist.replaceAll('"', "\\\"")}"`, fmt: "json", limit: "100", offset: String(offset),
    });
    const payload = await fetchMusicBrainz(`https://musicbrainz.org/ws/2/release-group/?${params}`);
    const page = payload["release-groups"] || [];
    groups.push(...page);
    total = Number(payload.count) || page.length;
    offset += page.length;
    if (!page.length) break;
  } while (offset < total && offset < 1000);
  cache[cacheKey] = { complete: offset >= total || offset >= 1000, groups };
  return groups;
}
async function getCover(groupId) {
  try {
    const response = await fetch(`https://coverartarchive.org/release-group/${groupId}`, {
      signal: AbortSignal.timeout(30000), headers: { "User-Agent": "ElRinconcitoDelRock/1.0 artwork lookup" },
    });
    if (!response.ok) return null;
    const art = await response.json();
    const front = (art.images || []).find((image) => image.front && image.approved !== false);
    if (!front) return null;
    const source = front.thumbnails?.["500"] || front.thumbnails?.["250"] || front.image;
    const imageResponse = await fetch(source.replace(/^http:/, "https:"), { signal: AbortSignal.timeout(30000) });
    if (!imageResponse.ok) return null;
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) return null;
    const contentType = imageResponse.headers.get("content-type") || "";
    return { bytes, extension: contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg" };
  } catch { return null; }
}

let artistsDone = 0, albumsAdded = 0, productsAdded = 0, noMatch = 0, noCover = 0, ambiguous = 0;
const artists = [...albumGroupsByArtist.values()];
for (const artistGroup of artists) {
  const requestedArtist = artistAliases.get(artistKey(artistGroup.artist)) || artistGroup.artist;
  let groups;
  try { groups = await getArtistGroups(artistGroup.artist); }
  catch (error) {
    noMatch += artistGroup.albums.size;
    console.log(`MusicBrainz sin respuesta: ${artistGroup.artist} · ${error.message}`);
    artistsDone++;
    continue;
  }
  const requestedKey = artistKey(requestedArtist);
  const validArtistKeys = new Set([requestedKey, artistKey(artistGroup.artist)]);
  const relevant = groups.filter((group) => creditsOf(group).some((name) => {
    const key = artistKey(name);
    return validArtistKeys.has(key) || (Math.min(key.length, requestedKey.length) >= 7 && distance(key, requestedKey) === 1);
  }));
  for (const [owner, productGroup] of artistGroup.albums) {
    if (productGroup.some((product) => product.image && !product.image.includes("/illustrative-"))) continue;
    const product = productGroup[0];
    const matches = relevant.map((group) => ({ group, kind: titleMatch(product.title, group.title, relevant) }))
      .filter((entry) => entry.kind)
      .sort((a, b) => {
        const rank = { exact: 0, abbreviated: 1, typo: 2 };
        return rank[a.kind] - rank[b.kind] || String(a.group["first-release-date"] || "9999").localeCompare(String(b.group["first-release-date"] || "9999"));
      });
    if (!matches.length) { noMatch++; continue; }
    const bestKind = matches[0].kind;
    const best = [...new Map(matches.filter((entry) => entry.kind === bestKind).map((entry) => [entry.group.id, entry])).values()];
    const covers = [];
    for (const entry of best) {
      const art = await getCover(entry.group.id);
      if (!art) continue;
      const hash = createHash("sha256").update(art.bytes).digest("hex");
      covers.push({ ...entry, ...art, hash });
    }
    const uniqueCovers = new Map(covers.map((cover) => [cover.hash, cover]));
    if (!uniqueCovers.size) { noCover++; continue; }
    if (uniqueCovers.size > 1) { ambiguous++; continue; }
    const chosen = uniqueCovers.values().next().value;
    if ([...(usedHashes.get(chosen.hash) || [])].some((ownerKey) => ownerKey !== owner)) { ambiguous++; continue; }
    const imagePath = `/assets/covers/musicbrainz-${chosen.group.id}.${chosen.extension}`;
    const target = path.join(coversDirectory, path.basename(imagePath));
    try { await fs.access(target); } catch { await fs.writeFile(`${target}.tmp`, chosen.bytes); await fs.rename(`${target}.tmp`, target); }
    const catalogArtist = creditsOf(chosen.group).join(" & ") || requestedArtist;
    for (const item of productGroup) {
      item.image = imagePath;
      credits.push({
        sku: item.id, artist: catalogArtist, album: chosen.group.title,
        collectionUrl: `https://musicbrainz.org/release-group/${chosen.group.id}`,
        collectionId: chosen.group.id, image: imagePath,
        source: "MusicBrainz / Cover Art Archive",
        match: chosen.kind === "exact" ? "exact artist and album title" : chosen.kind === "abbreviated" ? "unique album title abbreviation confirmed by catalog" : "short spelling variant confirmed by catalog",
        ...(artistKey(catalogArtist) !== artistKey(item.artist) ? { inventoryArtist: item.artist, catalogArtist } : {}),
      });
      productsAdded++;
    }
    albumsAdded++;
    usedHashes.set(chosen.hash, new Set([owner]));
  }
  artistsDone++;
  if (artistsDone % 20 === 0) {
    await writeJson(cachePath, cache);
    await writeJson(productsPath, products);
    await writeJson(creditsPath, credits);
    console.log(`MusicBrainz ${artistsDone}/${artists.length} artistas · ${albumsAdded} álbumes · ${productsAdded} fichas · ${noCover} sin carátula CAA · ${ambiguous} ambiguos`);
  }
}

await writeJson(cachePath, cache);
await writeJson(productsPath, products);
await writeJson(creditsPath, credits);
const oldReasons = new Map(unmatchedBefore.map((entry) => [albumKey(entry.artist, entry.album), entry.reason]));
const remaining = new Map();
for (const product of products) if (!product.image || product.image.includes("/illustrative-")) {
  const key = albumKey(product.artist, product.title);
  if (!remaining.has(key)) remaining.set(key, { artist: product.artist, album: product.title, reason: oldReasons.get(key) || "no unambiguous official cover located in Apple, Deezer, or MusicBrainz / Cover Art Archive" });
}
const unmatched = [...remaining.values()];
await writeJson(unmatchedPath, unmatched);
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const updates = products.filter((product) => product.image).map((product) => `UPDATE products SET image=${sql(product.image)} WHERE id=${sql(product.id)} AND (image='' OR image LIKE '/assets/covers/illustrative-%');`);
await fs.writeFile("data/artwork-update.sql", updates.join("\n") + "\n");
console.log(`MusicBrainz listo: ${albumsAdded} álbumes y ${productsAdded} fichas nuevas; ${unmatched.length} álbumes siguen sin imagen oficial inequívoca (${noMatch} sin coincidencia, ${noCover} sin arte CAA, ${ambiguous} ambiguos).`);
