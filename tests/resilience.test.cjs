const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const driver = { driverId: 'test', givenName: 'Test', familyName: 'Driver', nationality: 'British' };
const standings = (season = String(new Date().getUTCFullYear())) => ({ MRData: { StandingsTable: { StandingsLists: [{ season, DriverStandings: [{ Driver: driver, points: '30', wins: '1', Constructors: [{ constructorId: 'mercedes' }] }] }] } } });
function apiContext(fetch, storage = new Map(), extras = {}) {
    const context = vm.createContext({ AbortController, URL, URLSearchParams, Date, Map, console, setTimeout, clearTimeout,
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, fetch, ...extras });
    vm.runInContext(source('js/api.js') + '\nglobalThis.api = F1API;', context);
    return context;
}
const response = data => ({ ok: true, json: async () => data });

test('fresh saved standings survive navigation without another upstream request; driver identity reuses them', async () => {
    const storage = new Map();
    let calls = 0;
    const first = apiContext(async () => { calls++; return response(standings()); }, storage);
    await first.api.getDriverStandings();
    const second = apiContext(async () => { throw new Error('must use fresh storage'); }, storage);
    assert.equal((await second.api.getDriverStandings())[0].Driver.driverId, 'test');
    assert.equal((await second.api.getDriverInfo('test')).familyName, 'Driver');
    assert.equal(calls, 1);
});

test('championship current-year aliases deduplicate concurrent requests', async () => {
    let calls = 0;
    const context = apiContext(async () => { calls++; return response(standings()); });
    await Promise.all([context.api.getDriverStandings(), context.api.getDriverStandings(new Date().getUTCFullYear())]);
    assert.equal(calls, 1);
});

test('explicit year never substitutes a previous season at the year boundary', async () => {
    const year = new Date().getUTCFullYear();
    const calls = [];
    const context = apiContext(async url => { calls.push(url); return response(standings(String(url).includes('/current/') ? String(year - 1) : String(year))); });
    assert.equal((await context.api.getDriverStandings(year))[0].season, String(year));
    assert.equal(calls.length, 2);
});

test('six driver form queries share one season-results request and filter each driver correctly', async () => {
    let calls = 0;
    const context = apiContext(async () => {
        calls++;
        return response({ MRData: { total: '6', RaceTable: { Races: [{ round: '1', Results: Array.from({ length: 6 }, (_, i) => ({ Driver: { driverId: `d${i}` }, position: String(i + 1) })) }] } } });
    });
    const rows = await Promise.all(Array.from({ length: 6 }, (_, i) => context.api.getDriverSeasonResults(2099, `d${i}`)));
    assert.equal(calls, 1);
    rows.forEach((races, i) => assert.equal(races[0].Results[0].Driver.driverId, `d${i}`));
});

test('season result pagination merges a round split across pages', async () => {
    const context = apiContext(async url => response({ MRData: { total: '1001', RaceTable: { Races: [{ round: '1', Results: [{ Driver: { driverId: String(url).includes('offset=1000') ? 'second' : 'first' } }] }] } } }));
    const races = await context.api.getSeasonResults(2099);
    assert.equal(races.length, 1);
    assert.equal(races[0].Results.length, 2);
});

test('request queue limits concurrent upstream calls to three', async () => {
    let active = 0, peak = 0;
    const context = apiContext(async () => {
        active++; peak = Math.max(active, peak);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--; return response(standings());
    });
    await Promise.all(Array.from({ length: 8 }, (_, i) => context.api.getOpenF1Weather(2000 + i)));
    assert.equal(peak, 3);
});

test('stale OpenF1 telemetry is rejected instead of presented as live', async () => {
    const storage = new Map([['f1pulse_api_v2:https://api.openf1.org/v1/position?session_key=123', JSON.stringify({ timestamp: Date.now() - 60000, duration: 8000, data: [{ position: 1 }] })]]);
    const context = apiContext(async () => { throw new Error('offline'); }, storage);
    await assert.rejects(context.api.getOpenF1Position(123), /offline/);
});

test('saved server response raises a stale-data notice and is not cached as fresh', async () => {
    let calls = 0, notices = 0;
    class CustomEvent { constructor(type) { this.type = type; } }
    const context = apiContext(async () => { calls++; return { ...response(standings()), headers: { get: () => 'STALE' } }; }, new Map(), {
        CustomEvent, window: { dispatchEvent: () => notices++ },
    });
    await context.api.getDriverStandings();
    await context.api.getDriverStandings();
    assert.equal(calls, 2);
    assert.equal(notices, 2);
});

test('static GitHub Pages requests providers directly instead of a nonexistent API proxy', async () => {
    let requested;
    const context = apiContext(async url => { requested = url; return response(standings()); }, new Map(), {
        window: { location: { protocol: 'https:', hostname: 'arnav-dugad.github.io', origin: 'https://arnav-dugad.github.io' } },
    });
    await context.api.getDriverStandings();
    assert.ok(requested.startsWith('https://api.jolpi.ca/'));
});

