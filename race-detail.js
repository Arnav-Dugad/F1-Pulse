/* ============================================
   F1 PULSE - Race Detail Page Logic (Full)
   ============================================ */

let enriched = {};
let telemetryRefreshTimer = null;
let raceCountdownTimer = null;
const ALL_TABS = ['race', 'qualifying', 'sprint', 'pitstops', 'tires', 'laptimes', 'teamradio', 'racecontrol'];

const TRACK_INTEL_BY_ID = {
    albertpark: {
        lengthKm: 5.278,
        corners: 14,
        overtakeZones: 3,
        laps: 58,
        raceDistanceKm: 306.124,
        firstGrandPrix: 1996,
        facts: [
            'Fast direction changes through sectors 1 and 2 reward a precise front axle.',
            'Track evolution is steep because this is a temporary park-road circuit.',
            'Kerb use and traction out of the final complex are key for lap time.'
        ]
    },
    shanghai: {
        lengthKm: 5.451,
        corners: 16,
        overtakeZones: 3,
        laps: 56,
        raceDistanceKm: 305.066,
        firstGrandPrix: 2004,
        facts: [
            'The opening snail corner sequence heavily stresses front-left tyres.',
            'Long-load corners punish understeer and reward stable aero balance.',
            'Strong exits onto the long back straight define overtaking opportunities.'
        ]
    },
    suzuka: {
        lengthKm: 5.807,
        corners: 18,
        overtakeZones: 2,
        laps: 53,
        raceDistanceKm: 307.471,
        firstGrandPrix: 1987,
        facts: [
            'The iconic esses expose rhythm, confidence, and aerodynamic platform control.',
            'Crosswinds can shift car balance noticeably through high-speed sections.',
            'Tyre degradation rises quickly when drivers push in the first sector.'
        ]
    },
    miami: {
        lengthKm: 5.412,
        corners: 19,
        overtakeZones: 3,
        laps: 57,
        raceDistanceKm: 308.326,
        firstGrandPrix: 2022,
        facts: [
            'Heavy braking zones create opportunities but increase lock-up risk.',
            'The chicane section can overheat tyres if the car is too stiff.',
            'Low drag helps race pace, but rear stability is still crucial in sector 2.'
        ]
    },
    villeneuve: {
        lengthKm: 4.361,
        corners: 14,
        overtakeZones: 3,
        laps: 70,
        raceDistanceKm: 305.27,
        firstGrandPrix: 1978,
        facts: [
            'Hard braking and traction zones punish rear tyre management.',
            'Close walls reward commitment but punish small mistakes instantly.',
            'The final chicane is critical for speed and confidence into the straight.'
        ]
    },
    monaco: {
        lengthKm: 3.337,
        corners: 19,
        overtakeZones: 1,
        laps: 78,
        raceDistanceKm: 260.286,
        firstGrandPrix: 1950,
        facts: [
            'Qualifying position usually dictates race outcome due narrow streets.',
            'Mechanical grip and low-speed traction are the dominant setup targets.',
            'Traffic management and pit timing are often decisive strategic tools.'
        ]
    },
    catalunya: {
        lengthKm: 4.657,
        corners: 14,
        overtakeZones: 2,
        laps: 66,
        raceDistanceKm: 307.236,
        firstGrandPrix: 1991,
        facts: [
            'Long, loaded corners make this one of the strongest aero test tracks.',
            'Front-left tyre wear shapes race strategy and stint lengths.',
            'A clean final-corner exit is essential for defending on the main straight.'
        ]
    },
    redbullring: {
        lengthKm: 4.318,
        corners: 10,
        overtakeZones: 3,
        laps: 71,
        raceDistanceKm: 306.452,
        firstGrandPrix: 1970,
        facts: [
            'Short lap times compress qualifying gaps and magnify traffic effects.',
            'Big elevation changes challenge braking reference consistency.',
            'Strong traction out of low-speed corners drives race pace.'
        ]
    },
    silverstone: {
        lengthKm: 5.891,
        corners: 18,
        overtakeZones: 3,
        laps: 52,
        raceDistanceKm: 306.198,
        firstGrandPrix: 1950,
        facts: [
            'High-speed combinations demand confidence and an efficient aero package.',
            'Wind direction changes can transform balance corner by corner.',
            'Tyre energy through Maggots-Becketts-Chapel often defines stint management.'
        ]
    },
    spa: {
        lengthKm: 7.004,
        corners: 19,
        overtakeZones: 3,
        laps: 44,
        raceDistanceKm: 308.052,
        firstGrandPrix: 1950,
        facts: [
            'Micro-climate shifts can create different weather around the same lap.',
            'Low drag helps in sectors 1 and 3 but hurts confidence in sector 2.',
            'Tyre and brake temperatures can fluctuate sharply with changing conditions.'
        ]
    },
    hungaroring: {
        lengthKm: 4.381,
        corners: 14,
        overtakeZones: 2,
        laps: 70,
        raceDistanceKm: 306.63,
        firstGrandPrix: 1986,
        facts: [
            'Track position is valuable because clean overtakes are limited.',
            'Hot conditions can trigger thermal degradation in long runs.',
            'A compliant setup helps over kerbs while preserving traction.'
        ]
    },
    zandvoort: {
        lengthKm: 4.259,
        corners: 14,
        overtakeZones: 2,
        laps: 72,
        raceDistanceKm: 306.587,
        firstGrandPrix: 1952,
        facts: [
            'Banked corners demand confidence and stable ride control.',
            'Narrow sections reward precision and punish compromised exits.',
            'Crosswinds from the coast can alter balance lap to lap.'
        ]
    },
    monza: {
        lengthKm: 5.793,
        corners: 11,
        overtakeZones: 3,
        laps: 53,
        raceDistanceKm: 306.72,
        firstGrandPrix: 1950,
        facts: [
            'Known as the Temple of Speed with very high full-throttle percentage.',
            'Low-drag setups are vital but still require stable heavy braking behavior.',
            'Kerb riding quality can decide both lap time and tyre life.'
        ]
    },
    madring: {
        lengthKm: 5.416,
        corners: 22,
        overtakeZones: 4,
        laps: 57,
        raceDistanceKm: 308.712,
        firstGrandPrix: 2026,
        facts: [
            'The planned layout mixes city streets and purpose-built sections.',
            'Early projections indicate multiple major overtaking opportunities.',
            'This circuit includes a long banked section called La Monumental.'
        ]
    },
    baku: {
        lengthKm: 6.003,
        corners: 20,
        overtakeZones: 3,
        laps: 51,
        raceDistanceKm: 306.049,
        firstGrandPrix: 2016,
        facts: [
            'The castle section is one of the narrowest and most technical in F1.',
            'Very long full-throttle runs reward efficient top-speed setup.',
            'Race outcomes often swing quickly because safety cars are common here.'
        ]
    },
    marinabay: {
        lengthKm: 4.94,
        corners: 19,
        overtakeZones: 3,
        laps: 62,
        raceDistanceKm: 306.143,
        firstGrandPrix: 2008,
        facts: [
            'Night racing plus humidity make this one of the toughest physical events.',
            'Frequent braking events raise thermal loads on brakes and tyres.',
            'Track evolution through the weekend is usually significant.'
        ]
    },
    americas: {
        lengthKm: 5.513,
        corners: 20,
        overtakeZones: 3,
        laps: 56,
        raceDistanceKm: 308.405,
        firstGrandPrix: 2012,
        facts: [
            'Large elevation changes and varied corner styles challenge setup compromise.',
            'Bumps can unsettle braking phases and traction exits in race trim.',
            'Tyre strategy flexibility is often a race-winning differentiator.'
        ]
    },
    rodriguez: {
        lengthKm: 4.304,
        corners: 17,
        overtakeZones: 3,
        laps: 71,
        raceDistanceKm: 305.354,
        firstGrandPrix: 1963,
        facts: [
            'High altitude reduces downforce and cooling efficiency across the lap.',
            'Long straights reward low drag and strong hybrid deployment.',
            'Braking stability into the stadium section remains critical for consistency.'
        ]
    },
    interlagos: {
        lengthKm: 4.309,
        corners: 15,
        overtakeZones: 2,
        laps: 71,
        raceDistanceKm: 305.879,
        firstGrandPrix: 1973,
        facts: [
            'Counter-clockwise layout loads drivers physically in uncommon ways.',
            'Weather volatility can shift grip and strategy within minutes.',
            'Momentum through sector 2 is essential for pace and tyre protection.'
        ]
    },
    vegas: {
        lengthKm: 6.201,
        corners: 17,
        overtakeZones: 3,
        laps: 50,
        raceDistanceKm: 309.958,
        firstGrandPrix: 2023,
        facts: [
            'Very long straights amplify efficiency and deployment advantages.',
            'Cool night temperatures can make tyre warm-up a strategic challenge.',
            'Heavy braking demands confidence and robust front-axle stability.'
        ]
    },
    losail: {
        lengthKm: 5.419,
        corners: 16,
        overtakeZones: 3,
        laps: 57,
        raceDistanceKm: 308.611,
        firstGrandPrix: 2021,
        facts: [
            'Flowing medium-to-fast corners punish sliding and rear overheating.',
            'Desert winds can carry dust onto the racing line between sessions.',
            'Track temperatures and tyre compounds strongly shape stint pace.'
        ]
    },
    yasmarina: {
        lengthKm: 5.281,
        corners: 16,
        overtakeZones: 3,
        laps: 58,
        raceDistanceKm: 306.183,
        firstGrandPrix: 2009,
        facts: [
            'Long traction phases reward rear stability and differential setup.',
            'Twilight transition can change tyre behavior over a single race distance.',
            'A precise final sector is key to preserving straight-line defense speed.'
        ]
    },
    bahrain: {
        lengthKm: 5.412,
        corners: 15,
        overtakeZones: 3,
        laps: 57,
        raceDistanceKm: 308.238,
        firstGrandPrix: 2004,
        facts: [
            'Rear tyre traction and degradation usually drive strategy choices.',
            'Braking zones at turns 1, 4 and 11 create repeated overtaking chances.',
            'Wind and sand can shift grip and braking points between stints.'
        ]
    },
    jeddah: {
        lengthKm: 6.174,
        corners: 27,
        overtakeZones: 3,
        laps: 50,
        raceDistanceKm: 308.45,
        firstGrandPrix: 2021,
        facts: [
            'One of the fastest street circuits by average speed on the calendar.',
            'High-speed walls leave almost zero margin for driver error.',
            'Confidence on turn-in is essential through rapid linked sweeps.'
        ]
    },
    imola: {
        lengthKm: 4.909,
        corners: 19,
        overtakeZones: 2,
        laps: 63,
        raceDistanceKm: 309.049,
        firstGrandPrix: 1980,
        facts: [
            'Old-school flow and narrow sections make qualifying highly important.',
            'Kerb riding and traction control through Variante Alta are major themes.',
            'Brake consistency into Tamburello and Rivazza shapes race confidence.'
        ]
    }
};

