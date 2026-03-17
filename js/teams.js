/* ============================================
   F1 PULSE - Teams Page Logic
   ============================================ */

(async function () {
    initPage('teams');

    const container = document.getElementById('teams-container');
    const tableSection = document.getElementById('table-section');
    const tableContainer = document.getElementById('teams-table');

    const TEAMS_PREFS_KEY = 'f1pulse_teams_prefs_v1';
    const TEAM_UI_ICONS = {
        leader: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H5a2 2 0 0 0 0 4h2"></path><path d="M17 6h2a2 2 0 0 1 0 4h-2"></path></svg>',
        battle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20L18 4"></path><path d="M10 20L22 4"></path><path d="M2 20h20"></path></svg>',
        wins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"></path><path d="M4 18h16"></path><path d="M4 6h16"></path></svg>',
        visible: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M2 12c2.3-4.2 5.7-6.3 10-6.3s7.7 2.1 10 6.3c-2.3 4.2-5.7 6.3-10 6.3S4.3 16.2 2 12z"></path></svg>',
        points: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"></path><path d="M10 19V9"></path><path d="M16 19V12"></path><path d="M22 19V7"></path></svg>',
        momentum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"></path><path d="M14 7h7v7"></path></svg>',
        filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18"></path><path d="M7 12h10"></path><path d="M10 19h4"></path></svg>',
        reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.4 6.4"></path><path d="M3 12A9 9 0 0 1 18.4 5.6"></path><path d="M7 20H5v-2"></path><path d="M17 4h2v2"></path></svg>'
    };
    const teamIcon = (svg) => `<span class="teams-label-icon" aria-hidden="true">${svg}</span>`;

    const tools = ensureTeamsEnhancementUI(container);
    const insightsContainer = tools.insightsContainer;
    const chartsContainer = tools.chartsContainer;
    const formContainer = tools.formContainer;
    const searchInput = tools.searchInput;
    const winsOnlyCheckbox = tools.winsOnlyCheckbox;
    const showAllDriversCheckbox = tools.showAllDriversCheckbox;
    const resetBtn = tools.resetBtn;
    const sortSelect = tools.sortSelect;

    function getTeamsPrefs() {
        try {
            const raw = localStorage.getItem(TEAMS_PREFS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return typeof parsed === 'object' && parsed ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveTeamsPrefs(partial) {
        const next = { ...getTeamsPrefs(), ...partial };
        localStorage.setItem(TEAMS_PREFS_KEY, JSON.stringify(next));
    }

    const state = {
        constructorStandings: [],
        teamDrivers: {},
        teamFormData: {},
        teamFormRounds: [],
        teamFormUpdatedAt: 0,
        showAllDrivers: false,
        sortMode: 'points',
    };

    showLoading(container, 'Loading constructor standings', 'skeleton-cards');

    const seasonLabelEl = document.getElementById('season-label');
    if (seasonLabelEl) {
        seasonLabelEl.textContent = `${new Date().getFullYear()} FIA Formula One World Championship`;
    }

    let enriched = {};
    try {
        enriched = await Promise.race([
            loadEnrichedDrivers(),
            new Promise((resolve) => setTimeout(() => resolve({}), 2500)),
        ]) || {};
    } catch (e) {
        enriched = {};
    }

    const prefs = getTeamsPrefs();
    state.sortMode = prefs.sortMode || 'points';
    state.showAllDrivers = !!prefs.showAllDrivers;
    if (searchInput) searchInput.value = prefs.searchQuery || '';
    if (winsOnlyCheckbox) winsOnlyCheckbox.checked = !!prefs.winsOnly;
    if (showAllDriversCheckbox) showAllDriversCheckbox.checked = state.showAllDrivers;
    if (sortSelect) sortSelect.value = state.sortMode;

    bindFilterEvents();

    try {
        const [constructorStandings, driverStandings] = await Promise.all([
            F1API.getConstructorStandings(),
            F1API.getDriverStandings(),
        ]);

        if (!constructorStandings?.length) {
            showError(container, 'No constructor standings data available yet for this season.');
            return;
        }

        // Fetch team logos from Wikipedia
        await fetchTeamLogos(constructorStandings);

        state.constructorStandings = constructorStandings;
        state.teamDrivers = buildTeamDriversMap(driverStandings);
        await loadTeamFormData(true);
        renderCurrentView();
    } catch (err) {
        showError(container, 'Failed to load constructor standings. Please try again.', 'location.reload()');
        console.error(err);
    }

    function normalizeConstructorId(cId) {
        return resolveTeamId(cId) || cId || null;
    }

    function formatPoints(points) {
        const n = parseFloat(points);
        if (!Number.isFinite(n)) return '0';
        return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }

    function buildTeamDriversMap(driverStandings) {
        const teamDrivers = {};
        if (!driverStandings?.length) return teamDrivers;

        driverStandings.forEach(ds => {
            const rawConstructorId = ds.Constructors?.[0]?.constructorId;
            const constructorId = normalizeConstructorId(rawConstructorId);
            if (!constructorId) return;

            if (!teamDrivers[constructorId]) teamDrivers[constructorId] = [];
            teamDrivers[constructorId].push(ds);
        });

        Object.keys(teamDrivers).forEach(cId => {
            teamDrivers[cId].sort((a, b) => (parseFloat(b.points) || 0) - (parseFloat(a.points) || 0));
        });

        return teamDrivers;
    }

    function getFilteredStandings() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const onlyWinners = winsOnlyCheckbox.checked;

        const filtered = state.constructorStandings.filter(s => {
            const cId = s.Constructor?.constructorId;
            const resolvedId = normalizeConstructorId(cId);
            const wins = parseInt(s.wins, 10) || 0;
            const teamName = getTeamName(cId).toLowerCase();
            const idStr = String(resolvedId || '').toLowerCase();

            const matchesQuery = !query || teamName.includes(query) || idStr.includes(query);
            const matchesWins = !onlyWinners || wins > 0;
            return matchesQuery && matchesWins;
        });

        const sortMode = state.sortMode || 'points';
        if (sortMode === 'wins') {
            filtered.sort((a, b) => (parseInt(b.wins, 10) || 0) - (parseInt(a.wins, 10) || 0));
        } else if (sortMode === 'alphabetical') {
            filtered.sort((a, b) => getTeamName(a.Constructor?.constructorId).localeCompare(getTeamName(b.Constructor?.constructorId)));
        } else {
            filtered.sort((a, b) => (parseFloat(b.points) || 0) - (parseFloat(a.points) || 0));
        }

        return filtered;
    }

    function getClosestBattle(standings) {
        if (!standings?.length || standings.length < 2) return null;
        let closest = null;
        for (let i = 0; i < standings.length - 1; i++) {
            const a = standings[i];
            const b = standings[i + 1];
            const gap = Math.abs((parseFloat(a.points) || 0) - (parseFloat(b.points) || 0));
            if (!closest || gap < closest.gap) {
                closest = { gap, a, b };
            }
        }
        return closest;
    }

    function renderInsights(allStandings, visibleStandings) {
        if (!allStandings?.length) {
            insightsContainer.innerHTML = '';
            return;
        }

        const leader = allStandings[0];
        const leaderPoints = parseFloat(leader.points) || 0;
        const totalPoints = allStandings.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);
        const totalWins = allStandings.reduce((sum, s) => sum + (parseInt(s.wins, 10) || 0), 0);
        const winnersCount = allStandings.filter(s => (parseInt(s.wins, 10) || 0) > 0).length;
        const closestBattle = getClosestBattle(allStandings);

        insightsContainer.innerHTML = `
            <div class="teams-insight-card">
                <span class="label">${teamIcon(TEAM_UI_ICONS.leader)}Championship Leader</span>
                <strong>${teamLogoSmallHTML(leader.Constructor?.constructorId)} ${getConstructorFlag(leader.Constructor?.constructorId)} ${getTeamName(leader.Constructor?.constructorId)}</strong>
                <span class="value">${formatPoints(leaderPoints)} pts</span>
            </div>
            <div class="teams-insight-card">
                <span class="label">${teamIcon(TEAM_UI_ICONS.battle)}Closest Battle</span>
                <strong>${closestBattle ? `${teamLogoSmallHTML(closestBattle.a.Constructor?.constructorId)} ${getTeamName(closestBattle.a.Constructor?.constructorId)} vs ${teamLogoSmallHTML(closestBattle.b.Constructor?.constructorId)} ${getTeamName(closestBattle.b.Constructor?.constructorId)}` : 'N/A'}</strong>
                <span class="value">${closestBattle ? `${formatPoints(closestBattle.gap)} pts` : 'No data'}</span>
            </div>
            <div class="teams-insight-card">
                <span class="label">${teamIcon(TEAM_UI_ICONS.wins)}Total Constructor Wins</span>
                <strong>${totalWins}</strong>
                <span class="value">Across ${winnersCount} team${winnersCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="teams-insight-card">
                <span class="label">${teamIcon(TEAM_UI_ICONS.visible)}Visible Teams</span>
                <strong>${visibleStandings.length} / ${allStandings.length}</strong>
                <span class="value">${totalPoints > 0 ? `${((visibleStandings.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0) / totalPoints) * 100).toFixed(1)}% points share` : '0% points share'}</span>
            </div>`;
    }

    function renderCurrentView() {
        const filteredStandings = getFilteredStandings();
        renderInsights(state.constructorStandings, filteredStandings);
        renderPerformanceCharts(state.constructorStandings, filteredStandings);
        renderTeamFormTrends(filteredStandings);
        renderTeamCards(filteredStandings, state.teamDrivers, state.constructorStandings);
        renderTable(filteredStandings, state.constructorStandings);
    }

    async function loadTeamFormData(force = false) {
        const stale = (Date.now() - state.teamFormUpdatedAt) > 10 * 60 * 1000;
        if (!force && state.teamFormUpdatedAt && !stale) return;

        try {
            const schedule = await F1API.getSchedule();
            const now = new Date();
            const completedRounds = (Array.isArray(schedule) ? schedule : [])
                .filter((race) => new Date(race.date) < now)
                .sort((a, b) => (parseInt(a.round, 10) || 0) - (parseInt(b.round, 10) || 0))
                .slice(-5);

            if (!completedRounds.length) {
                state.teamFormData = {};
                state.teamFormRounds = [];
                state.teamFormUpdatedAt = Date.now();
                return;
            }

            const roundResults = await Promise.allSettled(
                completedRounds.map((race) => F1API.getRaceResults('current', race.round))
            );

            const teamIds = state.constructorStandings
                .map((s) => normalizeConstructorId(s.Constructor?.constructorId))
                .filter(Boolean);

            const formMap = {};
            teamIds.forEach((id) => { formMap[id] = completedRounds.map(() => 0); });

            roundResults.forEach((outcome, idx) => {
                if (outcome.status !== 'fulfilled' || !Array.isArray(outcome.value?.Results)) return;
                const pointsByTeam = {};

                outcome.value.Results.forEach((row) => {
                    const teamId = normalizeConstructorId(row.Constructor?.constructorId);
                    const points = parseFloat(row.points) || 0;
                    if (!teamId) return;
                    pointsByTeam[teamId] = (pointsByTeam[teamId] || 0) + points;
                });

                teamIds.forEach((id) => {
                    formMap[id][idx] = pointsByTeam[id] || 0;
                });
            });

            state.teamFormData = formMap;
            state.teamFormRounds = completedRounds.map((race) => `R${race.round}`);
            state.teamFormUpdatedAt = Date.now();
        } catch (e) {
            state.teamFormData = state.teamFormData || {};
            state.teamFormRounds = state.teamFormRounds || [];
        }
    }

    function renderTeamFormTrends(visibleStandings) {
        if (!formContainer) return;

        if (!visibleStandings?.length) {
            formContainer.innerHTML = '';
            return;
        }

        const roundLabels = state.teamFormRounds || [];
        if (!roundLabels.length) {
            formContainer.innerHTML = '<div class="analytics-empty">Team form trend data will appear after race results are available.</div>';
            return;
        }

        const cards = visibleStandings.slice(0, 10).map((row) => {
            const cId = row.Constructor?.constructorId;
            const normalized = normalizeConstructorId(cId);
            const series = Array.isArray(state.teamFormData?.[normalized]) ? state.teamFormData[normalized] : [];
            if (!series.length) return '';

            const mean = series.reduce((sum, v) => sum + v, 0) / series.length;
            const variance = series.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / series.length;
            const stdDev = Math.sqrt(variance || 0);
            const consistency = Math.max(0, Math.min(100, 100 - stdDev * 10));

            const split = Math.max(1, Math.floor(series.length / 2));
            const early = series.slice(0, split);
            const late = series.slice(-split);
            const earlyAvg = early.reduce((sum, v) => sum + v, 0) / early.length;
            const lateAvg = late.reduce((sum, v) => sum + v, 0) / late.length;

            let trend = 'flat';
            if (lateAvg > earlyAvg + 1) trend = 'up';
            else if (lateAvg < earlyAvg - 1) trend = 'down';

            const trendLabel = trend === 'up' ? '▲ Rising' : trend === 'down' ? '▼ Dropping' : '■ Stable';
            const teamColor = getTeamColor(cId);

            const chips = series.map((pts) => {
                const cls = pts >= 25 ? 'elite' : pts >= 15 ? 'strong' : pts > 0 ? 'scored' : 'zero';
                return `<span class="team-form-chip ${cls}">${Number.isInteger(pts) ? pts : pts.toFixed(1)}</span>`;
            }).join('');

            return `<article class="team-form-card">
                <div class="team-form-head">
                    ${teamLogoHTML(cId, 32)}
                    <strong>${getTeamName(cId)}</strong>
                </div>
                <div class="team-form-row">
                    <span>Last 5 rounds</span>
                    <div class="team-form-chips">${chips}</div>
                </div>
                <div class="team-form-row">
                    <span>Momentum</span>
                    <strong class="trend-${trend}">${trendLabel}</strong>
                </div>
                <div class="team-form-row">
                    <span>Consistency</span>
                    <strong>${consistency.toFixed(0)} / 100</strong>
                </div>
                <div class="form-consistency-track"><span style="width:${consistency.toFixed(1)}%;background:${teamColor}"></span></div>
                <div class="team-form-rounds">${roundLabels.join(' · ')}</div>
            </article>`;
        }).filter(Boolean).join('');

        formContainer.innerHTML = cards || '<div class="analytics-empty">No team form data available right now.</div>';
    }

    function renderPerformanceCharts(allStandings, visibleStandings) {
        if (!chartsContainer) return;
        if (!allStandings?.length || !visibleStandings?.length) {
            chartsContainer.innerHTML = '';
            return;
        }

        const topVisible = visibleStandings.slice(0, 8);
        const maxPoints = Math.max(...topVisible.map(s => parseFloat(s.points) || 0), 1);
        const maxWins = Math.max(...topVisible.map(s => parseInt(s.wins, 10) || 0), 1);
        const totalVisiblePoints = topVisible.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);

        const pointsRows = topVisible.map((s) => {
            const cId = s.Constructor?.constructorId;
            const points = parseFloat(s.points) || 0;
            const pct = (points / maxPoints) * 100;
            return `<div class="analytics-bar-row">
                <div class="analytics-bar-label">${teamLogoSmallHTML(cId)} <span>${getTeamName(cId)}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div>
                <div class="analytics-bar-value">${formatPoints(points)}</div>
            </div>`;
        }).join('');

        const winsRows = topVisible.map((s) => {
            const cId = s.Constructor?.constructorId;
            const wins = parseInt(s.wins, 10) || 0;
            const pct = (wins / maxWins) * 100;
            return `<div class="analytics-bar-row compact">
                <div class="analytics-bar-label">${teamLogoSmallHTML(cId)} <span>${getTeamAbbr(cId)}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div>
                <div class="analytics-bar-value">${wins}</div>
            </div>`;
        }).join('');

        const leader = topVisible[0];
        const leaderPoints = parseFloat(leader?.points) || 0;
        const visibleLeaderShare = totalVisiblePoints > 0 ? (leaderPoints / totalVisiblePoints) * 100 : 0;

        chartsContainer.innerHTML = `
            <article class="analytics-card">
                <h3>${teamIcon(TEAM_UI_ICONS.points)}Visible Team Points</h3>
                <div class="analytics-bars">${pointsRows}</div>
            </article>
            <article class="analytics-card">
                <h3>${teamIcon(TEAM_UI_ICONS.wins)}Visible Team Wins</h3>
                <div class="analytics-bars">${winsRows}</div>
            </article>
            <article class="analytics-card analytics-highlight-card">
                <h3>${teamIcon(TEAM_UI_ICONS.momentum)}Leader Momentum</h3>
                <div class="analytics-big-value">${visibleLeaderShare.toFixed(1)}%</div>
                <p>${inlineTeamHTML(leader?.Constructor?.constructorId)} controls ${formatPoints(leaderPoints)} of ${formatPoints(totalVisiblePoints)} visible points.</p>
            </article>`;
    }

    function renderTeamCards(standings, teamDrivers, fullStandings) {
        if (!standings?.length) {
            container.innerHTML = '<div class="section" style="text-align:center;padding:24px;color:var(--f1-gray)">No teams match the current filters.</div>';
            return;
        }

        const totalPoints = fullStandings.reduce((sum, row) => sum + (parseFloat(row.points) || 0), 0);
        const leaderPoints = parseFloat(fullStandings[0]?.points) || 0;

        container.innerHTML = standings.map((s, i) => {
            const cId = s.Constructor?.constructorId;
            const normalizedId = normalizeConstructorId(cId);
            const teamColor = getTeamColor(cId);
            const drivers = teamDrivers[normalizedId] || [];
            const displayDrivers = state.showAllDrivers ? drivers : drivers.slice(0, 2);
            const wins = parseInt(s.wins) || 0;
            const points = parseFloat(s.points) || 0;
            const pointsShare = totalPoints > 0 ? (points / totalPoints) * 100 : 0;
            const progressWidth = points > 0 ? Math.max(pointsShare, 3) : 0;
            const gapToLeader = Math.max(leaderPoints - points, 0);
            const hiddenDrivers = Math.max(drivers.length - displayDrivers.length, 0);
            const carImage = teamCarHTML(cId);

            return `
            <div class="team-card">
                <div class="team-stripe" style="background:${teamColor}"></div>
                <div class="team-card-header">
                    ${teamLogoHTML(cId, 64)}
                    <div>
                        <div class="team-card-name">${teamLogoSmallHTML(cId)} ${getConstructorFlag(cId)} ${getTeamName(cId)}</div>
                        <div class="team-card-points">
                            P${s.position} — <strong>${formatPoints(points)}</strong> PTS${wins > 0 ? ` — ${wins} WIN${wins !== 1 ? 'S' : ''}` : ''}
                        </div>
                    </div>
                </div>
                ${carImage ? `<div class="team-car-media">${carImage}</div>` : ''}
                <div class="team-card-metrics">
                    <span class="team-metric-chip">Share ${pointsShare.toFixed(1)}%</span>
                    <span class="team-metric-chip">${gapToLeader > 0 ? `+${formatPoints(gapToLeader)} to leader` : 'Leader'}</span>
                    <span class="team-metric-chip">${drivers.length} listed driver${drivers.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="team-points-track"><span style="width:${progressWidth}%;background:${teamColor}"></span></div>
                <div class="team-card-drivers">
                    ${displayDrivers.length ? displayDrivers.map(ds => {
                        const d = ds.Driver;
                        const driverWins = parseInt(ds.wins) || 0;
                        const img = driverImgHTML(d.givenName, d.familyName, enriched, 'driver-avatar-lg', teamColor, d.permanentNumber);
                        const driverId = d.driverId || '';
                        const openModal = driverId ? ` onclick="openDriverModal('${driverId}', '${cId}')" style="cursor:pointer"` : '';
                        return `
                        <div class="team-driver-row${driverId ? ' team-driver-row-clickable' : ''}"${openModal}>
                            ${img}
                            <div>
                                <div class="driver-name">${d.givenName || ''} ${d.familyName || ''}</div>
                                <div style="font-size:0.8rem;color:var(--f1-gray)">${countryFlagHTML(d.nationality, 14)} ${d.nationality || ''} · #${d.permanentNumber || '?'}${driverWins > 0 ? ` · ${driverWins} win${driverWins > 1 ? 's' : ''}` : ''}</div>
                            </div>
                            <div class="driver-pts">
                                <strong>${formatPoints(ds.points)}</strong> <span style="font-size:0.75rem;color:var(--f1-gray)">PTS</span>
                            </div>
                        </div>`;
                    }).join('') : '<div style="padding:8px 0;color:var(--f1-gray);font-size:0.9rem">Driver data loading...</div>'}
                    ${(!state.showAllDrivers && hiddenDrivers > 0) ? `<div class="team-extra-driver-note">+${hiddenDrivers} additional driver ${hiddenDrivers > 1 ? 'entries' : 'entry'} this season</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    function renderTable(standings, fullStandings) {
        tableSection.style.display = '';

        if (!standings?.length) {
            tableContainer.innerHTML = '<div class="section" style="margin:0;text-align:center;padding:20px;color:var(--f1-gray)">No rows to show for the active filters.</div>';
            return;
        }

        const leaderPoints = parseFloat(fullStandings?.[0]?.points) || parseFloat(standings[0]?.points) || 0;

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Pos</th>
                            <th>Team</th>
                            <th>Wins</th>
                            <th>Gap</th>
                            <th style="text-align:right">Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${standings.map(s => {
                            const cId = s.Constructor?.constructorId;
                            const teamColor = getTeamColor(cId);
                            const points = parseFloat(s.points) || 0;
                            const gap = Math.max(leaderPoints - points, 0);
                            return `
                            <tr>
                                <td class="pos-cell">${s.position}</td>
                                <td>
                                    <div class="driver-cell">
                                        ${teamLogoHTML(cId, 36)}
                                        <span class="team-color-bar" style="background:${teamColor}"></span>
                                        <strong style="text-transform:uppercase">${teamLogoSmallHTML(cId)} ${getConstructorFlag(cId)} ${getTeamName(cId)}</strong>
                                    </div>
                                </td>
                                <td>${s.wins || 0}</td>
                                <td>${gap > 0 ? `+${formatPoints(gap)}` : 'Leader'}</td>
                                <td class="points-cell">${formatPoints(points)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function ensureTeamsEnhancementUI(targetContainer) {
        let wrapper = document.getElementById('teams-tools');
        if (!wrapper) {
            wrapper = document.createElement('section');
            wrapper.id = 'teams-tools';
            wrapper.className = 'section teams-tools';
            wrapper.innerHTML = `
                <div class="teams-filter-row">
                    <input id="teams-search" class="teams-search ui-input" type="search" placeholder="Search by team name or ID">
                    <label class="teams-toggle ui-toggle">
                        <input id="teams-wins-only" type="checkbox">
                        <span>Only teams with wins</span>
                    </label>
                    <label class="teams-toggle ui-toggle">
                        <input id="teams-show-all-drivers" type="checkbox">
                        <span>Show all listed drivers</span>
                    </label>
                    <select id="teams-sort" class="ui-input">
                        <option value="points">Sort: Points</option>
                        <option value="wins">Sort: Wins</option>
                        <option value="alphabetical">Sort: A-Z</option>
                    </select>
                    <button id="teams-filter-reset" class="teams-reset-btn ui-btn" type="button">${teamIcon(TEAM_UI_ICONS.reset)}Reset</button>
                </div>
                <div id="teams-insights" class="teams-insights"></div>
                <div id="teams-performance-charts" class="standings-analytics-grid teams-analytics-grid"></div>
                <div class="section-header" style="margin-top:var(--space-lg)"><h2 data-iconized="true">${teamIcon(TEAM_UI_ICONS.filter)}Team Form Trend</h2></div>
                <div id="teams-form-trends" class="team-form-grid"></div>`;
            targetContainer.parentNode.insertBefore(wrapper, targetContainer);
        }

        return {
            wrapper,
            searchInput: wrapper.querySelector('#teams-search'),
            winsOnlyCheckbox: wrapper.querySelector('#teams-wins-only'),
            showAllDriversCheckbox: wrapper.querySelector('#teams-show-all-drivers'),
            sortSelect: wrapper.querySelector('#teams-sort'),
            resetBtn: wrapper.querySelector('#teams-filter-reset'),
            insightsContainer: wrapper.querySelector('#teams-insights'),
            chartsContainer: wrapper.querySelector('#teams-performance-charts'),
            formContainer: wrapper.querySelector('#teams-form-trends'),
        };
    }

    function bindFilterEvents() {
        const rerender = () => {
            saveTeamsPrefs({
                searchQuery: searchInput.value || '',
                winsOnly: !!winsOnlyCheckbox.checked,
                showAllDrivers: !!showAllDriversCheckbox.checked,
                sortMode: state.sortMode,
            });
            renderCurrentView();
        };
        searchInput.addEventListener('input', rerender);
        winsOnlyCheckbox.addEventListener('change', rerender);
        showAllDriversCheckbox.addEventListener('change', () => {
            state.showAllDrivers = showAllDriversCheckbox.checked;
            rerender();
        });
        sortSelect?.addEventListener('change', () => {
            state.sortMode = sortSelect.value || 'points';
            rerender();
        });
        resetBtn.addEventListener('click', () => {
            searchInput.value = '';
            winsOnlyCheckbox.checked = false;
            showAllDriversCheckbox.checked = false;
            if (sortSelect) sortSelect.value = 'points';
            state.showAllDrivers = false;
            state.sortMode = 'points';
            rerender();
        });
    }

    // Auto-refresh every 5 minutes
    setInterval(async () => {
        try {
            const [cs, ds] = await Promise.all([
                F1API.getConstructorStandings(),
                F1API.getDriverStandings(),
            ]);
            if (cs?.length) {
                await fetchTeamLogos(cs);
                state.constructorStandings = cs;
                state.teamDrivers = buildTeamDriversMap(ds);
                await loadTeamFormData(false);
                renderCurrentView();
            }
        } catch (e) { /* silent */ }
    }, 5 * 60 * 1000);
})();