function modalContext(api) {
    const classes = new Set(['open']);
    const modal = { classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) }, setAttribute() {}, querySelector: () => ({ focus() {} }) };
    const body = { innerHTML: '', querySelector: () => null, appendChild() {} };
    const main = { inert: false, setAttribute() {}, removeAttribute() {} };
    const doc = { getElementById: id => id === 'driver-modal' ? modal : id === 'driver-modal-body' ? body : null,
        addEventListener() {}, querySelectorAll: () => [main], activeElement: null,
        body: { children: [modal, main], classList: { add() {}, remove() {} }, style: {} } };
    const context = vm.createContext({ F1API: { normalizeStr: x => String(x).toLowerCase(), ...api }, document: doc,
        window: { requestAnimationFrame: fn => fn() }, Date, console: { error() {} }, setTimeout, clearTimeout });
    vm.runInContext(source('js/components.js') + '\nloadEnrichedDrivers = async () => ({}); getDriverHeadshotHiRes = () => null; getDriverPhotoOverride = () => null;', context);
    return { context, body, main, modal };
}

test('driver modal keeps identity and a retry control when optional statistics fail', async () => {
    const { context, body } = modalContext({ getDriverInfo: async () => driver,
        getDriverSeasonResults: async () => { throw new Error('429'); }, getDriverStandings: async () => [] });
    await context.openDriverModal('test', null, 2099);
    assert.match(body.innerHTML, /Test.*Driver/s);
    assert.match(body.innerHTML, /temporarily unavailable/);
    assert.match(body.innerHTML, /Retry race statistics/);
    assert.doesNotMatch(body.innerHTML, /No completed race statistics/);
});

test('driver modal falls back to standings identity when driver-info endpoint fails', async () => {
    const { context, body } = modalContext({ getDriverInfo: async () => { throw new Error('429'); },
        getDriverSeasonResults: async () => [], getDriverStandings: async () => [{ Driver: driver }] });
    await context.openDriverModal('test', null, 2099);
    assert.match(body.innerHTML, /Test.*Driver/s);
    assert.doesNotMatch(body.innerHTML, /Failed to load driver/);
});

test('finish rate excludes retirement while championship points include sprint totals', async () => {
    const { context, body } = modalContext({ getDriverInfo: async () => driver,
        getDriverStandings: async () => [{ Driver: driver, points: '30' }],
        getDriverSeasonResults: async () => [{ round: '1', Results: [{ position: '1', grid: '1', points: '25', status: 'Finished' }] },
            { round: '2', Results: [{ position: '20', grid: '2', points: '0', status: 'Retired' }] }] });
    await context.openDriverModal('test', null, 2099);
    assert.match(body.innerHTML, /<span>50%<\/span>/);
    assert.match(body.innerHTML, />30<\/div>\s*<div class="driver-stat-label">Championship Points/);
    assert.match(body.innerHTML, /Race Points/);
    assert.match(body.innerHTML, /Best Grid/);
});

test('closing or switching a driver modal prevents late requests from overwriting it', async () => {
    let resolveFirst;
    const { context, body, main } = modalContext({ getDriverInfo: id => id === 'old' ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ ...driver, givenName: 'New' }),
        getDriverSeasonResults: async () => [], getDriverStandings: async () => [] });
    const old = context.openDriverModal('old', null, 2099);
    await context.openDriverModal('new', null, 2099);
    resolveFirst({ ...driver, givenName: 'Old' });
    await old;
    assert.match(body.innerHTML, /New/);
    assert.doesNotMatch(body.innerHTML, /Old/);
    context.closeDriverModal();
    assert.equal(main.inert, false);
});

for (const kind of ['driver', 'team']) test(`invalid ${kind} profile link shows not found, never the championship leader`, async () => {
    const main = { innerHTML: '' };
    const context = vm.createContext({ initPage() {}, document: { body: { classList: { add() {} } }, getElementById: () => main },
        window: { location: { search: `?${kind === 'driver' ? 'driver' : 'team'}=invalid` } }, URLSearchParams,
        F1API: { getDriverStandings: async () => [{ Driver: driver }], getConstructorStandings: async () => [{ Constructor: { constructorId: 'mercedes' } }] },
        loadEnrichedDrivers: async () => ({}), fetchTeamLogos: async () => {}, resolveTeamId: id => id,
        showLoading() {}, showError: (_, text) => { main.innerHTML = text; }, console });
    vm.runInContext(source(`js/${kind}-profile.js`).replace('(async function () {', 'globalThis.done = (async function () {'), context);
    await context.done;
    assert.match(main.innerHTML, /profile not found/);
});

