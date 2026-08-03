const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

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

    if (!html.includes('css/premium.css')) fail(`${file}: premium stylesheet is not linked`);
    if (!html.includes('css/mobile.css')) fail(`${file}: mobile stylesheet is not linked`);
    if (!html.includes('href="css/mobile.css" media="(max-width: 760px)"')) {
        fail(`${file}: mobile bundle is not conditionally loaded for small screens`);
    }
    if (html.indexOf('css/mobile.css') < html.indexOf('css/premium.css')) {
        fail(`${file}: mobile stylesheet must load after the premium layer`);
    }
    if (file !== '404.html') {
        if (!html.includes('manifest.webmanifest')) fail(`${file}: web app manifest is not linked`);
    }
    if (!html.includes('css/core.css')) fail(`${file}: shared core stylesheet is not linked`);
    if (html.includes('css/styles.css')) fail(`${file}: legacy monolithic stylesheet is still linked`);
}

if (read('index.html').includes('Everything on the grid') || read('index.html').includes('One pulse')) {
    fail('Home: removed command-centre copy is still present');
}

const componentsSource = read('js/components.js');
if (!componentsSource.includes("logoImageUrl: 'icons/f1-tv-logo.svg'")) {
    fail('Navigation: authentic F1 TV logo is not configured');
}
if (!componentsSource.includes("matchMedia('(min-width: 761px)')")) {
    fail('Navigation: desktop-only floating utilities are not gated on mobile');
}

const expectedPageBundles = {
    'about.html': 'css/pages/about.css',
    'driver-profile.html': 'css/pages/about.css',
    'team-profile.html': 'css/pages/about.css',
    'drivers.html': 'css/pages/standings.css',
    'teams.html': 'css/pages/standings.css',
    'schedule.html': 'css/pages/schedule.css',
    'race-detail.html': 'css/pages/race.css',
};
for (const [file, bundle] of Object.entries(expectedPageBundles)) {
    if (!read(file).includes(bundle)) fail(`${file}: expected page bundle "${bundle}" is not linked`);
}

for (const required of ['api/f1.mjs', 'css/core.css', 'css/premium.css', 'css/mobile.css', 'css/pages/about.css', 'css/pages/standings.css', 'css/pages/race.css', 'css/pages/schedule.css', 'manifest.webmanifest', 'service-worker.js', 'vercel.json', 'robots.txt', 'og.png', 'favicon.svg', 'icons/f1-tv-logo.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']) {
    if (!fs.existsSync(path.join(root, required))) fail(`missing required file "${required}"`);
}

if (fs.existsSync(path.join(root, 'css', 'styles.css'))) {
    fail('legacy css/styles.css should be removed after the page-bundle split');
}

if (fs.existsSync(path.join(root, 'public'))) {
    fail('the root public directory must not exist because Vercel would publish only that directory');
}

for (const file of [
    'css/core.css',
    'css/premium.css',
    'css/mobile.css',
    'css/pages/about.css',
    'css/pages/standings.css',
    'css/pages/race.css',
    'css/pages/schedule.css',
]) {
    const css = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let depth = 0;
    for (const char of css) {
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth < 0) break;
    }
    if (depth !== 0) fail(`${file}: unbalanced CSS blocks`);
}

try {
    const manifest = JSON.parse(read('manifest.webmanifest'));
    if (!manifest.start_url || !manifest.scope) fail('manifest: start_url and scope are required');
    if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('manifest: installable icons are required');
} catch (error) {
    fail(`manifest.webmanifest: ${error.message}`);
}

