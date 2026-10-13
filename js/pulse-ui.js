/* Shared personalization, comparisons, readable explanations and dashboard layout. */
var PulseUI = (() => {
    const esc = value => PulseLab.esc(value), registry = { driver: new Map(), team: new Map(), race: new Map() };
    const data = {}; let toastTimer;
    function toast(text) {
        let element = document.getElementById('pulse-toast');
        if (!element) { element = document.createElement('div'); element.id = 'pulse-toast'; element.className = 'pulse-toast'; element.setAttribute('role', 'status'); document.body.append(element); }
        element.textContent = text; element.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 4000);
    }
    function dialog(title, content, className = '') {
        const element = document.createElement('dialog'); element.className = `pulse-dialog ${className}`;
        element.innerHTML = `<header class="dialog-heading"><h2>${esc(title)}</h2><button class="icon-button" data-close-dialog type="button" aria-label="Close ${esc(title)}">×</button></header><div class="dialog-body">${content}</div>`;
        element.querySelector('[data-close-dialog]').addEventListener('click', () => element.close());
        element.addEventListener('close', () => element.remove());
        element.addEventListener('click', event => { if (event.target === element) { const r = element.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) element.close(); } });
        document.body.append(element); element.showModal(); return element;
    }
    function actions(kind, id, name) {
        const favourite = PulseStore.isFavourite(kind, id), tray = getTray();
        return `<div class="entity-actions"><button type="button" class="entity-action" data-favourite-kind="${esc(kind)}" data-entity-id="${esc(id)}" data-entity-name="${esc(name)}" aria-pressed="${favourite}" aria-label="${favourite ? 'Unfollow' : 'Follow'} ${esc(name)}">${favourite ? '★ Following' : '☆ Follow'}</button><button type="button" class="entity-action" data-compare-kind="${esc(kind)}" data-entity-id="${esc(id)}" data-entity-name="${esc(name)}" aria-pressed="${tray.some(row => row.kind === kind && row.id === String(id))}" aria-label="Compare ${esc(name)}">＋ Compare</button></div>`;
    }
    function getTray() { const value = PulseStore.read('tray', []); return Array.isArray(value) ? value.filter(row => ['driver', 'team', 'race'].includes(row?.kind) && typeof row.id === 'string').slice(0, 4) : []; }
    function registerData(next) {
        Object.assign(data, next);
        (next.drivers || []).forEach(row => registry.driver.set(row.Driver.driverId, { ...row, name: PulseLab.fullName(row.Driver) }));
        (next.teams || []).forEach(row => registry.team.set(row.Constructor.constructorId, { ...row, name: row.Constructor.name }));
        [...(next.schedule || []), ...(next.races || [])].forEach(row => registry.race.set(`${row.season}:${row.round}`, { ...row, name: row.raceName }));
        const stored = PulseStore.read('entities', {});
        const saved = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        for (const [kind, rows] of Object.entries(registry)) for (const [id, row] of rows) saved[`${kind}:${id}`] = { ...row };
        PulseStore.write('entities', saved); updateButtons(); renderTray(); renderPersonalBriefing();
    }
    function entity(kind, id) { return registry[kind]?.get(id) || PulseStore.read('entities', {})?.[`${kind}:${id}`] || null; }
    function updateButtons() {
        const tray = getTray();
        document.querySelectorAll('[data-favourite-kind]').forEach(button => {
            const favourite = PulseStore.isFavourite(button.dataset.favouriteKind, button.dataset.entityId);
            button.setAttribute('aria-pressed', String(favourite)); button.setAttribute('aria-label', `${favourite ? 'Unfollow' : 'Follow'} ${button.dataset.entityName}`); button.textContent = favourite ? '★ Following' : '☆ Follow';
            const card = button.closest('.driver-card,.team-card,.race-card'); if (card) card.dataset.favourite = String(favourite);
        });
        document.querySelectorAll('[data-compare-kind]').forEach(button => button.setAttribute('aria-pressed', String(tray.some(row => row.kind === button.dataset.compareKind && row.id === button.dataset.entityId))));
    }
    function addComparison(kind, id, name) {
        let rows = getTray(); const exists = rows.some(row => row.kind === kind && row.id === id);
        if (exists) rows = rows.filter(row => !(row.kind === kind && row.id === id));
        else {
            if (rows.length && rows[0].kind !== kind) { toast(`Your tray contains ${rows[0].kind}s. Clear it to compare ${kind}s.`); return; }
            if (rows.length >= 4) { toast('Compare up to four items. Remove one from the tray first.'); return; }
            rows.push({ kind, id, name });
        }
        PulseStore.write('tray', rows); renderTray(); updateButtons();
    }
    function renderTray() {
        let tray = document.getElementById('comparison-tray');
        if (!tray) { tray = document.createElement('aside'); tray.id = 'comparison-tray'; tray.className = 'comparison-tray'; tray.setAttribute('aria-label', 'Saved comparison tray'); document.body.append(tray); }
        const rows = getTray(); tray.hidden = !rows.length; document.body.classList.toggle('has-comparison-tray', !!rows.length);
        tray.innerHTML = `<span class="tray-title">Compare <strong>${rows.length}/4</strong></span><div class="tray-items">${rows.map((row, index) => `<button class="tray-chip" data-remove-comparison="${index}" aria-label="Remove ${esc(row.name)}">${esc(row.name)} <span aria-hidden="true">×</span></button>`).join('')}</div><button class="ui-btn ui-btn-primary" id="open-comparison" ${rows.length < 2 ? 'disabled' : ''}>Compare</button><button class="text-button" id="clear-comparison">Clear</button>`;
        tray.querySelectorAll('[data-remove-comparison]').forEach(button => button.addEventListener('click', () => { const next = getTray(); next.splice(Number(button.dataset.removeComparison), 1); PulseStore.write('tray', next); renderTray(); updateButtons(); }));
        tray.querySelector('#clear-comparison').addEventListener('click', () => { PulseStore.write('tray', []); renderTray(); updateButtons(); });
        tray.querySelector('#open-comparison').addEventListener('click', openComparison);
    }
    async function openComparison() {
        const rows = getTray(); if (rows.length < 2) return;
        const trayDialog = dialog('Your comparison', '<p class="muted">Loading selected data…</p>', 'wide-dialog');
        try {
            const kind = rows[0].kind;
            if (kind === 'driver') registerData({ drivers: await F1API.getDriverStandings() });
            if (kind === 'team') registerData({ teams: await F1API.getConstructorStandings() });
            const selected = await Promise.all(rows.map(async row => {
                if (kind !== 'race') return entity(kind, row.id);
                const [season, round] = row.id.split(':'); return F1API.getRaceResults(season, round).catch(() => entity(kind, row.id));
            }));
            if (!trayDialog.isConnected) return;
            const metrics = kind === 'driver' ? [['Season', row => row?.season], ['Points', row => row?.points], ['Wins', row => row?.wins], ['Position', row => row?.position ? `P${row.position}` : null], ['Team', row => row?.Constructors?.map(team => team.name).join(', ')]]
                : kind === 'team' ? [['Season', row => row?.season], ['Points', row => row?.points], ['Wins', row => row?.wins], ['Position', row => row?.position ? `P${row.position}` : null], ['Nationality', row => row?.Constructor?.nationality]]
                : [['Date', row => row?.date], ['Winner', row => row?.Results?.[0] ? PulseLab.fullName(row.Results[0].Driver) : null], ['Circuit', row => row?.Circuit?.circuitName], ['Entries', row => row?.Results?.length || null], ['Finishers', row => row?.Results ? row.Results.filter(result => PulseLab.finished(result.status)).length : null]];
            trayDialog.querySelector('.dialog-body').innerHTML = `<div class="table-wrapper"><table class="comparison-table"><thead><tr><th>Metric</th>${rows.map(row => `<th>${esc(row.name)}</th>`).join('')}</tr></thead><tbody>${metrics.map(([name, value]) => `<tr><th scope="row">${name}</th>${selected.map(row => `<td>${esc(value(row) ?? 'Unavailable')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted small">Published data. Missing values are shown explicitly. Your selection stays on this browser.</p>`;
        } catch { if (trayDialog?.isConnected) trayDialog.querySelector('.dialog-body').textContent = 'Comparison data is temporarily unavailable. Close and try again.'; }
    }
    function filterRows(kind, rows, value) {
        const query = String(value.query || '').trim().toLowerCase(), favourites = PulseStore.favourites(kind);
        return rows.filter(row => {
            const id = kind === 'driver' ? row.Driver.driverId : row.Constructor.constructorId;
            const name = kind === 'driver' ? `${PulseLab.fullName(row.Driver)} ${row.Driver.nationality} ${row.Constructors?.map(team => team.name).join(' ')}` : `${row.Constructor.name} ${row.Constructor.nationality}`;
            return (!query || name.toLowerCase().includes(query)) && (!value.favourites || favourites.includes(id)) && (!value.team || row.Constructors?.some(team => team.constructorId === value.team));
        });
    }
    function setupFilters(kind, rows, anchor, onChange) {
        let toolbar = document.getElementById(`${kind}-filters`); if (toolbar) return;
        toolbar = document.createElement('div'); toolbar.id = `${kind}-filters`; toolbar.className = 'filter-bar';
        const saved = PulseStore.read(`filters:${kind}`, {}), teams = [...new Map(rows.flatMap(row => row.Constructors || []).map(team => [team.constructorId, team])).values()];
        toolbar.innerHTML = `<label class="field grow"><span>Search ${kind}s</span><input type="search" id="${kind}-search" placeholder="Name${kind === 'driver' ? ', team' : ''} or nationality" value="${esc(saved.query || '')}"></label>${teams.length ? `<label class="field"><span>Team</span><select id="${kind}-filter-team"><option value="">All teams</option>${teams.map(team => `<option value="${esc(team.constructorId)}">${esc(team.name)}</option>`).join('')}</select></label>` : ''}<label class="check-field"><input type="checkbox" id="${kind}-filter-favourites" ${saved.favourites ? 'checked' : ''}> Following only</label><button type="button" class="text-button" id="${kind}-clear-filters">Reset filters</button><p class="active-filters" id="${kind}-active-filters" aria-live="polite"></p>`;
        anchor.insertAdjacentElement('beforebegin', toolbar);
        const input = toolbar.querySelector('input[type="search"]'), team = toolbar.querySelector('select'), favourites = toolbar.querySelector('input[type="checkbox"]'); if (team) team.value = saved.team || '';
        const render = () => {
            const value = { query: input.value, team: team?.value || '', favourites: favourites.checked }; PulseStore.write(`filters:${kind}`, value);
            const filtered = filterRows(kind, rows, value);
            toolbar.querySelector('.active-filters').textContent = `${filtered.length} of ${rows.length} ${kind}s${value.query ? ` · Search: ${value.query}` : ''}${value.team ? ` · ${team.selectedOptions[0].textContent}` : ''}${value.favourites ? ' · Following' : ''}`;
            onChange(filtered);
        };
        input.addEventListener('input', render); team?.addEventListener('change', render); favourites.addEventListener('change', render);
        toolbar.querySelector('.text-button').addEventListener('click', () => { input.value = ''; if (team) team.value = ''; favourites.checked = false; render(); });
        window.addEventListener('pulse:favourites', render); render(); return { render, setRows(next) { rows = next; render(); } };
    }
    function fold(section, description) {
        if (!section || section.dataset.folded) return;
        section.dataset.folded = 'true'; const details = document.createElement('details'); details.className = 'analysis-fold';
        const title = section.querySelector('h2')?.textContent || 'More analysis', summary = document.createElement('summary'); summary.textContent = title;
        const body = document.createElement('div'); body.className = 'fold-body';
        while (section.firstChild) body.append(section.firstChild);
        body.querySelector('.section-header')?.remove();
        if (description) { const text = document.createElement('p'); text.className = 'muted small'; text.textContent = description; body.prepend(text); }
        details.append(summary, body); section.append(details);
    }
    const widgets = [
        ['personal-briefing-section', 'Your briefing', true], ['quick-stats-section', 'Season at a glance', true], ['latest-results-section', 'Latest race results', true],
        ['championship-battle-section', 'Driver championship', true], ['constructor-battle-section', 'Constructor championship', true], ['upcoming-section', 'Upcoming races', true],
        ['season-progress-section', 'Season progress', false], ['last-podium-section', 'Latest podium', false], ['standings-section', 'Driver cards', false],
        ['constructors-section', 'Team cards', false], ['fastest-laps-section', 'Fastest laps', false], ['teammate-h2h-section', 'Teammate comparisons', false]
    ];
    function getLayout() {
        const saved = PulseStore.read('dashboard', []), seen = new Set();
        const valid = Array.isArray(saved) ? saved.filter(row => row && widgets.some(([id]) => id === row.id) && !seen.has(row.id) && seen.add(row.id)) : [];
        return [...valid, ...widgets.filter(([id]) => !valid.some(row => row.id === id)).map(([id, name, visible]) => ({ id, name, visible, width: 'full' }))]
            .map(row => ({ ...row, name: widgets.find(([id]) => id === row.id)[1], visible: row.visible !== false, width: row.width === 'half' ? 'half' : 'full' }));
    }
    function applyLayout() {
        const parent = document.querySelector('.home-panels'); if (!parent) return;
        getLayout().forEach(row => { const panel = document.getElementById(row.id); if (panel) { panel.dataset.userHidden = String(!row.visible); panel.dataset.widgetWidth = row.width; parent.append(panel); } });
    }
    function customizeDashboard() {
        const content = dialog('Customize your dashboard', '<p class="muted small">Show the panels you need. Reorder with the arrow buttons or drag a row. Half-width panels expand on mobile.</p><div id="widget-options"></div><button class="text-button" id="reset-dashboard">Restore the clean default</button>');
        const draw = () => {
            const rows = getLayout(), list = content.querySelector('#widget-options');
            list.innerHTML = rows.map((row, index) => `<div class="widget-option" draggable="true" data-widget-index="${index}"><span class="drag-handle" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-visible="${index}" ${row.visible ? 'checked' : ''}> ${esc(row.name)}</label><select aria-label="Width of ${esc(row.name)}" data-width="${index}"><option value="full" ${row.width === 'full' ? 'selected' : ''}>Full width</option><option value="half" ${row.width === 'half' ? 'selected' : ''}>Half width</option></select><button class="icon-button" data-move="${index}" data-direction="-1" aria-label="Move ${esc(row.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" data-move="${index}" data-direction="1" aria-label="Move ${esc(row.name)} down" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('');
            const save = () => { PulseStore.write('dashboard', rows); applyLayout(); };
            list.querySelectorAll('[data-visible]').forEach(input => input.addEventListener('change', () => { rows[Number(input.dataset.visible)].visible = input.checked; save(); }));
            list.querySelectorAll('[data-width]').forEach(input => input.addEventListener('change', () => { rows[Number(input.dataset.width)].width = input.value; save(); }));
            list.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => { const i = Number(button.dataset.move), next = i + Number(button.dataset.direction); [rows[i], rows[next]] = [rows[next], rows[i]]; save(); draw(); }));
            let dragged = null;
            list.querySelectorAll('[draggable]').forEach(row => { row.addEventListener('dragstart', event => { dragged = Number(row.dataset.widgetIndex); event.dataTransfer.setData('text/plain', String(dragged)); }); row.addEventListener('dragover', event => event.preventDefault()); row.addEventListener('drop', event => { event.preventDefault(); if (dragged === null) return; const entry = rows.splice(dragged, 1)[0]; rows.splice(Number(row.dataset.widgetIndex), 0, entry); save(); draw(); }); });
        };
        content.querySelector('#reset-dashboard').addEventListener('click', () => { PulseStore.write('dashboard', []); applyLayout(); draw(); }); draw();
    }
    function renderPersonalBriefing() {
        const section = document.getElementById('personal-briefing-section'); if (!section) return;
        const ids = PulseStore.favourites('driver'), favouriteTeams = PulseStore.favourites('team');
        const favouriteRows = (data.drivers || []).filter(row => ids.includes(row.Driver.driverId) || row.Constructors?.some(team => favouriteTeams.includes(team.constructorId)));
        const next = (data.schedule || []).find(race => Date.parse(`${race.date}T${race.time || '23:59:59Z'}`) > Date.now());
        section.innerHTML = `<div class="section-header"><h2>Your briefing</h2><a class="section-link" href="insights.html">Open Insights →</a></div><div class="briefing-grid"><div><p class="eyebrow">Following</p>${favouriteRows.length ? `<div class="followed-list">${favouriteRows.slice(0, 6).map(row => `<a href="driver-profile.html?driver=${esc(row.Driver.driverId)}">${esc(row.Driver.familyName)} <strong>P${row.position} · ${row.points} pts</strong></a>`).join('')}</div>` : '<p class="muted">Follow drivers or teams to make this briefing yours.</p><button class="text-button" data-open-preferences>Choose favourites →</button>'}</div><div><p class="eyebrow">Next weekend</p><h3>${esc(next?.raceName || 'Calendar updating')}</h3><p class="muted">${next ? esc(formatLocalSessionDateTime(new Date(`${next.date}T${next.time || '14:00:00Z'}`))) : 'Check the calendar for the next published race.'}</p></div></div>`;
        section.style.display = '';
    }
    async function preferences() {
        const content = dialog('Your preferences', `<p class="muted small">Saved on this browser. No account needed.</p><label class="field"><span>Appearance</span><select id="theme-preference"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option></select></label><h3 class="preferences-title">Follow drivers and teams</h3><div id="favourite-options"><p class="muted">Loading the current field…</p></div>`);
        const theme = content.querySelector('#theme-preference'); theme.value = PulseStore.read('theme', 'dark'); theme.addEventListener('change', () => { PulseStore.write('theme', theme.value); PulseStore.applyTheme(theme.value); updateThemeButton(); });
        const settled = await Promise.allSettled([F1API.getDriverStandings(), F1API.getConstructorStandings()]);
        if (!content.isConnected) return;
        registerData({ drivers: settled[0].status === 'fulfilled' ? settled[0].value : data.drivers || [], teams: settled[1].status === 'fulfilled' ? settled[1].value : data.teams || [] });
        const options = content.querySelector('#favourite-options'); options.innerHTML = ['driver', 'team'].map(kind => `<fieldset class="favourite-group"><legend>${kind === 'driver' ? 'Drivers' : 'Teams'}</legend>${[...registry[kind]].map(([id, row]) => `<label><input type="checkbox" data-favourite-checkbox="${kind}" value="${esc(id)}" ${PulseStore.isFavourite(kind, id) ? 'checked' : ''}> ${esc(row.name)}</label>`).join('') || '<p class="muted">Data unavailable. Try again later.</p>'}</fieldset>`).join('');
        options.querySelectorAll('input').forEach(input => input.addEventListener('change', () => { PulseStore.toggleFavourite(input.dataset.favouriteCheckbox, input.value); updateButtons(); renderPersonalBriefing(); window.dispatchEvent(new Event('pulse:favourites')); }));
    }
    function updateThemeButton() { const button = document.getElementById('theme-toggle'); if (button) { const light = document.documentElement.dataset.theme === 'light'; button.textContent = light ? '☾' : '☀'; button.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`); } }
    function glossary(term = '') {
        const content = dialog('F1 explained', `<label class="field"><span>Search terms</span><input type="search" id="glossary-search" value="${esc(term)}" placeholder="Gap, stint, countback…"></label><div id="glossary-results"></div>`);
        const input = content.querySelector('input'), render = () => { const rows = Object.entries(PulseLab.glossary).filter(([name, definition]) => `${name} ${definition}`.toLowerCase().includes(input.value.toLowerCase())); content.querySelector('#glossary-results').innerHTML = rows.map(([name, definition]) => `<article class="glossary-term"><h3>${esc(name)}</h3><p>${esc(definition)}</p></article>`).join('') || '<p class="muted">No matching terms.</p>'; };
        input.addEventListener('input', render); render();
    }
    function init(activePage) {
        const tools = document.createElement('div'); tools.className = 'nav-personal'; tools.innerHTML = '<button type="button" class="icon-button" id="theme-toggle" aria-label="Switch theme"></button><button type="button" class="icon-button" data-open-preferences aria-label="Open preferences and favourites">⚙</button>';
        document.querySelector('.nav-f1tv-btn')?.insertAdjacentElement('beforebegin', tools); updateThemeButton();
        tools.querySelector('#theme-toggle').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; PulseStore.write('theme', next); PulseStore.applyTheme(next); updateThemeButton(); });
        renderTray();
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-favourite-kind],[data-compare-kind],[data-open-preferences],[data-open-glossary],[data-customize-dashboard]'); if (!button) return;
            event.preventDefault(); event.stopPropagation();
            if (button.dataset.favouriteKind) { PulseStore.toggleFavourite(button.dataset.favouriteKind, button.dataset.entityId); updateButtons(); renderPersonalBriefing(); window.dispatchEvent(new Event('pulse:favourites')); }
            else if (button.dataset.compareKind) addComparison(button.dataset.compareKind, button.dataset.entityId, button.dataset.entityName);
            else if (button.hasAttribute('data-open-preferences')) preferences();
            else if (button.hasAttribute('data-open-glossary')) glossary(button.dataset.openGlossary);
            else customizeDashboard();
        }, true);
        if (activePage === 'home') {
            const host = document.querySelector('main > .container'), panels = document.createElement('div'); panels.className = 'home-panels';
            [...host.children].filter(child => child.classList.contains('section')).forEach(child => panels.append(child));
            const briefing = document.createElement('section'); briefing.id = 'personal-briefing-section'; briefing.className = 'section panel'; panels.prepend(briefing); host.append(panels);
            const toolbar = document.querySelector('.dashboard-shortcuts'); toolbar.insertAdjacentHTML('beforeend', '<button class="preference-btn" data-customize-dashboard>Customize dashboard</button>');
            applyLayout(); renderPersonalBriefing();
        }
        if (['workspace', 'replay', 'championship', 'insights'].includes(activePage)) {
            const nav = document.createElement('nav'); nav.className = 'lab-nav'; nav.setAttribute('aria-label', 'Explore tools');
            nav.innerHTML = [['workspace', 'Explore', 'workspace.html'], ['replay', 'Race Replay', 'replay.html'], ['championship', 'Championship Lab', 'championship.html'], ['insights', 'Insights', 'insights.html']].map(([id, name, href]) => `<a href="${href}" ${id === activePage ? 'aria-current="page"' : ''}>${name}</a>`).join(''); document.querySelector('main > .container')?.prepend(nav);
        }
    }
    return { init, registerData, actions, setupFilters, filterRows, fold, dialog, toast, glossary, preferences, getLayout, applyLayout, entity, esc, data };
})();
