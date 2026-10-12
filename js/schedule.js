/* ============================================
   F1 PULSE - Schedule Page Logic
   ============================================ */

let allRaces = [];
let currentSeasonLabel = 'current';
let scheduleLoadToken = 0;

const SCHEDULE_PREFS_KEY = 'f1pulse_schedule_prefs_v1';

function getSchedulePrefs() {
    try {
        const raw = localStorage.getItem(SCHEDULE_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return typeof parsed === 'object' && parsed ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveSchedulePrefs(partial) {
    const prev = getSchedulePrefs();
    const next = { ...prev, ...partial };
    try { localStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(next)); } catch { /* This visit still works without saved preferences. */ }
}

function ensureScheduleAnalyticsSection() {
    let section = document.getElementById('schedule-analytics');
    if (section) return section;

    section = document.createElement('section');
    section.id = 'schedule-analytics';
    section.className = 'section standings-analytics';
    section.innerHTML = '<div class="section-header"><h2>Calendar Snapshot</h2></div><div id="schedule-analytics-grid" class="standings-analytics-grid"></div>';

    const racesContainer = document.getElementById('races-container');
    racesContainer?.insertAdjacentElement('afterend', section);
    return section;
}

function ensureScheduleFeatureControls() {
    let controls = document.getElementById('schedule-controls');
    if (controls) return controls;

    controls = document.createElement('div');
    controls.id = 'schedule-controls';
    controls.className = 'section schedule-controls';
    controls.innerHTML = `
        <div class="schedule-controls-grid">
            <div class="schedule-timezone">
                <span class="schedule-timezone-icon" aria-hidden="true">${UI_ICONS.clock}</span>
                <span><small>Session times automatically shown in</small><strong>${getLocalTimeZoneLabel()}</strong></span>
            </div>
            <div class="schedule-control-actions">
                <button id="schedule-jump-next" class="schedule-jump-next ui-btn" type="button">Jump to next race</button>
                <button id="schedule-export-next" class="ui-btn ui-btn-secondary" type="button">Export next weekend</button>
                <button id="schedule-export-season" class="ui-btn ui-btn-primary" type="button">Export full season</button>
            </div>
        </div>`;

    const header = document.querySelector('.page-header');
    header?.insertAdjacentElement('afterend', controls);

    const jumpBtn = controls.querySelector('#schedule-jump-next');
    const nextExportBtn = controls.querySelector('#schedule-export-next');
    const seasonExportBtn = controls.querySelector('#schedule-export-season');

    jumpBtn?.addEventListener('click', () => {
        const nextCard = document.getElementById('next-race-card');
        if (nextCard) {
            nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextCard.classList.add('race-card-spotlight');
            setTimeout(() => nextCard.classList.remove('race-card-spotlight'), 1300);
        }
    });

    nextExportBtn?.addEventListener('click', () => {
        const now = Date.now();
        const nextRace = allRaces.find((race) => {
            const start = new Date(`${race.date}T${race.time || '14:00:00Z'}`).getTime();
            return Number.isFinite(start) && start > now - (4 * 60 * 60 * 1000);
        });
        downloadRaceCalendar(nextRace ? [nextRace] : [], 'f1-pulse-next-race.ics');
    });

    seasonExportBtn?.addEventListener('click', () => {
        const seasonName = currentSeasonLabel === 'current' ? new Date().getFullYear() : currentSeasonLabel;
        downloadRaceCalendar(allRaces, `f1-pulse-${seasonName}-calendar.ics`);
    });

    return controls;
}

async function loadSeason(season) {
    const loadToken = ++scheduleLoadToken;
    const container = document.getElementById('races-container');
    showLoading(container, 'Loading schedule', 'skeleton-cards');
    currentSeasonLabel = season;
    saveSchedulePrefs({ season });

    try {
        const races = await F1API.getSchedule(season);
        if (loadToken !== scheduleLoadToken) return;
        allRaces = races;

        // Fetch circuit images in background (don't await - let them load as cards render)
        Promise.allSettled(allRaces.map(r => fetchCircuitImage(r.Circuit?.url, r.Circuit?.circuitName))).then(() => {
            if (loadToken !== scheduleLoadToken) return;
            // Re-render to show circuit images once they're cached
            renderRaces();
        });

        const select = document.getElementById('season-select');
        if (select) select.value = season;
        document.getElementById('season-label').textContent = `${season === 'current' ? new Date().getFullYear() : season} Season — ${allRaces.length} Races`;
        renderScheduleAnalytics();
        renderRaces();
    } catch (err) {
        if (loadToken !== scheduleLoadToken) return;
        showError(container, 'Failed to load schedule.', 'location.reload()');
        console.error(err);
    }
}

function renderScheduleAnalytics() {
    const section = ensureScheduleAnalyticsSection();
    const grid = section?.querySelector('#schedule-analytics-grid');
    if (!grid || !allRaces?.length) return;

    const now = new Date();
    const nowMs = now.getTime();
    const visibleRaces = allRaces;

    const byMonth = {};
    visibleRaces.forEach((r) => {
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime())) return;
        const key = d.toLocaleDateString('en-GB', { month: 'short' });
        byMonth[key] = (byMonth[key] || 0) + 1;
    });

    const monthEntries = Object.entries(byMonth);
    const maxMonthCount = Math.max(...monthEntries.map(([, v]) => v), 1);
    const monthBars = monthEntries.map(([label, value]) => {
        const pct = (value / maxMonthCount) * 100;
        return `<div class="analytics-bar-row compact"><div class="analytics-bar-label"><span>${label}</span></div><div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:var(--f1-red)"></span></div><div class="analytics-bar-value">${value}</div></div>`;
    }).join('');

    const completed = visibleRaces.filter(r => new Date(r.date) < now).length;
    const upcoming = visibleRaces.length - completed;
    const completedPct = visibleRaces.length ? (completed / visibleRaces.length) * 100 : 0;
    const sprintWeekends = visibleRaces.filter(r => !!(r.Sprint || r.SprintQualifying || r.SprintShootout)).length;

    grid.innerHTML = `
        <article class="analytics-card">
            <h3>Races by Month</h3>
            <div class="analytics-bars">${monthBars || '<div class="analytics-empty">No races in this season.</div>'}</div>
        </article>
        <article class="analytics-card">
            <h3>Season Progress</h3>
            <div class="analytics-progress-stack">
                <div class="analytics-progress-track"><span style="width:${completedPct.toFixed(1)}%;background:linear-gradient(90deg,var(--f1-red),#ff6f61)"></span></div>
                <div class="analytics-progress-labels"><span>Completed: ${completed}</span><span>Upcoming: ${upcoming}</span></div>
            </div>
            <div class="analytics-meta">${sprintWeekends} sprint weekend${sprintWeekends !== 1 ? 's' : ''} this season.</div>
        </article>
        <article class="analytics-card analytics-highlight-card">
            <h3>Calendar Snapshot</h3>
            <div class="analytics-big-value">${visibleRaces.length}</div>
            <p>Visible rounds in ${currentSeasonLabel === 'current' ? new Date().getFullYear() : currentSeasonLabel}: ${completed} done, ${upcoming} to go.</p>
        </article>`;
}

