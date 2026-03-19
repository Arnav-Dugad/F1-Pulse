/* ============================================
   F1 PULSE - Driver Profile Page
   ============================================ */

function driverProfileEsc(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

(async function () {
    initPage('about');
    document.body.classList.add('page-about-detail', 'page-driver-profile');

    const subtitle = document.getElementById('driver-profile-subtitle');
    const main = document.getElementById('driver-profile-main');
    const header = document.getElementById('driver-profile-header');

    showLoading(main, 'Loading driver profile', 'skeleton-cards');

    const params = new URLSearchParams(window.location.search);
    const driverIdParam = params.get('driver') || '';
    const teamParam = params.get('team') || '';

    try {
        const [driverStandings, constructorStandings, enriched] = await Promise.all([
            F1API.getDriverStandings(),
            F1API.getConstructorStandings(),
            loadEnrichedDrivers().catch(() => ({})),
        ]);

        if (constructorStandings?.length) {
            await fetchTeamLogos(constructorStandings);
        }

        const item = (driverStandings || []).find((d) => String(d?.Driver?.driverId || '') === driverIdParam)
            || (driverStandings || []).find((d) => resolveTeamId(d?.Constructors?.[0]?.constructorId) === teamParam)
            || (driverStandings || [])[0];

        if (!item?.Driver) {
            showError(main, 'Driver profile not found.', 'window.location.href="about.html"');
            return;
        }

        const d = item.Driver;
        const constructorIdRaw = item.Constructors?.[0]?.constructorId || teamParam;
        const teamId = resolveTeamId(constructorIdRaw) || constructorIdRaw || '';
        const teamColor = getTeamColor(constructorIdRaw);
        const teamName = getTeamName(constructorIdRaw);
        const key = ABOUT_DATA.normalizeDriverKey(d.driverId, d.familyName);
        const gradient = ABOUT_DATA.getTeamBrandGradient(teamId);
        const photoObjectPosition = ABOUT_DATA.getDriverProfileFraming(key);
        const heroPhotoPosition = ABOUT_DATA.getDriverHeroFraming(key);
        const quoteData = ABOUT_DATA.getDriverQuote(key, `${d.givenName || ''} ${d.familyName || ''}`.trim(), teamName);
        const bio = ABOUT_DATA.getDriverBio(key, `${d.givenName || ''} ${d.familyName || ''}`.trim());
        const profilePhoto = ABOUT_DATA.driverProfilePhotoURL(d, enriched || {}, key);
        const country = d.nationality || '';
        const flag = countryFlagHTML(country, 18);
        const dateOfBirth = d.dateOfBirth ? formatDate(d.dateOfBirth) : 'Unknown';
        const displayName = `${d.givenName || ''} ${d.familyName || ''}`.trim();
        const driverNumber = d.permanentNumber || '--';

        if (header) {
            header.style.setProperty('--profile-team', teamColor);
        }

        if (subtitle) {
            subtitle.textContent = displayName;
        }

        main.innerHTML = `
            <section class="driver-brand-hero" style="--team:${teamColor};--team-top:${driverProfileEsc(gradient.top)};--team-mid:${driverProfileEsc(gradient.mid)};--team-bottom:${driverProfileEsc(gradient.bottom)}">
                <div class="driver-brand-left">
                    <p class="driver-brand-script">${driverProfileEsc(d.givenName || '')}</p>
                    <h2 class="driver-brand-surname">${driverProfileEsc(String(d.familyName || '').toUpperCase())}</h2>
                    <p class="driver-brand-meta">
                        <span class="driver-meta-chip">${SVG_ICONS.flagBlue}${flag}<span>${driverProfileEsc(country || 'Unknown')}</span></span>
                        <span class="driver-meta-chip">${SVG_ICONS.road}<span>${driverProfileEsc(teamName)}</span></span>
                        <span class="driver-meta-chip">${SVG_ICONS.flagChequered}<span>No. ${driverProfileEsc(String(driverNumber))}</span></span>
                    </p>
                </div>
                <div class="driver-brand-right">
                    <span class="driver-brand-number" aria-hidden="true">${driverProfileEsc(String(driverNumber))}</span>
                    <div class="driver-brand-photo-wrap">
                        ${profilePhoto
                            ? `<img src="${driverProfileEsc(profilePhoto)}" alt="${driverProfileEsc(displayName)}" class="driver-brand-photo" style="object-position:${driverProfileEsc(heroPhotoPosition)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${profilePhoto ? 'none' : 'grid'}">Paste driver image URL in js/about-data.js</div>
                    </div>
                </div>
            </section>

            <article class="driver-bio-shell" style="--team:${teamColor};--team-top:${driverProfileEsc(gradient.top)};--team-mid:${driverProfileEsc(gradient.mid)};--team-bottom:${driverProfileEsc(gradient.bottom)}">
                <header class="driver-bio-header">
                    <h2><span class="profile-inline-icon">${SVG_ICONS.road}</span>Biography</h2>
                    <p>${driverProfileEsc(displayName)} · ${driverProfileEsc(teamName)}</p>
                </header>
                <div class="driver-bio-facts">
                    <article>
                        <span><span class="profile-inline-icon">${SVG_ICONS.calendar}</span>Date Of Birth</span>
                        <strong>${driverProfileEsc(dateOfBirth)}</strong>
                    </article>
                    <article>
                        <span><span class="profile-inline-icon">${SVG_ICONS.flagBlue}</span>Place Of Birth</span>
                        <strong>${driverProfileEsc(country || 'Unknown')}</strong>
                    </article>
                </div>
                <div class="driver-bio-content">
                    <figure class="driver-bio-photo-card">
                        ${profilePhoto
                            ? `<img src="${driverProfileEsc(profilePhoto)}" alt="${driverProfileEsc(displayName)}" class="driver-bio-photo" style="object-position:${driverProfileEsc(photoObjectPosition)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
                            : ''}
                        <div class="about-photo-placeholder" style="display:${profilePhoto ? 'none' : 'grid'}">Paste driver image URL in js/about-data.js</div>
                        <figcaption>${flag} ${driverProfileEsc(country)} · ${driverProfileEsc(teamName)}</figcaption>
                    </figure>
                    <div class="driver-bio-copy">
                        <p class="profile-bio-text">${driverProfileEsc(bio)}</p>
                    </div>
                </div>
            </article>

            <section class="driver-quote-section" style="--team:${teamColor}">
                <span class="driver-quote-emblem" aria-hidden="true">${SVG_ICONS.flagChequered}</span>
                <span class="driver-quote-mark" aria-hidden="true">''</span>
                <p class="driver-quote-text">${driverProfileEsc(quoteData.quote || '')}</p>
                <p class="driver-quote-author">${driverProfileEsc(quoteData.by || '')}</p>
            </section>`;
    } catch (err) {
        if (subtitle) {
            subtitle.textContent = 'Driver profile data unavailable right now.';
        }
        showError(main, 'Failed to load driver profile. Please try again.', 'location.reload()');
        console.error(err);
    }
})();
