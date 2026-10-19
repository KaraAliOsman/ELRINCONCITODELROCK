// Remove only generated placeholder illustrations before a future cover refresh.
// This lets newly sourced official covers replace those local artwork fallbacks.
import fs from "node:fs/promises";

const path = "data/catalogue-source.json";
const products = JSON.parse(await fs.readFile(path, "utf8"));
const creditsPath = "data/artwork-credits.json";
const credits = JSON.parse(await fs.readFile(creditsPath, "utf8"));
let cleared = 0;
for (const product of products) {
  if (!product.image?.includes("/illustrative-")) continue;
  product.image = "";
  cleared++;
}
const remainingCredits = credits.filter((entry) => !entry.image?.includes("/illustrative-"));
await fs.writeFile(`${path}.tmp`, JSON.stringify(products, null, 2) + "\n");
await fs.rename(`${path}.tmp`, path);
await fs.writeFile(`${creditsPath}.tmp`, JSON.stringify(remainingCredits, null, 2) + "\n");
await fs.rename(`${creditsPath}.tmp`, creditsPath);
console.log(`Ilustraciones temporales retiradas para nueva búsqueda: ${cleared} fichas.`);
