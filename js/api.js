/* ============================================
   F1 PULSE - API Service Layer
   Jolpica-F1 & OpenF1 Integration (Full)
   ============================================ */

const F1API = (() => {
    const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1';
    const OPENF1_BASE = 'https://api.openf1.org/v1';

    const CACHE_DURATION = 5 * 60 * 1000;      // 5 minutes for live data
    const CACHE_DURATION_LONG = 60 * 60 * 1000; // 1 hour for standings/schedule
    const cache = new Map();

    function getCached(key) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.timestamp < entry.duration) {
            return entry.data;
        }
        cache.delete(key);
        return null;
    }

    function setCache(key, data, duration = CACHE_DURATION) {
        cache.set(key, { data, timestamp: Date.now(), duration });
    }

    async function fetchJSON(url, cacheDuration = CACHE_DURATION) {
        const cached = getCached(url);
        if (cached) return cached;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setCache(url, data, cacheDuration);
        return data;
    }

    // ========================================
    // Jolpica-F1 (Ergast-compatible) Endpoints
    // ========================================

    async function getDriverStandings(season = 'current') {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/driverstandings.json?limit=100`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    }

    async function getConstructorStandings(season = 'current') {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/constructorstandings.json?limit=100`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
    }

    async function getSchedule(season = 'current') {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}.json?limit=30`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races || [];
    }

    async function getNextRace() {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/current/next.json`,
            CACHE_DURATION
        );
        return data?.MRData?.RaceTable?.Races?.[0] || null;
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
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/${round}/laps${lapPath}.json?limit=1000`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races?.[0]?.Laps || [];
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
        const data = await fetchJSON(
            `${JOLPICA_BASE}/drivers/${driverId}.json`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.DriverTable?.Drivers?.[0] || null;
    }

    async function getDriverSeasonResults(season, driverId) {
        const data = await fetchJSON(
            `${JOLPICA_BASE}/${season}/drivers/${driverId}/results.json?limit=50`,
            CACHE_DURATION_LONG
        );
        return data?.MRData?.RaceTable?.Races || [];
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
            CACHE_DURATION_LONG
        );
        return data || [];
    }

    async function getOpenF1Sessions(params = {}) {
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/sessions${qs ? '?' + qs : ''}`,
            CACHE_DURATION
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
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Intervals(sessionKey) {
        const data = await fetchJSON(
            `${OPENF1_BASE}/intervals?session_key=${sessionKey}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Laps(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/laps?${qs}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Weather(sessionKey) {
        const data = await fetchJSON(
            `${OPENF1_BASE}/weather?session_key=${sessionKey}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Stints(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/stints?${qs}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Pit(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/pit?${qs}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1RaceControl(sessionKey) {
        const data = await fetchJSON(
            `${OPENF1_BASE}/race_control?session_key=${sessionKey}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1TeamRadio(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/team_radio?${qs}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1Location(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/location?${qs}`,
            CACHE_DURATION
        );
        return data || [];
    }

    async function getOpenF1CarData(sessionKey, driverNumber) {
        const params = { session_key: sessionKey };
        if (driverNumber) params.driver_number = driverNumber;
        const qs = new URLSearchParams(params).toString();
        const data = await fetchJSON(
            `${OPENF1_BASE}/car_data?${qs}`,
            CACHE_DURATION
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

        let openF1Drivers = [];
        try {
            openF1Drivers = await getOpenF1Drivers('latest');
        } catch (e) {
            try {
                const year = new Date().getFullYear();
                const meetings = await getOpenF1Meetings({ year });
                if (meetings?.length) {
                    const lastMeeting = meetings[meetings.length - 1];
                    const sessions = await getOpenF1Sessions({ meeting_key: lastMeeting.meeting_key });
                    if (sessions?.length) {
                        openF1Drivers = await getOpenF1Drivers(sessions[sessions.length - 1].session_key);
                    }
                }
            } catch (e2) { /* fallback empty */ }
        }

        // If still no drivers, try the previous year as fallback
        if (!openF1Drivers?.length) {
            try {
                const prevYear = new Date().getFullYear() - 1;
                const meetings = await getOpenF1Meetings({ year: prevYear });
                if (meetings?.length) {
                    const lastMeeting = meetings[meetings.length - 1];
                    const sessions = await getOpenF1Sessions({ meeting_key: lastMeeting.meeting_key });
                    if (sessions?.length) {
                        openF1Drivers = await getOpenF1Drivers(sessions[sessions.length - 1].session_key);
                    }
                }
            } catch (e3) { /* fallback empty */ }
        }

        const driverMap = {};
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

