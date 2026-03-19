/* ============================================
   F1 PULSE - About Page Overview
   ============================================ */

function aboutEsc(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

(async function () {
    initPage('about');

    const subtitle = document.getElementById('about-subtitle');
    const heroMetrics = document.getElementById('about-hero-metrics');
    const driverGrid = document.getElementById('about-driver-grid');
    const teamGrid = document.getElementById('about-team-grid');

    const state = {
        season: new Date().getFullYear(),
        drivers: [],
        teams: [],
        enriched: {},
    };

    showLoading(driverGrid, 'Loading driver headshots', 'skeleton-cards');
    showLoading(teamGrid, 'Loading team profiles', 'skeleton-cards');

    try {
        const [driverStandings, constructorStandings, enriched] = await Promise.all([
            F1API.getDriverStandings(),
            F1API.getConstructorStandings(),
            loadEnrichedDrivers().catch(() => ({})),
        ]);

        if (constructorStandings?.length) {
            await fetchTeamLogos(constructorStandings);
        }

        state.drivers = driverStandings || [];
        state.teams = constructorStandings || [];
        state.enriched = enriched || {};
        state.season = driverStandings?.[0]?.season || constructorStandings?.[0]?.season || new Date().getFullYear();

        subtitle.textContent = `${state.season} visual index for all drivers and teams. Click any card to open full profile.`;
        renderOverview();
    } catch (err) {
        subtitle.textContent = 'About data unavailable right now.';
        showError(driverGrid, 'Failed to load driver overview. Please try again.', 'location.reload()');
        showError(teamGrid, 'Failed to load team overview. Please try again.', 'location.reload()');
        console.error(err);
    }

    function renderOverview() {
        const drivers = state.drivers || [];
        const teams = state.teams || [];
        renderHeroMetrics(drivers, teams, drivers, teams);
        renderDriverTiles(drivers, state.enriched || {});
        renderTeamTiles(teams);
    }

    function renderHeroMetrics(drivers, teams, shownDrivers, shownTeams) {
        if (!heroMetrics) return;

        const totalPoints = drivers.reduce((sum, d) => sum + (parseFloat(d?.points) || 0), 0);
        const totalWins = teams.reduce((sum, t) => sum + (parseInt(t?.wins, 10) || 0), 0);
        const shownPoints = shownDrivers.reduce((sum, d) => sum + (parseFloat(d?.points) || 0), 0);

        heroMetrics.innerHTML = `
            <article class="about-hero-metric">
                <span class="label">Drivers</span>
                <strong>${shownDrivers.length}/${drivers.length}</strong>
                <em>Visible biography cards</em>
            </article>
            <article class="about-hero-metric">
                <span class="label">Teams</span>
                <strong>${shownTeams.length}/${teams.length}</strong>
                <em>Visible team profile cards</em>
            </article>
            <article class="about-hero-metric">
                <span class="label">Driver Points</span>
                <strong>${Math.round(totalPoints)}</strong>
                <em>Total listed championship points</em>
            </article>
            <article class="about-hero-metric">
                <span class="label">Constructor Wins</span>
                <strong>${totalWins}</strong>
                <em>Across current constructor standings</em>
            </article>
            <article class="about-hero-metric">
                <span class="label">Visible Points</span>
                <strong>${Math.round(shownPoints)}</strong>
                <em>Displayed driver points</em>
            </article>`;
    }

    function renderDriverTiles(drivers, enriched) {
        if (!driverGrid) return;
        if (!drivers.length) {
            driverGrid.innerHTML = '<div class="error-state"><div class="error-message">No driver data available right now.</div></div>';
            return;
        }

        driverGrid.innerHTML = drivers.map((item) => {
            const d = item?.Driver || {};
            const cIdRaw = item?.Constructors?.[0]?.constructorId;
            const teamId = resolveTeamId(cIdRaw) || cIdRaw || '';
            const teamColor = getTeamColor(cIdRaw);
            const key = ABOUT_DATA.normalizeDriverKey(d.driverId, d.familyName);
            const photo = ABOUT_DATA.driverProfilePhotoURL(d, enriched, key);
            const href = `driver-profile.html?driver=${encodeURIComponent(d.driverId || '')}&team=${encodeURIComponent(teamId)}`;
            const points = parseFloat(item?.points) || 0;
            const wins = parseInt(item?.wins, 10) || 0;
            const nationality = d?.nationality || '';
            const nationalityFlag = countryFlagHTML(nationality, 14);

            return `
                <a href="${href}" class="about-driver-tile" aria-label="Open profile for ${aboutEsc(d.givenName)} ${aboutEsc(d.familyName)}">
                    <div class="about-driver-tile-media" style="--team:${teamColor}">
                        ${photo
                            ? `<img src="${aboutEsc(photo)}" alt="${aboutEsc(d.givenName)} ${aboutEsc(d.familyName)}" class="about-profile-photo about-driver-tile-photo" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${photo ? 'none' : 'grid'}">Paste driver image URL in js/about-data.js</div>
                        <span class="about-driver-position">P${aboutEsc(item?.position || '-')}</span>
                    </div>
                    <div class="about-tile-caption">
                        <strong>${aboutEsc(d.givenName)} ${aboutEsc(d.familyName)}</strong>
                        <span>${nationalityFlag} ${aboutEsc(nationality)} · ${inlineTeamHTML(teamId)}</span>
                        <span>${aboutEsc(points.toFixed(points % 1 ? 1 : 0))} pts · ${aboutEsc(wins)} wins</span>
                    </div>
                </a>`;
        }).join('');
    }

    function renderTeamTiles(teams) {
        if (!teamGrid) return;
        if (!teams.length) {
            teamGrid.innerHTML = '<div class="error-state"><div class="error-message">No team data available right now.</div></div>';
            return;
        }

        teamGrid.innerHTML = teams.map((item) => {
            const cIdRaw = item?.Constructor?.constructorId;
            const teamId = resolveTeamId(cIdRaw) || cIdRaw || '';
            const teamName = getTeamName(cIdRaw);
            const teamColor = getTeamColor(cIdRaw);
            const logo = teamLogoHTML(cIdRaw, 72);
            const car = getTeamCarUrl(teamId) || '';
            const href = `team-profile.html?team=${encodeURIComponent(teamId)}`;
            const points = parseFloat(item?.points) || 0;
            const wins = parseInt(item?.wins, 10) || 0;
            const nationality = item?.Constructor?.nationality || '';
            const nationalityFlag = countryFlagHTML(nationality, 14);

            return `
                <a href="${href}" class="about-team-tile" aria-label="Open profile for ${aboutEsc(teamName)}">
                    <div class="about-team-tile-head" style="--team:${teamColor}">
                        <div class="about-team-logo-wrap">${logo}</div>
                        <span class="about-team-position">P${aboutEsc(item?.position || '-')}</span>
                    </div>
                    <div class="about-team-car-shell">
                        ${car
                            ? `<img src="${aboutEsc(car)}" alt="${aboutEsc(teamName)} car" class="about-team-car" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${car ? 'none' : 'grid'}">Paste team image URL in js/about-data.js</div>
                    </div>
                    <div class="about-tile-caption">
                        <strong>${aboutEsc(teamName)}</strong>
                        <span>${nationalityFlag} ${aboutEsc(nationality)}</span>
                        <span>${aboutEsc(points.toFixed(points % 1 ? 1 : 0))} pts · ${aboutEsc(wins)} wins</span>
                    </div>
                </a>`;
        }).join('');
    }
})();