function readPngDimensions(relativePath) {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG file');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

for (const [file, size] of [['icons/icon-180.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512]]) {
    try {
        const dimensions = readPngDimensions(file);
        if (dimensions.width !== size || dimensions.height !== size) {
            fail(`${file}: expected ${size}x${size}, got ${dimensions.width}x${dimensions.height}`);
        }
    } catch (error) {
        fail(`${file}: ${error.message}`);
    }
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

    const requestsBeforeDedupe = scheduleRequests;
    await Promise.all([
        context.__F1API.getDriverStandings('2099'),
        context.__F1API.getDriverStandings('2099'),
    ]);
    if (scheduleRequests !== requestsBeforeDedupe + 1) {
        fail('API: concurrent duplicate requests were not deduplicated');
    }
}

async function testBrowserProxyRouting() {
    let requestedURL = '';
    const context = {
        AbortController,
        URL,
        URLSearchParams,
        Date,
        Map,
        console,
        setTimeout,
        clearTimeout,
        window: {
            location: {
                protocol: 'https:',
                hostname: 'f1-pulse-iota.vercel.app',
                origin: 'https://f1-pulse-iota.vercel.app',
            },
        },
        localStorage: {
            getItem: () => null,
            setItem: () => {},
        },
        fetch: async (url) => {
            requestedURL = String(url);
            return {
                ok: true,
                json: async () => ({ MRData: { RaceTable: { Races: [] } } }),
            };
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(`${read('js/api.js')}\nglobalThis.__F1API = F1API;`, context);
    await context.__F1API.getSchedule('2099');
    if (!requestedURL.startsWith('https://f1-pulse-iota.vercel.app/api/f1?')) {
        fail('API: browser requests are not routed through the same-origin edge cache');
    }
    if (!requestedURL.includes('provider=jolpica') || !requestedURL.includes('path=2099.json')) {
        fail('API: edge proxy URL did not preserve the provider and endpoint');
    }
}

function testScheduleRendering() {
    const container = {
        innerHTML: '',
        classList: { add: () => {} },
    };
    const context = {
        Date,
        console,
        localStorage: { getItem: () => null, setItem: () => {} },
        document: {
            getElementById: (id) => id === 'races-container' ? container : null,
        },
        SVG_ICONS: { calendar: '<span></span>' },
        countryFlagLargeHTML: () => '',
        circuitImageHTML: () => '',
        formatLocalSessionDateTime: () => 'Local race time',
        formatDate: () => 'Race date',
    };
    context.globalThis = context;
    vm.createContext(context);
    const scheduleSource = read('js/schedule.js');
    const bootIndex = scheduleSource.lastIndexOf('(async function ()');
    if (bootIndex < 0) {
        fail('Schedule: initialization boundary was not found');
        return;
    }
    vm.runInContext(`${scheduleSource.slice(0, bootIndex)}
        allRaces = [{
            season: '2099',
            round: '1',
            raceName: 'Test Grand Prix',
            date: '2099-06-10',
            time: '12:00:00Z',
            Circuit: { circuitName: 'Test Circuit', Location: { country: 'Test' } }
        }];
        renderRaces();`, context);
    if (!container.innerHTML.includes('Local race time') || !container.innerHTML.includes('Your local time')) {
        fail('Schedule: localized race-card rendering failed');
    }
}

async function testEdgeProxy() {
    const originalFetch = global.fetch;
    let upstreamURL = '';
    try {
        global.fetch = async (url) => {
            upstreamURL = String(url);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
        const moduleURL = `${pathToFileURL(path.join(root, 'api', 'f1.mjs')).href}?smoke=${Date.now()}`;
        const edge = await import(moduleURL);
        const valid = await edge.default(new Request('https://example.com/api/f1?provider=jolpica&path=current.json&limit=30'));
        if (valid.status !== 200) fail(`Edge API: expected 200, got ${valid.status}`);
        if (upstreamURL !== 'https://api.jolpi.ca/ergast/f1/current.json?limit=30') {
            fail(`Edge API: unexpected upstream URL "${upstreamURL}"`);
        }
        if (!valid.headers.get('Vercel-CDN-Cache-Control')?.includes('s-maxage=')) {
            fail('Edge API: Vercel CDN cache header is missing');
        }
        await edge.default(new Request('https://example.com/api/f1?provider=openf1&path=intervals&session_key=123&date%3E=2026-01-01T00%3A00%3A00Z'));
        if (upstreamURL !== 'https://api.openf1.org/v1/intervals?session_key=123&date%3E=2026-01-01T00%3A00%3A00Z') {
            fail(`Edge API: comparison filters were not forwarded safely ("${upstreamURL}")`);
        }
        const rejected = await edge.default(new Request('https://example.com/api/f1?provider=openf1&path=../secrets'));
        if (rejected.status !== 400) fail('Edge API: unsafe paths are not rejected');
    } finally {
        global.fetch = originalFetch;
    }
}

Promise.all([
    testStaleNextRaceFallback(),
    testBrowserProxyRouting(),
    testEdgeProxy(),
    Promise.resolve().then(testScheduleRendering),
])
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
