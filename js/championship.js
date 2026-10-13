(async () => {
    initPage('championship');
    const $ = id => document.getElementById(id), esc = PulseLab.esc;
    let token = 0, model = null, cursor = 0, timer = null, assignments = {};
    const year = new Date().getUTCFullYear();
    $('lab-season').innerHTML = Array.from({ length: year - 2009 }, (_, index) => `<option value="${year - index}">${year - index}</option>`).join('');
    const requested = Number(new URLSearchParams(location.search).get('season')); if (requested >= 2010 && requested <= year) $('lab-season').value = String(requested);
    const points = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    function table(rows, columns) {
        return `<table class="lab-table"><thead><tr>${columns.map(([name]) => `<th>${esc(name)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function drawHistory() {
        const snapshots = model.history;
        if (!snapshots.length) { $('history-standings').textContent = 'No published classification history.'; $('history-chart').textContent = ''; return; }
        const snapshot = snapshots[cursor], changed = PulseLab.changes(snapshot.standings, snapshot.before);
        $('history-label').textContent = snapshot.label;
        $('history-standings').innerHTML = table(changed.slice(0, 12), [
            ['Position', row => `P${row.position}${row.tied ? ' · tie' : ''}`], ['Driver', row => esc(PulseLab.fullName(row.Driver))], ['Points', row => points(row.points)],
            ['This session', row => `${row.change > 0 ? '+' : ''}${points(row.change)}`], ['Movement', row => row.movement === null ? '—' : row.movement > 0 ? `↑ ${row.movement}` : row.movement < 0 ? `↓ ${-row.movement}` : '—']
        ]);
        const winner = changed.find(row => row.change > 0);
        $('history-explanation').textContent = `${snapshot.standings[0]?.Driver.familyName || 'The leader'} leads with ${points(snapshot.standings[0]?.points || 0)} recorded points at this event.${winner ? ` ${winner.Driver.familyName} added ${points(winner.change)} points in this session.` : ''} Select a different event to inspect how totals changed.`;
        const favourite = PulseStore.favourites('driver');
        const ids = [...new Set([...model.official.slice(0, 4).map(row => row.Driver.driverId), ...favourite])].slice(0, 6);
        const width = 800, height = 240, left = 46, right = 20, top = 16, bottom = 36;
        const max = Math.max(1, ...snapshots.slice(0, cursor + 1).flatMap(event => event.standings.filter(row => ids.includes(row.id)).map(row => row.points)));
        const x = index => left + index / Math.max(snapshots.length - 1, 1) * (width - left - right), y = value => height - bottom - value / max * (height - top - bottom);
        const series = ids.map(id => {
            const entry = model.official.find(row => row.Driver.driverId === id), historical = model.book.drivers.get(id);
            const color = getTeamColor(entry?.Constructors?.[0]?.constructorId || historical?.team);
            const name = entry?.Driver.familyName || historical?.Driver.familyName || id;
            const path = snapshots.slice(0, cursor + 1).map((event, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(event.standings.find(row => row.id === id)?.points || 0).toFixed(1)}`).join(' ');
            return { color, name, path };
        });
        const grid = [0, .5, 1].map(fraction => `<line class="chart-grid" x1="${left}" y1="${y(max * fraction)}" x2="${width - right}" y2="${y(max * fraction)}"/><text x="${left - 8}" y="${y(max * fraction) + 4}" text-anchor="end">${points(max * fraction)}</text>`).join('');
        $('history-chart').innerHTML = `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorded cumulative championship points up to ${esc(snapshot.label)}">${grid}${series.map(row => `<path d="${row.path}" stroke="${row.color}" stroke-width="2.5" fill="none"/>`).join('')}<line x1="${x(cursor)}" x2="${x(cursor)}" y1="${top}" y2="${height - bottom}" stroke="var(--f1-gray)" stroke-dasharray="4 4"/><text x="${left}" y="${height - 9}">Season start</text><text x="${width - right}" y="${height - 9}" text-anchor="end">${snapshots.length} recorded sessions</text></svg><div class="chart-legend">${series.map(row => `<span><i class="driver-dot" style="background:${row.color}"></i>${esc(row.name)}</span>`).join('')}</div>`;
    }
    function drawTitleBounds() {
        const rows = model.official.map(row => ({ id: row.Driver.driverId, Driver: row.Driver, points: Number(row.points) }));
        if (!model.schedule.length) {
            $('title-stats').innerHTML = ''; $('title-bounds').innerHTML = '<p class="notice">Calendar unavailable. Maximum points and title-clinching bounds cannot be calculated. Reload the season to retry.</p>';
            $('lead-history').textContent = 'Recorded standings history remains available above.'; return;
        }
        const bounds = PulseLab.titleBounds(rows, model.events), leader = bounds[0];
        const races = model.events.filter(event => event.kind === 'race').length, sprints = model.events.filter(event => event.kind === 'sprint').length;
        $('title-stats').innerHTML = [['Published leader', model.official[0]?.Driver.familyName || '—', `${model.official[0]?.points || 0} points`], ['Remaining races', races, 'Future or pending sessions'], ['Remaining sprints', sprints, 'Separate sprint awards'], ['Maximum available', leader?.remaining || 0, 'Full-distance scoring']].map(([label, value, detail]) => `<article class="stat-tile"><span>${label}</span><strong>${esc(value)}</strong><small>${detail}</small></article>`).join('');
        $('title-bounds').innerHTML = table(bounds.slice(0, 12), [['Driver', row => esc(row.Driver.familyName)], ['Now', row => points(row.points)], ['Maximum', row => points(row.maximum)], ['Possibility', row => row.clinched ? 'Title secured on points' : row.eliminated ? 'Below the current leader even at maximum' : row.tiePossible ? 'Can only tie the current leader' : 'Still mathematically possible']]);
        $('title-bounds').insertAdjacentHTML('afterend', `<p class="muted small title-guarantee">${leader?.clinched ? `${esc(leader.Driver.familyName)} is beyond every rival’s points ceiling.` : `Conservative guarantee for ${esc(leader?.Driver.familyName || 'the leader')}: ${leader?.guarantee || 0} additional points would exceed every rival’s maximum. ${leader && leader.guarantee > leader.remaining ? 'That bound exceeds the remaining award, so rivals’ results matter.' : 'This is a sufficient points bound, not the smallest clinching combination.'}`}</p>`);
        const leads = PulseLab.leadHistory(model.history);
        $('lead-history').innerHTML = `${leads.largest ? `<p><strong>${esc(leads.largest.driver.Driver.familyName)}</strong> held the largest recorded lead: <strong>${points(leads.largest.gap)} points</strong> after ${esc(leads.largest.snapshot.label)}.</p>` : '<p class="muted">No recorded lead history yet.</p>'}<div class="lead-log">${leads.changes.map(entry => `<a href="${PulseLab.raceURL(entry.snapshot.race)}"><span>${esc(entry.snapshot.label)}</span><strong>${esc(entry.driver.Driver.familyName)}</strong></a>`).join('') || '<p class="muted small">No change of leader in the loaded history.</p>'}</div>`;
    }
    function drawScenarioEditor() {
        const event = model.events.find(row => `${row.round}:${row.kind}` === $('scenario-session').value);
        if (!event) { $('scenario-editor').textContent = 'No future sessions available to simulate for this season.'; $('scenario-fill').disabled = true; drawScenario(); return; }
        $('scenario-fill').disabled = false;
        const key = `${event.round}:${event.kind}`, values = assignments[key] || {};
        $('scenario-editor').innerHTML = table(model.official, [['Driver', row => esc(PulseLab.fullName(row.Driver))], ['Hypothetical finish', row => `<select aria-label="Finish of ${esc(PulseLab.fullName(row.Driver))}" data-scenario-driver="${esc(row.Driver.driverId)}"><option value="0">No points</option>${model.official.map((_, index) => `<option value="${index + 1}" ${Number(values[row.Driver.driverId]) === index + 1 ? 'selected' : ''}>P${index + 1} · ${PulseLab.score(index + 1, event.kind, model.season)} pts</option>`).join('')}</select>`]]);
        $('scenario-editor').querySelectorAll('select').forEach(select => select.addEventListener('change', () => { if (!assignments[key]) assignments[key] = {}; assignments[key][select.dataset.scenarioDriver] = Number(select.value); saveScenario(); drawScenario(); }));
        drawScenario();
    }
    function saveScenario() { PulseStore.write(`scenario:${model.season}`, assignments); }
    function drawScenario() {
        const result = PulseLab.applyScenario(model.official, model.book, model.events, assignments);
        $('scenario-errors').hidden = !result.errors.length; $('scenario-errors').textContent = result.errors.join(' · ');
        $('scenario-output').innerHTML = result.errors.length ? '<p class="notice">Resolve duplicate or invalid positions before viewing a projected championship.</p>' : table(result.rows, [['Position', row => `P${row.position}${row.tied ? ' · tie' : ''}`], ['Driver', row => esc(row.Driver.familyName)], ['Projected points', row => points(row.points)], ['Added', row => `+${points(row.added)}`]]);
    }
    function drawBreakdown() {
        $('points-breakdown').innerHTML = table(model.official, [['Driver', row => esc(PulseLab.fullName(row.Driver))], ['Grand Prix', row => points(model.book.drivers.get(row.Driver.driverId)?.race || 0)], ['Sprint', row => model.sprintsAvailable ? points(model.book.drivers.get(row.Driver.driverId)?.sprint || 0) : 'Unavailable'], ['Published total', row => points(row.points)], ['Difference', row => model.sprintsAvailable ? points(Number(row.points) - (model.book.drivers.get(row.Driver.driverId)?.points || 0)) : 'Not reconciled']]);
        $('constructor-contributions').innerHTML = `<div class="tool-grid">${[...model.book.teams.values()].sort((a, b) => b.points - a.points).map(team => `<article class="panel"><h3>${esc(team.name)} <span class="muted small">${points(team.points)} recorded pts</span></h3><ul class="countback-list">${Object.entries(team.drivers).sort((a, b) => b[1] - a[1]).map(([id, value]) => `<li><span>${esc(model.book.drivers.get(id)?.Driver.familyName || id)}</span><strong>${points(value)} pts · ${team.points ? (value / team.points * 100).toFixed(1) : '0.0'}%</strong></li>`).join('')}</ul></article>`).join('')}</div>`;
    }
    async function load() {
        const run = ++token, season = $('lab-season').value; stopHistory(); $('championship-content').hidden = true; $('championship-status').textContent = 'Loading published results and standings…';
        try {
            const results = await Promise.allSettled([F1API.getDriverStandings(season), F1API.getSchedule(season), F1API.getSeasonResults(season), F1API.getSeasonSprints(season), F1API.getConstructorStandings(season)]);
            if (run !== token) return;
            const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback;
            const official = value(0, []), schedule = value(1, []), races = value(2, []), sprints = value(3, []);
            if (!official.length || !races.length) throw new Error('The standings or result history is unavailable. Try loading the season again.');
            model = { season, official, schedule, races, sprints, sprintsAvailable: results[3].status === 'fulfilled', book: PulseLab.ledger(races, sprints), history: PulseLab.history(races, sprints), events: Number(season) >= 2025 ? PulseLab.remainingEvents(schedule, races, sprints) : [] };
            const saved = PulseStore.read(`scenario:${season}`, {}); assignments = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
            cursor = Math.max(0, model.history.length - 1); $('history-slider').max = String(cursor); $('history-slider').value = String(cursor);
            $('scenario-session').innerHTML = model.events.length ? model.events.map(event => `<option value="${event.round}:${event.kind}">${esc(event.label)}</option>`).join('') : '<option value="">No future sessions</option>';
            document.querySelectorAll('.title-guarantee').forEach(element => element.remove());
            drawHistory(); drawTitleBounds(); drawScenarioEditor(); drawBreakdown();
            $('championship-content').hidden = false; $('championship-status').textContent = `Jolpica published records · ${season} · ${races.length} Grand Prix results · ${sprints.length} sprint results.${!model.sprintsAvailable ? ' Sprint data is unavailable; reconstructed history currently contains race points only.' : ''}${!schedule.length ? ' Calendar unavailable; future title bounds are incomplete.' : ''}`;
            PulseUI.registerData({ drivers: official, teams: value(4, []), schedule, races });
        } catch (error) { if (run === token) $('championship-status').textContent = error.message || 'Championship data unavailable. Try again.'; }
    }
    function stopHistory() { clearInterval(timer); timer = null; $('history-play').textContent = 'Play history'; }
    $('championship-form').addEventListener('submit', event => { event.preventDefault(); load(); });
    $('history-slider').addEventListener('input', () => { stopHistory(); cursor = Number($('history-slider').value); drawHistory(); });
    $('history-play').addEventListener('click', () => { if (timer) { stopHistory(); return; } if (!model?.history.length) return; if (cursor >= model.history.length - 1) cursor = 0; $('history-play').textContent = 'Pause history'; drawHistory(); timer = setInterval(() => { if (document.hidden) return; if (cursor >= model.history.length - 1) { stopHistory(); return; } cursor++; $('history-slider').value = String(cursor); drawHistory(); }, 1100); });
    $('scenario-session').addEventListener('change', drawScenarioEditor);
    $('scenario-fill').addEventListener('click', () => { const key = $('scenario-session').value; if (!key) return; assignments[key] = Object.fromEntries(model.official.map((row, index) => [row.Driver.driverId, index + 1])); saveScenario(); drawScenarioEditor(); });
    $('scenario-clear').addEventListener('click', () => { assignments = {}; saveScenario(); drawScenarioEditor(); });
    $('show-point-ledger').addEventListener('click', () => { if (!model) return; const rows = model.book.events.flatMap(event => event.entries.map(entry => ({ ...entry, event }))); PulseUI.dialog('Recorded points ledger', `<div class="table-wrapper">${table(rows, [['Session', row => `<a href="${PulseLab.raceURL(row.event.race)}">${esc(row.event.label)}</a>`], ['Driver', row => esc(PulseLab.fullName(row.Driver))], ['Points', row => points(row.points)]])}</div>`, 'wide-dialog'); });
    window.addEventListener('pagehide', stopHistory); window.addEventListener('pulse:favourites', () => { if (model) drawHistory(); });
    await load();
})();
