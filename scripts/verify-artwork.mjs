import fs from "node:fs/promises";
import path from "node:path";

const seededProductIds = new Set();
for (const line of (await fs.readFile("data/seed.sql", "utf8")).split(/\r?\n/)) {
  const match = line.match(/^INSERT OR IGNORE INTO products \([^)]+\) VALUES \('([^']+)'/);
  if (match) seededProductIds.add(match[1]);
}
const credits = JSON.parse(await fs.readFile("data/artwork-credits.json", "utf8"));
const updates = (await fs.readFile("data/artwork-update.sql", "utf8"))
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const creditedProducts = new Set(credits.map((entry) => `${entry.sku}|${entry.image}`));
const updateByProduct = new Map();
const failures = [];

for (const statement of updates) {
  const match = statement.match(
    /^UPDATE products SET image='([^']+)' WHERE id='([^']+)' AND \(image='' OR image LIKE '\/assets\/covers\/illustrative-%' OR image LIKE 'https:\/\/%' OR image LIKE 'http:\/\/%'\)$/,
  );
  if (!match) {
    failures.push("SQL contiene una instrucción que no es una actualización segura de imágenes");
    continue;
  }
  const [, image, id] = match;
  if (updateByProduct.has(id)) failures.push(`${id}: tiene más de una actualización SQL`);
  updateByProduct.set(id, image);
}

for (const id of seededProductIds) {
  const image = updateByProduct.get(id);
  if (!image?.startsWith("/assets/covers/")) {
    failures.push(`${id}: falta una imagen de catálogo local`);
    continue;
  }
  if (!creditedProducts.has(`${id}|${image}`)) {
    failures.push(`${id}: falta registrar la fuente de su imagen`);
  }
  for (const directory of ["public", "dist"]) {
    try {
      await fs.access(path.join(directory, image.slice(1)));
    } catch {
      failures.push(`${id}: no existe ${directory}/${image.slice(1)}`);
    }
  }
}

for (const id of updateByProduct.keys()) {
  if (!seededProductIds.has(id)) failures.push(`${id}: actualización D1 sin producto en el catálogo`);
}

if (updateByProduct.size !== seededProductIds.size) {
  failures.push(`D1 tiene ${updateByProduct.size} rutas preparadas para ${seededProductIds.size} fichas`);
}

if (failures.length) {
  console.error(`Auditoría de imágenes falló (${failures.length} problemas):`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`);
  if (failures.length > 30) console.error(`- … y ${failures.length - 30} más`);
  process.exitCode = 1;
} else {
  console.log(`Imágenes verificadas: ${seededProductIds.size} fichas con archivo local y fuente registrada.`);
}
