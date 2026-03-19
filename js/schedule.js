/* ============================================
   F1 PULSE - Schedule Page Logic
   ============================================ */

let allRaces = [];
let currentFilter = 'all';
let currentSeasonLabel = 'current';
let sprintOnlyFilter = false;
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
    localStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(next));
}

function ensureScheduleAnalyticsSection() {
    let section = document.getElementById('schedule-analytics');
    if (section) return section;

    section = document.createElement('section');
    section.id = 'schedule-analytics';
    section.className = 'section standings-analytics';
    section.innerHTML = '<div class="section-header"><h2>Season Analytics</h2></div><div id="schedule-analytics-grid" class="standings-analytics-grid"></div>';

    const racesContainer = document.getElementById('races-container');
    racesContainer?.insertAdjacentElement('beforebegin', section);
    return section;
}

function ensureScheduleFeatureControls() {
    let controls = document.getElementById('schedule-controls');
    if (controls) return controls;

    controls = document.createElement('section');
    controls.id = 'schedule-controls';
    controls.className = 'section schedule-controls';
    controls.innerHTML = `
        <div class="schedule-controls-grid">
            <label class="schedule-toggle ui-toggle">
                <input id="schedule-sprint-only" type="checkbox">
                <span>Sprint weekends only</span>
            </label>
            <button id="schedule-jump-next" class="schedule-jump-next ui-btn" type="button">Jump to next race</button>
        </div>`;

    const tabs = document.getElementById('filter-tabs');
    tabs?.insertAdjacentElement('afterend', controls);

    const sprintOnlyInput = controls.querySelector('#schedule-sprint-only');
    const jumpBtn = controls.querySelector('#schedule-jump-next');

    sprintOnlyInput?.addEventListener('change', (e) => {
        sprintOnlyFilter = !!e.target.checked;
        saveSchedulePrefs({ sprintOnlyFilter });
        renderScheduleAnalytics();
        renderRaces();
    });

    jumpBtn?.addEventListener('click', () => {
        const nextCard = document.getElementById('next-race-card');
        if (nextCard) {
            nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextCard.classList.add('race-card-spotlight');
            setTimeout(() => nextCard.classList.remove('race-card-spotlight'), 1300);
        }
    });

    return controls;
}

function applyScheduleFilters(races) {
    const now = new Date();
    let filtered = races;

    if (currentFilter === 'upcoming') {
        filtered = filtered.filter(r => new Date(r.date) >= now);
    } else if (currentFilter === 'completed') {
        filtered = filtered.filter(r => new Date(r.date) < now);
    }

    if (sprintOnlyFilter) {
        filtered = filtered.filter(r => !!(r.Sprint || r.SprintQualifying || r.SprintShootout));
    }

    return filtered;
}

function filterRaces(filter) {
    currentFilter = filter;
    document.querySelectorAll('#filter-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    renderScheduleAnalytics();
    renderRaces();
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

        // If current season, also try to get last race results to show winners on completed cards
        if (season === 'current') {
            try {
                const ds = await F1API.getDriverStandings();
                const cs = await F1API.getConstructorStandings();
                if (cs?.length) await fetchTeamLogos(cs);
            } catch (e) { /* non-critical */ }
        }

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
        showError(container, 'Failed to load schedule.', 'location.reload()');
        console.error(err);
    }
}

function renderScheduleAnalytics() {
    const section = ensureScheduleAnalyticsSection();
    const grid = section?.querySelector('#schedule-analytics-grid');
    if (!grid || !allRaces?.length) return;

    const now = new Date();
    const visibleRaces = applyScheduleFilters(allRaces);

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
            <h3>Races by Month (${currentFilter}${sprintOnlyFilter ? ', sprint only' : ''})</h3>
            <div class="analytics-bars">${monthBars || '<div class="analytics-empty">No races in this filter.</div>'}</div>
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
    const races = applyScheduleFilters(allRaces);

    if (!races.length) {
        container.innerHTML = `<div class="error-state" style="grid-column:1/-1"><div class="error-icon">${SVG_ICONS.calendar}</div><div class="error-message">No races found for current filters.</div></div>`;
        return;
    }

    // Find next race
    let nextRound = null;
    for (const r of allRaces) {
        if (new Date(r.date) >= now) {
            nextRound = r.round;
            break;
        }
    }

    container.innerHTML = races.map((r, i) => {
        const flag = countryFlagLargeHTML(r.Circuit?.Location?.country, 48);
        const isPast = new Date(r.date) < now;
        const isNext = r.round === nextRound;
        const raceTime = r.time ? formatTimeOnly(r.time) : '';
        const hasSprint = !!(r.Sprint || r.SprintQualifying || r.SprintShootout);
        const circuitImg = circuitImageHTML(r.Circuit?.url, 186, r.Circuit?.circuitName);
        const daysToRace = Math.ceil((new Date(r.date) - now) / 86400000);
        const countdownBadge = !isPast
            ? `<span class="race-countdown-pill">${daysToRace <= 0 ? 'Today' : `T-${daysToRace}`}</span>`
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
                    ${formatDate(r.date)}${raceTime ? ` · ${raceTime}` : ''}
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
    sprintOnlyFilter = !!prefs.sprintOnlyFilter;

    const sprintOnlyInput = controls?.querySelector('#schedule-sprint-only');
    if (sprintOnlyInput) sprintOnlyInput.checked = sprintOnlyFilter;

    const initialSeason = prefs.season || 'current';
    await loadSeason(initialSeason);
})();

