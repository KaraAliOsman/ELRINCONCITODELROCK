import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = "public/assets/covers";
const files = await fs.readdir(directory, { withFileTypes: true });
let optimized = 0;
let savedBytes = 0;

for (const entry of files) {
  if (!entry.isFile() || !/\.jpe?g$/i.test(entry.name)) continue;
  const filename = path.join(directory, entry.name);
  const original = await fs.readFile(filename);
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height) continue;
  if (metadata.width <= 600 && metadata.height <= 600) continue;

  const output = await sharp(original)
    .rotate()
    .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toBuffer();
  if (output.length >= original.length) continue;

  const temporary = `${filename}.optimized`;
  await fs.writeFile(temporary, output);
  await fs.rename(temporary, filename);
  optimized++;
  savedBytes += original.length - output.length;
}

console.log(
  `Carátulas optimizadas: ${optimized}; espacio ahorrado: ${(savedBytes / 1024 / 1024).toFixed(1)} MB.`,
);
