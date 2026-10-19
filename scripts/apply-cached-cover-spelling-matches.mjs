// Resolve a final set of obvious inventory spelling mistakes against the
// Apple Music and Deezer metadata caches. Ambiguous releases remain untouched.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const productsPath = "data/catalogue-source.json";
const creditsPath = "data/artwork-credits.json";
const coversDirectory = "public/assets/covers";
const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
const manualSources = JSON.parse(
  await fs.readFile("data/artwork-manual-sources.json", "utf8"),
);
const cacheFiles = [
  "data/artwork-cache.json",
  "data/artwork-title-cache.json",
  "data/artwork-apple-live-cache.json",
  "data/artwork-deezer-cache.json",
  "data/artwork-deezer-broad-cache.json",
  "data/artwork-deezer-artist-cache.json",
];
const aliases = JSON.parse(
  await fs.readFile("data/artwork-artist-aliases.json", "utf8"),
);

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\bvarios artistas\b/g, "various artists")
    .replace(/\band\b/g, "y")
    .replace(/\bvolumen\b/g, "vol")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[right.length];
}

function providerOf(candidate) {
  const url = String(candidate.collectionViewUrl || "");
  if (candidate.provider === "apple" || /music\.apple\.com\//.test(url))
    return "apple";
  if (candidate.provider === "deezer" || /deezer\.com\/album\//.test(url))
    return "deezer";
  return "";
}

function rowsFrom(value, output) {
  if (Array.isArray(value)) {
    for (const row of value) {
      if (
        row?.artistName &&
        row?.collectionName &&
        row?.artworkUrl100 &&
        providerOf(row)
      )
        output.push(row);
    }
  } else if (value && typeof value === "object") {
    if (
      value.artistName &&
      value.collectionName &&
      value.artworkUrl100 &&
      providerOf(value)
    )
      output.push(value);
    for (const child of Object.values(value)) rowsFrom(child, output);
  }
}

const catalogArtist = new Map(
  aliases.map((entry) => [
    normalize(entry.inventoryArtist).replace(/^the /, ""),
    normalize(entry.catalogArtist).replace(/^the /, ""),
  ]),
);
function artistKey(value) {
  const key = normalize(value).replace(/^the /, "");
  return catalogArtist.get(key) || key;
}

const cacheRows = [];
for (const file of cacheFiles) {
  try {
    rowsFrom(JSON.parse(await fs.readFile(file, "utf8")), cacheRows);
  } catch {
    // A missing optional cache does not prevent the other sources from being used.
  }
}

const candidatesByArtist = new Map();
const candidatesByTitle = new Map();
const seenCandidates = new Set();
for (const row of cacheRows) {
  const provider = providerOf(row);
  const url = String(row.artworkUrl100).replace(/\d+x\d+bb/, "600x600bb");
  const identity = `${provider}|${row.collectionId || row.collectionViewUrl}|${url}`;
  if (seenCandidates.has(identity)) continue;
  seenCandidates.add(identity);
  const candidate = {
    provider,
    artist: String(row.artistName),
    title: String(row.collectionName),
    artistKey: artistKey(row.artistName),
    titleKey: normalize(row.collectionName),
    url,
    collectionId: String(row.collectionId || ""),
    collectionUrl:
      row.collectionViewUrl ||
      (provider === "deezer" && row.collectionId
        ? `https://www.deezer.com/album/${row.collectionId}`
        : ""),
  };
  if (!candidate.url || !candidate.collectionUrl) continue;
  const byArtist = candidatesByArtist.get(candidate.artistKey) || [];
  byArtist.push(candidate);
  candidatesByArtist.set(candidate.artistKey, byArtist);
  const byTitle = candidatesByTitle.get(candidate.titleKey) || [];
  byTitle.push(candidate);
  candidatesByTitle.set(candidate.titleKey, byTitle);
}

const productGroups = new Map();
for (const product of products) {
  if (!product.image?.includes("/illustrative-")) continue;
  const key = `${artistKey(product.artist)}|${normalize(product.title)}`;
  const group = productGroups.get(key) || [];
  group.push(product);
  productGroups.set(key, group);
}

function rankCandidate(product, candidate) {
  const targetArtist = artistKey(product.artist);
  const targetTitle = normalize(product.title);
  const sameArtist = candidate.artistKey === targetArtist;
  const sameTitle = candidate.titleKey === targetTitle;
  if (sameArtist && sameTitle) return 0;

  // Allow one metadata field to contain a short typo. Keep titles with
  // numbers strict, since they commonly distinguish different editions.
  if (sameArtist && !sameTitle) {
    if (/\d/.test(targetTitle + candidate.titleKey)) return Infinity;
    const genericTitles = new Set([
      "best of",
      "the best of",
      "greatest hits",
      "grandes exitos",
      "singles",
      "demos",
      "en vivo",
      "live",
      "lo mejor",
    ]);
    if (
      targetTitle.length >= 10 &&
      targetTitle.split(" ").length >= 2 &&
      !genericTitles.has(targetTitle) &&
      candidate.titleKey.startsWith(`${targetTitle} `)
    )
      return 3;
    const distance = editDistance(targetTitle, candidate.titleKey);
    if (
      distance <= 2 &&
      Math.min(targetTitle.length, candidate.titleKey.length) >= 7
    )
      return distance;
    return Infinity;
  }
  if (sameTitle && !sameArtist) {
    const distance = editDistance(targetArtist, candidate.artistKey);
    if (
      distance <= 2 &&
      Math.min(targetArtist.length, candidate.artistKey.length) >= 8
    )
      return distance;
  }
  return Infinity;
}

const selected = [];
const rejected = [];
const visualReview = [];
for (const group of productGroups.values()) {
  const product = group[0];
  const exactArtist = candidatesByArtist.get(artistKey(product.artist)) || [];
  const exactTitle = candidatesByTitle.get(normalize(product.title)) || [];
  const options = new Map();
  for (const candidate of [...exactArtist, ...exactTitle]) {
    const rank = rankCandidate(product, candidate);
    if (!Number.isFinite(rank)) continue;
    const key = `${candidate.provider}|${candidate.collectionId}|${candidate.url}`;
    const previous = options.get(key);
    if (!previous || rank < previous.rank)
      options.set(key, { candidate, rank });
  }
  if (!options.size) continue;
  const bestRank = Math.min(
    ...[...options.values()].map((entry) => entry.rank),
  );
  const best = [...options.values()].filter((entry) => entry.rank === bestRank);
  const uniqueImages = new Map(
    best.map((entry) => [entry.candidate.url, entry.candidate]),
  );
  if (uniqueImages.size !== 1) {
    visualReview.push({
      group,
      rank: bestRank,
      candidates: [...uniqueImages.values()],
    });
    rejected.push(
      `${product.artist} · ${product.title}: ${[...uniqueImages.values()]
        .slice(0, 3)
        .map((entry) => `${entry.artist} — ${entry.title}`)
        .join(" | ")}`,
    );
    continue;
  }
  selected.push({
    group,
    candidate: uniqueImages.values().next().value,
    rank: bestRank,
  });
}

const dryRun = process.argv.includes("--dry-run");
console.log(
  `Coincidencias únicas de Apple Music/Deezer: ${selected.length} álbumes; ` +
    `${productGroups.size - selected.length} grupos sin coincidencia segura; ` +
    `${rejected.length} ambiguos.`,
);
if (dryRun) {
  for (const { group, candidate, rank } of selected) {
    console.log(
      `${rank === 0 ? "exacto" : `variante ${rank}`} · ${group[0].artist} — ${group[0].title} → ${candidate.artist} — ${candidate.title} (${candidate.collectionUrl})`,
    );
  }
  for (const item of rejected) console.log(`ambiguo · ${item}`);
  process.exit(0);
}

await fs.mkdir(coversDirectory, { recursive: true });
const usedHashes = new Map();
for (const product of products.filter((entry) =>
  entry.image?.startsWith("/assets/covers/"),
)) {
  try {
    const bytes = await fs.readFile(
      path.join("public", product.image.slice(1)),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owner = `${artistKey(product.artist)}|${normalize(product.title)}`;
    const owners = usedHashes.get(hash) || new Set();
    owners.add(owner);
    usedHashes.set(hash, owners);
  } catch {
    // Missing local assets are detected by the artwork verification workflow.
  }
}

const addedCredits = [];
let albumsApplied = 0;
let productsApplied = 0;
const assignedByOwner = new Map();
const sharp = (await import("sharp")).default;

async function loadCatalogCover(candidate) {
  const host = new URL(candidate.url).hostname;
  const allowedHost =
    candidate.provider === "apple"
      ? host.endsWith(".mzstatic.com")
      : host.endsWith(".dzcdn.net");
  if (!allowedHost) return null;
  try {
    const response = await fetch(candidate.url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)",
      },
    });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    if (input.length < 2048 || input.length > 5_000_000) return null;
    const metadata = await sharp(input, { failOn: "none" }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < 250 ||
      Math.abs(metadata.width / metadata.height - 1) > 0.15
    )
      return null;
    const bytes = await sharp(input, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const pixels = await sharp(bytes)
      .resize(32, 32, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    return {
      candidate,
      bytes,
      pixels,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    return null;
  }
}

function pixelDifference(left, right) {
  let total = 0;
  for (let i = 0; i < left.length; i++) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

let sameArtworkVariantsResolved = 0;
for (const review of visualReview) {
  if (review.candidates.length > 6) continue;
  const loaded = (
    await Promise.all(review.candidates.map(loadCatalogCover))
  ).filter(Boolean);
  if (loaded.length !== review.candidates.length) continue;
  const clusters = [];
  for (const item of loaded) {
    let cluster = clusters.find((items) =>
      items.every((other) => pixelDifference(item.pixels, other.pixels) <= 4),
    );
    if (!cluster) clusters.push((cluster = []));
    cluster.push(item);
  }
  clusters.sort((left, right) => right.length - left.length);
  if (clusters[0].length < 2 || clusters[0].length === clusters[1]?.length)
    continue;
  const accepted = clusters[0].sort(
    (left, right) =>
      (right.candidate.provider === "apple") -
        (left.candidate.provider === "apple") ||
      right.width * right.height - left.width * left.height,
  )[0];
  accepted.candidate._verifiedBytes = accepted.bytes;
  selected.push({
    group: review.group,
    candidate: accepted.candidate,
    rank: review.rank,
    imageAgreementCount: clusters[0].length,
  });
  sameArtworkVariantsResolved++;
}

console.log(
  `Variantes de catálogo resueltas por acuerdo visual: ${sameArtworkVariantsResolved} álbumes.`,
);
for (const { group, candidate } of selected) {
  const owner = `${artistKey(group[0].artist)}|${normalize(group[0].title)}`;
  const loaded = candidate._verifiedBytes
    ? { bytes: candidate._verifiedBytes }
    : await loadCatalogCover(candidate);
  if (!loaded) continue;
  const bytes = loaded.bytes;
  if (bytes.length < 2048 || bytes.length > 5_000_000) continue;

  const hash = createHash("sha256").update(bytes).digest("hex");
  const otherOwners = usedHashes.get(hash);
  if (otherOwners && [...otherOwners].some((entry) => entry !== owner))
    continue;
  const filename = `verified-${hash.slice(0, 20)}.jpg`;
  const image = `/assets/covers/${filename}`;
  const destination = path.join(coversDirectory, filename);
  try {
    await fs.access(destination);
  } catch {
    await fs.writeFile(`${destination}.tmp`, bytes);
    await fs.rename(`${destination}.tmp`, destination);
  }

  for (const product of group) {
    product.image = image;
    addedCredits.push({
      sku: product.id,
      artist: candidate.artist,
      album: candidate.title,
      collectionUrl: candidate.collectionUrl,
      collectionId: candidate.collectionId,
      image,
      source: candidate._verifiedBytes
        ? "Apple Music/Deezer album catalogs (matching covers confirmed visually)"
        : candidate.provider === "apple"
          ? "Apple Music/iTunes album catalog (unique spelling match)"
          : "Deezer album catalog (unique spelling match)",
      match: `exact metadata or one-field spelling match (edit distance ${rankCandidate(group[0], candidate)}${selected.find((entry) => entry.group === group)?.imageAgreementCount ? `; ${selected.find((entry) => entry.group === group).imageAgreementCount} cover variants agree visually` : ""})`,
      ...(candidate.artist !== group[0].artist ||
      candidate.title !== group[0].title
        ? { inventoryArtist: group[0].artist, inventoryAlbum: group[0].title }
        : {}),
    });
    if (rankCandidate(group[0], candidate) === 3)
      addedCredits.at(-1).match =
        "unique catalog title begins with the inventory title, which appears truncated";
    productsApplied++;
  }
  usedHashes.set(hash, new Set([owner]));
  assignedByOwner.set(owner, image);
  albumsApplied++;
}

for (const source of manualSources) {
  const product = products.find((entry) => entry.id === source.sku);
  const currentCredit = product
    ? credits.find((entry) => entry.sku === product.id && entry.image === product.image)
    : null;
  const isIllustrative = Boolean(product?.image?.includes("/illustrative-"));
  const refreshManualSource = Boolean(
    product?.image?.includes("/manual-") &&
      currentCredit?.collectionUrl &&
      (currentCredit.collectionUrl !== source.sourceUrl ||
        (currentCredit.imageUrl && currentCredit.imageUrl !== source.imageUrl) ||
        JSON.stringify(currentCredit.crop || null) !==
          JSON.stringify(source.crop || null)),
  );
  if (
    !product ||
    product.image?.includes("/verified-") ||
    (!isIllustrative && !refreshManualSource) ||
    normalize(product.artist) !== normalize(source.inventoryArtist) ||
    normalize(product.title) !== normalize(source.inventoryAlbum)
  )
    continue;

  const owner = `${artistKey(product.artist)}|${normalize(product.title)}`;
  const group =
    productGroups.get(owner) ||
    products.filter(
      (entry) =>
        `${artistKey(entry.artist)}|${normalize(entry.title)}` === owner,
    );
  if (assignedByOwner.has(owner)) {
    for (const item of group) item.image = assignedByOwner.get(owner);
    continue;
  }
  let bytes;
  try {
    const response = await fetch(source.imageUrl, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "ElRinconcitoDelRock/1.0 (catalog artwork lookup)",
      },
    });
    if (!response.ok) continue;
    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length || input.length > 12_000_000) continue;
    const metadata = await sharp(input, { failOn: "none" }).metadata();
    const width = source.crop?.width || metadata.width;
    const height = source.crop?.height || metadata.height;
    if (
      !width ||
      !height ||
      Math.min(width, height) < 200 ||
      Math.abs(width / height - 1) > 0.12 ||
      (source.crop &&
        (source.crop.left + width > metadata.width ||
          source.crop.top + height > metadata.height))
    )
      continue;
    const transform = sharp(input, { failOn: "none" }).rotate();
    if (source.crop) transform.extract(source.crop);
    bytes = await transform.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    continue;
  }
  if (bytes.length < 2048 || bytes.length > 5_000_000) continue;

  const hash = createHash("sha256").update(bytes).digest("hex");
  const otherOwners = usedHashes.get(hash);
  const sourceOwner = `manual:${normalize(source.catalogArtist)}|${normalize(source.catalogAlbum)}`;
  if (
    otherOwners &&
    [...otherOwners].some((entry) => entry !== owner && entry !== sourceOwner)
  )
    continue;
  const filename = `manual-${hash.slice(0, 20)}.jpg`;
  const image = `/assets/covers/${filename}`;
  const destination = path.join(coversDirectory, filename);
  try {
    await fs.access(destination);
  } catch {
    await fs.writeFile(`${destination}.tmp`, bytes);
    await fs.rename(`${destination}.tmp`, destination);
  }

  for (const item of group) {
    item.image = image;
    addedCredits.push({
      sku: item.id,
      artist: source.catalogArtist,
      album: source.catalogAlbum,
      collectionUrl: source.sourceUrl,
      imageUrl: source.imageUrl,
      image,
      source: source.sourceName,
      match: source.match,
      ...(source.crop ? { crop: source.crop } : {}),
      inventoryArtist: item.artist,
      inventoryAlbum: item.title,
    });
    productsApplied++;
  }
  const hashOwners = otherOwners || new Set();
  hashOwners.add(sourceOwner);
  hashOwners.add(owner);
  usedHashes.set(hash, hashOwners);
  assignedByOwner.set(owner, image);
  albumsApplied++;
}

const creditKeys = new Set(
  credits.map((entry) => `${entry.sku}|${entry.image}`),
);
const mergedCredits = [...credits];
for (const entry of addedCredits) {
  const key = `${entry.sku}|${entry.image}`;
  if (!creditKeys.has(key)) mergedCredits.push(entry);
  creditKeys.add(key);
}

const writeJson = async (file, value) => {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
};
await writeJson(productsPath, products);
await writeJson(creditsPath, mergedCredits);

const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const updates = products
  .filter((product) => product.image)
  .map(
    (product) =>
      `UPDATE products SET image=${sql(product.image)} WHERE id=${sql(product.id)} AND (image='' OR image LIKE '/assets/covers/illustrative-%' OR image LIKE 'https://%' OR image LIKE 'http://%');`,
  );
await fs.writeFile("data/artwork-update.sql", updates.join("\n") + "\n");

const oldUnmatched = await (async () => {
  try {
    return JSON.parse(await fs.readFile("data/artwork-unmatched.json", "utf8"));
  } catch {
    return [];
  }
})();
const oldReasonByKey = new Map(
  oldUnmatched.map((entry) => [
    `${artistKey(entry.artist)}|${normalize(entry.album)}`,
    entry.reason,
  ]),
);
const remaining = new Map();
for (const product of products) {
  if (!product.image?.includes("/illustrative-")) continue;
  const key = `${artistKey(product.artist)}|${normalize(product.title)}`;
  if (!remaining.has(key))
    remaining.set(key, {
      artist: product.artist,
      album: product.title,
      reason:
        oldReasonByKey.get(key) ||
        "no unique real cover found in available catalogs",
    });
}
await writeJson("data/artwork-unmatched.json", [...remaining.values()]);
console.log(
  `Portadas reales aplicadas: ${albumsApplied} álbumes y ${productsApplied} fichas. ` +
    `${remaining.size} álbumes aún necesitan una portada identificable.`,
);
