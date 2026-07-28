const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(message) {
    failures.push(message);
}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

for (const file of fs.readdirSync(path.join(root, 'js')).filter((name) => name.endsWith('.js'))) {
    try {
        new vm.Script(read(path.join('js', file)), { filename: file });
    } catch (error) {
        fail(`${file}: ${error.message}`);
    }
}

try {
    new vm.Script(read('service-worker.js'), { filename: 'service-worker.js' });
} catch (error) {
    fail(`service-worker.js: ${error.message}`);
}

for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const html = read(file);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    for (const id of new Set(ids.filter((value, index) => ids.indexOf(value) !== index))) {
        fail(`${file}: duplicate id "${id}"`);
    }

    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const reference = match[1].split(/[?#]/)[0];
        if (!reference || /^(?:https?:|data:|mailto:)/.test(reference)) continue;
        if (!fs.existsSync(path.resolve(root, path.dirname(file), reference))) {
            fail(`${file}: missing local reference "${reference}"`);
        }
    }

    if (file !== '404.html') {
        if (!html.includes('css/premium.css')) fail(`${file}: premium stylesheet is not linked`);
        if (!html.includes('manifest.webmanifest')) fail(`${file}: web app manifest is not linked`);
    }
}

for (const required of ['css/premium.css', 'manifest.webmanifest', 'service-worker.js', 'vercel.json', 'robots.txt', 'public/og.png']) {
    if (!fs.existsSync(path.join(root, required))) fail(`missing required file "${required}"`);
}

async function testStaleNextRaceFallback() {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const toRace = (date, raceName, round) => ({
        season: String(date.getUTCFullYear()),
        round: String(round),
        raceName,
        date: date.toISOString().slice(0, 10),
        time: date.toISOString().slice(11, 19) + 'Z',
    });
    const staleRace = toRace(past, 'Completed Grand Prix', 1);
    const futureRace = toRace(future, 'Future Grand Prix', 2);
    const storage = new Map();
    let scheduleRequests = 0;
    const context = {
        AbortController,
        URLSearchParams,
        Date,
        Map,
        console,
        setTimeout,
        clearTimeout,
        localStorage: {
            getItem: (key) => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
        },
        fetch: async (url) => {
            const isNext = String(url).includes('/current/next.json');
            if (!isNext) scheduleRequests += 1;
            const races = isNext ? [staleRace] : [staleRace, futureRace];
            return {
                ok: true,
                json: async () => ({
                    MRData: {
                        RaceTable: { Races: races },
                    },
                }),
            };
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(`${read('js/api.js')}\nglobalThis.__F1API = F1API;`, context);
    const result = await context.__F1API.getNextRace();
    if (result?.raceName !== futureRace.raceName) {
        fail('API: stale next-race endpoint did not fall back to the future calendar round');
    }
    if (scheduleRequests < 1) {
        fail('API: stale next-race endpoint did not request the calendar fallback');
    }
}

testStaleNextRaceFallback()
    .then(() => {
        if (failures.length) {
            console.error(failures.join('\n'));
            process.exitCode = 1;
            return;
        }
        console.log('F1 Pulse smoke tests passed.');
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
