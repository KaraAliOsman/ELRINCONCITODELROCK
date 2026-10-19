// Reuse a catalog cover when the metadata confirms the same album despite a
// recognized edition label, a missing leading article, a curated artist/title
// variant, or a short inventory typo. Prefer one standard-edition cover when
// the inventory does not identify an edition; ambiguous covers remain unmatched.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const productsPath = "data/catalogue-source.json";
const creditsPath = "data/artwork-credits.json";
const unmatchedPath = "data/artwork-unmatched.json";
const artistAliasesPath = "data/artwork-artist-aliases.json";
const coversDirectory = path.join(root, "public/assets/covers");
const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
const unmatched = JSON.parse(await fs.readFile(unmatchedPath, "utf8"));
const artistAliases = await readJson(artistAliasesPath, []);

async function readJson(file, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const appleCaches = [
  await readJson("data/artwork-cache.json"),
  await readJson("data/artwork-title-cache.json"),
  await readJson("data/artwork-apple-live-cache.json"),
];
const deezerCaches = [
  await readJson("data/artwork-deezer-cache.json"),
  await readJson("data/artwork-deezer-broad-cache.json"),
  await readJson("data/artwork-deezer-artist-cache.json"),
];

const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\band\b/g, "y")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const strictArtistKey = (value) => normalize(value).replace(/^the /, "");
const artistAliasesByInventoryName = new Map(
  artistAliases.map((alias) => [
    strictArtistKey(alias.inventoryArtist),
    strictArtistKey(alias.catalogArtist),
  ]),
);
for (const alias of artistAliases) {
  if (
    !alias.inventoryArtist ||
    !alias.catalogArtist ||
    new Set((alias.evidenceAlbums || []).map(normalize)).size < 2
  )
    throw new Error(
      `Artist alias needs at least two distinct catalog album matches: ${alias.inventoryArtist || "unknown"}`,
    );
}
const artistKey = (value) => {
  const key = strictArtistKey(value);
  return artistAliasesByInventoryName.get(key) || key;
};
const ownerKey = (artist, title) => `${artistKey(artist)}|${normalize(title)}`;
const strictOwnerKey = (artist, title) =>
  `${strictArtistKey(artist)}|${normalize(title)}`;
