const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const loader = vm.runInNewContext(`${fs.readFileSync(path.join(root, 'js/race-data.js'), 'utf8')}\nloadRacePageData;`, { Date });
const now = Date.parse('2026-10-12T12:00:00Z');
const futureRace = {
    season: '2026', round: '18', raceName: 'Test Grand Prix', date: '2026-10-25', time: '20:00:00Z',
    Qualifying: { date: '2026-10-24', time: '21:00:00Z' },
};
function apiFor(race) {
    const calls = [];
    const api = { getSchedule: async () => race ? [race] : [] };
    for (const method of ['getRaceResults', 'getQualifyingResults', 'getSprintResults', 'getPitStops']) {
        api[method] = async () => { calls.push(method); return method === 'getPitStops' ? [] : null; };
    }
    return { api, calls };
}

test('upcoming race renders metadata without requesting unpublished results', async () => {
    const { api, calls } = apiFor(futureRace);
    let header;
    const result = await loader(api, '2026', '18', { now, onRace: (race) => { header = race; } });
    assert.equal(header, futureRace);
    assert.equal(result.raceInfo, futureRace);
    assert.equal(result.race, null);
    assert.deepEqual(calls, []);
});

test('qualifying can load before the race, while race and pit requests remain skipped', async () => {
    const { api, calls } = apiFor(futureRace);
    const qualifying = { ...futureRace, QualifyingResults: [{ position: '1' }] };
    api.getQualifyingResults = async () => { calls.push('getQualifyingResults'); return qualifying; };
    const result = await loader(api, '2026', '18', { now: Date.parse('2026-10-25T00:00:00Z') });
    assert.equal(result.qual, qualifying);
    assert.deepEqual(calls, ['getQualifyingResults']);
});

test('published race results survive optional endpoint failures', async () => {
    const race = { ...futureRace, date: '2026-10-10', Qualifying: { date: '2026-10-09', time: '10:00:00Z' } };
    const { api } = apiFor(race);
    const published = { ...race, Results: [{ position: '1' }] };
    api.getRaceResults = async () => published;
    api.getQualifyingResults = async () => { throw new Error('429'); };
    api.getPitStops = async () => { throw new Error('429'); };
    const result = await loader(api, '2026', '18', { now });
    assert.equal(result.race, published);
    assert.equal(result.raceInfo, published);
    assert.equal(result.qual, null);
    assert.equal(result.pitStops.length, 0);
});

test('results identify an historical race even if the calendar is unavailable', async () => {
    const { api } = apiFor(null);
    api.getSchedule = async () => { throw new Error('429'); };
    const published = { ...futureRace, Results: [{ position: '1' }] };
    api.getRaceResults = async () => published;
    assert.equal((await loader(api, '2026', '18', { now })).raceInfo, published);
});

test('total provider outage returns an explicit unavailable state', async () => {
    const { api } = apiFor(null);
    for (const method of Object.keys(api)) api[method] = async () => { throw new Error('429'); };
    const result = await loader(api, '2026', '18', { now });
    assert.equal(result.raceInfo, null);
});

function browserAPI(fetchImpl) {
    const storage = new Map();
    const context = {
        AbortController, URL, URLSearchParams, Date, Map, setTimeout, clearTimeout,
        console, fetch: fetchImpl,
        localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    };
    const api = vm.runInNewContext(`${fs.readFileSync(path.join(root, 'js/api.js'), 'utf8')}\nF1API;`, context);
    return { api, storage };
}
const calendarResponse = (season) => ({
    ok: true,
    json: async () => ({ MRData: { RaceTable: { season, Races: [{ ...futureRace, season }] } } }),
});

test('current and numbered calendars share the in-flight request without triggering throttling', async () => {
    const year = String(new Date().getUTCFullYear());
    const requests = [];
    const { api } = browserAPI(async (url) => {
        requests.push(String(url));
        if (!String(url).includes('/current.json')) return { ok: false, status: 429 };
        return calendarResponse(year);
    });
    const [current, numbered] = await Promise.all([api.getSchedule(), api.getSchedule(year)]);
    assert.equal(current[0].season, year);
    assert.equal(numbered[0].season, year);
    assert.equal(requests.length, 1);
});

test('numbered current-year page works on a fresh visit when its numbered endpoint is throttled', async () => {
    const year = String(new Date().getUTCFullYear());
    const requests = [];
    const { api } = browserAPI(async (url) => {
        requests.push(String(url));
        return String(url).includes('/current.json') ? calendarResponse(year) : { ok: false, status: 429 };
    });
    assert.equal((await api.getSchedule(year))[0].season, year);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].includes('/current.json'));
});

test('historical calendars never receive current-season races', async () => {
    const year = String(new Date().getUTCFullYear());
    const pastYear = String(Number(year) - 1);
    const requests = [];
    const { api } = browserAPI(async (url) => {
        requests.push(String(url));
        return calendarResponse(String(url).includes('/current.json') ? year : pastYear);
    });
    await api.getSchedule();
    assert.equal((await api.getSchedule(pastYear))[0].season, pastYear);
    assert.equal(requests.length, 2);
});

test('stored calendar from the selected year survives a temporary provider outage', async () => {
    const year = String(new Date().getUTCFullYear());
    let online = true;
    const { api, storage } = browserAPI(async () => online ? calendarResponse(year) : { ok: false, status: 429 });
    await api.getSchedule();
    online = false;
    // A second page has a new memory cache but shares the visitor's stored calendar.
    const second = browserAPI(async () => ({ ok: false, status: 429 }));
    storage.forEach((value, key) => second.storage.set(key, value));
    assert.equal((await second.api.getSchedule(year))[0].season, year);
});