const TRACK_INTEL_ALIASES = {
    albertparkcircuit: 'albertpark',
    shanghaiinternationalcircuit: 'shanghai',
    suzukainternationalracingcourse: 'suzuka',
    miamiinternationalautodrome: 'miami',
    circuitgillesvilleneuve: 'villeneuve',
    circuitdemonaco: 'monaco',
    circuitdebarcelonacatalunya: 'catalunya',
    redbullring: 'redbullring',
    silverstonecircuit: 'silverstone',
    circuitdespafrancorchamps: 'spa',
    hungaroring: 'hungaroring',
    circuitzandvoort: 'zandvoort',
    monzacircuit: 'monza',
    autodromonazionaledimonza: 'monza',
    bakucitycircuit: 'baku',
    marinabaystreetcircuit: 'marinabay',
    circuitoftheamericas: 'americas',
    autodromohermanosrodriguez: 'rodriguez',
    interlagoscircuit: 'interlagos',
    autodromojosecarlospace: 'interlagos',
    lasvegas: 'vegas',
    lasvegasgrandprix: 'vegas',
    lasvegasstripcircuit: 'vegas',
    lasvegasstripstreetcircuit: 'vegas',
    vegas: 'vegas',
    lusailinternationalcircuit: 'losail',
    losailinternationalcircuit: 'losail',
    yasmarinacircuit: 'yasmarina',
    bahraininternationalcircuit: 'bahrain',
    jeddahcornichecircuit: 'jeddah',
    autodromoenzoedinoferrari: 'imola',
    autodromointernazionaleenzoedinoferrari: 'imola',
    imola: 'imola',
    emiliaromagna: 'imola',
    madring: 'madring'
};

function normalizeCircuitIntelKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function resolveTrackIntelKey(value) {
    const key = normalizeCircuitIntelKey(value);
    if (!key) return null;
    if (TRACK_INTEL_BY_ID[key]) return key;
    const alias = TRACK_INTEL_ALIASES[key];
    if (alias && TRACK_INTEL_BY_ID[alias]) return alias;
    const fuzzy = Object.keys(TRACK_INTEL_BY_ID).find((id) => key.includes(id) || id.includes(key));
    return fuzzy || null;
}

function getTrackIntel(race, raceResults) {
    const mappedKey = resolveTrackIntelKey(race?.Circuit?.circuitId)
        || resolveTrackIntelKey(race?.Circuit?.circuitName)
        || resolveTrackIntelKey(race?.Circuit?.url);
    const mapped = mappedKey ? (TRACK_INTEL_BY_ID[mappedKey] || {}) : {};

    const lapsFromResults = parseInt(raceResults?.Results?.[0]?.laps, 10) || null;
    const mappedLaps = Number.isFinite(mapped.laps) ? mapped.laps : null;
    const laps = lapsFromResults || mappedLaps;
    const lengthKm = Number.isFinite(mapped.lengthKm) ? mapped.lengthKm : null;
    const raceDistanceKm = Number.isFinite(mapped.raceDistanceKm)
        ? mapped.raceDistanceKm
        : (lengthKm && laps ? Number((lengthKm * laps).toFixed(3)) : null);

    const facts = Array.isArray(mapped.facts) && mapped.facts.length
        ? mapped.facts
        : [
            `${race?.Circuit?.circuitName || 'This circuit'} usually rewards stable aero balance through medium and high-speed phases.`,
            'Tyre management and brake temperatures are often decisive over a full race distance.',
            `${race?.Circuit?.Location?.locality || 'This venue'} tends to show significant lap-time evolution as grip builds.`
        ];

    return {
        lengthKm,
        corners: Number.isFinite(mapped.corners) ? mapped.corners : null,
        overtakeZones: Number.isFinite(mapped.overtakeZones) ? mapped.overtakeZones : null,
        raceDistanceKm,
        firstGrandPrix: Number.isFinite(mapped.firstGrandPrix) ? mapped.firstGrandPrix : null,
        laps,
        facts,
    };
}

function switchTab(tab) {
    const tabsEl = document.getElementById('result-tabs');
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ALL_TABS.forEach(t => {
        const el = document.getElementById(t + '-results');
        if (el) el.style.display = (t === tab) ? '' : 'none';
    });
    const podium = document.getElementById('podium-container');
    if (podium) podium.style.display = (tab === 'race') ? '' : 'none';
}

