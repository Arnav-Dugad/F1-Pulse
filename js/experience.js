/* Shared preferences and a keyboard-accessible page finder. */
function initPremiumExperience() {
    const read = (key, fallback) => {
        try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
    };
    const save = (key, value) => {
        try { localStorage.setItem(key, value); } catch { /* Preferences work for this visit. */ }
    };
    document.documentElement.dataset.density = read('f1pulse_density', 'comfortable');
    document.documentElement.dataset.motion = read('f1pulse_motion', 'full');

    const routes = [
        ['Home', 'Next race, countdown and championship overview', 'index.html'],
        ['Drivers', 'Driver standings, profiles and comparisons', 'drivers.html'],
        ['Teams', 'Constructor championship and team profiles', 'teams.html'],
        ['Schedule', 'Race calendar, session times and calendar exports', 'schedule.html'],
        ['Explore', 'Replay, championship scenarios and personal insights', 'workspace.html'],
        ['Race Replay', 'Historical circuit replay and synchronized comparisons', 'replay.html'],
        ['Championship Lab', 'What-if scenarios, points history and title bounds', 'championship.html'],
        ['Insights', 'Race briefings, explanations and forecast evaluation', 'insights.html'],
        ['Profiles', 'Driver biographies and team stories', 'about.html'],
    ];
    const dialog = document.createElement('dialog');
    dialog.className = 'page-finder';
    dialog.setAttribute('aria-labelledby', 'finder-title');
    dialog.innerHTML = `<div class="finder-header"><div><span class="finder-eyebrow">F1 PULSE / QUICK NAVIGATION</span><h2 id="finder-title">Find your next stop.</h2></div><button class="finder-close" type="button" aria-label="Close search">×</button></div>
        <label class="sr-only" for="finder-input">Search pages</label>
        <input id="finder-input" type="search" placeholder="Search drivers, teams, calendar…" autocomplete="off">
        <div class="finder-results"></div><p class="finder-help">Tab to explore · Enter to open · Esc to close</p>`;
    document.body.appendChild(dialog);
    const input = dialog.querySelector('input');
    const results = dialog.querySelector('.finder-results');
    const render = () => {
        const query = input.value.trim().toLowerCase();
        const matches = routes.filter(([name, description]) => `${name} ${description}`.toLowerCase().includes(query));
        results.replaceChildren();
        matches.forEach(([name, description, href]) => {
            const link = document.createElement('a');
            link.href = href;
            const title = document.createElement('strong');
            title.textContent = name;
            const detail = document.createElement('span');
            detail.textContent = description;
            const arrow = document.createElement('span');
            arrow.className = 'finder-arrow';
            arrow.textContent = '↗';
            link.append(title, detail, arrow);
            results.appendChild(link);
        });
        if (!matches.length) {
            const empty = document.createElement('p');
            empty.className = 'finder-empty';
            empty.textContent = 'No pages found. Try “drivers” or “calendar”.';
            results.appendChild(empty);
        }
    };
    const open = () => {
        if (dialog.open) return;
        input.value = '';
        render();
        dialog.showModal();
        input.focus();
    };
    dialog.querySelector('.finder-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('a')?.focus(); }
        if (event.key === 'Enter') { event.preventDefault(); results.querySelector('a')?.click(); }
    });
    const trigger = document.createElement('button');
    trigger.className = 'nav-search';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Find a page (Ctrl or Command K)');
    trigger.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><kbd>⌘ K</kbd>';
    trigger.querySelector('kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
    trigger.addEventListener('click', open);
    document.querySelector('.nav-f1tv-btn')?.insertAdjacentElement('beforebegin', trigger);
    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            if (dialog.open) dialog.close(); else open();
        }
    });

    document.querySelectorAll('[data-preference]').forEach((button) => {
        const preference = button.dataset.preference;
        const activeValue = preference === 'motion' ? 'calm' : 'compact';
        const defaultValue = preference === 'motion' ? 'full' : 'comfortable';
        const sync = () => button.setAttribute('aria-pressed', String(document.documentElement.dataset[preference] === activeValue));
        sync();
        button.addEventListener('click', () => {
            const value = document.documentElement.dataset[preference] === activeValue ? defaultValue : activeValue;
            document.documentElement.dataset[preference] = value;
            save(`f1pulse_${preference}`, value);
            sync();
        });
    });

    // A closed mobile menu must not leave invisible links in the tab order.
    const navLinks = document.getElementById('nav-links');
    const syncMenu = () => {
        navLinks.inert = matchMedia('(max-width: 900px)').matches && !navLinks.classList.contains('open');
    };
    syncMenu();
    new MutationObserver(syncMenu).observe(navLinks, { attributes: true, attributeFilter: ['class'] });
    matchMedia('(max-width: 900px)').addEventListener('change', syncMenu);
}
