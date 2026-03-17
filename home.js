/* ============================================
   F1 PULSE - Home Page Logic
   ============================================ */

(async function () {
    initPage('home');
    document.body.classList.add('home-page');
    injectHomeVisualLayers();

    const enrichedDrivers = await loadEnrichedDrivers();

    // Helper: safely extract value from Promise.allSettled result
    const safeValue = (result) => result.status === 'fulfilled' ? result.value : null;

    // Load all data concurrently
    const [nextRace, lastRace, driverStandings, constructorStandings, schedule, finishingStatus] = await Promise.allSettled([
        F1API.getNextRace(),
        F1API.getLastRaceResults(),
        F1API.getDriverStandings(),
        F1API.getConstructorStandings(),
        F1API.getSchedule(),
        F1API.getFinishingStatus(),
    ]);

    // Fetch team logos from Wikipedia using constructor data
    if (safeValue(constructorStandings)?.length) {
        await fetchTeamLogos(safeValue(constructorStandings));
    }

    renderHero(safeValue(nextRace));
    renderQuickStats(safeValue(lastRace), safeValue(driverStandings), safeValue(schedule), enrichedDrivers, safeValue(finishingStatus));
    renderSeasonProgress(safeValue(schedule));
    renderLastPodium(safeValue(lastRace), enrichedDrivers);
    renderLatestResults(safeValue(lastRace), enrichedDrivers);
    renderChampionshipBattle(safeValue(driverStandings), enrichedDrivers);
    renderTopDrivers(safeValue(driverStandings), enrichedDrivers);
    renderConstructorBattle(safeValue(constructorStandings));
    renderTopConstructors(safeValue(constructorStandings), enrichedDrivers);
    await renderUpcomingRaces(safeValue(schedule));
    renderRecentRaces();
    renderFastestLaps(safeValue(lastRace), enrichedDrivers);
    renderTeammateH2H(safeValue(driverStandings), enrichedDrivers);

    // --- Hero / Countdown ---
    function renderHero(race) {
        const label = document.getElementById('hero-label');
        const title = document.getElementById('hero-title');
        const subtitle = document.getElementById('hero-subtitle');
        const countdownEl = document.getElementById('countdown');

        if (!race) {
            title.textContent = 'Season Loading...';
            subtitle.textContent = 'Waiting for schedule data';
            return;
        }

        label.innerHTML = `<span class="badge badge-red">Round ${race.round}</span> Next Race`;
        title.textContent = race.raceName || 'Grand Prix';
        subtitle.innerHTML = `${countryFlagHTML(race.Circuit?.Location?.country, 28)} ${race.Circuit?.circuitName || ''} — ${race.Circuit?.Location?.locality || ''}, ${race.Circuit?.Location?.country || ''}`;

        // Add large country flag to hero
        const country = race.Circuit?.Location?.country;
        const heroFlagISO = getCountryISO(country);
        const heroSection = document.getElementById('hero-section');
        heroSection?.querySelector('.hero-country-flag')?.remove();
        if (heroFlagISO && heroSection) {
            const flagDiv = document.createElement('div');
            flagDiv.className = 'hero-country-flag';
            flagDiv.innerHTML = `<img src="https://flagcdn.com/w1280/${heroFlagISO}.png" srcset="https://flagcdn.com/w2560/${heroFlagISO}.png 2x" alt="${country}" loading="eager" onerror="this.parentElement.style.display='none'">`;
            heroSection.appendChild(flagDiv);
        }

        // Fetch circuit image for hero decoration
        const circuitUrl = race.Circuit?.url;
        const circuitName = race.Circuit?.circuitName;
        if (circuitUrl || circuitName) {
            fetchCircuitImage(circuitUrl, circuitName).then(() => {
                const img = circuitImageHTML(circuitUrl, 200, circuitName);
                if (img) {
                    const heroContent = document.querySelector('.hero-content');
                    if (heroContent) {
                        heroContent.querySelector('.race-header-circuit')?.remove();
                        const imgDiv = document.createElement('div');
                        imgDiv.className = 'race-header-circuit';
                        imgDiv.innerHTML = img;
                        heroContent.style.position = 'relative';
                        heroContent.appendChild(imgDiv);
                    }
                }
            }).catch(() => { /* circuit image is decorative, failure is non-critical */ });
        }

        const raceDateTime = race.time
            ? `${race.date}T${race.time}`
            : `${race.date}T14:00:00Z`;

        updateCountdown();
        const countdownTimer = setInterval(updateCountdown, 1000);

        function updateCountdown() {
            const diff = getTimeDiff(raceDateTime);
            if (diff.passed) {
                clearInterval(countdownTimer);
                countdownEl.innerHTML = '<span class="badge badge-green" style="font-size:1rem;padding:8px 20px;">RACE WEEKEND</span>';
                return;
            }
            countdownEl.innerHTML = `
                <div class="countdown-item">
                    <span class="countdown-value">${diff.days}</span>
                    <span class="countdown-label">Days</span>
                </div>
                <span class="countdown-separator">:</span>
                <div class="countdown-item">
                    <span class="countdown-value">${String(diff.hours).padStart(2, '0')}</span>
                    <span class="countdown-label">Hours</span>
                </div>
                <span class="countdown-separator">:</span>
                <div class="countdown-item">
                    <span class="countdown-value">${String(diff.minutes).padStart(2, '0')}</span>
                    <span class="countdown-label">Mins</span>
                </div>
                <span class="countdown-separator">:</span>
                <div class="countdown-item">
                    <span class="countdown-value">${String(diff.seconds).padStart(2, '0')}</span>
                    <span class="countdown-label">Secs</span>
                </div>`;
        }

        // Render race weekend schedule below countdown
        renderWeekendSchedule(race);
    }

    function renderWeekendSchedule(race) {
        if (!race) return;
        const countdownEl = document.getElementById('countdown');
        countdownEl?.parentElement?.querySelector('.hero-weekend-schedule')?.remove();
        const sessions = [];
        if (race.FirstPractice) sessions.push({ name: 'FP1', date: race.FirstPractice.date, time: race.FirstPractice.time });
        if (race.SecondPractice) sessions.push({ name: 'FP2', date: race.SecondPractice.date, time: race.SecondPractice.time });
        if (race.ThirdPractice) sessions.push({ name: 'FP3', date: race.ThirdPractice.date, time: race.ThirdPractice.time });
        if (race.SprintShootout) sessions.push({ name: 'Sprint Shootout', date: race.SprintShootout.date, time: race.SprintShootout.time });
        if (race.SprintQualifying) sessions.push({ name: 'Sprint Quali', date: race.SprintQualifying.date, time: race.SprintQualifying.time });
        if (race.Sprint) sessions.push({ name: 'Sprint', date: race.Sprint.date, time: race.Sprint.time });
        if (race.Qualifying) sessions.push({ name: 'Qualifying', date: race.Qualifying.date, time: race.Qualifying.time });
        sessions.push({ name: 'Race', date: race.date, time: race.time });

        if (sessions.length <= 1) return;

        const scheduleDiv = document.createElement('div');
        scheduleDiv.className = 'hero-weekend-schedule';
        scheduleDiv.innerHTML = `
            <div class="weekend-schedule-label">Race Weekend Schedule</div>
            <div class="weekend-schedule-grid">
                ${sessions.map(s => {
                    const dt = s.time ? new Date(`${s.date}T${s.time}`) : new Date(s.date);
                    const dayStr = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                    const timeStr = s.time ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
                    const isRace = s.name === 'Race';
                    return `
                    <div class="weekend-session ${isRace ? 'weekend-session-race' : ''}">
                        <span class="weekend-session-name">${s.name}</span>
                        <span class="weekend-session-day">${dayStr}</span>
                        ${timeStr ? `<span class="weekend-session-time">${timeStr}</span>` : ''}
                    </div>`;
                }).join('')}
            </div>`;
        countdownEl.parentElement.appendChild(scheduleDiv);
    }

    function injectHomeVisualLayers() {
        const hero = document.getElementById('hero-section');
        if (hero && !hero.querySelector('.hero-speed-trails')) {
            const trails = document.createElement('div');
            trails.className = 'hero-speed-trails';
            hero.appendChild(trails);

            const orbA = document.createElement('div');
            orbA.className = 'hero-neon-orb hero-neon-orb-a';
            hero.appendChild(orbA);

            const orbB = document.createElement('div');
            orbB.className = 'hero-neon-orb hero-neon-orb-b';
            hero.appendChild(orbB);
        }

        const featuredSections = [
            'quick-stats-section',
            'championship-battle-section',
            'constructors-section',
            'fastest-laps-section',
            'teammate-h2h-section',
        ];

        featuredSections.forEach((id, index) => {
            const section = document.getElementById(id);
            if (!section) return;
            section.classList.add('home-visual-section', `home-visual-tone-${(index % 3) + 1}`);
            if (!section.querySelector('.home-section-beam')) {
                const beam = document.createElement('div');
                beam.className = 'home-section-beam';
                section.appendChild(beam);
            }
        });
    }

    // --- Quick Stats ---
    function renderQuickStats(lastRace, standings, schedule, enriched, statusData) {
        const section = document.getElementById('quick-stats-section');
        const container = document.getElementById('quick-stats');
        if (!lastRace && !standings) return;

        const leader = standings?.[0];
        const leaderCId = leader?.Constructors?.[0]?.constructorId;
        const leaderColor = getTeamColor(leaderCId);
        const totalRaces = schedule?.length || '?';
        const completedRaces = schedule?.filter(r => {
            const rd = new Date(r.date);
            return rd < new Date();
        }).length || '?';

        const totalWins = leader ? parseInt(leader.wins) || 0 : 0;

        // Count DNFs from finishing status (mechanical failures, accidents, etc.)
        const DNF_KEYWORDS = [
            'accident', 'collision', 'engine', 'gearbox', 'hydraulics', 'brakes',
            'suspension', 'electrical', 'retired', 'mechanical', 'oil pressure',
            'water pressure', 'fuel pressure', 'transmission', 'clutch', 'driveshaft',
            'overheating', 'power unit', 'power loss', 'spun off', 'puncture',
            'wheel', 'fire', 'electronics', 'turbo', 'exhaust', 'battery',
            'cooling', 'differential', 'radiator', 'fuel system', 'water leak',
            'oil leak', 'damage', 'tyre'
        ];
        let dnfCount = 0;
        if (statusData?.length) {
            statusData.forEach(s => {
                const status = (s.status || '').toLowerCase();
                if (DNF_KEYWORDS.some(kw => status.includes(kw))) {
                    dnfCount += parseInt(s.count) || 0;
                }
            });
        }

        section.style.display = '';
        container.innerHTML = `
            ${leader ? `
            <div class="stat-box">
                <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px;">
                    ${driverImgHTML(leader.Driver?.givenName, leader.Driver?.familyName, enriched, '', leaderColor, leader.Driver?.permanentNumber)}
                    ${teamLogoSmallHTML(leaderCId)}
                </div>
                <div class="stat-value" style="color:${leaderColor}">${leader.Driver?.familyName || ''}</div>
                <div class="stat-label">Championship Leader</div>
            </div>` : ''}
            ${leader ? `
            <div class="stat-box">
                <div class="stat-value" data-counter="${leader.points}">${leader.points || 0}</div>
                <div class="stat-label">Leader Points</div>
            </div>` : ''}
            <div class="stat-box">
                <div class="stat-value">${completedRaces}/${totalRaces}</div>
                <div class="stat-label">Races Completed</div>
            </div>
            ${leader && totalWins > 0 ? `
            <div class="stat-box">
                <div class="stat-value" data-counter="${totalWins}">${totalWins}</div>
                <div class="stat-label">Leader Wins</div>
            </div>` : ''}
            ${lastRace?.Results?.[0] ? `
            <div class="stat-box">
                <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px;">
                    ${driverImgHTML(lastRace.Results[0].Driver?.givenName, lastRace.Results[0].Driver?.familyName, enriched, '', getTeamColor(lastRace.Results[0].Constructor?.constructorId), lastRace.Results[0].Driver?.permanentNumber)}
                </div>
                <div class="stat-value">${lastRace.Results[0].Driver?.familyName || ''}</div>
                <div class="stat-label">Last Race Winner</div>
            </div>` : ''}
            ${dnfCount > 0 ? `
            <div class="stat-box">
                <div class="stat-value" data-counter="${dnfCount}">${dnfCount}</div>
                <div class="stat-label">Season DNFs</div>
            </div>` : ''}
        `;

    }

    // --- Season Progress ---
    function renderSeasonProgress(schedule) {
        const section = document.getElementById('season-progress-section');
        const container = document.getElementById('season-progress');
        if (!schedule?.length) return;

        const now = new Date();
        const total = schedule.length;
        const completed = schedule.filter(r => new Date(r.date) < now).length;
        const pct = Math.round((completed / total) * 100);

        section.style.display = '';
        container.innerHTML = `
            <div class="season-progress-bar">
                <div class="season-progress-header">
                    <span class="season-progress-label">Season Progress</span>
                    <span class="season-progress-count">${completed} of ${total} Races Complete</span>
                </div>
                <div class="season-progress-track">
                    <div class="season-progress-fill" style="width:${pct}%">
                        <span class="season-progress-pct">${pct}%</span>
                    </div>
                    ${schedule.map((r, i) => {
                        const isPast = new Date(r.date) < now;
                        const isNext = !isPast && (i === 0 || new Date(schedule[i - 1]?.date) < now);
                        const left = ((i + 0.5) / total) * 100;
                        return `<div class="season-race-dot ${isPast ? 'completed' : ''} ${isNext ? 'next' : ''}" style="left:${left}%" title="R${r.round}: ${r.raceName}"></div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    // --- Last Race Podium ---
    function renderLastPodium(race, enriched) {
        const section = document.getElementById('last-podium-section');
        const container = document.getElementById('last-podium');
        const link = document.getElementById('last-podium-link');
        if (!race?.Results?.length || race.Results.length < 3) return;

        section.style.display = '';
        link.href = `race-detail.html?season=${race.season}&round=${race.round}`;

        const podiumOrder = [race.Results[1], race.Results[0], race.Results[2]]; // P2, P1, P3

        container.innerHTML = `
            <div class="podium-race-label">
                ${countryFlagHTML(race.Circuit?.Location?.country, 20)} <strong>${race.raceName}</strong> — ${race.Circuit?.circuitName || ''}, R${race.round}
            </div>
            <div class="podium">
                ${podiumOrder.map((r, i) => {
                    const pos = parseInt(r.position);
                    const d = r.Driver;
                    const cId = r.Constructor?.constructorId;
                    const teamColor = getTeamColor(cId);
                    const headshot = getDriverHeadshotHiRes(d.givenName, d.familyName, enriched, d.permanentNumber);
                    const trophy = pos === 1 ? SVG_ICONS.trophy : pos === 2 ? SVG_ICONS.medalSilver : SVG_ICONS.medalBronze;
                    return `
                    <div class="podium-item p${pos}" onclick="openDriverModal('${d.driverId}', '${cId}')" style="cursor:pointer">
                        <div class="podium-trophy">${trophy}</div>
                        ${headshot ? `<img src="${headshot}" class="podium-driver-img" style="border-color:${teamColor}" alt="${d.familyName}" onerror="this.outerHTML='<span class=\\'driver-initials\\' style=\\'background:${teamColor};width:100px;height:100px;font-size:1.5rem;border-radius:50%\\'>${(d.familyName || '').substring(0, 3).toUpperCase()}</span>'">` : `<span class="driver-initials" style="background:${teamColor};width:100px;height:100px;font-size:1.5rem;border-radius:50%">${(d.familyName || '').substring(0, 3).toUpperCase()}</span>`}
                        <div class="podium-name">${d.givenName || ''} ${d.familyName || ''}</div>
                        <div class="podium-team" style="color:${teamColor}">${inlineTeamHTML(cId)}</div>
                        <div class="podium-block">
                            <span class="podium-pos">P${pos}</span>
                            <span class="podium-time">${r.Time?.time || r.status || ''}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // --- Latest Results ---
    function renderLatestResults(race, enriched) {
        const section = document.getElementById('latest-results-section');
        const container = document.getElementById('latest-results');
        const link = document.getElementById('latest-results-link');
        if (!race?.Results?.length) return;

        section.style.display = '';
        link.href = `race-detail.html?season=${race.season}&round=${race.round}`;

        const top10 = race.Results.slice(0, 10);
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Time</th><th style="text-align:right">Points</th></tr>
                    </thead>
                    <tbody>
                        ${top10.map((r, idx) => {
                            const cId = r.Constructor?.constructorId;
                            const teamColor = getTeamColor(cId);
                            const d = r.Driver;
                            const fl = r.FastestLap?.rank === '1' ? ' <span class="fastest-lap-badge">FL</span>' : '';
                            return `<tr style="animation-delay:${idx * 0.03}s">
                                <td class="pos-cell">${r.position}</td>
                                <td><div class="driver-cell">
                                    ${driverImgHTML(d.givenName, d.familyName, enriched, '', teamColor, d.permanentNumber)}
                                    <span class="team-color-bar" style="background:${teamColor}"></span>
                                    <div><span style="color:var(--f1-gray);font-size:0.8rem;text-transform:uppercase">${d.givenName || ''}</span><br><strong style="text-transform:uppercase">${d.familyName || ''}</strong></div>
                                </div></td>
                                <td>${inlineTeamHTML(cId)}</td>
                                <td>${r.Time?.time || r.status || ''}${fl}</td>
                                <td class="points-cell">${r.points || 0}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // --- Championship Battle (Head-to-Head Top 3) ---
    function renderChampionshipBattle(standings, enriched) {
        const section = document.getElementById('championship-battle-section');
        const container = document.getElementById('championship-battle');
        if (!standings?.length || standings.length < 2) return;

        section.style.display = '';
        const top3 = standings.slice(0, 3);
        const maxPts = parseFloat(top3[0].points) || 1;

        container.innerHTML = `
            <div class="championship-battle-grid">
                ${top3.map((s, i) => {
                    const d = s.Driver;
                    const cId = s.Constructors?.[0]?.constructorId;
                    const teamColor = getTeamColor(cId);
                    const wins = parseInt(s.wins) || 0;
                    const pct = Math.round((parseFloat(s.points) / maxPts) * 100);
                    const gap = i > 0 ? (parseFloat(s.points) - parseFloat(top3[0].points)).toFixed(0) : '';
                    const headshot = getDriverHeadshotHiRes(d.givenName, d.familyName, enriched, d.permanentNumber);
                    const medal = i === 0 ? SVG_ICONS.medalGold : i === 1 ? SVG_ICONS.medalSilver : SVG_ICONS.medalBronze;
                    return `
                    <div class="battle-card" onclick="openDriverModal('${d.driverId}', '${cId}')" style="cursor:pointer">
                        <div class="battle-card-stripe" style="background:${teamColor}"></div>
                        <div class="battle-card-rank">${medal}</div>
                        <div class="battle-card-driver">
                            ${headshot ? `<img src="${headshot}" alt="${d.familyName}" class="battle-driver-img" style="border-color:${teamColor}" onerror="this.outerHTML='<span class=\\'driver-initials\\' style=\\'background:${teamColor};width:80px;height:80px;font-size:1.2rem\\'>${(d.familyName || '??').substring(0, 3).toUpperCase()}</span>'">` : `<span class="driver-initials" style="background:${teamColor};width:80px;height:80px;font-size:1.2rem">${(d.familyName || '??').substring(0, 3).toUpperCase()}</span>`}
                        </div>
                        <div class="battle-card-info">
                            <div class="battle-card-name">
                                <span class="first-name">${d.givenName || ''}</span>
                                <span class="last-name">${d.familyName || ''}</span>
                            </div>
                            <div class="battle-card-team">
                                ${teamLogoSmallHTML(cId)} ${getTeamName(cId)}
                            </div>
                            <div class="battle-card-stats">
                                <div class="battle-stat">
                                    <span class="battle-stat-value" style="color:${teamColor}">${s.points}</span>
                                    <span class="battle-stat-label">PTS</span>
                                </div>
                                <div class="battle-stat">
                                    <span class="battle-stat-value">${wins}</span>
                                    <span class="battle-stat-label">WINS</span>
                                </div>
                                ${gap ? `<div class="battle-stat">
                                    <span class="battle-stat-value" style="color:var(--f1-gray)">${gap}</span>
                                    <span class="battle-stat-label">GAP</span>
                                </div>` : ''}
                            </div>
                            <div class="battle-progress">
                                <div class="battle-progress-fill" style="width:${pct}%;background:${teamColor}"></div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // --- Top 5 Drivers ---
    function renderTopDrivers(standings, enriched) {
        const section = document.getElementById('standings-section');
        const container = document.getElementById('top-drivers');
        if (!standings?.length) return;

        section.style.display = '';
        const top5 = standings.slice(0, 5);
        const maxPoints = parseFloat(top5[0]?.points) || 1;

        container.innerHTML = top5.map((s, i) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const teamColor = getTeamColor(cId);
            const teamCar = teamCarHTML(cId);
            const wins = parseInt(s.wins) || 0;
            const pctWidth = Math.round((parseFloat(s.points) / maxPoints) * 100);
            const gap = i > 0 ? (parseFloat(s.points) - parseFloat(top5[0].points)).toFixed(0) : '';
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

    // --- Constructor Battle (horizontal bars for all teams) ---
    function renderConstructorBattle(standings) {
        const section = document.getElementById('constructor-battle-section');
        const container = document.getElementById('constructor-battle');
        if (!standings?.length) return;

        section.style.display = '';
        const maxPts = parseFloat(standings[0]?.points) || 1;

        container.innerHTML = `
            <div class="constructor-battle-list">
                ${standings.map((s, i) => {
                    const cId = s.Constructor?.constructorId;
                    const teamColor = getTeamColor(cId);
                    const pct = Math.round((parseFloat(s.points) / maxPts) * 100);
                    const wins = parseInt(s.wins) || 0;
                    return `
                    <div class="constructor-battle-row">
                        <div class="constructor-battle-pos">P${s.position}</div>
                        <div class="constructor-battle-info">
                            ${teamLogoHTML(cId, 32)}
                            <span class="constructor-battle-name">${getConstructorFlag(cId)} ${getTeamName(cId)}</span>
                        </div>
                        <div class="constructor-battle-bar-wrap">
                            <div class="constructor-battle-bar" style="width:${pct}%;background:${teamColor}">
                                <span class="constructor-battle-pts">${s.points} PTS</span>
                            </div>
                        </div>
                        <div class="constructor-battle-wins">${wins > 0 ? `${wins}W` : ''}</div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // --- Top 3 Constructors ---
    function renderTopConstructors(standings, enriched) {
        const section = document.getElementById('constructors-section');
        const container = document.getElementById('top-constructors');
        if (!standings?.length) return;

        section.style.display = '';
        const top3 = standings.slice(0, 3);

        container.innerHTML = top3.map((s, i) => {
            const cId = s.Constructor?.constructorId;
            const teamColor = getTeamColor(cId);
            const wins = parseInt(s.wins) || 0;
            const teamCar = teamCarHTML(cId);
            return `
            <div class="team-card">
                <div class="team-stripe" style="background:${teamColor}"></div>
                <div class="team-card-header">
                    ${teamLogoHTML(cId, 64)}
                    <div>
                        <div class="team-card-name">${getConstructorFlag(cId)} ${getTeamName(cId)}</div>
                        <div class="team-card-points">${s.points} PTS — P${s.position}${wins > 0 ? ` — ${wins} win${wins > 1 ? 's' : ''}` : ''}</div>
                    </div>
                </div>
                ${teamCar ? `<div class="team-car-media">${teamCar}</div>` : ''}
            </div>`;
        }).join('');
    }

    // --- Upcoming Races ---
    async function renderUpcomingRaces(schedule) {
        const section = document.getElementById('upcoming-section');
        const container = document.getElementById('upcoming-races');
        if (!schedule?.length) return;

        const now = new Date();
        const upcoming = schedule.filter(r => new Date(r.date) >= now).slice(0, 3);
        if (!upcoming.length) return;

        // Fetch circuit images in background
        await Promise.allSettled(upcoming.map(r => fetchCircuitImage(r.Circuit?.url, r.Circuit?.circuitName)));

        section.style.display = '';
        container.innerHTML = upcoming.map((r, i) => {
            const flag = countryFlagLargeHTML(r.Circuit?.Location?.country, 48);
            const isNext = i === 0;
            const hasSprint = !!(r.Sprint || r.SprintQualifying || r.SprintShootout);
            const circuitImg = circuitImageHTML(r.Circuit?.url, 108, r.Circuit?.circuitName);
            return `
            <a href="race-detail.html?season=${r.season}&round=${r.round}" class="race-card ${isNext ? 'next' : ''}">
                <span class="race-card-round">R${r.round}</span>
                <div class="race-card-body">
                    <div class="race-card-flag">${flag}</div>
                    <div class="race-card-name">${r.raceName}</div>
                    <div class="race-card-circuit"><span class="home-inline-icon">${SVG_ICONS.road}</span>${r.Circuit?.circuitName || ''}</div>
                    ${circuitImg ? `<div class="race-card-circuit-img">${circuitImg}</div>` : ''}
                    <div class="race-card-date">
                        <span class="date-icon">${SVG_ICONS.calendar}</span>
                        ${formatDate(r.date)}
                    </div>
                    ${hasSprint ? '<div style="margin-top:8px"><span class="badge badge-yellow">Sprint Weekend</span></div>' : ''}
                    ${isNext ? '<div style="margin-top:8px"><span class="badge badge-red">Next Race</span></div>' : ''}
                </div>
            </a>`;
        }).join('');
    }

    // --- Fastest Laps Leaderboard ---
    function renderFastestLaps(race, enriched) {
        const section = document.getElementById('fastest-laps-section');
        const container = document.getElementById('fastest-laps');
        if (!race?.Results?.length) return;

        // Get drivers who set fastest laps, sorted by time
        const withFL = race.Results
            .filter(r => r.FastestLap?.Time?.time)
            .sort((a, b) => {
                const timeA = a.FastestLap.Time.time;
                const timeB = b.FastestLap.Time.time;
                return timeA.localeCompare(timeB);
            })
            .slice(0, 10);

        if (!withFL.length) return;

        section.style.display = '';
        const fastestTime = withFL[0]?.FastestLap?.Time?.time;

        container.innerHTML = `
            <div class="fastest-laps-grid">
                ${withFL.map((r, i) => {
                    const d = r.Driver;
                    const cId = r.Constructor?.constructorId;
                    const teamColor = getTeamColor(cId);
                    const fl = r.FastestLap;
                    const isFastest = fl.rank === '1';
                    const lapTime = fl.Time?.time || '';
                    const lapNum = fl.lap || '';
                    const avgSpeed = fl.AverageSpeed?.speed ? `${parseFloat(fl.AverageSpeed.speed).toFixed(1)} ${fl.AverageSpeed.units || 'kph'}` : '';

                    return `
                    <div class="fl-row ${isFastest ? 'fl-row-fastest' : ''}" onclick="openDriverModal('${d.driverId}', '${cId}')" style="cursor:pointer">
                        <div class="fl-rank">${i + 1}</div>
                        <div class="fl-driver">
                            ${driverImgHTML(d.givenName, d.familyName, enriched, '', teamColor, d.permanentNumber)}
                            <span class="team-color-bar" style="background:${teamColor}"></span>
                            <div class="fl-driver-name">
                                <span class="fl-first">${d.givenName || ''}</span>
                                <span class="fl-last">${d.familyName || ''}</span>
                            </div>
                        </div>
                        <div class="fl-time ${isFastest ? 'fl-time-purple' : ''}">${lapTime}</div>
                        <div class="fl-meta">
                            ${lapNum ? `<span class="fl-lap">Lap ${lapNum}</span>` : ''}
                            ${avgSpeed ? `<span class="fl-speed">${avgSpeed}</span>` : ''}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    function renderRecentRaces() {
        const races = getRecentRaces();
        if (!races.length) return;

        let section = document.getElementById('recent-races-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'recent-races-section';
            section.className = 'section';
            section.innerHTML = '<div class="section-header"><h2>Recently Viewed <span class="text-red">Races</span></h2><a href="schedule.html" class="section-link">Calendar</a></div><div id="recent-races-grid" class="grid-3"></div>';
            const upcoming = document.getElementById('upcoming-section');
            if (upcoming?.parentNode) upcoming.parentNode.insertBefore(section, upcoming);
        }

        const grid = section.querySelector('#recent-races-grid');
        if (!grid) return;

        section.style.display = '';
        grid.innerHTML = races.slice(0, 6).map((r) => {
            const link = `race-detail.html?season=${encodeURIComponent(r.season)}&round=${encodeURIComponent(r.round)}`;
            const flag = countryFlagLargeHTML(r.country, 40);
            return `<a href="${link}" class="race-card">
                <span class="race-card-round">R${r.round}</span>
                <div class="race-card-body">
                    <div class="race-card-flag">${flag}</div>
                    <div class="race-card-name">${r.raceName || 'Grand Prix'}</div>
                    <div class="race-card-circuit">${r.circuitName || ''}</div>
                    <div class="race-card-date">${r.date ? formatDate(r.date) : ''}</div>
                </div>
            </a>`;
        }).join('');
    }

    // --- Teammate Head-to-Head Comparison ---
    function renderTeammateH2H(standings, enriched) {
        const section = document.getElementById('teammate-h2h-section');
        const container = document.getElementById('teammate-h2h');
        if (!standings?.length) return;

        // Group drivers by team
        const teamDrivers = {};
        standings.forEach(s => {
            const cId = s.Constructors?.[0]?.constructorId;
            if (!cId) return;
            if (!teamDrivers[cId]) teamDrivers[cId] = [];
            teamDrivers[cId].push(s);
        });

        // Filter teams with exactly 2 drivers and sort by team points
        const pairs = Object.entries(teamDrivers)
            .filter(([, drivers]) => drivers.length === 2)
            .sort((a, b) => {
                const ptsA = a[1].reduce((sum, d) => sum + (parseFloat(d.points) || 0), 0);
                const ptsB = b[1].reduce((sum, d) => sum + (parseFloat(d.points) || 0), 0);
                return ptsB - ptsA;
            });

        if (!pairs.length) return;
        section.style.display = '';

        container.innerHTML = `
            <div class="h2h-grid">
                ${pairs.map(([cId, drivers], idx) => {
                    const teamColor = getTeamColor(cId);
                    const [d1, d2] = drivers;
                    const pts1 = parseFloat(d1.points) || 0;
                    const pts2 = parseFloat(d2.points) || 0;
                    const totalPts = pts1 + pts2 || 1;
                    const pct1 = Math.round((pts1 / totalPts) * 100);
                    const pct2 = 100 - pct1;
                    const wins1 = parseInt(d1.wins) || 0;
                    const wins2 = parseInt(d2.wins) || 0;
                    const leader = pts1 >= pts2 ? 1 : 2;

                    return `
                    <div class="h2h-card">
                        <div class="h2h-card-stripe" style="background:${teamColor}"></div>
                        <div class="h2h-team-name">
                            ${teamLogoSmallHTML(cId)} ${getTeamName(cId)}
                        </div>
                        <div class="h2h-drivers">
                            <div class="h2h-driver ${leader === 1 ? 'h2h-leader' : ''}" onclick="openDriverModal('${d1.Driver.driverId}', '${cId}')" style="cursor:pointer">
                                ${driverImgHTML(d1.Driver.givenName, d1.Driver.familyName, enriched, '', teamColor, d1.Driver.permanentNumber)}
                                <span class="h2h-driver-name">${d1.Driver.familyName || ''}</span>
                                <span class="h2h-pts" style="color:${teamColor}">${pts1}</span>
                                ${wins1 > 0 ? `<span class="h2h-wins">${wins1}W</span>` : ''}
                            </div>
                            <div class="h2h-vs">VS</div>
                            <div class="h2h-driver ${leader === 2 ? 'h2h-leader' : ''}" onclick="openDriverModal('${d2.Driver.driverId}', '${cId}')" style="cursor:pointer">
                                ${driverImgHTML(d2.Driver.givenName, d2.Driver.familyName, enriched, '', teamColor, d2.Driver.permanentNumber)}
                                <span class="h2h-driver-name">${d2.Driver.familyName || ''}</span>
                                <span class="h2h-pts" style="color:${teamColor}">${pts2}</span>
                                ${wins2 > 0 ? `<span class="h2h-wins">${wins2}W</span>` : ''}
                            </div>
                        </div>
                        <div class="h2h-bar">
                            <div class="h2h-bar-fill h2h-bar-left" style="width:${pct1}%;background:${teamColor};opacity:${leader === 1 ? 1 : 0.4}"></div>
                            <div class="h2h-bar-fill h2h-bar-right" style="width:${pct2}%;background:${teamColor};opacity:${leader === 2 ? 1 : 0.4}"></div>
                        </div>
                        <div class="h2h-gap">${Math.abs(pts1 - pts2).toFixed(0)} pts gap</div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // Auto-refresh standings every 5 minutes
    setInterval(async () => {
        const [ds, cs] = await Promise.allSettled([
            F1API.getDriverStandings(),
            F1API.getConstructorStandings(),
        ]);
        if (ds.status === 'fulfilled' && ds.value) renderTopDrivers(ds.value, enrichedDrivers);
        if (cs.status === 'fulfilled' && cs.value) renderTopConstructors(cs.value, enrichedDrivers);
    }, 5 * 60 * 1000);

})();

