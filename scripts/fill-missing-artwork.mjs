// Give every remaining album a unique, clearly illustrative local image.
// These are not presented as official album sleeves or photographs.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const sourcePath = "data/catalogue-source.json";
const creditsPath = "data/artwork-credits.json";
const products = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
const existingCredits = new Set(credits.map((entry) => `${entry.sku}|${entry.image}`));
for (const product of products) {
  if (!product.image || existingCredits.has(`${product.id}|${product.image}`)) continue;
  credits.push({
    sku: product.id,
    artist: product.artist,
    album: product.title,
    image: product.image,
    source: product.image.includes("/illustrative-")
      ? "Original illustrative catalog artwork; not an official album cover"
      : "Image retained from the demo supplied by the store; original source not documented",
  });
  existingCredits.add(`${product.id}|${product.image}`);
}
const groups = new Map();
const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const albumKey = (product) => `${normalize(product.artist)}|${normalize(product.title)}`;
const officialImages = new Map();
for (const product of products) {
  if (product.image && !product.image.includes("/illustrative-")) officialImages.set(albumKey(product), product.image);
}
for (const product of products) {
  const officialImage = officialImages.get(albumKey(product));
  if (officialImage && (!product.image || product.image.includes("/illustrative-"))) {
    const previousImage = product.image;
    product.image = officialImage;
    const sourceCredit = credits.find((entry) => entry.image === officialImage);
    if (sourceCredit && !existingCredits.has(`${product.id}|${officialImage}`)) {
      credits.push({ ...sourceCredit, sku: product.id, image: officialImage });
      existingCredits.add(`${product.id}|${officialImage}`);
    }
    if (previousImage && previousImage.includes("/illustrative-")) continue;
  }
}

for (const product of products) {
  if (product.image && !product.image.includes("/illustrative-")) continue;
  const key = `${normalize(product.artist)}|${normalize(product.title)}`;
  const group = groups.get(key) || [];
  group.push(product);
  groups.set(key, group);
}
const palettes = [
  ["#101010", "#eee8dc", "#c83a2d", "#74716b"],
  ["#e6dfcf", "#171715", "#9f3026", "#77736c"],
  ["#181816", "#d8d0be", "#a94c35", "#817c70"],
  ["#c9c1b2", "#171615", "#c4382b", "#77716a"],
];
function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function makeSvg(artist, title, hash) {
  const seed = parseInt(hash.slice(0, 8), 16) >>> 0;
  const random = randomFrom(seed);
  const [background, foreground, accent, shadow] = palettes[seed % palettes.length];
  const cx = 362 + Math.round(random() * 90 - 45);
  const cy = 286 + Math.round(random() * 90 - 45);
  const radius = 219 + Math.round(random() * 30);
  const initials = [...artist.normalize("NFD").replace(/[\u0300-\u036f]/g, "")]
    .filter((char) => /[A-Za-z0-9]/.test(char)).slice(0, 2).join("").toUpperCase() || "R";
  const rings = Array.from({ length: 10 }, (_, index) => {
    const r = Math.round(radius * (0.34 + index * 0.065));
    const offset = Math.round(random() * 24 - 12);
    return `<circle cx="${cx + offset}" cy="${cy - offset}" r="${r}" fill="none" stroke="${index % 3 === 0 ? foreground : shadow}" stroke-opacity="${index % 3 === 0 ? ".34" : ".55"}" stroke-width="${index % 3 === 0 ? 2 : 1}"/>`;
  }).join("");
  const bars = Array.from({ length: 22 }, (_, index) => {
    const y = 44 + index * 24 + Math.round(random() * 8);
    const width = 90 + Math.round(random() * 230);
    const x = 38 + Math.round(random() * 210);
    return `<path d="M${x} ${y}h${width}" stroke="${index % 4 === 0 ? accent : foreground}" stroke-opacity="${index % 4 === 0 ? ".86" : ".24"}" stroke-width="${index % 4 === 0 ? 4 : 1}"/>`;
  }).join("");
  const dots = Array.from({ length: 44 }, () => {
    const x = Math.round(random() * 560 + 20);
    const y = Math.round(random() * 560 + 20);
    const r = (random() * 2.5 + 0.6).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${foreground}" opacity=".42"/>`;
  }).join("");
  const labelY = 526 + Math.round(random() * 20);
  const titleWeight = seed % 3 === 0 ? 700 : 500;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="Ilustración de catálogo para ${esc(artist)} — ${esc(title)}">
<rect width="600" height="600" fill="${background}"/>
<rect x="15" y="15" width="570" height="570" fill="none" stroke="${foreground}" stroke-opacity=".42"/>
<g>${bars}${dots}</g>
<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${background}" stroke="${foreground}" stroke-opacity=".8" stroke-width="3"/>
<g>${rings}</g>
<circle cx="${cx}" cy="${cy}" r="${Math.round(radius * .31)}" fill="${accent}"/>
<circle cx="${cx}" cy="${cy}" r="${Math.round(radius * .245)}" fill="${background}" opacity=".76"/>
<text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="${foreground}" font-family="Arial,sans-serif" font-size="${initials.length === 1 ? 64 : 42}" font-weight="700" letter-spacing="-3">${esc(initials)}</text>
<path d="M30 472H570" stroke="${foreground}" stroke-opacity=".56"/>
<text x="36" y="${labelY}" fill="${foreground}" font-family="Arial,sans-serif" font-size="13" font-weight="${titleWeight}" letter-spacing="2.4">IMAGEN ILUSTRATIVA</text>
<text x="36" y="558" fill="${foreground}" opacity=".7" font-family="Arial,sans-serif" font-size="9" letter-spacing="1.4">REFERENCIA DE CATÁLOGO · NO ES LA PORTADA ORIGINAL</text>
</svg>`;
}

await fs.mkdir("public/assets/covers", { recursive: true });
let productsFilled = 0;
for (const [key, group] of groups) {
  const { artist, title } = group[0];
  const hash = createHash("sha256").update(key).digest("hex");
  const image = `/assets/covers/illustrative-${hash.slice(0, 16)}.svg`;
  const target = path.join("public", image.slice(1));
  try { await fs.access(target); } catch { await fs.writeFile(target, makeSvg(artist, title, hash), "utf8"); }
  for (const product of group) {
    if (product.image && !product.image.includes("/illustrative-")) continue;
    product.image = image;
    productsFilled++;
    if (!existingCredits.has(`${product.id}|${image}`)) {
      credits.push({
        sku: product.id,
        artist,
        album: title,
        image,
        source: "Original illustrative catalog artwork; not an official album cover",
      });
      existingCredits.add(`${product.id}|${image}`);
    }
  }
}

await fs.writeFile(`${sourcePath}.tmp`, JSON.stringify(products, null, 2) + "\n");
await fs.rename(`${sourcePath}.tmp`, sourcePath);
await fs.writeFile(`${creditsPath}.tmp`, JSON.stringify(credits, null, 2) + "\n");
await fs.rename(`${creditsPath}.tmp`, creditsPath);
const sql = products.filter((product) => product.image).map((product) => `UPDATE products SET image='${product.image}' WHERE id='${product.id}' AND (image='' OR image LIKE '/assets/covers/illustrative-%');`);
await fs.writeFile("data/artwork-update.sql", sql.join("\n") + "\n");
console.log(`Ilustraciones únicas generadas: ${groups.size} álbumes · ${productsFilled} fichas sin portada oficial previa.`);
