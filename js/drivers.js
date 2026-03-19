/* ============================================
   F1 PULSE - Drivers Page Logic
   ============================================ */

let currentView = 'grid';
let standingsData = [];
let enriched = {};
let openedModalFromQuery = false;

function switchView(view) {
    currentView = view;
    document.querySelectorAll('#view-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('drivers-grid').style.display = view === 'grid' ? '' : 'none';
    document.getElementById('drivers-table').style.display = view === 'table' ? '' : 'none';
}

(async function () {
    initPage('drivers');

    const grid = document.getElementById('drivers-grid');
    const table = document.getElementById('drivers-table');
    const analytics = ensureDriversAnalyticsSection();
    const compare = ensureDriversCompareSection();
    const formTrends = ensureDriversFormSection();

    showLoading(grid, 'Loading driver standings', 'skeleton-cards');

    const seasonLabelEl = document.getElementById('season-label');
    if (seasonLabelEl) {
        seasonLabelEl.textContent = `${new Date().getFullYear()} FIA Formula One World Championship`;
    }

    try {
        enriched = await Promise.race([
            loadEnrichedDrivers(),
            new Promise((resolve) => setTimeout(() => resolve({}), 2500)),
        ]) || {};
    } catch (e) {
        enriched = {};
    }

    try {
        const [standings, constructorStandings] = await Promise.all([
            F1API.getDriverStandings(),
            F1API.getConstructorStandings(),
        ]);

        standingsData = standings;
        if (!standingsData?.length) {
            showError(grid, 'No driver standings data available yet for this season.');
            return;
        }

        // Fetch team logos
        if (constructorStandings?.length) {
            await fetchTeamLogos(constructorStandings);
        }

        renderDriverAnalytics(standingsData);
        renderGrid(standingsData);
        renderTable(standingsData);
        renderDriversCompareTool(standingsData);
        await renderDriverFormTrends(standingsData);
        openDriverFromQueryIfNeeded(standingsData);
    } catch (err) {
        showError(grid, 'Failed to load driver standings. Please try again.', 'location.reload()');
        console.error(err);
    }

    function renderGrid(standings) {
        const maxPoints = parseFloat(standings[0]?.points) || 1;

        grid.innerHTML = standings.map((s, i) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const teamColor = getTeamColor(cId);
            const teamCar = teamCarHTML(cId);
            const wins = parseInt(s.wins) || 0;
            const pctWidth = Math.round((parseFloat(s.points) / maxPoints) * 100);
            const gap = i > 0 ? (parseFloat(s.points) - parseFloat(standings[0].points)).toFixed(0) : '';

            return `
            <div class="driver-card" onclick="openDriverModal('${d.driverId}', '${cId}')" style="cursor:pointer">
                <div class="team-stripe" style="background:${teamColor}"></div>
                <span class="driver-position ${parseInt(s.position) <= 3 ? 'pos-top-' + s.position : ''}">${String(s.position).padStart(2, '0')}</span>
                <div class="driver-card-img">
                    <span class="driver-number">${d.permanentNumber || ''}</span>
                    ${driverCardImgHTML(d.givenName, d.familyName, enriched, d.permanentNumber)}
                </div>
                <div class="driver-card-info">
                    <div class="driver-card-name">
                        <span class="first-name">${d.givenName || ''}</span>
                        <span class="last-name">${d.familyName || ''}</span>
                    </div>
                    <div class="driver-flag-badge">
                        ${countryFlagHTML(d.nationality, 16)}
                        <span>${d.nationality || ''}</span>
                    </div>
                    <div class="driver-card-team">
                        ${teamLogoSmallHTML(cId)}
                        ${getTeamName(cId)}
                    </div>
                    ${teamCar ? `<div class="driver-card-car">${teamCar}</div>` : ''}
                    <div class="driver-card-points">
                        <span class="points-value">${s.points}</span>
                        <span class="points-label">PTS</span>
                        ${wins > 0 ? `<span style="margin-left:auto;font-size:0.8rem;color:#FFD700">${wins} win${wins > 1 ? 's' : ''}</span>` : ''}
                    </div>
                    <div class="points-progress-bar">
                        <div class="points-progress-fill" style="width:${pctWidth}%;background:${teamColor}"></div>
                    </div>
                    <div class="driver-card-meta">
                        ${gap ? `<span class="driver-meta-item">${gap} pts to P1</span>` : '<span class="driver-meta-item" style="color:var(--f1-success)">Championship Leader</span>'}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function renderTable(standings) {
        const leaderPts = parseFloat(standings[0]?.points) || 0;

        table.innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr><th>Pos</th><th>Driver</th><th>Nationality</th><th>Team</th><th>Wins</th><th>Gap</th><th style="text-align:right">Points</th></tr>
                    </thead>
                    <tbody>
                        ${standings.map((s, idx) => {
                            const d = s.Driver;
                            const cId = s.Constructors?.[0]?.constructorId;
                            const teamColor = getTeamColor(cId);
                            const currentPts = parseFloat(s.points) || 0;
                            const gapToLeader = Math.max(leaderPts - currentPts, 0);
                            const gap = s.position === '1' ? '-' : `+${gapToLeader.toFixed(0)}`;
                            return `
                            <tr style="animation-delay:${idx * 0.02}s">
                                <td class="pos-cell">${s.position}</td>
                                <td><div class="driver-cell">
                                    ${driverImgHTML(d.givenName, d.familyName, enriched, '', teamColor, d.permanentNumber)}
                                    <span class="team-color-bar" style="background:${teamColor}"></span>
                                    <div><span style="color:var(--f1-gray);font-size:0.8rem;text-transform:uppercase">${d.givenName || ''}</span><br><strong style="text-transform:uppercase">${d.familyName || ''}</strong></div>
                                </div></td>
                                <td>${countryFlagHTML(d.nationality, 16)} ${d.nationality || ''}</td>
                                <td>${inlineTeamHTML(cId)}</td>
                                <td>${s.wins || 0}</td>
                                <td style="color:${s.position === '1' ? 'var(--f1-success)' : 'var(--f1-gray)'};font-size:0.85rem">${gap}</td>
                                <td class="points-cell">${s.points}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function ensureDriversAnalyticsSection() {
        let section = document.getElementById('drivers-analytics');
        if (section) return section;

        section = document.createElement('section');
        section.id = 'drivers-analytics';
        section.className = 'section standings-analytics';
        section.innerHTML = '<div class="section-header"><h2>Championship Analytics</h2></div><div id="drivers-analytics-grid" class="standings-analytics-grid"></div>';

        const tabs = document.getElementById('view-tabs');
        tabs?.insertAdjacentElement('afterend', section);
        return section;
    }

    function ensureDriversCompareSection() {
        let section = document.getElementById('drivers-compare');
        if (section) return section;

        section = document.createElement('section');
        section.id = 'drivers-compare';
        section.className = 'section drivers-compare';
        section.innerHTML = `
            <div class="section-header"><h2>Driver Head-to-Head</h2></div>
            <div class="drivers-compare-controls">
                <select id="driver-compare-a" class="ui-input"></select>
                <button id="driver-compare-swap" class="ui-btn" type="button">Swap</button>
                <select id="driver-compare-b" class="ui-input"></select>
            </div>
            <div id="drivers-compare-output" class="drivers-compare-output"></div>`;

        analytics?.insertAdjacentElement('afterend', section);
        return section;
    }

    function ensureDriversFormSection() {
        let section = document.getElementById('drivers-form-trends');
        if (section) return section;

        section = document.createElement('section');
        section.id = 'drivers-form-trends';
        section.className = 'section drivers-form-trends';
        section.innerHTML = '<div class="section-header"><h2>Driver Form Trend</h2></div><div id="drivers-form-grid" class="drivers-form-grid"></div>';

        compare?.insertAdjacentElement('afterend', section);
        return section;
    }

    function renderDriversCompareTool(standings) {
        if (!compare || !standings?.length) return;
        const selectA = compare.querySelector('#driver-compare-a');
        const selectB = compare.querySelector('#driver-compare-b');
        const swapBtn = compare.querySelector('#driver-compare-swap');
        const out = compare.querySelector('#drivers-compare-output');
        if (!selectA || !selectB || !swapBtn || !out) return;

        selectA.innerHTML = standings.map((s) => `<option value="${s.Driver?.driverId}">${s.position}. ${s.Driver?.givenName || ''} ${s.Driver?.familyName || ''}</option>`).join('');
        selectB.innerHTML = standings.map((s) => `<option value="${s.Driver?.driverId}">${s.position}. ${s.Driver?.givenName || ''} ${s.Driver?.familyName || ''}</option>`).join('');

        if (!selectA.value) selectA.value = standings[0]?.Driver?.driverId || '';
        if (!selectB.value) selectB.value = standings[1]?.Driver?.driverId || standings[0]?.Driver?.driverId || '';

        const render = () => {
            const a = standings.find((x) => x.Driver?.driverId === selectA.value);
            const b = standings.find((x) => x.Driver?.driverId === selectB.value);
            if (!a || !b) {
                out.innerHTML = '<div class="analytics-empty">Select two drivers to compare.</div>';
                return;
            }

            const aPts = parseFloat(a.points) || 0;
            const bPts = parseFloat(b.points) || 0;
            const aWins = parseInt(a.wins, 10) || 0;
            const bWins = parseInt(b.wins, 10) || 0;
            const maxPts = Math.max(aPts, bPts, 1);
            const maxWins = Math.max(aWins, bWins, 1);

            const aTeam = a.Constructors?.[0]?.constructorId;
            const bTeam = b.Constructors?.[0]?.constructorId;
            const aColor = getTeamColor(aTeam);
            const bColor = getTeamColor(bTeam);

            out.innerHTML = `
                <div class="drivers-compare-head">
                    <div class="drivers-compare-driver">${driverImgHTML(a.Driver?.givenName, a.Driver?.familyName, enriched, '', aColor, a.Driver?.permanentNumber)} <strong>${a.Driver?.familyName || ''}</strong> <span>P${a.position}</span></div>
                    <div class="drivers-compare-driver">${driverImgHTML(b.Driver?.givenName, b.Driver?.familyName, enriched, '', bColor, b.Driver?.permanentNumber)} <strong>${b.Driver?.familyName || ''}</strong> <span>P${b.position}</span></div>
                </div>
                <div class="drivers-compare-row">
                    <span>Points</span>
                    <div class="drivers-compare-track">
                        <span style="width:${((aPts / maxPts) * 100).toFixed(1)}%;background:${aColor}"></span>
                        <span style="width:${((bPts / maxPts) * 100).toFixed(1)}%;background:${bColor}"></span>
                    </div>
                    <strong>${aPts.toFixed(1)} vs ${bPts.toFixed(1)}</strong>
                </div>
                <div class="drivers-compare-row">
                    <span>Wins</span>
                    <div class="drivers-compare-track">
                        <span style="width:${((aWins / maxWins) * 100).toFixed(1)}%;background:${aColor}"></span>
                        <span style="width:${((bWins / maxWins) * 100).toFixed(1)}%;background:${bColor}"></span>
                    </div>
                    <strong>${aWins} vs ${bWins}</strong>
                </div>
            `;
        };

        selectA.onchange = render;
        selectB.onchange = render;
        swapBtn.onclick = () => {
            const tmp = selectA.value;
            selectA.value = selectB.value;
            selectB.value = tmp;
            render();
        };

        render();
    }

    function renderDriverAnalytics(standings) {
        if (!analytics || !standings?.length) return;
        const gridEl = analytics.querySelector('#drivers-analytics-grid');
        if (!gridEl) return;

        const topDrivers = standings.slice(0, 8);
        const maxPoints = Math.max(...topDrivers.map(s => parseFloat(s.points) || 0), 1);
        const maxWins = Math.max(...topDrivers.map(s => parseInt(s.wins, 10) || 0), 1);
        const totalPoints = standings.reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);

        const pointsRows = topDrivers.map((s) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const pct = ((parseFloat(s.points) || 0) / maxPoints) * 100;
            return `<div class="analytics-bar-row">
                <div class="analytics-bar-label">${driverImgHTML(d.givenName, d.familyName, enriched, '', getTeamColor(cId), d.permanentNumber)} <span>${d.familyName || ''}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div>
                <div class="analytics-bar-value">${s.points}</div>
            </div>`;
        }).join('');

        const winsRows = topDrivers.map((s) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const wins = parseInt(s.wins, 10) || 0;
            const pct = (wins / maxWins) * 100;
            return `<div class="analytics-bar-row compact">
                <div class="analytics-bar-label">${driverImgHTML(d.givenName, d.familyName, enriched, '', getTeamColor(cId), d.permanentNumber)} <span>${d.familyName || ''}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div>
                <div class="analytics-bar-value">${wins}</div>
            </div>`;
        }).join('');

        const leader = standings[0];
        const leaderCId = leader?.Constructors?.[0]?.constructorId;
        const leaderShare = totalPoints > 0 ? ((parseFloat(leader.points) || 0) / totalPoints) * 100 : 0;

        gridEl.innerHTML = `
            <article class="analytics-card">
                <h3>Top 8 Points Distribution</h3>
                <div class="analytics-bars">${pointsRows}</div>
            </article>
            <article class="analytics-card">
                <h3>Top 8 Wins Chart</h3>
                <div class="analytics-bars">${winsRows}</div>
            </article>
            <article class="analytics-card analytics-highlight-card">
                <h3>Leader Share</h3>
                <div class="analytics-big-value">${leaderShare.toFixed(1)}%</div>
                <p>${inlineDriverHTML(leader?.Driver?.givenName, leader?.Driver?.familyName, leaderCId, enriched, leader?.Driver?.permanentNumber)} holds ${leader?.points || 0} of ${totalPoints.toFixed(1)} total points.</p>
            </article>`;
    }

    async function renderDriverFormTrends(standings) {
        if (!formTrends || !standings?.length) return;

        const grid = formTrends.querySelector('#drivers-form-grid');
        if (!grid) return;

        const targetDrivers = standings.slice(0, 6);
        const season = String(new Date().getFullYear());
        grid.innerHTML = '<div class="analytics-empty">Loading recent form...</div>';

        const settled = await Promise.allSettled(targetDrivers.map(async (s) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const seasonResults = await F1API.getDriverSeasonResults(season, d.driverId);
            const races = (Array.isArray(seasonResults) ? seasonResults : [])
                .map((race) => {
                    const rr = race.Results?.[0];
                    const pos = parseInt(rr?.position, 10);
                    return {
                        round: parseInt(race.round, 10) || 0,
                        pos: Number.isFinite(pos) ? pos : null,
                        status: String(rr?.status || ''),
                    };
                })
                .sort((a, b) => a.round - b.round)
                .slice(-5);

            if (!races.length) return null;

            const valid = races.filter((x) => x.pos != null);
            const avg = valid.length ? (valid.reduce((sum, x) => sum + x.pos, 0) / valid.length) : null;
            const variance = valid.length
                ? valid.reduce((sum, x) => sum + Math.pow(x.pos - avg, 2), 0) / valid.length
                : 0;
            const stdDev = Math.sqrt(variance || 0);
            const consistency = valid.length ? Math.max(0, Math.min(100, 100 - (stdDev * 12))) : 0;

            const split = Math.max(1, Math.floor(valid.length / 2));
            const early = valid.slice(0, split);
            const late = valid.slice(-split);
            const earlyAvg = early.length ? early.reduce((sum, x) => sum + x.pos, 0) / early.length : null;
            const lateAvg = late.length ? late.reduce((sum, x) => sum + x.pos, 0) / late.length : null;

            let trend = 'flat';
            if (earlyAvg != null && lateAvg != null) {
                if (lateAvg < earlyAvg - 0.25) trend = 'up';
                else if (lateAvg > earlyAvg + 0.25) trend = 'down';
            }

            return {
                d,
                cId,
                races,
                avg,
                consistency,
                trend,
            };
        }));

        const rows = settled
            .filter((x) => x.status === 'fulfilled' && x.value)
            .map((x) => x.value);

        if (!rows.length) {
            grid.innerHTML = '<div class="analytics-empty">No recent form data available.</div>';
            return;
        }

        grid.innerHTML = rows.map((row) => {
            const trendText = row.trend === 'up' ? '▲ Improving' : row.trend === 'down' ? '▼ Slipping' : '■ Stable';
            const trendClass = row.trend === 'up' ? 'up' : row.trend === 'down' ? 'down' : 'flat';
            const teamColor = getTeamColor(row.cId);
            const chips = row.races.map((item) => {
                if (item.pos == null) return '<span class="form-chip dnf">DNF</span>';
                const cls = item.pos <= 3 ? `p${item.pos}` : '';
                return `<span class="form-chip ${cls}">P${item.pos}</span>`;
            }).join('');

            return `<article class="form-trend-card">
                <div class="form-trend-head">
                    ${driverImgHTML(row.d?.givenName, row.d?.familyName, enriched, '', teamColor, row.d?.permanentNumber)}
                    <div>
                        <strong>${row.d?.givenName || ''} ${row.d?.familyName || ''}</strong>
                        <small>${inlineTeamHTML(row.cId)}</small>
                    </div>
                </div>
                <div class="form-trend-row">
                    <span>Last 5 finishes</span>
                    <div class="form-chips">${chips}</div>
                </div>
                <div class="form-trend-row">
                    <span>Momentum</span>
                    <strong class="trend-${trendClass}">${trendText}</strong>
                </div>
                <div class="form-trend-row">
                    <span>Consistency</span>
                    <strong>${row.consistency.toFixed(0)} / 100</strong>
                </div>
                <div class="form-consistency-track"><span style="width:${row.consistency.toFixed(1)}%;background:${teamColor}"></span></div>
                <div class="form-trend-footnote">Average finish: ${row.avg != null ? `P${row.avg.toFixed(1)}` : 'N/A'}</div>
            </article>`;
        }).join('');
    }

    function openDriverFromQueryIfNeeded(standings) {
        if (openedModalFromQuery) return;
        const params = new URLSearchParams(window.location.search);
        const targetDriver = params.get('driver');
        if (!targetDriver) return;

        const row = standings.find((s) => s.Driver?.driverId === targetDriver);
        const fallbackConstructor = row?.Constructors?.[0]?.constructorId;
        const constructorId = params.get('constructor') || fallbackConstructor;
        if (!row) return;

        openedModalFromQuery = true;
        openDriverModal(targetDriver, constructorId || undefined);

        // Clean query once consumed so refresh does not repeatedly re-open modal.
        try {
            const clean = new URL(window.location.href);
            clean.searchParams.delete('driver');
            clean.searchParams.delete('constructor');
            window.history.replaceState({}, '', clean.toString());
        } catch (e) { /* non-critical */ }
    }

    // Auto-refresh every 5 minutes
    setInterval(async () => {
        try {
            const data = await F1API.getDriverStandings();
            if (data?.length) {
                standingsData = data;
                renderDriverAnalytics(data);
                renderGrid(data);
                renderTable(data);
                renderDriversCompareTool(data);
                await renderDriverFormTrends(data);
                openDriverFromQueryIfNeeded(data);
            }
        } catch (e) { /* silent retry next interval */ }
    }, 5 * 60 * 1000);
})();

