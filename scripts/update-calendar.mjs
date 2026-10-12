import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = 'https://api.jolpi.ca/ergast/f1/current.json?limit=30';
const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Calendar provider returned HTTP ${response.status}; existing snapshot was preserved.`);
const data = await response.json();
const table = data?.MRData?.RaceTable;
if (!/^\d{4}$/.test(table?.season) || !table?.Races?.length || table.Races.some((race) => race.season !== table.season || !race.round || !race.date)) {
    throw new Error('Invalid provider calendar; existing snapshot was preserved.');
}
data.F1Pulse = { source: 'saved-calendar', updatedAt: new Date().toISOString(), provider: url };
const directory = resolve(import.meta.dirname, '..', 'data');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'calendar-current.json'), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Saved ${table.Races.length} provider races for ${table.season}, updated ${data.F1Pulse.updatedAt}.`);