(async function () {
    initPage('race');

    window.addEventListener('beforeunload', () => {
        if (telemetryRefreshTimer) {
            clearInterval(telemetryRefreshTimer);
            telemetryRefreshTimer = null;
        }
        if (raceCountdownTimer) {
            clearInterval(raceCountdownTimer);
            raceCountdownTimer = null;
        }
    });

    const params = new URLSearchParams(window.location.search);
    const season = params.get('season') || 'current';
    const round = params.get('round');

    if (!round) {
        document.getElementById('race-title').textContent = 'No race specified';
        document.getElementById('race-subtitle').textContent = 'Please select a race from the schedule.';
        return;
    }

    const raceResultsEl = document.getElementById('race-results');
    showLoading(raceResultsEl, 'Loading race data');

    enriched = await loadEnrichedDrivers();

    // Also fetch constructor standings for logos
    try {
        const cs = await F1API.getConstructorStandings(season === 'current' ? 'current' : season);
        if (cs?.length) await fetchTeamLogos(cs);
    } catch (e) { /* non-critical */ }

    try {
        // Load all data concurrently
        const [raceData, qualData, sprintData, pitData] = await Promise.allSettled([
            F1API.getRaceResults(season, round),
            F1API.getQualifyingResults(season, round),
            F1API.getSprintResults(season, round),
            F1API.getPitStops(season, round),
        ]);

        const race = raceData.value;
        const qual = qualData.value;
        const sprint = sprintData.value;
        const pitStops = pitData.value || [];

        let raceInfo = race;
        if (!raceInfo) {
            const schedule = await F1API.getSchedule(season);
            raceInfo = schedule?.find(r => r.round === round);
        }

        if (!raceInfo) {
            showError(raceResultsEl, 'Race data not found.');
            return;
        }

        renderRaceHeader(raceInfo);
        renderRaceActions();
        renderRaceCountdown(raceInfo);
        renderRaceInfo(raceInfo, race);
        renderCircuitShowcase(raceInfo, race);
        renderTrackIntel(raceInfo, race);

        renderGrandPrixDashboard(
            raceInfo,
            race?.Results || [],
            qual?.QualifyingResults || [],
            sprint?.SprintResults || [],
            pitStops
        );
        renderHistoricalComparison(raceInfo);
        reorderRaceDetailSections();

        const hasRaceResults = race?.Results?.length > 0;
        const hasQualResults = qual?.QualifyingResults?.length > 0;
        const hasSprintResults = sprint?.SprintResults?.length > 0;
        const hasPitStops = pitStops?.length > 0;

        if (hasRaceResults || hasQualResults || hasSprintResults) {
            const tabs = document.getElementById('result-tabs');
            tabs.style.display = '';

            if (!hasRaceResults) tabs.querySelector('[data-tab="race"]').style.display = 'none';
            if (!hasQualResults) tabs.querySelector('[data-tab="qualifying"]').style.display = 'none';
            if (!hasSprintResults) tabs.querySelector('[data-tab="sprint"]').style.display = 'none';
            if (!hasPitStops) tabs.querySelector('[data-tab="pitstops"]').style.display = 'none';

            const firstTab = hasRaceResults ? 'race' : hasQualResults ? 'qualifying' : 'sprint';
            switchTab(firstTab);
            tabs.querySelector(`[data-tab="${firstTab}"]`).classList.add('active');

            if (hasRaceResults) {
                renderPodium(race.Results);
                renderRaceResults(race.Results);
                renderRaceAnalytics(race.Results);
            }
            if (hasQualResults) renderQualifyingResults(qual.QualifyingResults);
            if (hasSprintResults) renderSprintResults(sprint.SprintResults);
            if (hasPitStops) renderPitStops(pitStops, race?.Results);

            // Load OpenF1 data in background for weather, stints, race control, telemetry and strategy analysis
            loadOpenF1Data(raceInfo, hasRaceResults, race, pitStops);
            reorderRaceDetailSections();
        } else {
            raceResultsEl.innerHTML = '';
            renderUpcomingInfo(raceInfo);
        }
    } catch (err) {
        showError(raceResultsEl, 'Failed to load race data.', 'location.reload()');
        console.error(err);
    }

    async function loadOpenF1Data(raceInfo, hasResults, race, pitStops) {
        try {
            const year = raceInfo.season || new Date().getFullYear();
            const meetings = await F1API.getOpenF1Meetings({ year });
            if (!meetings?.length) return;

            // Find matching meeting by race name, country, or date
            const raceName = (raceInfo.raceName || '').toLowerCase();
            const raceDate = raceInfo.date;
            const raceCountry = (raceInfo.Circuit?.Location?.country || '').toLowerCase();

            function normMeetingName(name) {
                return (name || '').toLowerCase()
                    .replace(/grand prix/gi, '')
                    .replace(/[-_]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            const normalizedRace = normMeetingName(raceName);

            const meeting = meetings.find(m => {
                const mNorm = normMeetingName(m.meeting_name);
                const mCountry = (m.country_name || '').toLowerCase();
                return mNorm === normalizedRace ||
                       mNorm.includes(normalizedRace) ||
                       normalizedRace.includes(mNorm) ||
                       (raceCountry && mCountry && raceCountry === mCountry);
            }) || meetings.find(m => {
                return m.date_start && raceDate && m.date_start.startsWith(raceDate.substring(0, 7));
            });

            if (!meeting) return;

            const sessions = await F1API.getOpenF1Sessions({ meeting_key: meeting.meeting_key });
            if (!sessions?.length) return;

            const raceSess = sessions.find(s => s.session_type === 'Race') || sessions[sessions.length - 1];
            if (!raceSess) return;
            const sk = raceSess.session_key;
            const nowMs = Date.now();
            const startMs = Date.parse(raceSess.date_start || '');
            const endMs = Date.parse(raceSess.date_end || '');
            const sessionIsLive = Number.isFinite(startMs) && Number.isFinite(endMs)
                ? nowMs >= startMs && nowMs <= endMs
                : Number.isFinite(endMs) ? nowMs <= endMs : false;

            // Fetch weather, stints, race control, team radio in parallel
            const [weather, stints, raceControl, teamRadio] = await Promise.allSettled([
                F1API.getOpenF1Weather(sk),
                F1API.getOpenF1Stints(sk),
                F1API.getOpenF1RaceControl(sk),
                F1API.getOpenF1TeamRadio(sk),
            ]);

            if (weather.value?.length) renderWeather(weather.value);
            if (stints.value?.length && hasResults) {
                renderTireStrategy(stints.value);
                const tiresTab = document.querySelector('[data-tab="tires"]');
                if (tiresTab) tiresTab.style.display = '';
            }
            if (hasResults && race?.Results?.length) {
                renderConstructorStrategyAnalyzer(pitStops, stints.value || [], race.Results);
                setupTelemetryMiniPanel(sk, race.Results, sessionIsLive);
            }
            if (raceControl.value?.length) renderRaceControl(raceControl.value);
            if (teamRadio.value?.length) {
                renderTeamRadio(teamRadio.value);
                const radioTab = document.querySelector('[data-tab="teamradio"]');
                if (radioTab) radioTab.style.display = '';
            }

            if (hasResults && race?.Results?.length) {
                const topDriverNumbers = race.Results
                    .slice(0, 6)
                    .map((r) => parseInt(r.Driver?.permanentNumber, 10))
                    .filter((n) => Number.isFinite(n));

                if (topDriverNumbers.length) {
                    const sectorLapSets = await Promise.allSettled(
                        topDriverNumbers.map((driverNumber) => F1API.getOpenF1Laps(sk, driverNumber))
                    );
                    const sectorLaps = sectorLapSets
                        .filter((x) => x.status === 'fulfilled' && Array.isArray(x.value))
                        .flatMap((x) => x.value);
                    if (sectorLaps.length) {
                        renderSectorPerformanceMiniChart(sectorLaps, race.Results.slice(0, 6));
                    }
                }
            }

            // Load lap times from Jolpica (separate call, can be slow)
            if (hasResults) {
                try {
                    const lapData = await F1API.getLapTimes(raceInfo.season || season, raceInfo.round || round);
                    if (lapData?.length) {
                        renderLapChart(lapData, race?.Results);
                        const ltTab = document.querySelector('[data-tab="laptimes"]');
                        if (ltTab) ltTab.style.display = '';
                    }
                } catch (e) { /* lap times non-critical */ }
            }
            reorderRaceDetailSections();
        } catch (e) {
            console.log('OpenF1 enrichment unavailable:', e.message);
            reorderRaceDetailSections();
        }
    }

    function renderRaceHeader(race) {
        const flag = countryFlagHTML(race.Circuit?.Location?.country, 32);
        document.getElementById('race-title').innerHTML = `${flag} ${race.raceName || 'Grand Prix'}`;
        document.getElementById('race-subtitle').textContent = `Round ${race.round} — ${race.Circuit?.circuitName || ''} — ${race.Circuit?.Location?.locality || ''}, ${race.Circuit?.Location?.country || ''}`;
    }

    function renderRaceActions() {
        const bar = document.getElementById('race-action-bar');
        if (bar) bar.remove();
    }

    function keepSingleSectionById(container, id) {
        const duplicates = Array.from(container.querySelectorAll(`#${id}`));
        if (!duplicates.length) return null;
        const keeper = duplicates[0];
        duplicates.slice(1).forEach((node) => node.remove());
        return keeper;
    }

    function reorderRaceDetailSections() {
        const container = document.querySelector('.page-content .container');
        if (!container) return;

        const orderedIds = [
            'race-header',
            'race-countdown-section',
            'race-info',
            'weather-section',
            'race-circuit-showcase',
            'track-intel-section',
            'gp-dashboard-section',
            'gp-history-section',
            'result-tabs',
            'podium-container',
            'race-results',
            'qualifying-results',
            'sprint-results',
            'pitstops-results',
            'tires-results',
            'laptimes-results',
            'teamradio-results',
            'racecontrol-results',
            'race-analytics',
            'constructor-strategy-section',
            'telemetry-mini-section',
            'sector-mini-section',
            'upcoming-info',
        ];

        orderedIds.forEach((id) => {
            const node = keepSingleSectionById(container, id) || document.getElementById(id);
            if (node && node.parentElement === container) {
                container.appendChild(node);
            }
        });
    }

    function ensureCircuitLightbox() {
        let lightbox = document.getElementById('circuit-lightbox');
        if (lightbox) return lightbox;

        lightbox = document.createElement('div');
        lightbox.id = 'circuit-lightbox';
        lightbox.className = 'circuit-lightbox';
        lightbox.innerHTML = `
            <div class="circuit-lightbox-content">
                <button class="circuit-lightbox-close" type="button" aria-label="Close circuit preview">&times;</button>
                <img id="circuit-lightbox-img" alt="Circuit layout enlarged">
            </div>`;
        document.body.appendChild(lightbox);

        const closeBtn = lightbox.querySelector('.circuit-lightbox-close');
        closeBtn?.addEventListener('click', () => lightbox.classList.remove('open'));
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) lightbox.classList.remove('open');
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') lightbox.classList.remove('open');
        });

        return lightbox;
    }

    function renderCircuitShowcase(race, raceResults) {
        const circuitUrl = race.Circuit?.url;
        const circuitName = race.Circuit?.circuitName;
        const intel = getTrackIntel(race, raceResults);
        const fastestResult = raceResults?.Results?.find((r) => r.FastestLap?.rank === '1') || null;
        const fastestLapTime = fastestResult?.FastestLap?.Time?.time || 'TBA';
        const fastestLapDriver = fastestResult?.Driver
            ? `${fastestResult.Driver.givenName || ''} ${fastestResult.Driver.familyName || ''}`.trim()
            : 'Data unavailable';
        const fastestLapSeason = race?.season ? ` (${race.season})` : '';

        const lengthText = intel.lengthKm != null ? `${intel.lengthKm.toFixed(3)}km` : 'TBA';
        const firstGpText = intel.firstGrandPrix != null ? String(intel.firstGrandPrix) : 'TBA';
        const lapsText = intel.laps != null
            ? String(intel.laps)
            : (raceResults?.Results?.[0]?.laps ? String(raceResults.Results[0].laps) : 'TBA');
        const distanceText = intel.raceDistanceKm != null ? `${intel.raceDistanceKm.toFixed(3)}km` : 'TBA';

        let section = document.getElementById('race-circuit-showcase');
        if (!section) {
            section = document.createElement('section');
            section.id = 'race-circuit-showcase';
            section.className = 'section race-circuit-showcase race-circuit-hero';
            const container = document.querySelector('.page-content .container');
            container?.appendChild(section);
        }

        if (!circuitUrl && !circuitName) {
            section.style.display = 'none';
            return;
        }

        fetchCircuitImage(circuitUrl, circuitName).then(() => {
            const circuitMarkup = circuitImageHTML(circuitUrl, 620, circuitName);
            if (!circuitMarkup) {
                section.style.display = 'none';
                return;
            }

            section.style.display = '';
            section.innerHTML = `
                <div class="race-circuit-topline" aria-hidden="true"><span></span></div>
                <h2 class="race-circuit-title">Circuit</h2>
                <div class="race-circuit-hero-grid">
                    <div class="race-circuit-hero-map">${circuitMarkup}</div>
                    <div class="race-circuit-hero-stats">
                        <article class="race-circuit-main-stat">
                            <span class="race-circuit-stat-label">Circuit Length</span>
                            <strong class="race-circuit-main-value">${lengthText}</strong>
                        </article>
                        <div class="race-circuit-hero-stat-grid">
                            <article class="race-circuit-hero-stat-card">
                                <span class="race-circuit-stat-label">First Grand Prix</span>
                                <strong>${firstGpText}</strong>
                            </article>
                            <article class="race-circuit-hero-stat-card">
                                <span class="race-circuit-stat-label">Number of Laps</span>
                                <strong>${lapsText}</strong>
                            </article>
                            <article class="race-circuit-hero-stat-card">
                                <span class="race-circuit-stat-label">Fastest lap time</span>
                                <strong>${fastestLapTime}</strong>
                                <small>${fastestLapDriver}${fastestLapSeason}</small>
                            </article>
                            <article class="race-circuit-hero-stat-card">
                                <span class="race-circuit-stat-label">Race Distance</span>
                                <strong>${distanceText}</strong>
                            </article>
                        </div>
                    </div>
                </div>`;
            reorderRaceDetailSections();
        }).catch(() => {
            section.style.display = 'none';
        });
    }

    function renderGrandPrixDashboard(raceInfo, raceResults, qualResults, sprintResults, pitStops) {
        const results = Array.isArray(raceResults) ? raceResults : [];
        const qualifying = Array.isArray(qualResults) ? qualResults : [];
        const sprint = Array.isArray(sprintResults) ? sprintResults : [];
        const pits = Array.isArray(pitStops) ? pitStops : [];

        let section = document.getElementById('gp-dashboard-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'gp-dashboard-section';
            section.className = 'section gp-dashboard';
            const tabs = document.getElementById('result-tabs');
            tabs?.insertAdjacentElement('beforebegin', section);
        }

        const starters = results.length;
        const finishers = results.filter((r) => {
            const status = String(r.status || '').toLowerCase();
            return status === 'finished' || status.startsWith('+');
        }).length;
        const dnfs = Math.max(starters - finishers, 0);
        const pointsScorers = results.filter((r) => (parseFloat(r.points) || 0) > 0).length;
        const finishedPct = starters ? Math.round((finishers / starters) * 100) : 0;

        const winner = results[0];
        const pole = qualifying[0];
        const sprintWinner = sprint[0];

        const inlineDriverValue = (entry, fallback = 'TBA') => {
            if (!entry?.Driver) return fallback;
            const d = entry.Driver;
            const cId = entry.Constructor?.constructorId;
            const fullName = `${d?.givenName || ''} ${d?.familyName || ''}`.trim();
            return `<span class="gp-driver-inline">${driverImgHTML(d?.givenName, d?.familyName, enriched, 'driver-avatar-sm', getTeamColor(cId), d?.permanentNumber)}<strong>${fullName || fallback}</strong></span>`;
        };

        const winnerInline = inlineDriverValue(winner, 'TBA');
        const poleInline = inlineDriverValue(pole, 'TBA');
        const sprintInline = inlineDriverValue(sprintWinner, 'N/A');

        const pitDurations = pits.map((p) => parseFloat(p.duration)).filter((x) => Number.isFinite(x) && x > 0);
        const avgPit = pitDurations.length ? (pitDurations.reduce((a, b) => a + b, 0) / pitDurations.length).toFixed(2) : '-';
        const fastestPit = pitDurations.length ? Math.min(...pitDurations).toFixed(2) : '-';

        const teamPoints = {};
        results.forEach((r) => {
            const cId = r.Constructor?.constructorId;
            if (!cId) return;
            teamPoints[cId] = (teamPoints[cId] || 0) + (parseFloat(r.points) || 0);
        });
        const teamRows = Object.entries(teamPoints)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([cId, pts]) => {
                const maxPts = Math.max(...Object.values(teamPoints), 1);
                const pct = (pts / maxPts) * 100;
                return `<div class="analytics-bar-row compact"><div class="analytics-bar-label">${teamLogoSmallHTML(cId)} <span>${getTeamName(cId)}</span></div><div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div><div class="analytics-bar-value">${pts.toFixed(1)}</div></div>`;
            }).join('');

        const movers = results
            .map((r) => {
                const gain = (parseInt(r.grid, 10) || 0) - (parseInt(r.position, 10) || 0);
                return { result: r, gain };
            })
            .filter((x) => Number.isFinite(x.gain))
            .sort((a, b) => b.gain - a.gain)
            .slice(0, 6)
            .map((x) => {
                const d = x.result.Driver;
                const cId = x.result.Constructor?.constructorId;
                const magnitude = Math.min(Math.abs(x.gain) * 14, 100);
                const color = x.gain >= 0 ? 'var(--f1-success)' : 'var(--f1-red)';
                return `<div class="analytics-bar-row compact"><div class="analytics-bar-label">${driverImgHTML(d?.givenName, d?.familyName, enriched, '', getTeamColor(cId), d?.permanentNumber)} <span>${d?.familyName || ''}</span></div><div class="analytics-bar-track"><span style="width:${magnitude.toFixed(1)}%;background:${color}"></span></div><div class="analytics-bar-value">${x.gain > 0 ? '+' : ''}${x.gain}</div></div>`;
            }).join('');

        section.innerHTML = `
            <div class="section-header"><h2>Grand Prix <span class="text-red">Dashboard</span></h2></div>
            <div class="gp-dashboard-stats">
                <article class="gp-stat-card"><span class="label">Winner</span><div class="gp-stat-driver">${winnerInline}</div><span>${winner ? inlineTeamHTML(winner.Constructor?.constructorId) : ''}</span></article>
                <article class="gp-stat-card"><span class="label">Pole</span><div class="gp-stat-driver">${poleInline}</div><span>${pole ? (pole.Q3 || pole.Q2 || pole.Q1 || '-') : '-'}</span></article>
                <article class="gp-stat-card"><span class="label">Sprint Winner</span><div class="gp-stat-driver">${sprintInline}</div><span>${sprintWinner ? inlineTeamHTML(sprintWinner.Constructor?.constructorId) : 'No sprint'}</span></article>
                <article class="gp-stat-card"><span class="label">Pit Stops</span><strong>${pits.length}</strong><span>Avg ${avgPit}s · Best ${fastestPit}s</span></article>
            </div>
            <div class="standings-analytics-grid gp-dashboard-grid">
                <article class="analytics-card">
                    <h3>Finish vs DNF</h3>
                    <div class="gp-finish-ring" style="--finish-pct:${finishedPct};"><span>${finishers}/${starters || 0}</span><small>finishers</small></div>
                    <div class="analytics-meta">${dnfs} DNFs · ${pointsScorers} points scorers</div>
                </article>
                <article class="analytics-card">
                    <h3>Team Points</h3>
                    <div class="analytics-bars">${teamRows || '<div class="analytics-empty">No race points available.</div>'}</div>
                </article>
                <article class="analytics-card">
                    <h3>Grid to Flag Movers</h3>
                    <div class="analytics-bars">${movers || '<div class="analytics-empty">No position-change data available.</div>'}</div>
                </article>
            </div>`;
        reorderRaceDetailSections();
    }

    async function renderHistoricalComparison(raceInfo) {
        let section = document.getElementById('gp-history-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'gp-history-section';
            section.className = 'section standings-analytics';
            const dashboard = document.getElementById('gp-dashboard-section');
            dashboard?.insertAdjacentElement('afterend', section);
        }

        const currentSeason = parseInt(raceInfo?.season, 10) || new Date().getFullYear();
        const targetYears = [];
        for (let y = currentSeason - 1; y >= Math.max(currentSeason - 8, 2000); y--) targetYears.push(y);

        if (!targetYears.length) {
            section.style.display = 'none';
            reorderRaceDetailSections();
            return;
        }

        const normalizeName = (name) => String(name || '').toLowerCase().replace(/grand prix/gi, '').replace(/[^a-z0-9]/g, '');
        const targetCircuitId = raceInfo?.Circuit?.circuitId;
        const targetName = normalizeName(raceInfo?.raceName);
        const targetCountry = String(raceInfo?.Circuit?.Location?.country || '').toLowerCase();

        section.style.display = '';
        section.innerHTML = '<div class="section-header"><h2>Historical <span class="text-red">Comparison</span></h2></div><div class="analytics-empty">Loading previous seasons...</div>';

        const settled = await Promise.allSettled(targetYears.map(async (year) => {
            const schedule = await F1API.getSchedule(year);
            if (!schedule?.length) return null;

            const matchedRace = schedule.find((r) => r.Circuit?.circuitId && targetCircuitId && r.Circuit.circuitId === targetCircuitId)
                || schedule.find((r) => normalizeName(r.raceName) === targetName)
                || schedule.find((r) => normalizeName(r.raceName).includes(targetName) || targetName.includes(normalizeName(r.raceName)))
                || schedule.find((r) => String(r.Circuit?.Location?.country || '').toLowerCase() === targetCountry);

            if (!matchedRace?.round) return null;

            const result = await F1API.getRaceResults(year, matchedRace.round);
            const winner = result?.Results?.[0];
            if (!winner) return null;

            return {
                year,
                raceName: matchedRace.raceName || raceInfo?.raceName || 'Grand Prix',
                winnerName: `${winner.Driver?.givenName || ''} ${winner.Driver?.familyName || ''}`.trim(),
                winnerFamilyName: winner.Driver?.familyName || 'Winner',
                winnerNumber: winner.Driver?.permanentNumber,
                teamId: winner.Constructor?.constructorId,
                grid: winner.grid || '-',
                fastestLap: winner.FastestLap?.Time?.time || '-',
                margin: winner.Time?.time || winner.status || '-',
            };
        }));

        const history = settled
            .filter((x) => x.status === 'fulfilled' && x.value)
            .map((x) => x.value)
            .sort((a, b) => b.year - a.year);

        if (!history.length) {
            section.innerHTML = '<div class="section-header"><h2>Historical <span class="text-red">Comparison</span></h2></div><div class="analytics-empty">Historical data unavailable for this Grand Prix.</div>';
            reorderRaceDetailSections();
            return;
        }

        const teamWins = {};
        history.forEach((h) => {
            if (!h.teamId) return;
            teamWins[h.teamId] = (teamWins[h.teamId] || 0) + 1;
        });
        const maxTeamWins = Math.max(...Object.values(teamWins), 1);
        const teamBars = Object.entries(teamWins)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([teamId, wins]) => {
                const pct = (wins / maxTeamWins) * 100;
                return `<div class="analytics-bar-row compact"><div class="analytics-bar-label">${teamLogoSmallHTML(teamId)} <span>${getTeamName(teamId)}</span></div><div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(teamId)}"></span></div><div class="analytics-bar-value">${wins}</div></div>`;
            }).join('');

        let streakTeam = history[0]?.teamId;
        let streakCount = 0;
        for (const item of history) {
            if (item.teamId === streakTeam) streakCount++;
            else break;
        }

        const timelineRows = history.map((h) => {
            const teamColor = getTeamColor(h.teamId);
            return `<div class="gp-history-row">
                <span class="gp-history-year">${h.year}</span>
                <span class="gp-history-winner">${driverImgHTML('', h.winnerFamilyName, enriched, '', teamColor, h.winnerNumber)} <strong>${h.winnerName}</strong></span>
                <span class="gp-history-team">${inlineTeamHTML(h.teamId)}</span>
                <span class="gp-history-meta">Grid P${h.grid} · FL ${h.fastestLap}</span>
            </div>`;
        }).join('');

        section.innerHTML = `
            <div class="section-header"><h2>Historical <span class="text-red">Comparison</span></h2></div>
            <div class="standings-analytics-grid gp-history-grid">
                <article class="analytics-card">
                    <h3>Recent Winners</h3>
                    <div class="gp-history-list">${timelineRows}</div>
                </article>
                <article class="analytics-card">
                    <h3>Team Win Share</h3>
                    <div class="analytics-bars">${teamBars}</div>
                </article>
                <article class="analytics-card analytics-highlight-card">
                    <h3>Historical Snapshot</h3>
                    <div class="analytics-big-value">${history.length}</div>
                    <p>Seasons compared: ${history[history.length - 1].year}-${history[0].year}. ${streakTeam ? `${inlineTeamHTML(streakTeam)} holds a ${streakCount}-race winning streak here.` : ''}</p>
                </article>
            </div>`;
        reorderRaceDetailSections();
    }

    function renderSectorPerformanceMiniChart(openF1Laps, raceTopResults) {
        if (!Array.isArray(openF1Laps) || !openF1Laps.length || !Array.isArray(raceTopResults) || !raceTopResults.length) return;

        let section = document.getElementById('sector-mini-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'sector-mini-section';
            section.className = 'section sector-mini-section';
            const weather = document.getElementById('weather-section');
            weather?.insertAdjacentElement('afterend', section);
        }

        const driverByNumber = new Map();
        raceTopResults.forEach((r) => {
            const num = parseInt(r.Driver?.permanentNumber, 10);
            if (Number.isFinite(num)) driverByNumber.set(num, r);
        });

        if (!driverByNumber.size) {
            section.style.display = 'none';
            return;
        }

        const getSector = (lap, idx) => {
            const keys = [
                `duration_sector_${idx}`,
                `sector_${idx}_time`,
                `sector_${idx}`,
            ];
            for (const key of keys) {
                const value = parseFloat(lap?.[key]);
                if (Number.isFinite(value) && value > 0) return value;
            }
            return null;
        };

        const acc = {};
        openF1Laps.forEach((lap) => {
            const num = parseInt(lap.driver_number, 10);
            if (!driverByNumber.has(num)) return;
            if (!acc[num]) acc[num] = { s1: 0, s2: 0, s3: 0, c1: 0, c2: 0, c3: 0 };

            const s1 = getSector(lap, 1);
            const s2 = getSector(lap, 2);
            const s3 = getSector(lap, 3);
            if (s1) { acc[num].s1 += s1; acc[num].c1 += 1; }
            if (s2) { acc[num].s2 += s2; acc[num].c2 += 1; }
            if (s3) { acc[num].s3 += s3; acc[num].c3 += 1; }
        });

        const rows = Object.entries(acc).map(([num, v]) => {
            const result = driverByNumber.get(parseInt(num, 10));
            const d = result?.Driver;
            const cId = result?.Constructor?.constructorId;
            const s1 = v.c1 ? (v.s1 / v.c1) : null;
            const s2 = v.c2 ? (v.s2 / v.c2) : null;
            const s3 = v.c3 ? (v.s3 / v.c3) : null;
            if (!s1 || !s2 || !s3) return null;
            return { num, d, cId, s1, s2, s3 };
        }).filter(Boolean);

        if (!rows.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        const bestS1 = Math.min(...rows.map((r) => r.s1));
        const bestS2 = Math.min(...rows.map((r) => r.s2));
        const bestS3 = Math.min(...rows.map((r) => r.s3));

        const toPace = (best, value) => Math.max(35, Math.min(100, (best / value) * 100));

        const content = rows
            .sort((a, b) => (a.s1 + a.s2 + a.s3) - (b.s1 + b.s2 + b.s3))
            .slice(0, 6)
            .map((r) => {
                const color = getTeamColor(r.cId);
                const p1 = toPace(bestS1, r.s1);
                const p2 = toPace(bestS2, r.s2);
                const p3 = toPace(bestS3, r.s3);
                return `<div class="sector-mini-row">
                    <div class="sector-mini-driver">${driverImgHTML(r.d?.givenName, r.d?.familyName, enriched, '', color, r.num)} <strong>${r.d?.familyName || `#${r.num}`}</strong></div>
                    <div class="sector-mini-bars">
                        <div class="sector-mini-bar"><span class="sector-mini-label">S1</span><div class="sector-mini-track"><span style="width:${p1.toFixed(1)}%;background:${color}"></span></div><em>${r.s1.toFixed(3)}s</em></div>
                        <div class="sector-mini-bar"><span class="sector-mini-label">S2</span><div class="sector-mini-track"><span style="width:${p2.toFixed(1)}%;background:${color}"></span></div><em>${r.s2.toFixed(3)}s</em></div>
                        <div class="sector-mini-bar"><span class="sector-mini-label">S3</span><div class="sector-mini-track"><span style="width:${p3.toFixed(1)}%;background:${color}"></span></div><em>${r.s3.toFixed(3)}s</em></div>
                    </div>
                </div>`;
            }).join('');

        section.innerHTML = `
            <div class="section-header"><h2>Mini Sector <span class="text-red">Performance</span></h2></div>
            <div class="sector-mini-chart">${content}</div>`;
        reorderRaceDetailSections();
    }

    function setupTelemetryMiniPanel(sessionKey, raceResults, isLiveSession) {
        const top3 = (raceResults || [])
            .slice(0, 3)
            .filter((r) => Number.isFinite(parseInt(r.Driver?.permanentNumber, 10)));

        if (!top3.length || !sessionKey) {
            const section = document.getElementById('telemetry-mini-section');
            if (section) section.style.display = 'none';
            if (telemetryRefreshTimer) {
                clearInterval(telemetryRefreshTimer);
                telemetryRefreshTimer = null;
            }
            return;
        }

        const renderSnapshot = async () => {
            const data = await Promise.allSettled(
                top3.map((r) => F1API.getOpenF1CarData(sessionKey, parseInt(r.Driver?.permanentNumber, 10)))
            );

            const telemetryRows = top3.map((result, index) => {
                const samples = data[index]?.status === 'fulfilled' && Array.isArray(data[index].value)
                    ? data[index].value
                    : [];
                const latest = samples.length ? samples[samples.length - 1] : null;

                const speed = Number(latest?.speed);
                const throttleRaw = Number(latest?.throttle);
                const brakeRaw = Number(latest?.brake);
                const throttle = Number.isFinite(throttleRaw) ? Math.max(0, Math.min(100, throttleRaw)) : null;
                const brake = Number.isFinite(brakeRaw)
                    ? Math.max(0, Math.min(100, brakeRaw <= 1 ? brakeRaw * 100 : brakeRaw))
                    : null;

                return {
                    result,
                    latest,
                    speed: Number.isFinite(speed) ? speed : null,
                    throttle,
                    brake,
                };
            });

            renderTelemetryMiniPanel(telemetryRows, isLiveSession);
        };

        if (telemetryRefreshTimer) {
            clearInterval(telemetryRefreshTimer);
            telemetryRefreshTimer = null;
        }

        renderSnapshot().catch(() => { /* telemetry is additive and non-critical */ });

        if (isLiveSession) {
            telemetryRefreshTimer = setInterval(() => {
                renderSnapshot().catch(() => { /* retry on next poll */ });
            }, 10_000);
        }
    }

    function renderTelemetryMiniPanel(rows, isLiveSession) {
        let section = document.getElementById('telemetry-mini-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'telemetry-mini-section';
            section.className = 'section telemetry-mini-section';
            const weather = document.getElementById('weather-section');
            weather?.insertAdjacentElement('afterend', section);
        }

        if (!Array.isArray(rows) || !rows.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        const maxSpeed = Math.max(...rows.map((r) => r.speed || 0), 1);
        const timestamp = rows
            .map((r) => r.latest?.date)
            .filter(Boolean)
            .sort()
            .pop();

        const cards = rows.map((entry) => {
            const d = entry.result?.Driver;
            const cId = entry.result?.Constructor?.constructorId;
            const color = getTeamColor(cId);

            const speedPct = entry.speed != null ? (entry.speed / maxSpeed) * 100 : 0;
            const throttlePct = entry.throttle != null ? entry.throttle : 0;
            const brakePct = entry.brake != null ? entry.brake : 0;

            return `<article class="telemetry-driver-card">
                <div class="telemetry-driver-head">
                    ${driverImgHTML(d?.givenName, d?.familyName, enriched, '', color, d?.permanentNumber)}
                    <div>
                        <strong>${d?.givenName || ''} ${d?.familyName || ''}</strong>
                        <small>${inlineTeamHTML(cId)}</small>
                    </div>
                </div>
                <div class="telemetry-metrics">
                    <div class="telemetry-metric-row">
                        <span>Speed</span>
                        <div class="telemetry-track"><span style="width:${speedPct.toFixed(1)}%;background:${color}"></span></div>
                        <em>${entry.speed != null ? `${entry.speed.toFixed(0)} km/h` : '-'}</em>
                    </div>
                    <div class="telemetry-metric-row">
                        <span>Throttle</span>
                        <div class="telemetry-track"><span style="width:${throttlePct.toFixed(1)}%;background:var(--f1-success)"></span></div>
                        <em>${entry.throttle != null ? `${entry.throttle.toFixed(0)}%` : '-'}</em>
                    </div>
                    <div class="telemetry-metric-row">
                        <span>Brake</span>
                        <div class="telemetry-track"><span style="width:${brakePct.toFixed(1)}%;background:var(--f1-red)"></span></div>
                        <em>${entry.brake != null ? `${entry.brake.toFixed(0)}%` : '-'}</em>
                    </div>
                </div>
            </article>`;
        }).join('');

        section.innerHTML = `
            <div class="section-header">
                <h2>Live Telemetry <span class="text-red">Mini Panel</span></h2>
                <span class="telemetry-status ${isLiveSession ? 'live' : 'static'}">${isLiveSession ? 'LIVE · auto-refresh 10s' : 'Snapshot'}</span>
            </div>
            <div class="telemetry-mini-grid">${cards}</div>
            <div class="telemetry-footnote">Latest sample: ${timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : 'Unavailable'}</div>`;
        reorderRaceDetailSections();
    }

    function renderConstructorStrategyAnalyzer(pitStops, stints, raceResults) {
        const results = Array.isArray(raceResults) ? raceResults : [];

        let section = document.getElementById('constructor-strategy-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'constructor-strategy-section';
            section.className = 'section standings-analytics constructor-strategy-section';
            const historySection = document.getElementById('gp-history-section');
            if (historySection) {
                historySection.insertAdjacentElement('afterend', section);
            } else {
                const dashboard = document.getElementById('gp-dashboard-section');
                dashboard?.insertAdjacentElement('afterend', section);
            }
        }

        if (!results.length) {
            section.style.display = 'none';
            return;
        }

        const driverToTeam = {};
        const numberToTeam = {};
        results.forEach((r) => {
            const cId = r.Constructor?.constructorId;
            const dId = r.Driver?.driverId;
            const num = parseInt(r.Driver?.permanentNumber, 10);
            if (cId && dId) driverToTeam[dId] = cId;
            if (cId && Number.isFinite(num)) numberToTeam[num] = cId;
        });

        const pitByTeam = {};
        const allPitDurations = [];
        (Array.isArray(pitStops) ? pitStops : []).forEach((p) => {
            const cId = driverToTeam[p.driverId];
            const dur = parseFloat(p.duration);
            if (!cId || !Number.isFinite(dur) || dur <= 0) return;
            allPitDurations.push(dur);
            if (!pitByTeam[cId]) pitByTeam[cId] = { sum: 0, count: 0 };
            pitByTeam[cId].sum += dur;
            pitByTeam[cId].count += 1;
        });

        const stintsByTeam = {};
        const allStintLengths = [];
        (Array.isArray(stints) ? stints : []).forEach((s) => {
            const num = parseInt(s.driver_number, 10);
            const cId = numberToTeam[num];
            if (!cId) return;

            const lapStart = parseInt(s.lap_start, 10);
            const lapEnd = parseInt(s.lap_end, 10);
            const safeStart = Number.isFinite(lapStart) ? lapStart : lapEnd;
            const safeEnd = Number.isFinite(lapEnd) ? lapEnd : lapStart;
            if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) return;

            const length = Math.max(1, safeEnd - safeStart + 1);
            allStintLengths.push(length);
            if (!stintsByTeam[cId]) stintsByTeam[cId] = { sum: 0, count: 0 };
            stintsByTeam[cId].sum += length;
            stintsByTeam[cId].count += 1;
        });

        const fieldPitAvg = allPitDurations.length
            ? allPitDurations.reduce((a, b) => a + b, 0) / allPitDurations.length
            : null;
        const fieldStintAvg = allStintLengths.length
            ? allStintLengths.reduce((a, b) => a + b, 0) / allStintLengths.length
            : null;

        const teamIds = [...new Set(results.map((r) => r.Constructor?.constructorId).filter(Boolean))];
        const rows = teamIds.map((teamId) => {
            const pit = pitByTeam[teamId];
            const stint = stintsByTeam[teamId];
            const pitAvg = pit?.count ? pit.sum / pit.count : null;
            const stintAvg = stint?.count ? stint.sum / stint.count : null;

            let strategyScore = null;
            const components = [];
            if (pitAvg != null && fieldPitAvg != null && fieldPitAvg > 0) {
                components.push(((fieldPitAvg - pitAvg) / fieldPitAvg) * 100);
            }
            if (stintAvg != null && fieldStintAvg != null && fieldStintAvg > 0) {
                components.push(((stintAvg - fieldStintAvg) / fieldStintAvg) * 100);
            }
            if (components.length) {
                strategyScore = components.reduce((a, b) => a + b, 0) / components.length;
            }

            return {
                teamId,
                pitAvg,
                stintAvg,
                pitDelta: pitAvg != null && fieldPitAvg != null ? pitAvg - fieldPitAvg : null,
                stintDelta: stintAvg != null && fieldStintAvg != null ? stintAvg - fieldStintAvg : null,
                strategyScore,
            };
        }).filter((r) => r.pitAvg != null || r.stintAvg != null);

        if (!rows.length) {
            section.style.display = 'none';
            return;
        }

        rows.sort((a, b) => (b.strategyScore || -999) - (a.strategyScore || -999));
        section.style.display = '';

        const pitRows = rows.map((r) => {
            const color = r.pitDelta != null && r.pitDelta <= 0 ? 'var(--f1-success)' : 'var(--f1-red)';
            const pct = r.pitAvg != null && fieldPitAvg != null ? Math.max(12, Math.min(100, (fieldPitAvg / r.pitAvg) * 100)) : 0;
            return `<div class="analytics-bar-row compact">
                <div class="analytics-bar-label">${teamLogoSmallHTML(r.teamId)} <span>${getTeamName(r.teamId)}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div>
                <div class="analytics-bar-value">${r.pitAvg != null ? `${r.pitAvg.toFixed(2)}s` : '-'}</div>
            </div>`;
        }).join('');

        const stintRows = rows.map((r) => {
            const color = r.stintDelta != null && r.stintDelta >= 0 ? 'var(--f1-success)' : 'var(--f1-warning)';
            const pct = r.stintAvg != null && fieldStintAvg != null ? Math.max(12, Math.min(100, (r.stintAvg / fieldStintAvg) * 100)) : 0;
            return `<div class="analytics-bar-row compact">
                <div class="analytics-bar-label">${teamLogoSmallHTML(r.teamId)} <span>${getTeamAbbr(r.teamId)}</span></div>
                <div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div>
                <div class="analytics-bar-value">${r.stintAvg != null ? `${r.stintAvg.toFixed(1)} laps` : '-'}</div>
            </div>`;
        }).join('');

        const leader = rows[0];
        const leaderText = leader
            ? `${inlineTeamHTML(leader.teamId)} leads with ${leader.strategyScore != null ? leader.strategyScore.toFixed(1) : '0.0'} strategy score.`
            : 'Strategy data unavailable.';

        section.innerHTML = `
            <div class="section-header"><h2>Constructor Strategy <span class="text-red">Analyzer</span></h2></div>
            <div class="standings-analytics-grid">
                <article class="analytics-card">
                    <h3>Pit Stop Efficiency</h3>
                    <div class="analytics-bars">${pitRows}</div>
                    <div class="analytics-meta">Field average: ${fieldPitAvg != null ? `${fieldPitAvg.toFixed(2)}s` : '-'}</div>
                </article>
                <article class="analytics-card">
                    <h3>Stint Delta vs Field</h3>
                    <div class="analytics-bars">${stintRows}</div>
                    <div class="analytics-meta">Field average: ${fieldStintAvg != null ? `${fieldStintAvg.toFixed(1)} laps` : '-'}</div>
                </article>
                <article class="analytics-card analytics-highlight-card">
                    <h3>Best Strategy Signal</h3>
                    <div class="analytics-big-value">${leader?.strategyScore != null ? leader.strategyScore.toFixed(1) : '-'}</div>
                    <p>${leaderText}</p>
                </article>
            </div>`;
        reorderRaceDetailSections();
    }

    function renderRaceCountdown(race) {
        let section = document.getElementById('race-countdown-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'race-countdown-section';
            section.className = 'section race-countdown-section';
            const container = document.querySelector('.page-content .container');
            container?.appendChild(section);
        }

        section.style.display = '';
        section.innerHTML = `
            <div class="section-header"><h2>Countdown</h2></div>
            <div class="race-countdown-shell">
                <div class="countdown race-countdown-live" id="race-countdown-live"></div>
            </div>`;

        const targetDate = race?.time ? `${race.date}T${race.time}` : `${race?.date || ''}T14:00:00Z`;
        const countdownEl = document.getElementById('race-countdown-live');
        if (!countdownEl || !race?.date) return;

        if (raceCountdownTimer) {
            clearInterval(raceCountdownTimer);
            raceCountdownTimer = null;
        }

        const updateCountdown = () => {
            const diff = getTimeDiff(targetDate);
            if (diff.passed) {
                countdownEl.innerHTML = '<span class="race-countdown-status is-complete">Race Completed</span>';
                if (raceCountdownTimer) {
                    clearInterval(raceCountdownTimer);
                    raceCountdownTimer = null;
                }
                return;
            }

            countdownEl.innerHTML = ['days', 'hours', 'minutes', 'seconds'].map((unit, i) => {
                const val = unit === 'days' ? diff.days : unit === 'hours' ? diff.hours : unit === 'minutes' ? diff.minutes : diff.seconds;
                return `${i > 0 ? '<span class="countdown-separator">:</span>' : ''}
                    <div class="countdown-item"><span class="countdown-value">${String(val).padStart(unit === 'days' ? 1 : 2, '0')}</span><span class="countdown-label">${unit.slice(0, 4)}</span></div>`;
            }).join('');
        };

        updateCountdown();
        raceCountdownTimer = setInterval(updateCountdown, 1000);
        reorderRaceDetailSections();
    }

    function renderRaceInfo(race, raceResults) {
        const infoEl = document.getElementById('race-info');
        infoEl.style.display = '';

        const fastestResult = raceResults?.Results?.find(r => r.FastestLap?.rank === '1');

        const fastestHTML = fastestResult ? `
            <div class="race-info-item">
                <div class="label">Fastest Lap</div>
                <div class="value">
                    <span class="fastest-lap-badge">FL</span>
                    ${driverImgHTML(fastestResult.Driver?.givenName, fastestResult.Driver?.familyName, enriched, '', getTeamColor(fastestResult.Constructor?.constructorId), fastestResult.Driver?.permanentNumber)}
                    ${fastestResult.Driver?.familyName || ''} — ${fastestResult.FastestLap?.Time?.time || ''}
                </div>
            </div>` : '';

        const totalLaps = raceResults?.Results?.[0]?.laps;
        const lapsHTML = totalLaps ? `
            <div class="race-info-item">
                <div class="label">Total Laps</div>
                <div class="value">${totalLaps}</div>
            </div>` : '';

        infoEl.innerHTML = `
            <div class="race-info-item">
                <div class="label">Circuit</div>
                <div class="value">${race.Circuit?.circuitName || 'TBA'}</div>
            </div>
            <div class="race-info-item">
                <div class="label">Location</div>
                <div class="value">${countryFlagHTML(race.Circuit?.Location?.country, 16)} ${race.Circuit?.Location?.locality || ''}, ${race.Circuit?.Location?.country || ''}</div>
            </div>
            <div class="race-info-item">
                <div class="label">Date</div>
                <div class="value">${formatDate(race.date)}</div>
            </div>
            <div class="race-info-item">
                <div class="label">Race Start</div>
                <div class="value">${race.time ? formatTimeOnly(race.time) + ' UTC' : 'TBA'}</div>
            </div>
            ${lapsHTML}
            ${fastestHTML}
        `;
        reorderRaceDetailSections();
    }

    function renderTrackIntel(race, raceResults) {
        const intel = getTrackIntel(race, raceResults);

        let section = document.getElementById('track-intel-section');
        if (!section) {
            section = document.createElement('section');
            section.id = 'track-intel-section';
            section.className = 'section track-intel-section';
            const circuit = document.getElementById('race-circuit-showcase');
            circuit?.insertAdjacentElement('afterend', section);
        }

        const dims = [
            { label: 'Track Length', value: intel.lengthKm != null ? `${intel.lengthKm.toFixed(3)} km` : 'TBA', icon: SVG_ICONS.road },
            { label: 'Corners', value: intel.corners != null ? String(intel.corners) : 'TBA', icon: SVG_ICONS.flagBlue },
            { label: 'Overtake Zones', value: intel.overtakeZones != null ? String(intel.overtakeZones) : 'TBA', icon: SVG_ICONS.wind },
            { label: 'Race Distance', value: intel.raceDistanceKm != null ? `${intel.raceDistanceKm.toFixed(3)} km` : 'TBA', icon: SVG_ICONS.flagChequered },
            { label: 'Laps', value: intel.laps != null ? String(intel.laps) : 'TBA', icon: SVG_ICONS.calendar },
            { label: 'First GP', value: intel.firstGrandPrix != null ? String(intel.firstGrandPrix) : 'TBA', icon: SVG_ICONS.medalGold },
        ];

        section.style.display = '';
        section.innerHTML = `
            <div class="section-header"><h2>Track <span class="text-red">Intel</span></h2></div>
            <div class="track-intel-grid">
                ${dims.map((d) => `<article class="track-intel-card"><span class="track-intel-icon">${d.icon}</span><span class="track-intel-label">${d.label}</span><strong>${d.value}</strong></article>`).join('')}
            </div>
            <div class="track-facts-list">
                ${intel.facts.slice(0, 4).map((fact, idx) => `<article class="track-fact-item"><span class="track-fact-index">F${idx + 1}</span><p>${fact}</p></article>`).join('')}
            </div>`;
        reorderRaceDetailSections();
    }

    function renderWeather(weatherData) {
        const section = document.getElementById('weather-section');
        const container = document.getElementById('weather-container');
        if (!weatherData?.length) return;

        const latest = weatherData[weatherData.length - 1];
        section.style.display = '';

        const rainfall = latest.rainfall || 0;
        let mainIcon = SVG_ICONS.sun;
        if (rainfall > 0) mainIcon = SVG_ICONS.rain;
        else if (latest.air_temperature < 18) mainIcon = SVG_ICONS.partlyCloudy;

        container.innerHTML = `
            <div class="weather-widget">
                <div class="weather-item">
                    <div class="w-icon">${mainIcon}</div>
                    <div class="w-value">${rainfall > 0 ? 'Wet' : 'Dry'}</div>
                    <div class="w-label">Conditions</div>
                </div>
                <div class="weather-item">
                    <div class="w-icon">${SVG_ICONS.thermometer}</div>
                    <div class="w-value">${latest.air_temperature != null ? Number(latest.air_temperature).toFixed(1) + '°' : '-'}</div>
                    <div class="w-label">Air Temp</div>
                </div>
                <div class="weather-item">
                    <div class="w-icon">${SVG_ICONS.road}</div>
                    <div class="w-value">${latest.track_temperature != null ? Number(latest.track_temperature).toFixed(1) + '°' : '-'}</div>
                    <div class="w-label">Track Temp</div>
                </div>
                <div class="weather-item">
                    <div class="w-icon">${SVG_ICONS.wind}</div>
                    <div class="w-value">${latest.wind_speed != null ? Number(latest.wind_speed).toFixed(1) : '-'}</div>
                    <div class="w-label">Wind (m/s)</div>
                </div>
                <div class="weather-item">
                    <div class="w-icon">${SVG_ICONS.droplet}</div>
                    <div class="w-value">${latest.humidity != null ? Number(latest.humidity).toFixed(0) + '%' : '-'}</div>
                    <div class="w-label">Humidity</div>
                </div>
                <div class="weather-item">
                    <div class="w-icon">${SVG_ICONS.rain}</div>
                    <div class="w-value">${Number(rainfall).toFixed(0)}mm</div>
                    <div class="w-label">Rainfall</div>
                </div>
            </div>`;
        reorderRaceDetailSections();
    }

    function renderPodium(results) {
        const container = document.getElementById('podium-container');
        if (!container) return;
        const top3 = (results || []).slice(0, 3);
        if (top3.length < 3) { container.style.display = 'none'; return; }

        container.style.display = '';
        const order = [top3[1], top3[0], top3[2]];
        const positions = ['p2', 'p1', 'p3'];
        const trophies = [SVG_ICONS.medalSilver, SVG_ICONS.trophy, SVG_ICONS.medalBronze];

        container.innerHTML = `
            <div class="podium">
                ${order.map((r, i) => {
                    const d = r.Driver;
                    const cId = r.Constructor?.constructorId;
                    const teamColor = getTeamColor(cId);
                    const url = getDriverHeadshotHiRes(d.givenName, d.familyName, enriched, d.permanentNumber);
                    const imgHTML = url
                        ? `<img src="${url}" alt="${d.familyName}" class="podium-driver-img" style="border-color:${teamColor};object-position:50% 4%" loading="lazy" onerror="this.outerHTML='<div class=\\'podium-driver-img\\' style=\\'background:${teamColor};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.2rem;border-color:${teamColor}\\'>${(d.familyName||'').substring(0,3).toUpperCase()}</div>'">`
                        : `<div class="podium-driver-img" style="background:${teamColor};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.2rem;border-color:${teamColor}">${(d.familyName||'').substring(0,3).toUpperCase()}</div>`;
                    return `
                    <div class="podium-item ${positions[i]}">
                        <div class="podium-trophy">${trophies[i]}</div>
                        ${imgHTML}
                        <div class="podium-name">${d.givenName} ${d.familyName}</div>
                        <div class="podium-team" style="color:${teamColor}">${inlineTeamHTML(cId)}</div>
                        <div class="podium-block">
                            <div class="podium-pos">${r.position}</div>
                            <div style="font-size:0.8rem;color:var(--f1-gray)">${r.Time?.time || r.status || ''}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="checkered-divider"></div>`;
    }

    function renderRaceAnalytics(results) {
        if (!results?.length) return;

        let section = document.getElementById('race-analytics');
        if (!section) {
            section = document.createElement('section');
            section.id = 'race-analytics';
            section.className = 'section standings-analytics';
            section.innerHTML = '<div class="section-header"><h2>Race Analytics</h2></div><div id="race-analytics-grid" class="standings-analytics-grid"></div>';
            const tabs = document.getElementById('result-tabs');
            tabs?.insertAdjacentElement('beforebegin', section);
        }

        const grid = section.querySelector('#race-analytics-grid');
        if (!grid) return;

        const top10 = results.filter(r => (parseInt(r.position, 10) || 99) <= 10);
        const maxPoints = Math.max(...top10.map(r => parseFloat(r.points) || 0), 1);

        const pointsRows = top10.map((r) => {
            const d = r.Driver;
            const cId = r.Constructor?.constructorId;
            const pts = parseFloat(r.points) || 0;
            const pct = (pts / maxPoints) * 100;
            return `<div class="analytics-bar-row compact"><div class="analytics-bar-label">${driverImgHTML(d?.givenName, d?.familyName, enriched, '', getTeamColor(cId), d?.permanentNumber)} <span>${d?.familyName || ''}</span></div><div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${getTeamColor(cId)}"></span></div><div class="analytics-bar-value">${pts.toFixed(0)}</div></div>`;
        }).join('');

        const gainers = results
            .map((r) => ({
                r,
                gain: (parseInt(r.grid, 10) || 0) - (parseInt(r.position, 10) || 0),
            }))
            .sort((a, b) => b.gain - a.gain)
            .slice(0, 5);

        const gainRows = gainers.map((item) => {
            const d = item.r.Driver;
            const cId = item.r.Constructor?.constructorId;
            const gain = item.gain;
            const pct = Math.min(Math.abs(gain) * 12, 100);
            const color = gain >= 0 ? 'var(--f1-success)' : 'var(--f1-red)';
            return `<div class="analytics-bar-row compact"><div class="analytics-bar-label">${driverImgHTML(d?.givenName, d?.familyName, enriched, '', getTeamColor(cId), d?.permanentNumber)} <span>${d?.familyName || ''}</span></div><div class="analytics-bar-track"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div><div class="analytics-bar-value">${gain > 0 ? '+' : ''}${gain}</div></div>`;
        }).join('');

        const winner = results[0];
        const winnerName = winner?.Driver ? `${winner.Driver.givenName || ''} ${winner.Driver.familyName || ''}`.trim() : 'Winner';
        const winnerCId = winner?.Constructor?.constructorId;
        const winnerBadge = winner?.Driver
            ? `<span class="gp-driver-inline">${driverImgHTML(winner.Driver?.givenName, winner.Driver?.familyName, enriched, 'driver-avatar-sm', getTeamColor(winnerCId), winner.Driver?.permanentNumber)}<strong>${winnerName}</strong></span>`
            : winnerName;

        grid.innerHTML = `
            <article class="analytics-card">
                <h3>Top 10 Points Earned</h3>
                <div class="analytics-bars">${pointsRows}</div>
            </article>
            <article class="analytics-card">
                <h3>Best Position Changes</h3>
                <div class="analytics-bars">${gainRows}</div>
            </article>
            <article class="analytics-card analytics-highlight-card">
                <h3>Race Winner</h3>
                <div class="analytics-big-value">P1</div>
                <p>${winnerBadge} won from grid P${winner?.grid || '?'}, scoring ${winner?.points || '0'} points.</p>
            </article>`;
        reorderRaceDetailSections();
    }

    function renderRaceResults(results) {
        raceResultsEl.innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Laps</th><th>Time/Status</th><th>Fastest Lap</th><th style="text-align:right">Points</th></tr>
                    </thead>
                    <tbody>
                        ${results.map((r, idx) => {
                            const d = r.Driver;
                            const cId = r.Constructor?.constructorId;
                            const teamColor = getTeamColor(cId);
                            const fl = r.FastestLap?.rank === '1' ? ' <span class="fastest-lap-badge">FL</span>' : '';
                            const gridDiff = r.grid && r.position ? parseInt(r.grid) - parseInt(r.position) : 0;
                            const diffHTML = gridDiff > 0 ? ` <span class="pos-change up">&#9650;${gridDiff}</span>` : gridDiff < 0 ? ` <span class="pos-change down">&#9660;${Math.abs(gridDiff)}</span>` : '';
                            const flTime = r.FastestLap?.Time?.time || '-';
                            const flLap = r.FastestLap?.lap ? `L${r.FastestLap.lap}` : '';
                            return `<tr style="animation-delay:${idx * 0.02}s">
                                <td class="pos-cell">${r.position || r.positionText || ''}</td>
                                <td><div class="driver-cell">
                                    ${driverImgHTML(d.givenName, d.familyName, enriched, '', teamColor, d.permanentNumber)}
                                    <span class="team-color-bar" style="background:${teamColor}"></span>
                                    <div><span style="color:var(--f1-gray);font-size:0.8rem;text-transform:uppercase">${d.givenName || ''}</span><br><strong style="text-transform:uppercase">${d.familyName || ''}</strong></div>
                                </div></td>
                                <td>${inlineTeamHTML(cId)}</td>
                                <td>${r.grid || ''}${diffHTML}</td>
                                <td>${r.laps || ''}</td>
                                <td>${r.Time?.time || r.status || ''}${fl}</td>
                                <td><span class="text-sm">${flTime}</span>${flLap ? ` <span class="text-xs text-gray">${flLap}</span>` : ''}</td>
                                <td class="points-cell">${r.points || 0}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderQualifyingResults(results) {
        document.getElementById('qualifying-results').innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead>
                    <tbody>
                        ${results.map(r => {
                            const d = r.Driver; const cId = r.Constructor?.constructorId; const tc = getTeamColor(cId);
                            return `<tr>
                                <td class="pos-cell">${r.position || ''}</td>
                                <td><div class="driver-cell">${driverImgHTML(d.givenName, d.familyName, enriched, '', tc, d.permanentNumber)}<span class="team-color-bar" style="background:${tc}"></span><div><span style="color:var(--f1-gray);font-size:0.8rem;text-transform:uppercase">${d.givenName||''}</span><br><strong style="text-transform:uppercase">${d.familyName||''}</strong></div></div></td>
                                <td>${inlineTeamHTML(cId)}</td>
                                <td>${r.Q1 || '-'}</td><td>${r.Q2 || '-'}</td><td>${r.Q3 || '-'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderSprintResults(results) {
        document.getElementById('sprint-results').innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Laps</th><th>Time/Status</th><th style="text-align:right">Points</th></tr></thead>
                    <tbody>
                        ${results.map(r => {
                            const d = r.Driver; const cId = r.Constructor?.constructorId; const tc = getTeamColor(cId);
                            return `<tr>
                                <td class="pos-cell">${r.position||''}</td>
                                <td><div class="driver-cell">${driverImgHTML(d.givenName, d.familyName, enriched, '', tc, d.permanentNumber)}<span class="team-color-bar" style="background:${tc}"></span><div><span style="color:var(--f1-gray);font-size:0.8rem;text-transform:uppercase">${d.givenName||''}</span><br><strong style="text-transform:uppercase">${d.familyName||''}</strong></div></div></td>
                                <td>${inlineTeamHTML(cId)}</td>
                                <td>${r.grid||''}</td><td>${r.laps||''}</td>
                                <td>${r.Time?.time||r.status||''}</td>
                                <td class="points-cell">${r.points||0}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderPitStops(pitStops, raceResults) {
        // Find fastest pit stop
        let fastest = Infinity;
        pitStops.forEach(p => { const d = parseFloat(p.duration); if (d && d < fastest) fastest = d; });

        // Build driver lookup from race results for photos
        const driverLookup = {};
        if (raceResults?.length) {
            raceResults.forEach(r => {
                if (r.Driver?.driverId) {
                    driverLookup[r.Driver.driverId] = r;
                }
            });
        }

        document.getElementById('pitstops-results').innerHTML = `
            <div class="table-wrapper">
                <table class="results-table">
                    <thead><tr><th>Stop</th><th>Driver</th><th>Lap</th><th>Time of Day</th><th style="text-align:right">Duration</th></tr></thead>
                    <tbody>
                        ${pitStops.map(p => {
                            const dur = parseFloat(p.duration);
                            const isFastest = dur && Math.abs(dur - fastest) < 0.001;
                            const result = driverLookup[p.driverId];
                            const d = result?.Driver;
                            const cId = result?.Constructor?.constructorId;
                            const teamColor = cId ? getTeamColor(cId) : '#555';
                            const driverHTML = d
                                ? `<div class="driver-cell">${driverImgHTML(d.givenName, d.familyName, enriched, '', teamColor, d.permanentNumber)}<span class="team-color-bar" style="background:${teamColor}"></span><strong style="text-transform:uppercase">${d.familyName || p.driverId}</strong></div>`
                                : `<strong style="text-transform:uppercase">${p.driverId || ''}</strong>`;
                            return `<tr>
                                <td class="pos-cell">${p.stop || ''}</td>
                                <td>${driverHTML}</td>
                                <td>${p.lap || ''}</td>
                                <td>${p.time || ''}</td>
                                <td class="points-cell"><span class="pit-duration ${isFastest ? 'fast' : ''}">${p.duration || ''}s</span> ${isFastest ? '<span class="fastest-lap-badge">Fastest</span>' : ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderTireStrategy(stints) {
        const container = document.getElementById('tires-results');
        // Group stints by driver number
        const byDriver = {};
        let maxLap = 0;
        stints.forEach(s => {
            const dn = s.driver_number;
            if (!byDriver[dn]) byDriver[dn] = [];
            byDriver[dn].push(s);
            const endLap = (s.lap_end || s.lap_start || 0);
            if (endLap > maxLap) maxLap = endLap;
        });

        if (maxLap === 0) maxLap = 60;

        // Get driver names from enriched data
        const rows = Object.entries(byDriver).map(([driverNum, driverStints]) => {
            const entry = enriched['num_' + driverNum];
            const name = entry ? `${entry.lastName || ''}` : `#${driverNum}`;
            const teamColor = entry?.teamColor || '#555';
            const img = entry ? driverImgHTML(entry.firstName, entry.lastName, enriched, '', teamColor, driverNum) : '';

            driverStints.sort((a, b) => (a.stint_number || a.lap_start || 0) - (b.stint_number || b.lap_start || 0));

            const segments = driverStints.map(st => {
                const start = st.lap_start || 0;
                const end = st.lap_end || maxLap;
                const width = ((end - start) / maxLap * 100);
                const compound = st.compound || 'UNKNOWN';
                const tire = getTireCompound(compound);
                return `<div class="stint-segment" style="width:${width}%;background:${tire.color}" title="${compound}: Laps ${start}-${end}">
                    <span class="stint-tooltip">${compound} · Laps ${start}-${end} (${end - start} laps)</span>
                    ${width > 6 ? tire.label : ''}
                </div>`;
            }).join('');

            return `<div class="stint-bar-row">
                <div class="stint-bar-driver">${img} <span style="text-transform:uppercase;font-weight:700">${name}</span></div>
                <div class="stint-bar-track">${segments}</div>
            </div>`;
        });

        container.innerHTML = `
            <div class="race-detail-soft-panel race-tires-panel">
                <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
                    ${Object.keys(TIRE_COMPOUNDS).filter(k => k !== 'UNKNOWN').map(k => tireCompoundLabelHTML(k)).join('')}
                </div>
                <div style="font-size:0.75rem;color:var(--f1-gray);margin-bottom:12px;">Hover over segments for details · Bar width = race proportion</div>
                ${rows.join('')}
            </div>`;
    }

    function renderRaceControl(messages) {
        const container = document.getElementById('racecontrol-results');
        if (!container || !messages?.length) return;

        // Filter to important messages only
        const important = messages.filter(m =>
            m.flag || m.message?.toLowerCase().includes('safety car') ||
            m.message?.toLowerCase().includes('vsc') ||
            m.category === 'Flag' || m.category === 'SafetyCar' ||
            m.category === 'Drs'
        );
        const display = important.length ? important.slice(-30) : messages.slice(-20);

        container.innerHTML = `
            <div class="race-detail-soft-panel race-racecontrol-panel">
                <div class="rc-messages">
                    ${display.reverse().map(m => {
                        const time = m.date ? new Date(m.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '';
                        const flagHTML = m.flag ? raceControlFlagHTML(m.flag) : '';
                        return `<div class="rc-message">
                            <span class="rc-time">${time}</span>
                            ${flagHTML}
                            <span class="rc-text">${m.message || m.category || ''}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;

        // Show the race control tab button
        const rcTab = document.querySelector('[data-tab="racecontrol"]');
        if (rcTab) rcTab.style.display = '';
    }

    // --- Lap Time Chart (SVG) ---
    function renderLapChart(laps, raceResults) {
        const container = document.getElementById('laptimes-results');
        if (!container) return;

        const top5 = (raceResults || []).slice(0, 5);
        if (!top5.length) return;
        const driverIds = top5.map(r => r.Driver?.driverId);

        // Parse lap times into seconds
        const driverLaps = {};
        driverIds.forEach(id => { driverLaps[id] = []; });

        laps.forEach(lap => {
            (lap.Timings || []).forEach(t => {
                if (driverIds.includes(t.driverId)) {
                    const parts = t.time.split(':');
                    const seconds = parts.length === 2 ? parseFloat(parts[0]) * 60 + parseFloat(parts[1]) : parseFloat(parts[0]);
                    if (!isNaN(seconds) && seconds > 0) {
                        driverLaps[t.driverId].push({ lap: parseInt(lap.number), time: seconds });
                    }
                }
            });
        });

        // Find min/max for scaling
        let allTimes = [];
        Object.values(driverLaps).forEach(arr => arr.forEach(d => allTimes.push(d.time)));
        if (!allTimes.length) return;

        const minTime = Math.min(...allTimes);
        const maxTime = Math.min(minTime * 1.12, Math.max(...allTimes));
        const totalLaps = laps.length;

        const width = 900;
        const height = 320;
        const pad = { top: 25, right: 25, bottom: 35, left: 55 };
        const chartW = width - pad.left - pad.right;
        const chartH = height - pad.top - pad.bottom;

        // Grid lines
        const gridCount = 5;
        let gridLines = '';
        for (let i = 0; i <= gridCount; i++) {
            const y = pad.top + (i / gridCount) * chartH;
            const timeVal = minTime + (i / gridCount) * (maxTime - minTime);
            const m = Math.floor(timeVal / 60);
            const s = (timeVal % 60).toFixed(1);
            gridLines += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="grid-line"/>`;
            gridLines += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${m}:${s.padStart(4, '0')}</text>`;
        }

        // X-axis labels
        let xLabels = '';
        const lapStep = Math.max(1, Math.floor(totalLaps / 10));
        for (let l = 1; l <= totalLaps; l += lapStep) {
            const x = pad.left + ((l - 1) / (totalLaps - 1)) * chartW;
            xLabels += `<text x="${x}" y="${height - 5}" text-anchor="middle">${l}</text>`;
        }

        // Draw lines per driver
        const lines = top5.map(result => {
            const id = result.Driver?.driverId;
            const color = getTeamColor(result.Constructor?.constructorId);
            const pts = (driverLaps[id] || []).map(d => {
                const x = pad.left + ((d.lap - 1) / Math.max(totalLaps - 1, 1)) * chartW;
                const yRatio = Math.min((d.time - minTime) / (maxTime - minTime), 1);
                const y = pad.top + yRatio * chartH;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return pts ? `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>` : '';
        }).join('');

        // Legend
        const legend = top5.map(r => {
            const color = getTeamColor(r.Constructor?.constructorId);
            return `<span class="lap-chart-legend-item">${driverImgHTML(r.Driver?.givenName, r.Driver?.familyName, enriched, 'driver-avatar-sm', color, r.Driver?.permanentNumber)}<span class="lap-chart-legend-line" style="background:${color}"></span>${r.Driver?.familyName || ''}</span>`;
        }).join('');

        container.innerHTML = `
            <div class="lap-chart-container">
                <div class="lap-chart-legend">${legend}</div>
                <svg viewBox="0 0 ${width} ${height}" class="lap-chart-svg" preserveAspectRatio="xMidYMid meet">
                    ${gridLines}
                    ${xLabels}
                    ${lines}
                </svg>
                <div style="text-align:center;font-size:0.75rem;color:var(--f1-gray);margin-top:8px;">Lap Number — Top 5 finishers lap time comparison</div>
            </div>`;
    }

    // --- Team Radio ---
    function renderTeamRadio(radioData) {
        const container = document.getElementById('teamradio-results');
        if (!container || !radioData?.length) return;

        const clips = radioData.slice(-40).reverse();

        container.innerHTML = `
            <div class="race-detail-soft-panel race-radio-panel">
                <div class="radio-header-icon">Live Radio Communications</div>
                <div style="font-size:0.85rem;color:var(--f1-gray);margin-bottom:var(--space-md);">${clips.length} audio clips from this session</div>
                <div class="race-radio-list">
                    ${clips.map(r => {
                        const entry = enriched['num_' + r.driver_number];
                        const name = entry ? (entry.lastName || '') : `#${r.driver_number}`;
                        const color = entry?.teamColor || '#555';
                        const time = r.date ? new Date(r.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '';
                        const driverImg = entry ? driverImgHTML(entry.firstName, entry.lastName, enriched, '', color, r.driver_number) : '';
                        return `<div class="radio-clip">
                            ${driverImg}
                            <span class="radio-time">${time}</span>
                            <span class="radio-driver-name" style="color:${color}">${name}</span>
                            <audio controls preload="none">
                                <source src="${r.recording_url}" type="audio/mpeg">
                            </audio>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function renderUpcomingInfo(race) {
        const upcomingEl = document.getElementById('upcoming-info');
        upcomingEl.style.display = '';
        const raceDateTime = race.time ? `${race.date}T${race.time}` : `${race.date}T14:00:00Z`;

        // Show schedule details if available
        const sessions = [];
        if (race.FirstPractice) sessions.push({ name: 'Practice 1', ...race.FirstPractice });
        if (race.SecondPractice) sessions.push({ name: 'Practice 2', ...race.SecondPractice });
        if (race.ThirdPractice) sessions.push({ name: 'Practice 3', ...race.ThirdPractice });
        if (race.Sprint) sessions.push({ name: 'Sprint', ...race.Sprint });
        if (race.SprintQualifying) sessions.push({ name: 'Sprint Qualifying', ...race.SprintQualifying });
        if (race.Qualifying) sessions.push({ name: 'Qualifying', ...race.Qualifying });

        const sessionHTML = sessions.length ? `
            <div style="margin-top:24px;max-width:500px;margin-left:auto;margin-right:auto;">
                <h4 style="margin-bottom:12px;color:var(--f1-gray)">Weekend Schedule</h4>
                ${sessions.map(s => `
                    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--f1-border);font-size:0.9rem;">
                        <span style="font-weight:600">${s.name}</span>
                        <span style="color:var(--f1-gray)">${formatDate(s.date)}${s.time ? ' · ' + formatTimeOnly(s.time) + ' UTC' : ''}</span>
                    </div>
                `).join('')}
            </div>` : '';

        upcomingEl.innerHTML = `
            <div style="text-align:center;padding:48px 0;">
                <div class="race-upcoming-icon" style="margin-bottom:16px">${SVG_ICONS.flagChequered}</div>
                <h3 style="margin-bottom:8px">Race has not taken place yet</h3>
                <p style="color:var(--f1-gray);margin-bottom:24px">Results will appear here after the race.</p>
                <div class="countdown" id="detail-countdown" style="justify-content:center"></div>
                ${sessionHTML}
            </div>`;

        updateCountdown();
        const detailCountdownTimer = setInterval(updateCountdown, 1000);

        function updateCountdown() {
            const diff = getTimeDiff(raceDateTime);
            const el = document.getElementById('detail-countdown');
            if (!el) return;
            if (diff.passed) { clearInterval(detailCountdownTimer); el.innerHTML = '<span class="badge badge-green" style="font-size:1rem;padding:8px 20px;">RACE DAY</span>'; return; }
            el.innerHTML = ['days','hours','minutes','seconds'].map((unit, i) => {
                const val = unit === 'days' ? diff.days : unit === 'hours' ? diff.hours : unit === 'minutes' ? diff.minutes : diff.seconds;
                return `${i > 0 ? '<span class="countdown-separator">:</span>' : ''}
                    <div class="countdown-item"><span class="countdown-value">${String(val).padStart(unit === 'days' ? 1 : 2, '0')}</span><span class="countdown-label">${unit.slice(0,4)}</span></div>`;
            }).join('');
        }

        reorderRaceDetailSections();
    }
})();

