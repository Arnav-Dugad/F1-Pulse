/* Load race metadata independently of results that have not been published yet. */
async function loadRacePageData(api, season, round, options = {}) {
    const now = options.now ?? Date.now();
    let calendarRace = null;
    try {
        const schedule = await api.getSchedule(season);
        calendarRace = schedule?.find((race) => String(race.round) === String(round)) || null;
    } catch { /* Published results can still identify a race if the calendar is unavailable. */ }

    if (calendarRace) options.onRace?.(calendarRace);

    const started = (session) => {
        if (!session?.date) return false;
        const start = Date.parse(`${session.date}T${session.time || '23:59:59Z'}`);
        return Number.isFinite(start) && start <= now;
    };
    const raceStarted = !calendarRace || started(calendarRace);
    const tasks = [
        raceStarted ? () => api.getRaceResults(season, round) : () => null,
        !calendarRace || started(calendarRace.Qualifying) ? () => api.getQualifyingResults(season, round) : () => null,
        !calendarRace || started(calendarRace.Sprint) ? () => api.getSprintResults(season, round) : () => null,
        raceStarted ? () => api.getPitStops(season, round) : () => [],
    ];
    const settled = await Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
    const value = (index, fallback) => settled[index].status === 'fulfilled' ? settled[index].value : fallback;
    const race = value(0, null);
    const qual = value(1, null);
    const sprint = value(2, null);
    return {
        raceInfo: race || calendarRace || qual || sprint,
        race,
        qual,
        sprint,
        pitStops: value(3, []) || [],
    };
}

// Match the actual weekend before loading telemetry. Several GPs share a
// country, and sprint sessions also use OpenF1's Race session type.
function findOpenF1Meeting(meetings, race) {
    const normalize = value => String(value || '').toLowerCase().replace(/grand prix/g, '').replace(/[^a-z0-9]/g, '');
    const name = normalize(race.raceName);
    const country = normalize(race.Circuit?.Location?.country);
    const date = Date.parse(race.date);
    const dated = (meetings || []).filter(meeting => {
        const start = Date.parse(meeting.date_start);
        return Number.isFinite(date) && Number.isFinite(start) && Math.abs(date - start) <= 5 * 86400000;
    });
    const nearest = rows => [...rows].sort((a, b) => Math.abs(date - Date.parse(a.date_start)) - Math.abs(date - Date.parse(b.date_start)))[0] || null;
    const exact = dated.filter(meeting => name && normalize(meeting.meeting_name) === name);
    if (exact.length) return nearest(exact);
    return nearest(dated.filter(meeting => country && normalize(meeting.country_name) === country));
}

function findOpenF1RaceSession(sessions) {
    return (sessions || []).find(session => session.session_name === 'Race')
        || (sessions || []).find(session => session.session_type === 'Race' && !/sprint/i.test(session.session_name || ''))
        || null;
}

function findHistoricalRace(schedule, race) {
    const normalize = value => String(value || '').toLowerCase().replace(/grand prix/g, '').replace(/[^a-z0-9]/g, '');
    const circuit = race.Circuit?.circuitId;
    const name = normalize(race.raceName);
    return (schedule || []).find(entry => circuit && entry.Circuit?.circuitId === circuit)
        || (schedule || []).find(entry => name && normalize(entry.raceName) === name)
        || null;
}
