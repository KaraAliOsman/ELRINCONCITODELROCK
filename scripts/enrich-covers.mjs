// Exact artist/album matching; catalogue prices and stock are never changed.
import fs from "node:fs/promises";
import path from "node:path";
const base = process.cwd();
const products = JSON.parse(
  await fs.readFile("data/catalogue-source.json", "utf8"),
);
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\band\b/g, "y")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const title = (s) =>
  norm(
    s
      .replace(
        /\((?:[^)]*(?:remaster|deluxe|annivers|edition|bonus|explicit|expanded|mono|stereo)[^)]*)\)/gi,
        "",
      )
      .replace(
        /\[(?:[^\]]*(?:remaster|deluxe|annivers|edition|bonus|explicit|expanded|mono|stereo)[^\]]*)\]/gi,
        "",
      ),
  );
const sameArtist = (a, b) =>
  norm(a).replace(/^the /, "") === norm(b).replace(/^the /, "");
const artists = [
  ...new Set(products.filter((p) => !p.image).map((p) => p.artist)),
].sort(
  (a, b) =>
    products.filter((p) => p.artist === b).length -
    products.filter((p) => p.artist === a).length,
);
let cache = {};
try {
  cache = JSON.parse(await fs.readFile("data/artwork-cache.json", "utf8"));
} catch {}
let done = 0,
  matched = 0;
const credits = [];
const sql = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const statements = [];
async function worker() {
  while (artists.length) {
    const artist = artists.shift();
    try {
      let albums = cache[artist];
      if (!albums) {
        const response = await fetch(
          "https://itunes.apple.com/search?" +
            new URLSearchParams({
              term: artist,
              entity: "album",
              media: "music",
              limit: "200",
              country: "CL",
            }),
          { signal: AbortSignal.timeout(15000) },
        );
        if (!response.ok) throw new Error("Search " + response.status);
        albums = (await response.json()).results;
        cache[artist] = albums;
      }
      for (const p of products.filter((p) => p.artist === artist && !p.image)) {
        const candidate = albums.find(
          (a) =>
            sameArtist(a.artistName, artist) &&
            title(a.collectionName) === title(p.title),
        );
        if (!candidate?.artworkUrl100) continue;
        const filename = "album-" + candidate.collectionId + ".jpg";
        const dest = path.join(base, "public/assets/covers", filename);
        try {
          await fs.access(dest);
        } catch {
          const image = await fetch(
            candidate.artworkUrl100.replace("100x100bb", "600x600bb"),
            { signal: AbortSignal.timeout(15000) },
          );
          if (!image.ok) continue;
          await fs.writeFile(dest, Buffer.from(await image.arrayBuffer()));
        }
        p.image = "/assets/covers/" + filename;
        statements.push(
          "UPDATE products SET image=" +
            sql(p.image) +
            " WHERE id=" +
            sql(p.id) +
            " AND image='';",
        );
        credits.push({
          sku: p.id,
          artist: candidate.artistName,
          album: candidate.collectionName,
          collectionUrl: candidate.collectionViewUrl,
          image: p.image,
        });
        matched++;
      }
    } catch (e) {
      console.log("Artwork unavailable: " + artist + " · " + e.message);
    }
    done++;
    if (done % 25 === 0)
      console.log(
        "Artwork: " +
          done +
          " artists reviewed · " +
          matched +
          " products matched",
      );
    if (done % 50 === 0)
      await fs.writeFile("data/artwork-cache.json", JSON.stringify(cache));
  }
}
await Promise.all([worker(), worker(), worker()]);
await fs.writeFile("data/artwork-cache.json", JSON.stringify(cache));
await fs.writeFile("data/artwork-update.sql", statements.join("\n") + "\n");
await fs.writeFile(
  "data/artwork-credits.json",
  JSON.stringify(credits, null, 2),
);
await fs.writeFile("data/catalogue-source.json", JSON.stringify(products));
console.log(
  "Artwork completed: " + matched + " product images; " + done + " artists.",
);
