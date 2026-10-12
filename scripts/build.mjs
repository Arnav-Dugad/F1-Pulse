import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
const files = (await readdir(root)).filter((file) => /\.(html|png|svg|webmanifest|txt)$/.test(file) || ['service-worker.js', '_headers'].includes(file));
for (const file of [...files, 'css', 'js', 'icons', 'data']) {
    await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
console.log(`Built F1 Pulse: ${files.length} public files plus CSS, JavaScript and icons.`);
