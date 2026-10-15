/**
 * Generates the PWA / home-screen icons in public/icons/ from the favicon design.
 *   node scripts/icons.mjs
 * Uses sharp (installed with wrangler/miniflare); outputs are committed, so this only needs to run
 * again when the brand mark changes.
 */
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const favicon = await readFile("public/favicon.svg", "utf8");
const defs = favicon.match(/<defs>[\s\S]*<\/defs>/)[0];
const pulse = '<path d="M10 37h11l5-13 8 24 6-15h14" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>';
/** Full-bleed square (platform applies its own mask); glyph scaled into the safe zone. */
const square = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}<rect width="64" height="64" fill="url(#g)"/><rect width="64" height="64" fill="url(#s)"/><g transform="translate(32 32) scale(${scale}) translate(-32 -36)">${pulse}</g></svg>`;

await mkdir("public/icons", { recursive: true });
const jobs = [
  ["icon-192.png", favicon, 192],
  ["icon-512.png", favicon, 512],
  // Maskable: the glyph must sit inside the central 80% circle.
  ["maskable-192.png", square(0.72), 192],
  ["maskable-512.png", square(0.72), 512],
  // iOS rounds the corners itself and shows transparency as black.
  ["apple-touch-icon.png", square(0.86), 180],
];
for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 64) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(`public/icons/${name}`);
  console.log("✓ public/icons/" + name);
}
