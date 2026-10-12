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
