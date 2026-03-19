/* ============================================
   F1 PULSE - Team Profile Page
   ============================================ */

function teamProfileEsc(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

(async function () {
    initPage('about');
    document.body.classList.add('page-about-detail', 'page-team-profile');

    const subtitle = document.getElementById('team-profile-subtitle');
    const main = document.getElementById('team-profile-main');
    const header = document.getElementById('team-profile-header');

    showLoading(main, 'Loading team profile', 'skeleton-cards');

    const params = new URLSearchParams(window.location.search);
    const teamParam = params.get('team') || '';

    try {
        const [driverStandings, constructorStandings, enriched] = await Promise.all([
            F1API.getDriverStandings(),
            F1API.getConstructorStandings(),
            loadEnrichedDrivers(),
        ]);

        if (constructorStandings?.length) {
            await fetchTeamLogos(constructorStandings);
        }

        const item = (constructorStandings || []).find((t) => resolveTeamId(t?.Constructor?.constructorId) === teamParam)
            || (constructorStandings || [])[0];

        if (!item?.Constructor) {
            showError(main, 'Team profile not found.', 'window.location.href="about.html"');
            return;
        }

        const constructorIdRaw = item.Constructor.constructorId;
        const teamId = resolveTeamId(constructorIdRaw) || constructorIdRaw || '';
        const teamName = getTeamName(constructorIdRaw);
        const teamColor = getTeamColor(constructorIdRaw);
        const gradient = ABOUT_DATA.getTeamBrandGradient(teamId);
        const profileText = ABOUT_DATA.getTeamProfile(teamId, teamName);
        const logo = teamLogoHTML(constructorIdRaw, 96);
        const car = getTeamCarUrl(teamId);
        const nationality = item?.Constructor?.nationality || '';
        const flag = countryFlagHTML(nationality, 18);

        const teamDriverEntries = (driverStandings || [])
            .filter((d) => resolveTeamId(d?.Constructors?.[0]?.constructorId) === teamId)
            .slice(0, 2);

        const teamDrivers = teamDriverEntries
            .map((entry) => `${entry?.Driver?.givenName || ''} ${entry?.Driver?.familyName || ''}`.trim())
            .filter(Boolean);
        const teamDriversText = teamDrivers.length ? teamDrivers.join(' | ') : 'Driver lineup updating';
        const teamDetails = ABOUT_DATA.getTeamDetails(teamId, item?.Constructor?.name || teamName);

        const teamDriverCards = teamDriverEntries.length
            ? teamDriverEntries.map((entry) => {
                const driver = entry?.Driver || {};
                const driverKey = ABOUT_DATA.normalizeDriverKey(driver.driverId, driver.familyName);
                const driverPhoto = ABOUT_DATA.driverProfilePhotoURL(driver, enriched || {}, driverKey);
                const driverHeroPos = ABOUT_DATA.getDriverHeroFraming(driverKey);
                const driverFirst = driver.givenName || '';
                const driverLast = driver.familyName || '';
                const driverNumber = driver.permanentNumber || '--';
                const driverFlag = countryFlagHTML(driver.nationality || '', 24);

                return `<article class="team-driver-show-card" style="--team:${teamColor};--team-top:${teamProfileEsc(gradient.top)};--team-mid:${teamProfileEsc(gradient.mid)};--team-bottom:${teamProfileEsc(gradient.bottom)}">
                    <div class="team-driver-show-copy">
                        <h4><span>${teamProfileEsc(driverFirst)}</span><strong>${teamProfileEsc(driverLast)}</strong></h4>
                        <p>${teamProfileEsc(teamName)}</p>
                        <span class="team-driver-show-number">${teamProfileEsc(String(driverNumber))}</span>
                        <span class="team-driver-show-flag">${driverFlag}</span>
                    </div>
                    <div class="team-driver-show-media">
                        ${driverPhoto
                            ? `<img src="${teamProfileEsc(driverPhoto)}" alt="${teamProfileEsc(`${driverFirst} ${driverLast}`.trim())}" class="team-driver-show-photo" style="object-position:${teamProfileEsc(driverHeroPos)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${driverPhoto ? 'none' : 'grid'}">Paste driver image URL in js/about-data.js</div>
                    </div>
                </article>`;
            }).join('')
            : `<article class="team-driver-show-card placeholder" style="--team:${teamColor};--team-top:${teamProfileEsc(gradient.top)};--team-mid:${teamProfileEsc(gradient.mid)};--team-bottom:${teamProfileEsc(gradient.bottom)}">
                <div class="team-driver-show-copy">
                    <h4><span>Lineup</span><strong>Updating</strong></h4>
                    <p>${teamProfileEsc(teamName)}</p>
                    <span class="team-driver-show-number">--</span>
                </div>
            </article>`;

        const profileFacts = [
            ['Full Team Name', teamDetails.fullTeamName],
            ['Base', teamDetails.base],
            ['Team Chief', teamDetails.teamChief],
            ['Technical Chief', teamDetails.technicalChief],
            ['Chassis', teamDetails.chassis],
            ['Power Unit', teamDetails.powerUnit],
            ['Reserve Driver', teamDetails.reserveDriver],
            ['First Team Entry', teamDetails.firstTeamEntry],
        ].map(([label, value]) => `<article class="team-profile-fact"><span>${teamProfileEsc(label)}</span><strong>${teamProfileEsc(value || 'Updating')}</strong></article>`).join('');

        if (header) {
            header.style.setProperty('--profile-team', teamColor);
        }

        if (subtitle) {
            subtitle.textContent = `${teamName} · team profile, drivers and car`;
        }

        main.innerHTML = `
            <section class="team-car-hero" style="--team:${teamColor};--team-top:${teamProfileEsc(gradient.top)};--team-mid:${teamProfileEsc(gradient.mid)};--team-bottom:${teamProfileEsc(gradient.bottom)}">
                <div class="team-car-hero-art">
                    <div class="team-car-hero-wrap">
                        ${car
                            ? `<img src="${teamProfileEsc(car)}" alt="${teamProfileEsc(teamName)} car" class="team-car-hero-image" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${car ? 'none' : 'grid'}">Paste team image URL in js/about-data.js</div>
                    </div>
                </div>
                <div class="team-car-hero-meta">
                    <h2>${teamProfileEsc(teamName)}</h2>
                    <p>${teamProfileEsc(teamDriversText)}</p>
                    <div class="team-car-hero-logo">${logo}</div>
                </div>
            </section>

            <section class="team-drivers-showcase" style="--team:${teamColor};--team-top:${teamProfileEsc(gradient.top)};--team-mid:${teamProfileEsc(gradient.mid)};--team-bottom:${teamProfileEsc(gradient.bottom)}">
                <header class="team-drivers-showcase-head">
                    <h3>Drivers</h3>
                </header>
                <div class="team-driver-show-grid">
                    ${teamDriverCards}
                </div>
                <div class="team-driver-showcase-stripes" aria-hidden="true"><span></span><span></span></div>
            </section>

            <section class="team-bio-shell" style="--team:${teamColor};--team-top:${teamProfileEsc(gradient.top)};--team-mid:${teamProfileEsc(gradient.mid)};--team-bottom:${teamProfileEsc(gradient.bottom)}">
                <header class="team-bio-header">
                    <h3>Team Profile</h3>
                    <p>${flag} ${teamProfileEsc(item?.Constructor?.name || teamName)} · ${teamProfileEsc(nationality)}</p>
                </header>
                <div class="team-profile-facts-grid">
                    ${profileFacts}
                </div>
                <p class="profile-bio-text">${teamProfileEsc(profileText)}</p>
            </section>`;
    } catch (err) {
        if (subtitle) {
            subtitle.textContent = 'Team profile data unavailable right now.';
        }
        showError(main, 'Failed to load team profile. Please try again.', 'location.reload()');
        console.error(err);
    }
})();
