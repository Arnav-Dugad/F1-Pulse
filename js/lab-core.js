/* Pure analysis engines. Recorded data, derived estimates and scenarios stay distinct. */
var PulseLab = (() => {
    const num = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const finished = status => /^Finished$|^\+\d+ Lap/i.test(String(status || ''));
    const fullName = driver => `${driver?.givenName || ''} ${driver?.familyName || ''}`.trim();
    const raceURL = race => `race-detail.html?season=${encodeURIComponent(race.season)}&round=${encodeURIComponent(race.round)}`;
    const racePoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const sprintPoints = [8, 7, 6, 5, 4, 3, 2, 1];
    function score(position, kind = 'race', season = 2026) {
        const rules = kind === 'sprint' ? (Number(season) === 2021 ? [3, 2, 1] : sprintPoints) : racePoints;
        return position > 0 ? rules[position - 1] || 0 : 0;
    }
    function countback(a, b) {
        const points = Number(b.points) - Number(a.points);
        if (Math.abs(points) > 0.00001) return points;
        const length = Math.max(a.counts?.length || 0, b.counts?.length || 0, 30);
        for (let i = 1; i < length; i++) {
            const difference = (b.counts?.[i] || 0) - (a.counts?.[i] || 0);
            if (difference) return difference;
        }
        return 0; // Unresolved race countback must not invent a winner.
    }
    function rank(rows) {
        const sorted = rows.map(row => ({ ...row, counts: [...(row.counts || [])] })).sort(countback);
        sorted.forEach((row, index) => {
            row.position = index && countback(sorted[index - 1], row) === 0 ? sorted[index - 1].position : index + 1;
            row.tied = sorted.some((other, i) => i !== index && countback(other, row) === 0);
        });
        return sorted;
    }
    function ledger(races = [], sprints = []) {
        const drivers = new Map(), teams = new Map(), events = [];
        const add = (race, kind) => {
            const rows = kind === 'race' ? race.Results || [] : race.SprintResults || [];
            if (!rows.length) return;
            const entries = [];
            for (const result of rows) {
                const id = result.Driver?.driverId;
                if (!id) continue;
                const team = result.Constructor?.constructorId || '';
                const points = num(result.points) ?? 0;
                let row = drivers.get(id);
                if (!row) { row = { id, Driver: result.Driver, team, points: 0, race: 0, sprint: 0, counts: [], starts: 0, finishes: 0, results: [] }; drivers.set(id, row); }
                row.points += points; row[kind] += points;
                if (kind === 'race') {
                    row.starts++; if (finished(result.status)) row.finishes++;
                    const position = Number(result.position);
                    if (position > 0) row.counts[position] = (row.counts[position] || 0) + 1;
                }
                row.results.push({ round: race.round, kind, result, race });
                let constructor = teams.get(team);
                if (!constructor) { constructor = { id: team, name: result.Constructor?.name || team, points: 0, drivers: {} }; teams.set(team, constructor); }
                constructor.points += points; constructor.drivers[id] = (constructor.drivers[id] || 0) + points;
                entries.push({ id, Driver: result.Driver, team, points, position: num(result.position), kind });
            }
            events.push({ race, kind, entries, round: Number(race.round), label: `R${race.round} · ${race.raceName}${kind === 'sprint' ? ' · Sprint' : ''}` });
        };
        sprints.forEach(race => add(race, 'sprint')); races.forEach(race => add(race, 'race'));
        events.sort((a, b) => a.round - b.round || (a.kind === b.kind ? 0 : a.kind === 'sprint' ? -1 : 1));
        return { drivers, teams, events };
    }
    function history(races, sprints = []) {
        const { events, drivers } = ledger(races, sprints);
        const current = new Map([...drivers].map(([id, row]) => [id, { id, Driver: row.Driver, team: row.team, points: 0, counts: [] }]));
        return events.map(event => {
            const before = rank([...current.values()]);
            event.entries.forEach(entry => {
                const row = current.get(entry.id); row.points += entry.points; row.team = entry.team;
                if (event.kind === 'race' && entry.position > 0) row.counts[entry.position] = (row.counts[entry.position] || 0) + 1;
            });
            const standings = rank([...current.values()]);
            return { ...event, before, standings };
        });
    }
    function remainingEvents(schedule, races, sprints = [], now = Date.now()) {
        const publishedRaces = new Set(races.map(race => String(race.round)));
        const publishedSprints = new Set(sprints.map(race => String(race.round)));
        const events = [];
        for (const race of schedule) {
            if (race.Sprint && !publishedSprints.has(String(race.round)) && Number.isFinite(Date.parse(`${race.Sprint.date}T${race.Sprint.time || '23:59:59Z'}`))) events.push({ ...race, kind: 'sprint', label: `R${race.round} ${race.raceName} · Sprint${Date.parse(`${race.Sprint.date}T${race.Sprint.time || '23:59:59Z'}`) <= now ? ' · result pending' : ''}`, maximum: 8 });
            if (!publishedRaces.has(String(race.round)) && Number.isFinite(Date.parse(`${race.date}T${race.time || '23:59:59Z'}`))) events.push({ ...race, kind: 'race', label: `R${race.round} ${race.raceName}${Date.parse(`${race.date}T${race.time || '23:59:59Z'}`) <= now ? ' · result pending' : ''}`, maximum: 25 });
        }
        return events;
    }
    function applyScenario(official, recorded, events, assignments = {}) {
        const rows = official.map(standing => {
            const id = standing.Driver.driverId;
            return { id, Driver: standing.Driver, team: standing.Constructors?.[0]?.constructorId, points: Number(standing.points), base: Number(standing.points), counts: [...(recorded.drivers.get(id)?.counts || [])], added: 0 };
        });
        const errors = [];
        for (const event of events) {
            const key = `${event.round}:${event.kind}`, occupied = new Set();
            const session = assignments[key] || {};
            for (const row of rows) {
                const position = Number(session[row.id]) || 0;
                if (!Number.isInteger(position) || position < 0 || position > rows.length) { errors.push(`${event.label}: invalid position`); continue; }
                if (position && occupied.has(position)) errors.push(`${event.label}: position ${position} is assigned twice`);
                occupied.add(position);
                const points = score(position, event.kind, event.season);
                row.points += points; row.added += points;
                if (event.kind === 'race' && position) row.counts[position] = (row.counts[position] || 0) + 1;
            }
        }
        return { rows: rank(rows), errors: [...new Set(errors)] };
    }
    function titleBounds(rows, events) {
        const maximum = events.reduce((sum, event) => sum + event.maximum, 0);
        const sorted = [...rows].sort((a, b) => Number(b.points) - Number(a.points));
        return sorted.map(row => {
            const bestRival = Math.max(0, ...sorted.filter(rival => rival.id !== row.id).map(rival => Number(rival.points) + maximum));
            const leader = Number(sorted[0]?.points) || 0;
            return { ...row, maximum: Number(row.points) + maximum, remaining: maximum,
                clinched: Number(row.points) > bestRival, eliminated: Number(row.points) + maximum < leader,
                tiePossible: Number(row.points) + maximum === leader && row.id !== sorted[0]?.id,
                guarantee: Math.max(0, Math.floor(bestRival - Number(row.points)) + 1) };
        });
    }
    function changes(current, previous) {
        return current.map(row => { const old = previous.find(item => item.id === row.id); return { ...row, change: old ? row.points - old.points : row.points, movement: old ? old.position - row.position : null }; });
    }
    function leadHistory(snapshots) {
        let previous = null, largest = null;
        const changes = [];
        snapshots.forEach(snapshot => {
            const first = snapshot.standings[0], second = snapshot.standings.find(row => row.position > 1);
            if (!first) return;
            const lead = first.points - (second?.points || 0);
            if (!largest || lead > largest.gap) largest = { snapshot, driver: first, gap: lead };
            const id = snapshot.standings.filter(row => row.position === 1).map(row => row.id).sort().join(',');
            if (previous !== null && id !== previous) changes.push({ snapshot, driver: first });
            previous = id;
        });
        return { changes, largest };
    }
    const stamp = row => num(row.t) ?? Date.parse(row.date);
    function indexBy(rows, key, time = stamp) {
        const index = new Map();
        for (const row of rows || []) {
            const t = time(row);
            if (!Number.isFinite(t)) continue;
            const id = String(row[key]);
            if (!index.has(id)) index.set(id, []);
            index.get(id).push({ ...row, t });
        }
        for (const entries of index.values()) entries.sort((a, b) => a.t - b.t);
        return index;
    }
    function at(entries, time) {
        let lo = 0, hi = (entries?.length || 0) - 1, answer = null;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (entries[mid].t <= time) { answer = entries[mid]; lo = mid + 1; } else hi = mid - 1; }
        return answer;
    }
    function prepareReplay(data) {
        const laps = indexBy(data.laps, 'driver_number', row => Date.parse(row.date_start));
        const positions = indexBy(data.positions, 'driver_number');
        const intervals = indexBy(data.intervals, 'driver_number');
        const stints = new Map();
        (data.stints || []).forEach(row => { const id = String(row.driver_number); if (!stints.has(id)) stints.set(id, []); stints.get(id).push(row); });
        for (const rows of stints.values()) rows.sort((a, b) => Number(a.lap_start) - Number(b.lap_start));
        const starts = [...laps.values()].flatMap(rows => rows.map(row => row.t));
        const ends = [...laps.values()].flatMap(rows => rows.map(row => row.t + (num(row.lap_duration) || 0) * 1000));
        const start = starts.length ? Math.min(...starts) : Date.parse(data.session?.date_start);
        const end = ends.length ? Math.max(...ends) : Date.parse(data.session?.date_end);
        return { ...data, laps, positions, intervals, stints, start, end, maxLap: Math.max(1, ...(data.laps || []).map(row => Number(row.lap_number) || 0)) };
    }
    function replayState(data, time) {
        return (data.drivers || []).map(driver => {
            const id = String(driver.driver_number), driverLaps = data.laps.get(id) || [];
            const lap = at(driverLaps, time), position = at(data.positions.get(id), time), interval = at(data.intervals.get(id), time);
            const duration = num(lap?.lap_duration), lapNumber = Number(lap?.lap_number) || 0;
            const progress = duration > 0 ? Math.max(0, Math.min(1, (time - lap.t) / (duration * 1000))) : 0;
            const tyre = (data.stints.get(id) || []).filter(stint => Number(stint.lap_start) <= lapNumber && (!stint.lap_end || Number(stint.lap_end) >= lapNumber)).at(-1);
            const completed = driverLaps.filter(row => num(row.lap_duration) > 0 && row.t + Number(row.lap_duration) * 1000 <= time);
            const recent = completed.filter(row => !row.is_pit_out_lap).slice(-3);
            const pace = recent.length ? recent.reduce((sum, row) => sum + Number(row.lap_duration), 0) / recent.length : null;
            return { id, driver, position: num(position?.position), lap: lapNumber, progress, gap: interval?.gap_to_leader ?? null, interval: interval?.interval ?? null,
                compound: tyre?.compound || 'Unknown', tyreAge: tyre ? Math.max(0, lapNumber - Number(tyre.lap_start) + (Number(tyre.tyre_age_at_start) || 0)) : null,
                pace, lastLap: completed.at(-1)?.lap_duration ?? null, completed: completed.length, sample: recent.length };
        }).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    }
    function battles(state) {
        return state.slice(1).flatMap((driver, i) => {
            const ahead = state[i], gap = num(driver.interval);
            if (gap === null || gap < 0 || gap > 1.5 || ahead.position === null || driver.position !== ahead.position + 1) return [];
            return [{ ahead, behind: driver, gap, paceDelta: driver.pace !== null && ahead.pace !== null ? driver.pace - ahead.pace : null,
                tyreDifference: driver.compound !== ahead.compound }];
        });
    }
    function replayEvents(data, extra = {}) {
        const events = [];
        for (const [id, positions] of data.positions) {
            let previous;
            positions.forEach(row => {
                if (previous && Number(previous.position) !== Number(row.position)) events.push({ t: row.t, kind: 'position', driver: id, label: `#${id} · P${previous.position} → P${row.position}`, detail: 'Recorded position change; may include pit stops or penalties.' });
                previous = row;
            });
        }
        (data.results || []).filter(result => !finished(result.status) && Number(result.laps) > 0).forEach(result => {
            const driver = (data.drivers || []).find(row => row.name_acronym === result.Driver?.code || row.last_name?.toLowerCase() === result.Driver?.familyName?.toLowerCase());
            if (!driver) return;
            const id = String(driver.driver_number), last = data.laps.get(id)?.at(-1);
            if (!last) return;
            events.push({ t: last.t + (num(last.lap_duration) || 0) * 1000, kind: 'retirement', driver: id,
                label: `#${id} · Retired classification`, detail: `Final status: ${result.status}. Timestamp is the end of the last recorded lap, not an exact retirement time.` });
        });
        (extra.pit || []).forEach(row => events.push({ t: Date.parse(row.date), kind: 'pit', driver: String(row.driver_number), label: `#${row.driver_number} · Pit lane`, detail: row.pit_duration ? `Pit lane duration ${row.pit_duration}s` : 'Recorded pit event.' }));
        (extra.control || []).forEach(row => events.push({ t: Date.parse(row.date), kind: 'control', driver: row.driver_number ? String(row.driver_number) : '', label: row.flag || row.category || 'Race control', detail: row.message || '' }));
        (extra.overtakes || []).forEach(row => events.push({ t: Date.parse(row.date), kind: 'exchange', driver: String(row.overtaking_driver_number), label: `#${row.overtaking_driver_number} passed #${row.overtaken_driver_number}`, detail: 'Provider position exchange; may include pit stops or post-race penalties.' }));
        return events.filter(event => Number.isFinite(event.t) && event.t >= data.start && event.t <= data.end).sort((a, b) => a.t - b.t);
    }
    function trackGeometry(samples, width = 700, height = 420) {
        const points = (samples || []).filter(point => num(point.x) !== null && num(point.y) !== null);
        if (points.length < 8) return null;
        const minX = Math.min(...points.map(p => Number(p.x))), maxX = Math.max(...points.map(p => Number(p.x)));
        const minY = Math.min(...points.map(p => Number(p.y))), maxY = Math.max(...points.map(p => Number(p.y)));
        if (maxX === minX || maxY === minY) return null;
        const scale = Math.min((width - 80) / (maxX - minX), (height - 80) / (maxY - minY));
        const left = (width - (maxX - minX) * scale) / 2, top = (height - (maxY - minY) * scale) / 2;
        return points.map(p => [left + (Number(p.x) - minX) * scale, height - top - (Number(p.y) - minY) * scale]);
    }
    function routePoint(points, fraction) {
        if (!points?.length) return null;
        const index = Math.max(0, Math.min(points.length - 1, fraction * (points.length - 1))), lo = Math.floor(index), hi = Math.min(lo + 1, points.length - 1), alpha = index - lo;
        return [points[lo][0] + (points[hi][0] - points[lo][0]) * alpha, points[lo][1] + (points[hi][1] - points[lo][1]) * alpha];
    }
    function forecast(races) {
        const recent = races.slice(-3), rows = new Map();
        recent.forEach((race, index) => (race.Results || []).forEach(result => {
            const id = result.Driver?.driverId;
            if (!id) return;
            if (!rows.has(id)) rows.set(id, { id, Driver: result.Driver, weighted: 0, weight: 0, sample: 0 });
            const row = rows.get(id), weight = index + 1;
            row.weighted += Number(result.position) * weight; row.weight += weight; row.sample++;
        }));
        return [...rows.values()].filter(row => row.sample >= Math.min(2, recent.length) && row.weight > 0)
            .map(row => ({ ...row, estimate: row.weighted / row.weight })).sort((a, b) => a.estimate - b.estimate).map((row, i) => ({ ...row, position: i + 1 }));
    }
    function backtest(races) {
        let winners = 0, baseline = 0, error = 0, samples = 0; const evaluations = [];
        for (let i = 3; i < races.length; i++) {
            const predictions = forecast(races.slice(0, i)), actual = races[i].Results || [];
            if (!predictions.length || !actual.length) continue;
            const winner = actual.find(row => Number(row.position) === 1)?.Driver?.driverId;
            if (predictions[0].id === winner) winners++;
            if (races[i - 1].Results?.[0]?.Driver?.driverId === winner) baseline++;
            for (const prediction of predictions) { const result = actual.find(row => row.Driver?.driverId === prediction.id); if (result) { error += Math.abs(Number(result.position) - prediction.position); samples++; } }
            evaluations.push({ race: races[i], predicted: predictions[0].Driver, winner: actual[0]?.Driver, correct: predictions[0].id === winner });
        }
        return { races: evaluations.length, samples, winnerAccuracy: evaluations.length ? winners / evaluations.length : null,
            baselineAccuracy: evaluations.length ? baseline / evaluations.length : null, meanError: samples ? error / samples : null, evaluations };
    }
    function insights({ drivers = [], teams = [], races = [], sprints = [], previous = null, now = Date.now() }) {
        const cards = [], recent = races.at(-1), leader = drivers[0];
        const card = (id, title, text, evidence, method) => cards.push({ id, title, text, evidence, method });
        if (leader) card('leader', `${leader.Driver.familyName} leads the championship`, `${leader.points} points${drivers[1] ? ` · ${Number(leader.points) - Number(drivers[1].points)} ahead of ${drivers[1].Driver.familyName}` : ''}.`, [{ label: 'Driver standings', href: 'drivers.html', detail: 'Published championship totals' }], 'Difference between the two highest published driver totals.');
        if (recent?.Results?.length) {
            const results = recent.Results, winner = results[0], classified = results.filter(row => finished(row.status)).length;
            card('winner', `${fullName(winner.Driver)} wins ${recent.raceName}`, `${winner.Constructor?.name || ''} · ${results.length} entries · ${classified} finishers.`, [{ label: `R${recent.round} classification`, href: raceURL(recent), detail: winner.Time?.time || winner.status }], 'Final published classification. Finishers include drivers classified a lap or more behind.');
            const recovery = results.filter(row => Number(row.grid) > 0 && finished(row.status)).sort((a, b) => (Number(b.grid) - Number(b.position)) - (Number(a.grid) - Number(a.position)))[0];
            if (recovery && Number(recovery.grid) - Number(recovery.position) >= 5) card('recovery', `Recovery drive: ${recovery.Driver.familyName}`, `Started P${recovery.grid}, classified P${recovery.position}: ${Number(recovery.grid) - Number(recovery.position)} places gained.`, [{ label: 'Grid and final position', href: raceURL(recent), detail: `${recovery.grid} → ${recovery.position}` }], 'Grid minus final classification, excluding pit-lane starts and retirements. This does not count on-track overtakes.');
        }
        const book = ledger(races, sprints);
        for (const row of book.drivers.values()) {
            const last = row.results.filter(entry => entry.kind === 'race').slice(-3);
            if (last.length === 3 && last.every(entry => Number(entry.result.position) <= 3)) card(`podiums:${row.id}`, `${row.Driver.familyName}: three consecutive podiums`, last.map(entry => `R${entry.round} P${entry.result.position}`).join(' · '), last.map(entry => ({ label: `R${entry.round}`, href: raceURL(entry.race), detail: `P${entry.result.position}` })), 'A podium is a final classification of P1, P2 or P3. The sample is the last three starts.');
        }
        if (previous?.points && String(previous.season) === String(drivers[0]?.season)) {
            const changed = drivers.map(row => ({ row, difference: Number(row.points) - Number(previous.points[row.Driver.driverId] ?? row.points) })).filter(item => item.difference !== 0);
            if (changed.length) card('changes', 'Since your last Insights visit', changed.slice(0, 5).map(({ row, difference }) => `${row.Driver.familyName} ${difference > 0 ? '+' : ''}${difference} pts`).join(' · '), [{ label: 'Current standings', href: 'drivers.html', detail: `Compared with the saved snapshot from ${new Date(previous.at).toLocaleDateString()}` }], 'Difference from your previous browser snapshot; provider corrections can also change totals.');
        }
        const week = races.filter(race => { const date = Date.parse(`${race.date}T${race.time || '23:59:59Z'}`); return date <= now && date >= now - 7 * 86400000; });
        card('week', 'Your weekly race digest', week.length ? week.map(race => `${race.raceName}: ${fullName(race.Results?.[0]?.Driver)} won`).join(' · ') : 'No published Grand Prix results in the past seven days. Your next-weekend briefing is below.', week.map(race => ({ label: race.raceName, href: raceURL(race), detail: race.date })), 'Published Grand Prix results dated within the previous seven days, using the race start time.');
        return cards;
    }
    const glossary = {
        'Countback': 'When championship points are equal, race wins are compared, then second places, third places and so on. The 2026 rules also use qualifying results if race classifications cannot resolve the tie.',
        'Undercut': 'Pitting before a rival to try to gain time on fresh tyres before that rival stops.',
        'Overcut': 'Staying out longer than a rival to try to gain time before making your own stop.',
        'DNF': 'Did not finish. A retired driver can still have a classified finishing position.',
        'Gap': 'Time behind the race leader. A lapped gap is not a numeric number of seconds.',
        'Interval': 'Time behind the car immediately ahead, rather than behind the leader.',
        'Stint': 'The portion of a race run on one set of tyres.',
        'Sprint': 'A shorter race with its own points award, separate from the Grand Prix.',
        'Classification': 'The published order of a session, which can include retired drivers and penalties.',
        'Interpolation': 'A calculated position between observations. The replay map is an approximation of lap progress, not recorded GPS for every car.',
        'Sample size': 'The number of races, laps or observations used in a statistic. Small samples can change sharply.',
        'Pace': 'Lap-time performance measured over a stated sample. Traffic, tyres, weather and race interruptions can all affect it.'
    };
    return { num, esc, finished, fullName, raceURL, score, racePoints, sprintPoints, countback, rank, ledger, history, remainingEvents, applyScenario, titleBounds, changes, leadHistory,
        indexBy, at, prepareReplay, replayState, battles, replayEvents, trackGeometry, routePoint, forecast, backtest, insights, glossary };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PulseLab;
