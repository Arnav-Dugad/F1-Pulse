/* ============================================
   F1 PULSE - API Service Layer
   Jolpica-F1 & OpenF1 Integration (Full)
   ============================================ */

const F1API = (() => {
    const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1';
    const OPENF1_BASE = 'https://api.openf1.org/v1';

    const CACHE_DURATION = 5 * 60 * 1000;      // 5 minutes for live data
    const CACHE_DURATION_LONG = 60 * 60 * 1000; // 1 hour for standings/schedule
    const CACHE_DURATION_LIVE = 8 * 1000;
    const CACHE_DURATION_SESSION = 30 * 1000;
    const REQUEST_TIMEOUT = 12000;
    const requestQueue = [];
    let activeRequests = 0;

    // Keep navigation, optional analytics and telemetry from flooding the providers.
    async function withRequestSlot(task) {
        if (activeRequests >= 3) await new Promise(resolve => requestQueue.push(resolve));
        else activeRequests++;
        try { return await task(); } finally {
            const next = requestQueue.shift();
            if (next) next(); else activeRequests--;
        }
    }
    const STORAGE_PREFIX = 'f1pulse_api_v2:';
    const cache = new Map();
    const pendingRequests = new Map();

    function getRequestURL(url) {
        try {
            if (typeof window === 'undefined' || !window.location || !/^https?:$/.test(window.location.protocol)) {
                return url;
            }

            // Wrangler's standard preview port runs the same proxy as production.
            if (window.location.hostname.endsWith('.github.io') || (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) && window.location.port !== '8787')) {
                return url;
            }

            const upstream = new URL(url);
            let provider = '';
            let path = '';

            if (upstream.origin === 'https://api.jolpi.ca' && upstream.pathname.startsWith('/ergast/f1/')) {
                provider = 'jolpica';
                path = upstream.pathname.slice('/ergast/f1/'.length);
            } else if (upstream.origin === 'https://api.openf1.org' && upstream.pathname.startsWith('/v1/')) {
                provider = 'openf1';
                path = upstream.pathname.slice('/v1/'.length);
            } else {
                return url;
            }

            const proxy = new URL('/api/f1', window.location.origin);
            proxy.searchParams.set('provider', provider);
            proxy.searchParams.set('path', path);
            upstream.searchParams.forEach((value, key) => proxy.searchParams.append(key, value));
            return proxy.toString();
        } catch (error) {
            return url;
        }
    }

    function getCached(key, duration) {
        let entry = cache.get(key);
        if (!entry) {
            try {
                const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
                if (raw) entry = JSON.parse(raw);
            } catch { /* Memory cache still works without storage. */ }
        }
        if (entry && Date.now() - entry.timestamp < Math.min(entry.duration, duration ?? entry.duration)) {
            cache.set(key, entry);
            return entry.data;
        }
        cache.delete(key);
        return null;
    }

    function setCache(key, data, duration = CACHE_DURATION) {
        cache.set(key, { data, timestamp: Date.now(), duration });
        try {
            const payload = JSON.stringify({
                data,
                timestamp: Date.now(),
                duration,
            });
            const isHeavyTelemetry = /\/(?:car_data|location|laps|team_radio)\?/i.test(key);
            if (!isHeavyTelemetry && payload.length < 750000) {
                localStorage.setItem(`${STORAGE_PREFIX}${key}`, payload);
            }
        } catch (e) {
            // Storage can be unavailable in private browsing; in-memory caching still works.
        }
    }

    function getStored(key, maxAge = 7 * 24 * 60 * 60 * 1000) {
        try {
            const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (!entry?.timestamp || Date.now() - entry.timestamp > maxAge) return null;
            return entry.data;
        } catch (e) {
            return null;
        }
    }

    async function fetchJSON(url, cacheDuration = CACHE_DURATION) {
        const cached = getCached(url, cacheDuration);
        if (cached) return cached;

        if (pendingRequests.has(url)) {
            return pendingRequests.get(url);
        }

        const request = withRequestSlot(async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            try {
                const res = await fetch(getRequestURL(url), {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const data = await res.json();
                if (res.headers?.get('X-F1-Pulse-Cache') === 'STALE') {
                    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('f1pulse:stale-data', { detail: { url } }));
                    }
                    // Keep saved responses out of the fresh cache, so later visits retry live data.
                    return data;
                }
                setCache(url, data, cacheDuration);
                return data;
            } catch (error) {
                // A stale live feed must never masquerade as current telemetry.
                const stored = cacheDuration >= CACHE_DURATION ? getStored(url) : null;
                if (stored) {
                    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('f1pulse:stale-data', { detail: { url } }));
                    }
                    return stored;
                }
                throw error;
            } finally {
                clearTimeout(timeout);
            }
        });

        pendingRequests.set(url, request);
        try {
            return await request;
        } finally {
            pendingRequests.delete(url);
        }
    }

    // ========================================
    // Jolpica-F1 (Ergast-compatible) Endpoints
    // ========================================

    async function getDriverStandings(season = 'current') {
        const key = season === 'current' || String(season) === String(new Date().getUTCFullYear()) ? 'current' : season;
        let data = await fetchJSON(`${JOLPICA_BASE}/${key}/driverstandings.json?limit=100`, CACHE_DURATION);
        if (season !== 'current' && String(data?.MRData?.StandingsTable?.StandingsLists?.[0]?.season) !== String(season)) {
            data = await fetchJSON(`${JOLPICA_BASE}/${season}/driverstandings.json?limit=100`, CACHE_DURATION);
        }
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0];
        return (list?.DriverStandings || []).map(row => ({ ...row, season: list.season }));
    }

    async function getConstructorStandings(season = 'current') {
        const key = season === 'current' || String(season) === String(new Date().getUTCFullYear()) ? 'current' : season;
        let data = await fetchJSON(`${JOLPICA_BASE}/${key}/constructorstandings.json?limit=100`, CACHE_DURATION);
        if (season !== 'current' && String(data?.MRData?.StandingsTable?.StandingsLists?.[0]?.season) !== String(season)) {
            data = await fetchJSON(`${JOLPICA_BASE}/${season}/constructorstandings.json?limit=100`, CACHE_DURATION);
        }
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0];
        return (list?.ConstructorStandings || []).map(row => ({ ...row, season: list.season }));
    }

    async function getSchedule(season = 'current') {
        const requestedSeason = String(season);
        const currentURL = `${JOLPICA_BASE}/current.json?limit=30`;
        const seasonURL = `${JOLPICA_BASE}/${requestedSeason}.json?limit=30`;
        const matchesSeason = (data) => String(data?.MRData?.RaceTable?.season) === requestedSeason;
        const scheduleRaces = (data) => {
            const races = data?.MRData?.RaceTable?.Races || [];
            return data?.F1Pulse?.source === 'saved-calendar'
                ? races.map((race) => ({ ...race, calendarSnapshotAt: data.F1Pulse.updatedAt }))
                : races;
        };

        // Navigation already loads the current calendar. Reuse it only when the
        // provider confirms its season; historical pages must keep their own year.
        if (requestedSeason !== 'current') {
            let shared = getCached(currentURL);
            if (!shared && pendingRequests.has(currentURL)) {
                try { shared = await pendingRequests.get(currentURL); } catch { /* Try the season below. */ }
            }
            if (matchesSeason(shared)) return scheduleRaces(shared);
        }

        const useCurrent = requestedSeason === 'current' || requestedSeason === String(new Date().getUTCFullYear());
        let data;
        try {
            data = await fetchJSON(useCurrent ? currentURL : seasonURL, CACHE_DURATION_LONG);
            if (requestedSeason !== 'current' && !matchesSeason(data)) {
                data = await fetchJSON(seasonURL, CACHE_DURATION_LONG);
            }
        } catch (error) {
            // A calendar from a previous page still makes the race centre useful
            // during provider throttling, without substituting a different season.
            const stored = getStored(seasonURL) || getStored(currentURL);
            if (matchesSeason(stored) || (requestedSeason === 'current' && stored?.MRData?.RaceTable?.Races?.length)) {
                data = stored;
            } else if (useCurrent) {
                const snapshotURL = typeof window !== 'undefined' && window.location?.origin
                    ? new URL('/data/calendar-current.json', window.location.origin).toString()
                    : '/data/calendar-current.json';
                const snapshot = await fetchJSON(snapshotURL, CACHE_DURATION_LONG);
                const snapshotSeason = String(snapshot?.MRData?.RaceTable?.season);
                const expectedSeason = requestedSeason === 'current' ? String(new Date().getUTCFullYear()) : requestedSeason;
                if (snapshotSeason !== expectedSeason) throw error;
                data = snapshot;
            } else {
                throw error;
            }
        }
        const actualSeason = data?.MRData?.RaceTable?.season;
        if (/^\d{4}$/.test(String(actualSeason))) {
            const duration = data?.F1Pulse?.source === 'saved-calendar' ? CACHE_DURATION : CACHE_DURATION_LONG;
            setCache(`${JOLPICA_BASE}/${actualSeason}.json?limit=30`, data, duration);
            if (useCurrent && String(actualSeason) === String(new Date().getUTCFullYear())) setCache(currentURL, data, duration);
        }
        return scheduleRaces(data);
    }

    async function getNextRace() {
        let data = null;
        try {
            data = await fetchJSON(
                `${JOLPICA_BASE}/current/next.json`,
                CACHE_DURATION
            );
        } catch (error) {
            // The calendar below remains a complete fallback when /next is unavailable.
        }
        const nextFromEndpoint = data?.MRData?.RaceTable?.Races?.[0] || null;
        const raceStart = nextFromEndpoint
            ? new Date(`${nextFromEndpoint.date}T${nextFromEndpoint.time || '14:00:00Z'}`).getTime()
            : 0;
        const endpointStillCurrent = Number.isFinite(raceStart) && raceStart > Date.now() - (4 * 60 * 60 * 1000);
        if (endpointStillCurrent) return nextFromEndpoint;

        // Jolpica can briefly keep /next pointed at the race that just finished.
        // Deriving the next future round from the calendar prevents a stale hero.
        const schedule = await getSchedule();
        return schedule.find((race) => {
            const start = new Date(`${race.date}T${race.time || '14:00:00Z'}`).getTime();
            return Number.isFinite(start) && start > Date.now() - (4 * 60 * 60 * 1000);
        }) || null;
    }

    async function getLastRaceResults() {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/current/last/results.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    }

    async function getRaceResults(season, round) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/results.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    }

    async function getQualifyingResults(season, round) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/qualifying.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    }

    async function getSprintResults(season, round) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/sprint.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0] || null;
    }

    async function getPitStops(season, round) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/pitstops.json?limit=100`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0]?.PitStops || [];
    }

    async function getLapTimes(season, round, lap) {
        const lapPath = lap ? `/${lap}` : '';
        const laps = new Map();
        let offset = 0, total = 0;
        do {
            const data = await fetchJSON(`${JOLPICA_BASE}/${season}/${round}/laps${lapPath}.json?limit=1000&offset=${offset}`, CACHE_DURATION_LONG);
            for (const entry of data?.MRData?.RaceTable?.Races?.[0]?.Laps || []) {
                const existing = laps.get(entry.number);
                if (existing) existing.Timings.push(...(entry.Timings || []));
                else laps.set(entry.number, { ...entry, Timings: [...(entry.Timings || [])] });
            }
            total = Number(data?.MRData?.total) || 0;
            offset += 1000;
        } while (offset < total);
        return [...laps.values()].sort((a, b) => Number(a.number) - Number(b.number));
    }

    async function getFastestLap(season, round) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/fastest/1/results.json`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0]?.Results?.[0] || null;
    }

    async function getSeasons() {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/seasons.json?limit=100`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.SeasonTable?.Seasons || [];
    }

    async function getDriverInfo(driverId) {
        const standings = getCached(`${JOLPICA_BASE}/current/driverstandings.json?limit=100`);
        const known = standings?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings?.find(row => row.Driver?.driverId === driverId);
        if (known) return known.Driver;
        const data = await fetchJSON(
            `${JOLPICA_BASE}/drivers/${driverId}.json`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.DriverTable?.Drivers?.[0] || null;
    }

    async function getSeasonResults(season = 'current') {
        const key = season;
        const races = new Map();
        let offset = 0;
        let total = 0;
        do {
            const data = await fetchJSON(`${JOLPICA_BASE}/${key}/results.json?limit=1000&offset=${offset}`, CACHE_DURATION);
            for (const race of data?.MRData?.RaceTable?.Races || []) {
                const existing = races.get(race.round);
                if (existing) existing.Results.push(...race.Results);
                else races.set(race.round, { ...race, Results: [...(race.Results || [])] });
            }
            total = Number(data?.MRData?.total) || 0;
            offset += 1000;
        } while (offset < total);
        return [...races.values()].sort((a, b) => Number(a.round) - Number(b.round));
    }

    async function getDriverSeasonResults(season, driverId) {
        const races = await getSeasonResults(season);
        return races.map(race => ({ ...race, Results: race.Results.filter(row => row.Driver?.driverId === driverId) }))
            .filter(race => race.Results.length);
    }

    async function getConstructors(season = 'current') {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/constructors.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.ConstructorTable?.Constructors || [];
    }

    async function getFinishingStatus(season = 'current') {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/status.json?limit=100`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.StatusTable?.Status || [];
    }

    // ========================================
    // OpenF1 Endpoints (Full)
    // ========================================

    async function getOpenF1Drivers(sessionKey = 'latest') {
        const data = await fetchJSON(
            `${OPENF1_BASE}/drivers?session_key=${sessionKey}`,
            CACHE_DURATION_SESSION
        );
        return data || [];
    }

    async function getOpenF1Sessions(params = {}) {
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/sessions${qs ? '?' + qs : ''}`,
            CACHE_DURATION_SESSION
        );
        return data || [];
    }

    async function getOpenF1Meetings(params = {}) {
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/meetings${qs ? '?' + qs : ''}`,
            CACHE_DURATION_LONG
        );
        return data || [];
    }

    async function getOpenF1Position(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/position?${qs}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1Intervals(sessionKey, since) {
        const params = new URLSearchParams({ session_key: sessionKey });
        if (since) params.set('date>', since);
        const data = await fetchJSON(
            `${OPENF1_BASE}/intervals?${params.toString()}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1Laps(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/laps?${qs}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1Weather(sessionKey) {
        const data = await fetchJSON(
            `${OPENF1_BASE}/weather?session_key=${sessionKey}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1Stints(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/stints?${qs}`,
            CACHE_DURATION_SESSION
        );
        return data || [];
    }

    async function getOpenF1Pit(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/pit?${qs}`,
            CACHE_DURATION_SESSION
        );
        return data || [];
    }

    async function getOpenF1RaceControl(sessionKey) {
        const data = await fetchJSON(
            `${OPENF1_BASE}/race_control?session_key=${sessionKey}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1TeamRadio(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/team_radio?${qs}`,
            CACHE_DURATION_SESSION
        );
        return data || [];
    }

    async function getOpenF1Location(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/location?${qs}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    async function getOpenF1CarData(sessionKey, driverNumber, since) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const query = new URLSearchParams(params);
        if (since) query.set('date>', since);
        const qs = query.toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/car_data?${qs}`,
            CACHE_DURATION_LIVE
        );
        return data || [];
    }

    // ========================================
    // Wikipedia REST API (for team logos)
    // ========================================

    async function getWikipediaThumbnail(wikiUrl) {
        if (!wikiUrl) return null;
        const article = wikiUrl.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '');
        if (!article) return null;
        try {
            const data = await fetchJSON(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`,
                CACHE_DURATION_LONG
            );
            return data?.thumbnail?.source || null;
        } catch (e) {
            return null;
        }
    }

    // ========================================
    // Enriched driver data (multi-indexed)
    // ========================================

    let _driverCache = null;
    let _driverCacheTimestamp = 0;

    function normalizeStr(s) {
        if (!s) return '';
        return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function buildOfficialDriverHeadshot(teamSlug, driverSlug, width = 440) {
        return `https://media.formula1.com/image/upload/c_lfill,w_${width}/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026/${teamSlug}/${driverSlug}/2026${teamSlug}${driverSlug}right.webp`;
    }

    const OFFICIAL_DRIVER_HEADSHOTS_2026 = {
        russell:   { headshot: buildOfficialDriverHeadshot('mercedes', 'georus01', 440), headshotHiRes: buildOfficialDriverHeadshot('mercedes', 'georus01', 880) },
        antonelli: { headshot: buildOfficialDriverHeadshot('mercedes', 'andant01', 440), headshotHiRes: buildOfficialDriverHeadshot('mercedes', 'andant01', 880) },
        leclerc:   { headshot: buildOfficialDriverHeadshot('ferrari', 'chalec01', 440), headshotHiRes: buildOfficialDriverHeadshot('ferrari', 'chalec01', 880) },
        hamilton:  { headshot: buildOfficialDriverHeadshot('ferrari', 'lewham01', 440), headshotHiRes: buildOfficialDriverHeadshot('ferrari', 'lewham01', 880) },
        norris:    { headshot: buildOfficialDriverHeadshot('mclaren', 'lannor01', 440), headshotHiRes: buildOfficialDriverHeadshot('mclaren', 'lannor01', 880) },
        piastri:   { headshot: buildOfficialDriverHeadshot('mclaren', 'oscpia01', 440), headshotHiRes: buildOfficialDriverHeadshot('mclaren', 'oscpia01', 880) },
        verstappen:{ headshot: buildOfficialDriverHeadshot('redbullracing', 'maxver01', 440), headshotHiRes: buildOfficialDriverHeadshot('redbullracing', 'maxver01', 880) },
        hadjar:    { headshot: buildOfficialDriverHeadshot('redbullracing', 'isahad01', 440), headshotHiRes: buildOfficialDriverHeadshot('redbullracing', 'isahad01', 880) },
        alonso:    { headshot: buildOfficialDriverHeadshot('astonmartin', 'feralo01', 440), headshotHiRes: buildOfficialDriverHeadshot('astonmartin', 'feralo01', 880) },
        stroll:    { headshot: buildOfficialDriverHeadshot('astonmartin', 'lanstr01', 440), headshotHiRes: buildOfficialDriverHeadshot('astonmartin', 'lanstr01', 880) },
        gasly:     { headshot: buildOfficialDriverHeadshot('alpine', 'piegas01', 440), headshotHiRes: buildOfficialDriverHeadshot('alpine', 'piegas01', 880) },
        colapinto: { headshot: buildOfficialDriverHeadshot('alpine', 'fracol01', 440), headshotHiRes: buildOfficialDriverHeadshot('alpine', 'fracol01', 880) },
        albon:     { headshot: buildOfficialDriverHeadshot('williams', 'alealb01', 440), headshotHiRes: buildOfficialDriverHeadshot('williams', 'alealb01', 880) },
        sainz:     { headshot: buildOfficialDriverHeadshot('williams', 'carsai01', 440), headshotHiRes: buildOfficialDriverHeadshot('williams', 'carsai01', 880) },
        lawson:    { headshot: buildOfficialDriverHeadshot('racingbulls', 'lialaw01', 440), headshotHiRes: buildOfficialDriverHeadshot('racingbulls', 'lialaw01', 880) },
        lindblad:  { headshot: buildOfficialDriverHeadshot('racingbulls', 'arvlin01', 440), headshotHiRes: buildOfficialDriverHeadshot('racingbulls', 'arvlin01', 880) },
        ocon:      { headshot: buildOfficialDriverHeadshot('haasf1team', 'estoco01', 440), headshotHiRes: buildOfficialDriverHeadshot('haasf1team', 'estoco01', 880) },
        bearman:   { headshot: buildOfficialDriverHeadshot('haasf1team', 'olibea01', 440), headshotHiRes: buildOfficialDriverHeadshot('haasf1team', 'olibea01', 880) },
        hulkenberg:{ headshot: buildOfficialDriverHeadshot('audi', 'nichul01', 440), headshotHiRes: buildOfficialDriverHeadshot('audi', 'nichul01', 880) },
        bortoleto: { headshot: buildOfficialDriverHeadshot('audi', 'gabbor01', 440), headshotHiRes: buildOfficialDriverHeadshot('audi', 'gabbor01', 880) },
        perez:     { headshot: buildOfficialDriverHeadshot('cadillac', 'serper01', 440), headshotHiRes: buildOfficialDriverHeadshot('cadillac', 'serper01', 880) },
        bottas:    { headshot: buildOfficialDriverHeadshot('cadillac', 'valbot01', 440), headshotHiRes: buildOfficialDriverHeadshot('cadillac', 'valbot01', 880) },
    };

    async function getEnrichedDrivers() {
        if (_driverCache && Date.now() - _driverCacheTimestamp < CACHE_DURATION_LONG) {
            return _driverCache;
        }

        // Official portraits are already available locally in the configuration.
        // One optional feed lookup is enough; old seasons can have the wrong lineup.
        const openF1Drivers = await getOpenF1Drivers('latest').catch(() => []);

        const driverMap = Object.fromEntries(Object.entries(OFFICIAL_DRIVER_HEADSHOTS_2026)
            .map(([name, photos]) => [name, { ...photos, lastName: name }]));
        openF1Drivers.forEach(d => {
            const lastNameNorm = normalizeStr(d.last_name);
            const official = OFFICIAL_DRIVER_HEADSHOTS_2026[lastNameNorm] || null;

            // Upgrade headshot URL to high-res (replace .transform/ paths with larger size)
            let headshotUrl = official?.headshot || d.headshot_url || null;
            let headshotHiRes = official?.headshotHiRes || null;
            if (headshotUrl && !official) {
                // High-res for cards (1080px)
                headshotHiRes = headshotUrl
                    .replace(/\/1col\//i, '/4col/')
                    .replace(/\/2col\//i, '/4col/')
                    .replace(/w_[0-9]+/, 'w_1080')
                    .replace(/h_[0-9]+/, 'h_1080')
                    .replace(/q_auto/, 'q_auto:best');
                // Standard res for avatars (600px)
                headshotUrl = headshotUrl
                    .replace(/\/1col\//i, '/2col/')
                    .replace(/w_[0-9]+/, 'w_600')
                    .replace(/h_[0-9]+/, 'h_600')
                    .replace(/q_auto/, 'q_auto:best');
            }

            const entry = {
                headshot: headshotUrl,
                headshotHiRes: headshotHiRes,
                teamColor: d.team_colour ? `#${d.team_colour}` : null,
                teamName: d.team_name || null,
                number: d.driver_number,
                acronym: d.name_acronym,
                firstName: d.first_name,
                lastName: d.last_name,
                countryCode: d.country_code,
                broadcastName: d.broadcast_name,
                fullName: d.full_name,
            };

            const lastName = lastNameNorm;
            const firstName = normalizeStr(d.first_name);
            const fullName = normalizeStr((d.first_name || '') + (d.last_name || ''));
            const acronym = (d.name_acronym || '').toLowerCase();
            const number = String(d.driver_number || '');

            if (lastName) driverMap[lastName] = entry;
            if (fullName) driverMap[fullName] = entry;
            if (acronym) driverMap['acr_' + acronym] = entry;
            if (number) driverMap['num_' + number] = entry;

            // Extra aliases for hard-to-match names
            if (d.broadcast_name) {
                const broadNorm = normalizeStr(d.broadcast_name);
                if (broadNorm) driverMap[broadNorm] = entry;
            }
        });

        _driverCache = driverMap;
        _driverCacheTimestamp = Date.now();
        return driverMap;
    }

    return {
        getDriverStandings,
        getConstructorStandings,
        getSchedule,
        getNextRace,
        getLastRaceResults,
        getRaceResults,
        getQualifyingResults,
        getSprintResults,
        getPitStops,
        getLapTimes,
        getFastestLap,
        getSeasons,
        getDriverInfo,
        getDriverSeasonResults,
        getSeasonResults,
        getConstructors,
        getFinishingStatus,
        getOpenF1Drivers,
        getOpenF1Sessions,
        getOpenF1Meetings,
        getOpenF1Position,
        getOpenF1Intervals,
        getOpenF1Laps,
        getOpenF1Weather,
        getOpenF1Stints,
        getOpenF1Pit,
        getOpenF1RaceControl,
        getOpenF1TeamRadio,
        getOpenF1Location,
        getOpenF1CarData,
        getWikipediaThumbnail,
        getEnrichedDrivers,
        normalizeStr,
    };
})();