test('schedule remains usable when browser storage is denied', () => {
    const context = vm.createContext({ localStorage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } });
    const schedule = source('js/schedule.js');
    vm.runInContext(schedule.slice(0, schedule.lastIndexOf('(async function ()')), context);
    assert.doesNotThrow(() => context.saveSchedulePrefs({ season: 'current' }));
});

test('driver comparison defaults to different drivers and retains selected values after refresh', () => {
    const select = () => ({ value: '', set innerHTML(html) { this.value = html.match(/value="([^"]+)"/)[1]; } });
    const a = select(), b = select(), swap = {}, output = {};
    const context = vm.createContext({ compare: { querySelector: id => ({ '#driver-compare-a': a, '#driver-compare-b': b, '#driver-compare-swap': swap, '#drivers-compare-output': output })[id] },
        enriched: {}, getTeamColor: () => '#123', driverImgHTML: () => '' });
    const code = source('js/drivers.js');
    vm.runInContext(code.slice(code.indexOf('    function renderDriversCompareTool('), code.indexOf('    function renderDriverAnalytics(')), context);
    const rows = Array.from({ length: 3 }, (_, i) => ({ Driver: { driverId: `d${i}`, familyName: `Driver${i}` }, points: '25', position: String(i + 1) }));
    context.renderDriversCompareTool(rows);
    assert.equal(a.value, 'd0'); assert.equal(b.value, 'd1');
    a.value = 'd2'; b.value = 'd0';
    context.renderDriversCompareTool(rows);
    assert.equal(a.value, 'd2'); assert.equal(b.value, 'd0');
    swap.onclick();
    assert.equal(a.value, 'd0'); assert.equal(b.value, 'd2');
});

test('team aliases match official IDs but reject ambiguous fragments', () => {
    const { context } = modalContext({});
    assert.equal(context.resolveTeamId('red_bull'), 'red_bull');
    assert.equal(context.resolveTeamId('Oracle Red Bull Racing'), 'red_bull');
    assert.equal(context.resolveTeamId('rb'), 'rb');
    assert.equal(context.resolveTeamId('m'), null);
    assert.equal(context.resolveTeamId('r'), null);
});

test('telemetry matches Austin rather than the first of several US races', () => {
    const context = vm.createContext({ Date });
    vm.runInContext(source('js/race-data.js'), context);
    const austin = { meeting_name: 'United States Grand Prix', country_name: 'USA', date_start: '2026-10-23' };
    const meetings = [{ meeting_name: 'Miami Grand Prix', country_name: 'USA', date_start: '2026-05-01' }, austin,
        { meeting_name: 'Las Vegas Grand Prix', country_name: 'USA', date_start: '2026-11-19' }];
    assert.equal(context.findOpenF1Meeting(meetings, { raceName: 'United States Grand Prix', date: '2026-10-25', Circuit: { Location: { country: 'USA' } } }), austin);
    assert.equal(context.findOpenF1Meeting(meetings, { raceName: '', date: '2026-06-25' }), null);
});

test('main race session is selected ahead of sprint and practice', () => {
    const context = vm.createContext({ Date });
    vm.runInContext(source('js/race-data.js'), context);
    const race = { session_name: 'Race', session_type: 'Race' };
    assert.equal(context.findOpenF1RaceSession([{ session_name: 'Sprint', session_type: 'Race' }, race]), race);
    assert.equal(context.findOpenF1RaceSession([{ session_name: 'Practice 1', session_type: 'Practice' }]), null);
});

test('lap pagination retrieves final laps and merges split timing rows', async () => {
    const context = apiContext(async url => response({ MRData: { total: '1001', RaceTable: { Races: [{ Laps: [{ number: '50', Timings: [{ driverId: String(url).includes('offset=1000') ? 'last' : 'first' }] }] }] } } }));
    const laps = await context.api.getLapTimes(2099, 1);
    assert.equal(laps.length, 1);
    assert.equal(laps[0].Timings.length, 2);
    assert.equal(laps[0].Timings[1].driverId, 'last');
});

test('season pagination respects a provider cap below the requested limit', async () => {
    const offsets = [];
    const context = apiContext(async url => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        return response({ MRData: { total: '3', limit: '1', RaceTable: { Races: [{ round: String(offset + 1), Results: [{ Driver: driver }] }] } } });
    });
    const races = await context.api.getSeasonResults(2099);
    assert.deepEqual(offsets, [0, 1, 2]);
    assert.equal(races.length, 3);
});

test('lap pagination respects the provider limit and reaches the final lap', async () => {
    const offsets = [];
    const context = apiContext(async url => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        return response({ MRData: { total: '3', limit: '1', RaceTable: { Races: [{ Laps: [{ number: String(offset + 1), Timings: [] }] }] } } });
    });
    const laps = await context.api.getLapTimes(2099, 1);
    assert.deepEqual(offsets, [0, 1, 2]);
    assert.equal(laps[2].number, '3');
});
