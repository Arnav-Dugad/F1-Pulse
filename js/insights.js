(async () => {
    initPage('insights');
    const $ = id => document.getElementById(id), esc = PulseLab.esc;
    let token = 0, model = null;
    const year = new Date().getUTCFullYear();
    $('insights-season').innerHTML = Array.from({ length: year - 2009 }, (_, i) => `<option value="${year - i}">${year - i}</option>`).join('');
    function table(rows, columns) {
        return `<table class="lab-table"><thead><tr>${columns.map(([name]) => `<th>${esc(name)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function render() {
        if (!model) return;
        const cards = PulseLab.insights(model), ids = PulseStore.favourites('driver'), favouriteTeams = PulseStore.favourites('team');
        const favourites = model.drivers.filter(row => ids.includes(row.Driver.driverId) || row.Constructors?.some(team => favouriteTeams.includes(team.constructorId)));
        if (favourites.length) cards.unshift({ id: 'personal', title: 'Your followed grid', text: favourites.map(row => `${row.Driver.familyName}: P${row.position}, ${row.points} pts`).join(' · '),
            evidence: favourites.map(row => ({ label: row.Driver.familyName, href: `driver-profile.html?driver=${encodeURIComponent(row.Driver.driverId)}`, detail: 'Published standings' })), method: 'Your saved driver and team preferences matched to this season’s published standings.' });
        $('insight-feed').innerHTML = cards.map(card => `<article class="insight-card"><p class="eyebrow">${card.id === 'personal' ? 'For you' : card.id === 'week' ? 'Past seven days' : 'Recorded facts'}</p><h2>${esc(card.title)}</h2><p>${esc(card.text)}</p><div class="evidence-links">${card.evidence.map(source => `<a href="${esc(source.href)}" title="${esc(source.detail)}">${esc(source.label)} ↗</a>`).join('')}</div><details class="method-note"><summary>Why this insight?</summary><p>${esc(card.method)}</p></details></article>`).join('');
        const next = model.schedule.find(race => Date.parse(`${race.date}T${race.time || '23:59:59Z'}`) > Date.now());
        $('personal-weekend').innerHTML = next ? `<h3>${esc(next.raceName)}</h3><p class="muted">${esc(next.Circuit?.circuitName)} · ${esc(next.Circuit?.Location?.country)}</p><div class="stat-strip">${collectRaceSessions(next).map(session => `<article class="stat-tile"><span>${esc(session.label)}</span><strong class="session-time">${esc(formatLocalSessionDateTime(new Date(session.ts), { compact: true }))}</strong><small>${esc(getLocalTimeZoneLabel())}</small></article>`).join('')}</div><p>${favourites.length ? `${esc(favourites.map(row => row.Driver.familyName).join(', '))}: inspect recent form and comparisons before the next session.` : 'Follow drivers or teams to personalize this briefing.'}</p><div class="controls-row"><a class="ui-btn ui-btn-secondary" href="${PulseLab.raceURL(next)}">Open weekend</a><button class="text-button" id="briefing-calendar">Add weekend to calendar</button></div>` : '<p class="muted">No upcoming weekend is published in this selected season. Choose the current season for a future briefing.</p>';
        $('briefing-calendar')?.addEventListener('click', () => downloadRaceCalendar([next], 'f1-pulse-weekend.ics'));
        const leader = model.drivers[0], total = model.drivers.reduce((sum, row) => sum + Number(row.points), 0), runnerUp = model.drivers[1], completed = model.races.length;
        $('chart-stories').innerHTML = `<article><h3>Driver championship</h3><p class="muted">${leader ? `${esc(leader.Driver.familyName)} has ${esc(leader.points)} points${runnerUp ? `, ${Number(leader.points) - Number(runnerUp.points)} more than ${esc(runnerUp.Driver.familyName)}` : ''}. The leader holds ${total ? (Number(leader.points) / total * 100).toFixed(1) : '0.0'}% of the points across the listed drivers.` : 'Standings unavailable.'}</p><a class="section-link" href="drivers.html">Inspect the standings →</a></article><article><h3>Season progress</h3><p class="muted">${completed} Grand Prix classifications are loaded${model.schedule.length ? ` from a ${model.schedule.length}-race published calendar` : ''}. Completed classifications are counted from results, not simply from dates. Missing sprint rows are reported separately.</p><a class="section-link" href="championship.html?season=${model.season}">Explore points history →</a></article>`;
        const prediction = PulseLab.forecast(model.races), evaluation = PulseLab.backtest(model.races);
        $('forecast-cards').innerHTML = prediction.slice(0, 3).map(row => `<article class="stat-tile"><span>Form rank ${row.position}</span><strong>${esc(row.Driver.familyName)}</strong><small>${row.estimate.toFixed(1)} weighted classification · ${row.sample} starts</small></article>`).join('') || '<p class="muted">More completed races are needed for a form ranking.</p>';
        $('forecast-evaluation').innerHTML = evaluation.races ? `<div class="stat-strip">${[['Evaluated races', evaluation.races, 'Each estimate used only earlier races'], ['Winner accuracy', `${(evaluation.winnerAccuracy * 100).toFixed(1)}%`, 'Top form pick vs actual winner'], ['Simple baseline', `${(evaluation.baselineAccuracy * 100).toFixed(1)}%`, 'Previous winner wins again'], ['Position error', evaluation.meanError.toFixed(1), `${evaluation.samples} driver predictions · mean absolute error`]].map(([label, value, note]) => `<article class="stat-tile"><span>${label}</span><strong>${esc(value)}</strong><small>${note}</small></article>`).join('')}</div><p class="chart-explanation">An average position error of ${evaluation.meanError.toFixed(1)} means the ranking missed each driver’s actual classification by that many places on average. This historical evaluation is not a calibrated probability for the next race.</p>` : '<p class="notice">At least four completed races are needed for an evaluation. No accuracy score is invented from an empty sample.</p>';
        $('forecast-evidence').innerHTML = table(evaluation.evaluations, [['Race', row => `<a href="${PulseLab.raceURL(row.race)}">${esc(row.race.raceName)}</a>`], ['Form pick', row => esc(PulseLab.fullName(row.predicted))], ['Actual winner', row => esc(PulseLab.fullName(row.winner))], ['Winner matched', row => row.correct ? 'Yes' : 'No']]);
    }
    async function load() {
        const run = ++token, season = $('insights-season').value; $('insights-content').hidden = true; $('insights-status').textContent = 'Loading published records and building your briefing…';
        const results = await Promise.allSettled([F1API.getDriverStandings(season), F1API.getConstructorStandings(season), F1API.getSeasonResults(season), F1API.getSeasonSprints(season), F1API.getSchedule(season)]);
        if (run !== token) return;
        const value = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;
        const drivers = value(0, []), races = value(2, []);
        if (!drivers.length && !races.length) { $('insights-status').textContent = 'The data provider is unavailable. Refresh the briefing to try again.'; return; }
        model = { season, drivers, teams: value(1, []), races, sprints: value(3, []), schedule: value(4, []), previous: PulseStore.read(`insight-snapshot:${season}`, null) };
        PulseUI.registerData({ drivers, teams: model.teams, races, schedule: model.schedule }); render();
        if (drivers.length) PulseStore.write(`insight-snapshot:${season}`, { season, at: Date.now(), points: Object.fromEntries(drivers.map(row => [row.Driver.driverId, Number(row.points)])) });
        $('insights-content').hidden = false;
        $('insights-status').textContent = `Jolpica published records · ${season} · Rule-based explanations, not AI-generated claims.${results.some(row => row.status === 'rejected') ? ' Some sources are unavailable; missing data is not treated as zero.' : ''}`;
    }
    function answer(question) {
        if (!model) return 'Load a briefing first.';
        const query = question.toLowerCase(), leader = model.drivers[0], recent = model.races.at(-1);
        const term = Object.keys(PulseLab.glossary).find(name => query.includes(name.toLowerCase()));
        if (term) return `${term}: ${PulseLab.glossary[term]}\n\nMethod: F1 glossary. For a number in the briefing, inspect its source link.`;
        if (/forecast|predict|estimate/.test(query)) { const evaluation = PulseLab.backtest(model.races); return `The form ranking uses the last three classifications with weights 1, 2 and 3. Lower is better. Only prior races are used when evaluating it.\n\n${evaluation.races ? `${evaluation.races} held-out races: winner accuracy ${(evaluation.winnerAccuracy * 100).toFixed(1)}%, average classification error ${evaluation.meanError.toFixed(1)} positions.` : 'There are not enough recorded races for a historical evaluation.'}\n\nIt does not model qualifying, circuit characteristics or weather and does not claim a probability.`; }
        if (/favourite|favorite|follow/.test(query)) { const rows = model.drivers.filter(row => PulseStore.isFavourite('driver', row.Driver.driverId) || row.Constructors?.some(team => PulseStore.isFavourite('team', team.constructorId))); return rows.length ? rows.map(row => `${PulseLab.fullName(row.Driver)}: P${row.position}, ${row.points} points, ${row.wins} wins.`).join('\n') + '\n\nSource: published driver standings for the selected season.' : 'No followed drivers or teams match this season. Open Preferences to choose favourites.'; }
        if (/latest|last race|what happened/.test(query)) return recent?.Results?.length ? `${recent.raceName}: ${PulseLab.fullName(recent.Results[0].Driver)} won.\nPodium: ${recent.Results.slice(0, 3).map(row => `P${row.position} ${row.Driver.familyName}`).join(', ')}.\n${recent.Results.filter(row => PulseLab.finished(row.status)).length} of ${recent.Results.length} entries finished; lapped finishers are included.\n\nSource: R${recent.round} final race classification. This summary does not infer the reasons for a result.` : 'Latest-race results are unavailable in this briefing.';
        if (/leader|leads|championship|first/.test(query)) return leader ? `${PulseLab.fullName(leader.Driver)} leads the selected season with ${leader.points} points and ${leader.wins} wins.${model.drivers[1] ? ` The points gap to ${model.drivers[1].Driver.familyName} is ${Number(leader.points) - Number(model.drivers[1].points)}.` : ''}\n\nSource: published driver championship standings.` : 'Standings are unavailable.';
        const driver = model.drivers.find(row => query.includes(row.Driver.familyName.toLowerCase()));
        if (driver) return `${PulseLab.fullName(driver.Driver)}: P${driver.position}, ${driver.points} points, ${driver.wins} wins.\n\nSource: the selected season’s published standings. Open Championship Lab for the race/sprint point breakdown.`;
        return 'I can explain the championship leader, latest race, your favourites, the forecast, a driver’s standings or glossary terms such as countback.\n\nFor broader questions, the optional local Ollama assistant can use this public briefing as context.';
    }
    $('insights-form').addEventListener('submit', event => { event.preventDefault(); load(); });
    $('assistant-form').addEventListener('submit', event => { event.preventDefault(); $('assistant-answer').textContent = answer($('assistant-question').value); });
    document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => { $('assistant-question').value = button.dataset.question; $('assistant-answer').textContent = answer(button.dataset.question); }));
    $('open-local-assistant').addEventListener('click', () => {
        if (!model) return;
        const context = { season: model.season, source: 'Jolpica published records', capturedAt: new Date().toISOString(),
            standings: model.drivers.map(row => ({ driver: PulseLab.fullName(row.Driver), position: row.position, points: row.points, wins: row.wins, following: PulseStore.isFavourite('driver', row.Driver.driverId) })),
            latestRace: model.races.at(-1) ? { name: model.races.at(-1).raceName, source: PulseLab.raceURL(model.races.at(-1)), results: model.races.at(-1).Results?.slice(0, 10).map(row => ({ driver: PulseLab.fullName(row.Driver), position: row.position, status: row.status, points: row.points })) } : null,
            forecastMethod: 'Weighted classification of previous three races; not a calibrated probability' };
        window.open(`http://127.0.0.1:8788/#${encodeURIComponent(JSON.stringify(context))}`, '_blank', 'noopener,noreferrer');
    });
    window.addEventListener('pulse:favourites', render);
    await load();
})();
