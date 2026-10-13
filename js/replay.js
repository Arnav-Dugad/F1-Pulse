(async () => {
    initPage('replay');
    const $ = id => document.getElementById(id), esc = PulseLab.esc, asArray = value => Array.isArray(value) ? value : [];
    const parameters = new URLSearchParams(location.search), year = new Date().getUTCFullYear();
    const saved = PulseStore.read('last-replay', {});
    let calendar = [], calendarToken = 0, loadToken = 0, model = null, current = 0, playing = false, frame = null, previousFrame = null, lastPaint = 0;
    let events = [], extraEvents = {}, geometry = null, eventsPending = false, eventsLoaded = false;
    $('replay-season').innerHTML = Array.from({ length: year - 2022 }, (_, index) => `<option value="${year - index}">${year - index}</option>`).join('');
    const requestedSeason = Number(parameters.get('season') || saved.season); if (requestedSeason >= 2023 && requestedSeason <= year) $('replay-season').value = String(requestedSeason);
    const name = driver => driver.last_name || driver.full_name || `#${driver.driver_number}`;
    const color = driver => /^[0-9a-f]{6}$/i.test(driver.team_colour || '') ? `#${driver.team_colour}` : '#91a1b8';
    const seconds = value => { const n = PulseLab.num(value); return n === null ? (value === null || value === undefined ? '—' : String(value)) : n === 0 ? '0.000' : `+${n.toFixed(3)}`; };
    const duration = value => { const n = PulseLab.num(value); return n === null ? '—' : formatLapTime(n); };
    const clock = time => { const elapsed = Math.max(0, Math.floor((time - (model?.start || time)) / 1000)); return `${Math.floor(elapsed / 3600).toString().padStart(2, '0')}:${Math.floor(elapsed % 3600 / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`; };
    function stop() { playing = false; cancelAnimationFrame(frame); previousFrame = null; $('replay-play').textContent = 'Play'; }
    function setTime(time) { if (!model) return; current = Math.max(model.start, Math.min(model.end, time)); $('replay-time').value = String(Math.round((current - model.start) / 1000)); render(); }
    function animate(timestamp) {
        if (!playing || !model) return;
        if (document.hidden) { stop(); return; }
        if (previousFrame !== null) current = Math.min(model.end, current + (timestamp - previousFrame) * Number($('replay-speed').value));
        previousFrame = timestamp;
        if (timestamp - lastPaint >= 180 || current >= model.end) { render(); lastPaint = timestamp; }
        if (current >= model.end) { stop(); return; }
        frame = requestAnimationFrame(animate);
    }
    async function loadCalendar() {
        const run = ++calendarToken, season = $('replay-season').value;
        $('replay-race').innerHTML = '<option value="">Loading completed races…</option>'; $('load-replay').disabled = true;
        try {
            const races = await F1API.getSchedule(season); if (run !== calendarToken) return;
            calendar = races.filter(race => Date.parse(`${race.date}T${race.time || '23:59:59Z'}`) < Date.now() - 4 * 3600000);
            $('replay-race').innerHTML = calendar.length ? [...calendar].reverse().map(race => `<option value="${race.round}">R${race.round} · ${esc(race.raceName)}</option>`).join('') : '<option value="">No completed races available</option>';
            const desired = parameters.get('round') || saved.round; if (calendar.some(race => String(race.round) === String(desired))) $('replay-race').value = String(desired);
            $('load-replay').disabled = !calendar.length; PulseUI.registerData({ schedule: races });
        } catch { if (run === calendarToken) { $('replay-race').innerHTML = '<option value="">Calendar unavailable</option>'; $('replay-status').textContent = 'Calendar unavailable. Choose the season again to retry.'; } }
    }
    async function load() {
        const race = calendar.find(row => String(row.round) === $('replay-race').value); if (!race) return;
        const run = ++loadToken; stop(); $('replay-content').hidden = true; $('replay-status').textContent = 'Finding the recorded Grand Prix session…';
        $('load-replay').disabled = true; geometry = null; extraEvents = {}; eventsLoaded = false; eventsPending = false;
        try {
            const meetings = await F1API.getOpenF1Archive('meetings', { year: race.season });
            if (run !== loadToken) return;
            const meeting = findOpenF1Meeting(asArray(meetings), race); if (!meeting) throw new Error('No matching OpenF1 weekend is available for this race. Try another completed Grand Prix.');
            const sessions = await F1API.getOpenF1Archive('sessions', { meeting_key: meeting.meeting_key });
            if (run !== loadToken) return;
            const session = findOpenF1RaceSession(asArray(sessions));
            if (!session) throw new Error('The main-race session is unavailable. Sprint and practice data are never substituted.');
            const end = Date.parse(session.date_end);
            if (!Number.isFinite(end) || end + 30 * 60000 >= Date.now()) throw new Error('This session is still inside the provider’s live window. Choose an older race for a free historical replay.');
            $('replay-status').textContent = 'Loading recorded laps, running order, gaps and tyres. Large races can take a moment…';
            const key = session.session_key;
            const results = await Promise.allSettled([
                F1API.getOpenF1Archive('drivers', { session_key: key }), F1API.getOpenF1Archive('laps', { session_key: key }),
                F1API.getOpenF1Archive('position', { session_key: key }), F1API.getOpenF1Archive('intervals', { session_key: key }),
                F1API.getOpenF1Archive('stints', { session_key: key }), F1API.getRaceResults(race.season, race.round)
            ]);
            if (run !== loadToken) return;
            const value = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;
            const drivers = asArray(value(0, [])).filter(driver => Number.isFinite(Number(driver.driver_number)) && Number(driver.driver_number) > 0), laps = asArray(value(1, []));
            if (!drivers.length || !laps.length) throw new Error('Driver or lap timing data is unavailable. Load the replay again, or choose another race.');
            model = PulseLab.prepareReplay({ race, session, drivers, laps, positions: asArray(value(2, [])), intervals: asArray(value(3, [])), stints: asArray(value(4, [])), results: value(5, null)?.Results || [] });
            if (!Number.isFinite(model.start) || !Number.isFinite(model.end) || model.end <= model.start) throw new Error('The recorded timing coverage cannot form a replay. Try another race.');
            current = model.start; events = PulseLab.replayEvents(model); $('replay-title').textContent = `${race.raceName} · ${race.season}`;
            $('replay-follow').innerHTML = drivers.map(driver => `<option value="${driver.driver_number}">${esc(driver.full_name || name(driver))} · #${driver.driver_number}</option>`).join('');
            $('replay-compare').innerHTML = '<option value="">Choose a second driver</option>' + $('replay-follow').innerHTML;
            const favouriteIds = PulseStore.favourites('driver'), favouriteResult = model.results.find(result => favouriteIds.includes(result.Driver?.driverId));
            const initial = favouriteResult && drivers.find(driver => Number(driver.driver_number) === Number(favouriteResult.Driver.permanentNumber));
            if (initial) $('replay-follow').value = String(initial.driver_number);
            $('replay-time').max = String(Math.ceil((model.end - model.start) / 1000)); $('replay-time').value = '0';
            $('replay-lap-jump').innerHTML = Array.from({ length: model.maxLap }, (_, index) => `<option value="${index + 1}">Lap ${index + 1}</option>`).join('');
            $('replay-content').hidden = false;
            $('replay-status').textContent = `OpenF1 historical records · ${drivers.length} drivers · ${laps.length} lap observations · ${new Date(model.start).toLocaleString()}.${results.slice(0, 5).some(result => result.status === 'rejected') ? ' Some feeds are unavailable; missing gaps, compounds or positions stay unknown.' : ''}`;
            $('replay-track').innerHTML = '<p class="muted small">Loading the circuit outline from one recorded lap…</p>';
            $('replay-load-events').textContent = 'Load pit stops & race-control events'; $('replay-load-events').disabled = false;
            PulseStore.write('last-replay', { season: race.season, round: race.round }); renderEvents(); render(); await loadGeometry(run);
        } catch (error) { if (run === loadToken) $('replay-status').textContent = error.message || 'Replay unavailable. Try again.'; }
        finally { if (run === loadToken) $('load-replay').disabled = !calendar.length; }
    }
    async function loadGeometry(run) {
        const preferred = model.laps.get($('replay-follow').value) || [];
        const all = [...preferred, ...[...model.laps.values()].flat()];
        const lap = all.find(row => Number(row.lap_number) >= 2 && Number(row.lap_duration) > 30 && !row.is_pit_out_lap);
        if (!lap) { $('replay-track').innerHTML = '<p class="muted small">Circuit coordinates are unavailable. Timing replay is ready below.</p>'; return; }
        try {
            const coordinates = await F1API.getOpenF1Archive('location', { session_key: model.session.session_key, driver_number: lap.driver_number, 'date>': new Date(lap.t).toISOString(), 'date<': new Date(lap.t + Number(lap.lap_duration) * 1000).toISOString() });
            if (run !== loadToken) return;
            geometry = PulseLab.trackGeometry(asArray(coordinates));
            if (!geometry) throw new Error('No circuit shape');
            const path = geometry.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
            $('replay-track').innerHTML = `<svg viewBox="0 0 700 420" role="img" aria-label="Approximate lap-progress map from recorded circuit coordinates"><path class="track-shadow" d="${path}"/><path class="track-line" d="${path}"/>${model.drivers.map(driver => `<g id="replay-car-${driver.driver_number}"><circle r="10" fill="${color(driver)}" stroke="var(--f1-surface)" stroke-width="2"/><text text-anchor="middle" dominant-baseline="central">${driver.driver_number}</text></g>`).join('')}</svg>`;
            render();
        } catch { if (run === loadToken) $('replay-track').innerHTML = '<p class="muted small">Circuit coordinates are unavailable. The timing replay and comparisons remain usable.</p>'; }
    }
    function render() {
        if (!model) return;
        const state = PulseLab.replayState(model, current), followed = $('replay-follow').value, other = $('replay-compare').value;
        $('replay-clock').textContent = `${clock(current)} / ${clock(model.end)}`; $('replay-time').value = String(Math.round((current - model.start) / 1000));
        const lead = state.find(row => row.position === 1); $('replay-lap-label').textContent = lead ? `Leader lap ${lead.lap || '—'} / ${model.maxLap}` : 'Recorded race time';
        $('replay-timing').innerHTML = `<table class="lab-table"><thead><tr><th>Pos</th><th>Driver</th><th>Lap</th><th>Gap</th><th>Tyre</th></tr></thead><tbody>${state.map(row => `<tr data-followed="${row.id === followed}"><td>${row.position ?? '—'}</td><td><button class="timing-name" data-replay-driver="${row.id}" aria-pressed="${row.id === followed}"><span class="driver-dot" style="background:${color(row.driver)}"></span>${esc(name(row.driver))}</button></td><td>${row.lap || '—'}</td><td>${esc(row.position === 1 && row.gap === null ? 'Leader' : seconds(row.gap))}</td><td>${esc(row.compound)}${row.tyreAge === null ? '' : ` · ${row.tyreAge}`}</td></tr>`).join('')}</tbody></table>`;
        for (const row of state) {
            const marker = document.getElementById(`replay-car-${row.id}`); if (!marker || !geometry) continue;
            const point = PulseLab.routePoint(geometry, row.progress); marker.setAttribute('transform', `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})`);
            marker.style.opacity = row.lap ? (row.id === followed || row.id === other ? '1' : '.45') : '0'; marker.querySelector('circle').setAttribute('r', row.id === followed ? '13' : '9');
        }
        const selected = [state.find(row => row.id === followed), state.find(row => row.id === other)].filter(Boolean);
        $('replay-driver-comparison').innerHTML = `<div class="table-wrapper"><table class="lab-table"><thead><tr><th>Metric</th>${selected.map(row => `<th>${esc(name(row.driver))}</th>`).join('')}</tr></thead><tbody>${[
            ['Position', row => row.position === null ? '—' : `P${row.position}`], ['Current lap', row => row.lap || '—'], ['Last completed lap', row => duration(row.lastLap)],
            ['Recent pace', row => `${duration(row.pace)}${row.sample ? ` · ${row.sample} laps` : ''}`], ['Gap to leader', row => seconds(row.gap)], ['Tyre', row => row.compound], ['Tyre age', row => row.tyreAge === null ? '—' : `${row.tyreAge} laps`]
        ].map(([label, value]) => `<tr><th>${label}</th>${selected.map(row => `<td>${esc(value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${!other ? '<p class="muted small">Select a second driver to compare the same replay instant.</p>' : followed === other ? '<p class="notice">Choose a different driver for a meaningful comparison.</p>' : ''}`;
        const close = PulseLab.battles(state);
        $('replay-battles').innerHTML = close.length ? close.slice(0, 6).map(battle => `<article class="battle-card"><strong>${esc(name(battle.behind.driver))} → ${esc(name(battle.ahead.driver))}</strong><span>${battle.gap.toFixed(3)}s behind${battle.paceDelta === null ? '' : ` · recent pace ${battle.paceDelta < 0 ? Math.abs(battle.paceDelta).toFixed(3) + 's quicker' : battle.paceDelta.toFixed(3) + 's slower'}`}${battle.tyreDifference ? ' · different compounds' : ''}</span></article>`).join('') : '<p class="muted small">No qualifying close battle at this timestamp, or interval data is unavailable.</p>';
    }
    function renderEvents() {
        if (!model) return;
        const kind = $('replay-event-filter').value, followed = $('replay-follow').value;
        const filtered = events.filter(event => (kind === 'all' || event.kind === kind) && (!$('replay-follow-only').checked || event.driver === followed));
        const names = new Map(model.drivers.map(driver => [String(driver.driver_number), name(driver)]));
        const readable = text => text.replace(/#(\d+)/g, (_, id) => `${names.get(id) || 'Driver'} #${id}`);
        $('replay-event-count').textContent = `${filtered.length} events${filtered.length > 150 ? ' · first 150 shown; narrow the filters' : ''}`;
        $('replay-events').innerHTML = filtered.slice(0, 150).map(event => `<button class="event-row" type="button" data-event-time="${event.t}"><time>${clock(event.t)}</time><span><strong>${esc(readable(event.label))}</strong><small>${esc(event.detail)}</small></span></button>`).join('') || '<p class="muted small">No events match these filters. Load the additional feeds for pit stops and race-control messages.</p>';
    }
    async function loadEvents() {
        if (!model || eventsPending || eventsLoaded) return;
        const run = loadToken; eventsPending = true; $('replay-load-events').disabled = true; $('replay-load-events').textContent = 'Loading event feeds…';
        const results = await Promise.allSettled(['pit', 'race_control', 'overtakes'].map(endpoint => F1API.getOpenF1Archive(endpoint, { session_key: model.session.session_key })));
        if (run !== loadToken) return;
        extraEvents = { pit: results[0].status === 'fulfilled' ? asArray(results[0].value) : [], control: results[1].status === 'fulfilled' ? asArray(results[1].value) : [], overtakes: results[2].status === 'fulfilled' ? asArray(results[2].value) : [] };
        events = PulseLab.replayEvents(model, extraEvents); eventsPending = false; eventsLoaded = results.every(row => row.status === 'fulfilled');
        $('replay-load-events').disabled = eventsLoaded; $('replay-load-events').textContent = eventsLoaded ? 'Additional event feeds loaded' : 'Some feeds unavailable · Retry events'; renderEvents();
        if (!eventsLoaded) PulseUI.toast('Some historical event feeds are unavailable. Recorded position changes remain usable.');
    }
    function snapshots() {
        if (!model) return;
        $('replay-snapshots').innerHTML = [-10000, 10000].map(offset => { const time = Math.max(model.start, Math.min(model.end, current + offset)), state = PulseLab.replayState(model, time); return `<article><h3>${offset < 0 ? 'Before' : 'After'} · ${clock(time)}</h3><div class="table-wrapper"><table class="lab-table"><thead><tr><th>Pos</th><th>Driver</th><th>Gap</th><th>Tyre</th></tr></thead><tbody>${state.map(row => `<tr><td>${row.position ?? '—'}</td><td>${esc(name(row.driver))}</td><td>${esc(seconds(row.gap))}</td><td>${esc(row.compound)}</td></tr>`).join('')}</tbody></table></div></article>`; }).join('');
    }
    $('replay-form').addEventListener('submit', event => { event.preventDefault(); load(); });
    $('replay-season').addEventListener('change', () => { ++loadToken; stop(); $('replay-content').hidden = true; loadCalendar(); });
    $('replay-play').addEventListener('click', () => { if (!model) return; if (playing) { stop(); return; } if (current >= model.end) setTime(model.start); playing = true; previousFrame = null; $('replay-play').textContent = 'Pause'; frame = requestAnimationFrame(animate); });
    $('replay-reset').addEventListener('click', () => { stop(); if (model) setTime(model.start); });
    $('replay-time').addEventListener('input', () => { stop(); if (model) setTime(model.start + Number($('replay-time').value) * 1000); });
    $('replay-follow').addEventListener('change', () => { render(); renderEvents(); }); $('replay-compare').addEventListener('change', render);
    $('replay-timing').addEventListener('click', event => { const button = event.target.closest('[data-replay-driver]'); if (button) { $('replay-follow').value = button.dataset.replayDriver; render(); renderEvents(); } });
    $('replay-lap-jump').addEventListener('change', () => { if (!model) return; const lap = Number($('replay-lap-jump').value), winner = model.results[0]?.Driver?.permanentNumber; const rows = model.laps.get(String(winner)) || model.laps.get($('replay-follow').value) || []; const entry = rows.find(row => Number(row.lap_number) === lap); if (entry) { stop(); setTime(entry.t); } else PulseUI.toast('No timestamp is recorded for that driver’s lap.'); });
    $('replay-load-events').addEventListener('click', loadEvents);
    $('replay-event-filter').addEventListener('change', renderEvents); $('replay-follow-only').addEventListener('change', renderEvents);
    $('replay-events').addEventListener('click', event => { const button = event.target.closest('[data-event-time]'); if (button) { stop(); setTime(Number(button.dataset.eventTime)); snapshots(); } });
    $('replay-pit-jump').addEventListener('click', async () => { await loadEvents(); const next = events.find(event => event.kind === 'pit' && event.t > current); if (next) { stop(); setTime(next.t); snapshots(); } else PulseUI.toast('No later pit event is available in the loaded feed.'); });
    $('replay-snapshot').addEventListener('click', () => { stop(); snapshots(); }); window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    await loadCalendar(); if (parameters.has('round') && calendar.length) await load();
})();
