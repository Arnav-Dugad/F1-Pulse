/**
 * Compacts public/data/tracks.json (circuit outlines written by `npm run media:fetch`) and splits it
 * into one small file per circuit, so a page that draws a single outline loads ~4 KB instead of
 * every circuit. Coordinates are rounded to 0.1 of a viewBox unit — under half a pixel even on the
 * largest hero. Idempotent; run after media:fetch.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const src = "public/data/tracks.json";
const dir = "public/data/tracks";
const tracks = JSON.parse(await readFile(src, "utf8"));
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 10) / 10));
for (const t of Object.values(tracks)) t.paths = t.paths.map(round);

const before = (await readFile(src)).length;
await writeFile(src, JSON.stringify(tracks));
await mkdir(dir, { recursive: true });
for (const f of await readdir(dir)) if (!(f.replace(/\.json$/, "") in tracks)) await rm(`${dir}/${f}`);
for (const [id, t] of Object.entries(tracks)) await writeFile(`${dir}/${id}.json`, JSON.stringify(t));
console.log(`tracks: ${Object.keys(tracks).length} circuits, ${(before / 1024).toFixed(0)} KB → ${((await readFile(src)).length / 1024).toFixed(0)} KB, split into ${dir}/`);