const genericTitles = new Set([
  "greatest hits",
  "the greatest hits",
  "best of",
  "the best of",
  "anthology",
  "live",
  "unplugged",
  "the singles",
  "essential collection",
]);
const leadingArticle = /^(?:the|a|an|el|la|los|las|un|una|unos|unas) /;
const titleIdentity = (value) => {
  const title = normalize(value);
  const withoutArticle = title.replace(leadingArticle, "");
  return genericTitles.has(title) || genericTitles.has(withoutArticle)
    ? title
    : withoutArticle;
};
const sourceTitleIdentity = (value) => {
  const source = String(value);
  let title = normalize(source);
  const parentheticalLive = /\s*[\[(]\s*live\s*[\])]\s*$/i.test(source);
  let strippedEdition = parentheticalLive;
  if (parentheticalLive)
    title = normalize(source.replace(/\s*[\[(]\s*live\s*[\])]\s*$/i, ""));
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = title
      .replace(
        / (?:bonus tracks? version|deluxe edition|expanded edition|super deluxe edition|anniversary edition|special edition|limited edition|collector(?:s|['’]s) edition|edicion especial|edicion limitada|edicion de aniversario|deluxe|expanded|super deluxe)$/,
        "",
      )
      .replace(/ (?:[0-9]+(?:st|nd|rd|th)? )?anniversary$/, "")
      .replace(/ (?:[0-9]+(?:st|nd|rd|th)? )?aniversario$/, "")
      .replace(/ (?:digital )?remaster(?:ed|izado)?(?: [0-9]{4})?$/, "")
      .replace(/ [0-9]{4} (?:remaster|remastered|remasterizado|mix|remix|edition)$/, "");
    if (next === title) break;
    title = next;
    strippedEdition = true;
  }
  const withoutArticle = title.replace(leadingArticle, "");
  const generic = genericTitles.has(title) || genericTitles.has(withoutArticle);
  const identity = generic ? title : withoutArticle;
  return {
    key: identity,
    strippedEdition,
    strippedArticle: identity !== title,
  };
};
const preferStandardEdition = (rows) => {
  const standard = rows.filter(
    (candidate) => !sourceTitleIdentity(candidate.collectionName).strippedEdition,
  );
  return standard.length ? standard : rows;
};
const coverOwnerKey = (artist, title) =>
  `${artistKey(artist)}|${titleIdentity(title)}`;
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const writeJson = async (file, value) => {
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
};

function rowsFromCache(value) {
  return Array.isArray(value) ? value : value?.results || [];
}

function asApple(row) {
  if (!row?.collectionId || !row?.artistName || !row?.collectionName) return null;
  const url = row.artworkUrl100 || row.artworkUrl600;
  if (!url) return null;
  return {
    provider: "apple",
    collectionId: String(row.collectionId),
    artistName: row.artistName,
    collectionName: row.collectionName,
    collectionViewUrl: row.collectionViewUrl || "",
    artworkUrl100: url,
  };
}

function asDeezer(row) {
  if (!row?.collectionId || !row?.artistName || !row?.collectionName || !row?.artworkUrl100)
    return null;
  return {
    provider: "deezer",
    collectionId: String(row.collectionId),
    artistName: row.artistName,
    collectionName: row.collectionName,
    collectionViewUrl:
      row.collectionViewUrl || `https://www.deezer.com/album/${row.collectionId}`,
    artworkUrl100: row.artworkUrl100,
  };
}

const appleByIdentity = new Map();
const deezerByIdentity = new Map();
const appleByArtist = new Map();
const deezerByArtist = new Map();
const exactOwners = new Set();
function indexCandidate(index, artistIndex, candidate) {
  const identity = `${artistKey(candidate.artistName)}|${sourceTitleIdentity(candidate.collectionName).key}`;
  const rows = index.get(identity) || [];
  rows.push(candidate);
  index.set(identity, rows);
  const artistRows = artistIndex.get(artistKey(candidate.artistName)) || [];
  artistRows.push(candidate);
  artistIndex.set(artistKey(candidate.artistName), artistRows);
  exactOwners.add(strictOwnerKey(candidate.artistName, candidate.collectionName));
}

for (const cache of appleCaches) {
  for (const value of Object.values(cache)) {
    for (const raw of rowsFromCache(value)) {
      const row = asApple(raw);
      if (row) indexCandidate(appleByIdentity, appleByArtist, row);
    }
  }
}
for (const cache of deezerCaches) {
  for (const value of Object.values(cache)) {
    for (const raw of rowsFromCache(value)) {
      const row = asDeezer(raw);
      if (row) indexCandidate(deezerByIdentity, deezerByArtist, row);
    }
  }
}

const productsByOwner = new Map();
for (const product of products.filter((row) => !row.image || row.image.includes("/illustrative-"))) {
  const owner = ownerKey(product.artist, product.title);
  const group = productsByOwner.get(owner) || [];
  group.push(product);
  productsByOwner.set(owner, group);
}

const usedHashes = new Map();
const imageOwnersByCollection = new Map();
const productBySku = new Map(products.map((row) => [row.id, row]));
for (const product of products.filter((row) => row.image && !row.image.includes("/illustrative-"))) {
  if (!product.image.startsWith("/assets/covers/")) continue;
  try {
    const bytes = await fs.readFile(path.join(root, "public", product.image.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owner = coverOwnerKey(product.artist, product.title);
    const owners = usedHashes.get(hash) || new Set();
    owners.add(owner);
    usedHashes.set(hash, owners);
  } catch {
    // Missing old assets are ignored; they cannot validate or block a new cover.
  }
}
for (const credit of credits) {
  const product = productBySku.get(credit.sku);
  const url = String(credit.collectionUrl || "");
  if (!product || !url) continue;
  const appleId = url.match(/music\.apple\.com\/[^/]+\/album\/[^/]+\/(\d+)/)?.[1];
  const deezerId = url.match(/deezer\.com\/album\/(\d+)/)?.[1];
  const provider = deezerId ? "deezer" : appleId ? "apple" : "";
  const id = deezerId || appleId;
  if (!provider || !id) continue;
  const key = `${provider}:${id}`;
  const owner = coverOwnerKey(product.artist, product.title);
  const owners = imageOwnersByCollection.get(key) || new Set();
  owners.add(owner);
  imageOwnersByCollection.set(key, owners);
}

function isJpegCover(bytes) {
  return (
    bytes.length >= 2048 &&
    bytes.length <= 5_000_000 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

async function loadCandidate(candidate) {
  const prefix = candidate.provider === "apple" ? "album" : "deezer";
  const filename = `${prefix}-${candidate.collectionId}.jpg`;
  const file = path.join(coversDirectory, filename);
  try {
    const bytes = await fs.readFile(file);
    if (!isJpegCover(bytes)) throw new Error("cached file is not a valid JPEG cover");
    return { bytes, filename };
  } catch {
    let url = candidate.artworkUrl100;
    if (candidate.provider === "apple") url = url.replace(/\d+x\d+bb/, "600x600bb");
    const host = new URL(url).hostname;
    const allowed =
      candidate.provider === "apple"
        ? host.endsWith(".mzstatic.com")
        : host.endsWith(".dzcdn.net");
    if (!allowed) throw new Error("image host did not match the catalog provider");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)" },
    });
    if (!response.ok) throw new Error(`cover returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isJpegCover(bytes))
      throw new Error("catalog response was not a valid JPEG cover");
    return { bytes, filename };
  }
}

async function assignAlias(
  owner,
  group,
  candidate,
  bytes,
  filename,
  matchProviders,
  titleMatchKind = "",
) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const coverOwner = coverOwnerKey(group[0].artist, group[0].title);
  const currentOwners = usedHashes.get(hash);
  if (currentOwners && [...currentOwners].some((entry) => entry !== coverOwner))
    return { reason: "identical image bytes already belong to a different album" };
  const collectionKey = `${candidate.provider}:${candidate.collectionId}`;
  const existingOwners = imageOwnersByCollection.get(collectionKey);
  if (existingOwners && [...existingOwners].some((entry) => entry !== coverOwner))
    return { reason: "catalog cover is already assigned to a different album" };

  await fs.mkdir(coversDirectory, { recursive: true });
  const file = path.join(coversDirectory, filename);
  try {
    await fs.access(file);
  } catch {
    const temporary = file + ".tmp";
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, file);
  }
  usedHashes.set(hash, new Set([coverOwner]));
  imageOwnersByCollection.set(collectionKey, new Set([coverOwner]));
  const image = `/assets/covers/${filename}`;
  const artistSpellingDiffers = group.some(
    (product) =>
      strictArtistKey(product.artist) !== strictArtistKey(candidate.artistName),
  );
  const titleLabelDiffers = group.some(
    (product) => normalize(product.title) !== normalize(candidate.collectionName),
  );
  for (const product of group) {
    product.image = image;
    credits.push({
      sku: product.id,
      artist: candidate.artistName,
      album: candidate.collectionName,
      collectionUrl: candidate.collectionViewUrl,
      collectionId: candidate.collectionId,
      image,
      match:
        artistSpellingDiffers && titleLabelDiffers
          ? titleMatchKind === "typo"
            ? "same album; catalog-confirmed artist and title spelling variants"
            : titleMatchKind === "expanded"
              ? "same album; catalog-confirmed artist and abbreviated inventory title"
              : "same album; catalog-confirmed artist spelling and recognized title variant"
          : artistSpellingDiffers
            ? "same album; catalog-confirmed artist spelling variant"
            : titleMatchKind === "typo"
              ? "same album; catalog-confirmed title spelling correction"
              : titleMatchKind === "expanded"
                ? "same album; catalog confirms the abbreviated inventory title"
                : "same album; only a recognized edition label or leading article differs",
      ...(artistSpellingDiffers
        ? { inventoryArtist: product.artist, catalogArtist: candidate.artistName }
        : {}),
      source:
        candidate.provider === "apple"
          ? "Apple Music/iTunes cached catalog"
          : "Deezer catalog",
      corroboratedBy: matchProviders,
    });
  }
  return { ok: true };
}

const assignedOwners = new Set();
const aliasFailures = [];
let assignedAlbums = 0;
let assignedProducts = 0;
function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let beforePrevious = null;
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      )
        current[column] = Math.min(
          current[column],
          beforePrevious[column - 2] + 1,
        );
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

const genericFuzzyTitles =
  /\b(?:greatest|best|hits|anthology|live|unplugged|essential|collection|singles|compilation|volume|vol)\b/;
function safeTitleTypo(left, right) {
  const target = normalize(left);
  const candidate = normalize(right);
  if (
    target === candidate ||
    Math.min(target.length, candidate.length) < 4 ||
    /\d/.test(target) ||
    /\d/.test(candidate) ||
    genericFuzzyTitles.test(target) ||
    genericFuzzyTitles.test(candidate)
  )
    return null;
  const distance = editDistance(target, candidate);
  if (Math.min(target.length, candidate.length) < 7) {
    if (target.length !== candidate.length || distance !== 1) return null;
    const differences = [];
    for (let index = 0; index < target.length; index++)
      if (target[index] !== candidate[index]) differences.push(index);
    return (
      differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      target[differences[0]] === candidate[differences[1]] &&
      target[differences[1]] === candidate[differences[0]]
    )
      ? 1
      : null;
  }
  const limit = Math.min(target.length, candidate.length) < 12 ? 1 : 2;
  return distance <= limit ? distance : null;
}

function fuzzyAliasFor(index, product, provider) {
  const byTitle = new Map();
  for (const candidate of index.get(artistKey(product.artist)) || []) {
    if (artistKey(candidate.artistName) !== artistKey(product.artist)) continue;
    const distance = safeTitleTypo(product.title, candidate.collectionName);
    if (distance === null) continue;
    const key = normalize(candidate.collectionName);
    const rows = byTitle.get(key) || [];
    rows.push({ candidate, distance });
    byTitle.set(key, rows);
  }
  const choices = [...byTitle.entries()]
    .map(([title, matches]) => ({
      title,
      distance: Math.min(...matches.map((match) => match.distance)),
      matches,
    }))
    .sort((left, right) => left.distance - right.distance);
  let rows;
  let title;
  let matchKind = "typo";
  if (choices.length) {
    const best = choices[0];
    if (choices[1] && choices[1].distance <= best.distance + 1)
      return { rows: [], byImage: new Map(), reason: "multiple near title matches" };
    rows = preferStandardEdition(best.matches.map((match) => match.candidate));
    title = sourceTitleIdentity(
      best.matches[0].candidate.collectionName,
    ).key;
  } else {
    const target = titleIdentity(product.title);
    if (
      target.length < 10 ||
      target.split(" ").filter(Boolean).length < 2 ||
      genericFuzzyTitles.test(target)
    )
      return { rows: [], byImage: new Map() };
    const identities = new Map();
    for (const candidate of index.get(artistKey(product.artist)) || []) {
      if (artistKey(candidate.artistName) !== artistKey(product.artist)) continue;
      const identity = sourceTitleIdentity(candidate.collectionName).key;
      const start = identity.indexOf(target);
      if (
        identity === target ||
        start < 0 ||
        (start > 0 && identity[start - 1] !== " ") ||
        (start + target.length < identity.length &&
          identity[start + target.length] !== " ") ||
        identity.split(" ").length - target.split(" ").length > 8
      )
        continue;
      const matches = identities.get(identity) || [];
      matches.push(candidate);
      identities.set(identity, matches);
    }
    if (!identities.size) return { rows: [], byImage: new Map() };
    if (identities.size > 1)
      return { rows: [], byImage: new Map(), reason: "multiple near title matches" };
    [title, rows] = [...identities.entries()][0];
    rows = preferStandardEdition(rows);
    matchKind = "expanded";
  }
  const imageUrl = (candidate) =>
    provider === "apple"
      ? candidate.artworkUrl100.replace(/\d+x\d+bb/, "600x600bb")
      : candidate.artworkUrl100;
  const byImage = new Map();
  for (const row of rows) {
    const url = imageUrl(row);
    const same = byImage.get(url) || [];
    same.push(row);
    byImage.set(url, same);
  }
  return { rows, byImage, title, matchKind };
}

for (const [owner, group] of productsByOwner) {
  const product = group[0];
  const exactAppleRows = (appleByIdentity.get(`${artistKey(product.artist)}|${titleIdentity(product.title)}`) || [])
    .filter((row) => strictArtistKey(row.artistName) === strictArtistKey(product.artist) && normalize(row.collectionName) === normalize(product.title));
  const exactDeezerRows = (deezerByIdentity.get(`${artistKey(product.artist)}|${titleIdentity(product.title)}`) || [])
    .filter((row) => strictArtistKey(row.artistName) === strictArtistKey(product.artist) && normalize(row.collectionName) === normalize(product.title));
  if (exactAppleRows.length || exactDeezerRows.length || exactOwners.has(strictOwnerKey(product.artist, product.title))) continue;

  const key = `${artistKey(product.artist)}|${titleIdentity(product.title)}`;
  const aliasFor = (index, provider) => {
    let rows = (index.get(key) || []).filter((candidate) => {
      if (artistKey(candidate.artistName) !== artistKey(product.artist)) return false;
      const identity = sourceTitleIdentity(candidate.collectionName);
      const exact = normalize(candidate.collectionName) === normalize(product.title);
      const artistSpellingDiffers =
        strictArtistKey(candidate.artistName) !== strictArtistKey(product.artist);
      const titleAliasMatches =
        !exact &&
        identity.key === titleIdentity(product.title) &&
        (identity.strippedEdition ||
          identity.strippedArticle ||
          normalize(candidate.collectionName) !== normalize(product.title));
      return (
        identity.key === titleIdentity(product.title) &&
        (titleAliasMatches || artistSpellingDiffers)
      );
    });
    rows = preferStandardEdition(rows);
    const imageUrl = (candidate) =>
      provider === "apple"
        ? candidate.artworkUrl100.replace(/\d+x\d+bb/, "600x600bb")
        : candidate.artworkUrl100;
    const byImage = new Map();
    for (const row of rows) {
      const url = imageUrl(row);
      const same = byImage.get(url) || [];
      same.push(row);
      byImage.set(url, same);
    }
    return { rows, byImage };
  };
  let apple = aliasFor(appleByIdentity, "apple");
  let deezer = aliasFor(deezerByIdentity, "deezer");
  let titleMatchKind = "";
  if (!apple.byImage.size && !deezer.byImage.size) {
    apple = fuzzyAliasFor(appleByArtist, product, "apple");
    deezer = fuzzyAliasFor(deezerByArtist, product, "deezer");
    const fuzzyReason = apple.reason || deezer.reason;
    if (fuzzyReason) {
      aliasFailures.push({
        artist: product.artist,
        album: product.title,
        reason: fuzzyReason,
      });
      continue;
    }
    titleMatchKind =
      apple.byImage.size > 0 || deezer.byImage.size > 0
        ? apple.matchKind === "expanded" || deezer.matchKind === "expanded"
          ? "expanded"
          : "typo"
        : "";
  }
  if (
    titleMatchKind &&
    apple.title &&
    deezer.title &&
    apple.title !== deezer.title
  ) {
    aliasFailures.push({
      artist: product.artist,
      album: product.title,
      reason: "Apple and Deezer matched different near-title candidates",
    });
    continue;
  }
  if (apple.byImage.size > 1 || deezer.byImage.size > 1) {
    aliasFailures.push({ artist: product.artist, album: product.title, reason: "multiple edition covers" });
    continue;
  }
  if (!apple.byImage.size && !deezer.byImage.size) continue;

  let candidate;
  let bytes;
  let filename;
  let corroboratedBy = "";
  if (apple.byImage.size === 1 && deezer.byImage.size === 1) {
    const appleCandidate = apple.byImage.values().next().value[0];
    try {
      const appleImage = await loadCandidate(appleCandidate);
      candidate = appleCandidate;
      bytes = appleImage.bytes;
      filename = appleImage.filename;
      corroboratedBy = "Deezer independently matches the same artist and album identity";
    } catch (error) {
      aliasFailures.push({ artist: product.artist, album: product.title, reason: "could not compare provider images: " + error.message });
      continue;
    }
  } else {
    candidate = apple.byImage.size === 1
      ? apple.byImage.values().next().value[0]
      : deezer.byImage.values().next().value[0];
    try {
      const image = await loadCandidate(candidate);
      bytes = image.bytes;
      filename = image.filename;
    } catch (error) {
      aliasFailures.push({ artist: product.artist, album: product.title, reason: "cover download failed: " + error.message });
      continue;
    }
  }

  const result = await assignAlias(
    owner,
    group,
    candidate,
    bytes,
    filename,
    corroboratedBy,
    titleMatchKind,
  );
  if (!result.ok) {
    aliasFailures.push({ artist: product.artist, album: product.title, reason: result.reason });
    continue;
  }
  assignedOwners.add(owner);
  assignedAlbums++;
  assignedProducts += group.length;
}

const statements = products
  .filter((product) => product.image)
  .map(
    (product) =>
      `UPDATE products SET image=${sql(product.image)} WHERE id=${sql(product.id)} AND (image='' OR image LIKE '/assets/covers/illustrative-%');`,
  );
await fs.writeFile("data/artwork-update.sql", statements.join("\n") + "\n");
await writeJson(productsPath, products);
await writeJson(creditsPath, credits);
await writeJson(
  unmatchedPath,
  unmatched.filter((row) => !assignedOwners.has(ownerKey(row.artist, row.album))),
);
await writeJson("data/artwork-alias-unmatched.json", aliasFailures);
console.log(
  `Edition/title aliases assigned: ${assignedAlbums} albums, ${assignedProducts} product fichas. ` +
    `${aliasFailures.length} alias candidates were rejected or need review.`,
);