function renderRaces() {
    const container = document.getElementById('races-container');
    if (!container) return;

    container.classList.add('schedule-races-visual-grid');

    const now = new Date();
    const nowMs = now.getTime();
    const races = allRaces;

    if (!races.length) {
        container.innerHTML = `<div class="error-state" style="grid-column:1/-1"><div class="error-icon">${SVG_ICONS.calendar}</div><div class="error-message">No races found for this season.</div></div>`;
        return;
    }

    // Find next race
    let nextRound = null;
    for (const r of allRaces) {
        const raceStart = new Date(`${r.date}T${r.time || '14:00:00Z'}`).getTime();
        if (Number.isFinite(raceStart) && raceStart > nowMs - (4 * 60 * 60 * 1000)) {
            nextRound = r.round;
            break;
        }
    }

    container.innerHTML = races.map((r, i) => {
        const flag = countryFlagLargeHTML(r.Circuit?.Location?.country, 48);
        const raceStart = r.time ? new Date(`${r.date}T${r.time}`) : null;
        const raceStartMs = raceStart?.getTime() ?? Number.NaN;
        const isPast = Number.isFinite(raceStartMs) && raceStartMs < nowMs - (4 * 60 * 60 * 1000);
        const isNext = r.round === nextRound;
        const localRaceTime = Number.isFinite(raceStartMs)
            ? formatLocalSessionDateTime(raceStart)
            : `${formatDate(r.date)} · Time TBA`;
        const hasSprint = !!(r.Sprint || r.SprintQualifying || r.SprintShootout);
        const circuitImg = circuitImageHTML(r.Circuit?.url, 186, r.Circuit?.circuitName);
        const daysToRace = Number.isFinite(raceStartMs) ? Math.ceil((raceStartMs - nowMs) / 86400000) : null;
        const countdownBadge = !isPast
            ? `<span class="race-countdown-pill">${daysToRace === null ? 'Time TBA' : daysToRace <= 0 ? 'Today' : `T-${daysToRace}`}</span>`
            : '';
        const nextIdAttr = isNext ? ' id="next-race-card"' : '';

        return `
        <a href="race-detail.html?season=${r.season}&round=${r.round}"${nextIdAttr} class="race-card ${isPast ? 'past' : ''} ${isNext ? 'next' : ''}">
            <span class="race-card-round">R${r.round}</span>
            <div class="race-card-body">
                <div class="race-card-flag">${flag}</div>
                <div class="race-card-name">${r.raceName || 'Grand Prix'}</div>
                <div class="race-card-circuit">${r.Circuit?.circuitName || ''}</div>
                ${circuitImg ? `<div class="race-card-circuit-img race-track-layout">${circuitImg}</div>` : ''}
                <div class="race-card-date">
                    <span class="date-icon">${SVG_ICONS.calendar}</span>
                    <span><strong>${localRaceTime}</strong><small>Your local time</small></span>
                </div>
                ${countdownBadge ? `<div style="margin-top:8px">${countdownBadge}</div>` : ''}
                ${hasSprint ? '<div style="margin-top:8px"><span class="badge badge-yellow">Sprint Weekend</span></div>' : ''}
                ${isNext ? '<div style="margin-top:8px"><span class="badge badge-red">Next Race</span></div>' : ''}
                ${isPast ? '<div style="margin-top:8px"><span class="badge badge-green">Completed</span></div>' : ''}
            </div>
        </a>`;
    }).join('');
}

(async function () {
    initPage('schedule');
    const controls = ensureScheduleFeatureControls();

    // Populate season selector
    const select = document.getElementById('season-select');
    const currentYear = new Date().getFullYear();

    // Add recent years
    for (let y = currentYear; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y === currentYear ? 'current' : y;
        opt.textContent = y;
        select.appendChild(opt);
    }

    const prefs = getSchedulePrefs();

    const initialSeason = prefs.season || 'current';
    await loadSeason(initialSeason);
})();

