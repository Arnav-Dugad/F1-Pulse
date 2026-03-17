/* ============================================
   F1 PULSE - Shared Components & Utilities
   ============================================ */

// --- SVG Icon Library (replaces emojis for Windows compatibility) ---
const SVG_ICONS = {
    trophy: '<svg class="svg-icon svg-icon-trophy" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 9 7 9"></path><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 9 17 9"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0012 0V2z"></path></svg>',
    medalGold: '<svg class="svg-icon svg-icon-medal" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="15" r="7" fill="none" stroke="#FFD700" stroke-width="2"/><text x="12" y="18" text-anchor="middle" font-size="8" font-weight="900" fill="#FFD700">1</text><path d="M8 2l4 8 4-8" stroke="#FFD700" stroke-width="2" fill="none"/></svg>',
    medalSilver: '<svg class="svg-icon svg-icon-medal" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="15" r="7" fill="none" stroke="#C0C0C0" stroke-width="2"/><text x="12" y="18" text-anchor="middle" font-size="8" font-weight="900" fill="#C0C0C0">2</text><path d="M8 2l4 8 4-8" stroke="#C0C0C0" stroke-width="2" fill="none"/></svg>',
    medalBronze: '<svg class="svg-icon svg-icon-medal" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="15" r="7" fill="none" stroke="#CD7F32" stroke-width="2"/><text x="12" y="18" text-anchor="middle" font-size="8" font-weight="900" fill="#CD7F32">3</text><path d="M8 2l4 8 4-8" stroke="#CD7F32" stroke-width="2" fill="none"/></svg>',
    calendar: '<svg class="svg-icon svg-icon-calendar" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    sun: '<svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    rain: '<svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64B5F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 16.25"></path><line x1="8" y1="16" x2="8.01" y2="21"></line><line x1="12" y1="18" x2="12.01" y2="23"></line><line x1="16" y1="16" x2="16.01" y2="21"></line></svg>',
    cloudy: '<svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B0BEC5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"></path></svg>',
    hot: '<svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5722" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"></path></svg>',
    thermometer: '<svg class="svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF7043" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"></path></svg>',
    road: '<svg class="svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#78909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19L8 5"></path><path d="M16 5l4 14"></path><line x1="12" y1="6" x2="12" y2="8"></line><line x1="12" y1="12" x2="12" y2="14"></line><line x1="12" y1="18" x2="12" y2="20"></line></svg>',
    wind: '<svg class="svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#80CBC4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1111 8H2"></path><path d="M12.59 19.41A2 2 0 1014 16H2"></path><path d="M15.73 8.27A2.5 2.5 0 1119 12H2"></path></svg>',
    droplet: '<svg class="svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#42A5F5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"></path></svg>',
    flagGreen: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#4CAF50"/></svg>',
    flagYellow: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#FFC107"/></svg>',
    flagRed: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#f44336"/></svg>',
    flagBlue: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#2196F3"/></svg>',
    flagChequered: '<svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
    flagBW: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="#999" stroke-width="1.5"/><rect x="1" y="1" width="7" height="7" fill="#333"/><rect x="8" y="8" width="7" height="7" fill="#333"/></svg>',
    checkCircle: '<svg class="svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    whiteFlag: '<svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
    partlyCloudy: '<svg class="svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#90A4AE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"></path><circle cx="18" cy="6" r="3" stroke="#FFD700" fill="none"/></svg>',
};

// --- Team Configurations ---
const TEAMS = {
    mercedes:     { name: 'Mercedes',          color: '#27F4D2', abbr: 'MER' },
    ferrari:      { name: 'Ferrari',           color: '#E8002D', abbr: 'FER' },
    mclaren:      { name: 'McLaren',           color: '#FF8000', abbr: 'MCL' },
    red_bull:     { name: 'Red Bull Racing',   color: '#3671C6', abbr: 'RBR' },
    aston_martin: { name: 'Aston Martin',      color: '#229971', abbr: 'AMR' },
    alpine:       { name: 'Alpine',            color: '#FF87BC', abbr: 'ALP' },
    williams:     { name: 'Williams',          color: '#64C4FF', abbr: 'WIL' },
    rb:           { name: 'Racing Bulls',      color: '#6692FF', abbr: 'RB'  },
    haas:         { name: 'Haas F1 Team',      color: '#B6BABD', abbr: 'HAA' },
    audi:       { name: 'Audi',              color: '#E00600', abbr: 'AUD' },
    cadillac:     { name: 'Cadillac',          color: '#C0A050', abbr: 'CAD' },
};

// --- Manual Driver Photo Overrides (for drivers missing from OpenF1) ---
const DRIVER_PHOTO_OVERRIDES = {
    'lindblad': {
        headshot: 'https://media.formula1.com/image/upload/c_lfill,w_440/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026/racingbulls/arvlin01/2026racingbullsarvlin01right.webp',
        headshotHiRes: 'https://media.formula1.com/image/upload/c_lfill,w_440/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026/racingbulls/arvlin01/2026racingbullsarvlin01right.webp',
        avatarObjectPosition: '60% 0%',
        cardObjectPosition: '56% 0%',
    },
};

// --- Constructor Nationality ---
const CONSTRUCTOR_NATIONALITY = {
    'mercedes': 'Germany', 'ferrari': 'Italy', 'mclaren': 'UK',
    'red_bull': 'Austria', 'aston_martin': 'UK', 'alpine': 'France',
    'williams': 'UK', 'rb': 'Italy', 'haas': 'USA',
    'audi': 'Germany', 'cadillac': 'USA',
};

function getConstructorNationality(constructorId) {
    const id = resolveTeamId(constructorId);
    return CONSTRUCTOR_NATIONALITY[id] || null;
}

function getConstructorFlag(constructorId) {
    const nat = getConstructorNationality(constructorId);
    return nat ? countryFlagHTML(nat, 16) : '';
}

// Aliases for matching Jolpica constructorId values
const TEAM_ALIASES = {
    'mercedes': 'mercedes',
    'ferrari': 'ferrari',
    'mclaren': 'mclaren',
    'red_bull': 'red_bull',
    'red bull': 'red_bull',
    'redbull': 'red_bull',
    'aston_martin': 'aston_martin',
    'aston martin': 'aston_martin',
    'alpine': 'alpine',
    'williams': 'williams',
    'rb': 'rb',
    'racing bulls': 'rb',
    'alphatauri': 'rb',
    'visa cash app rb': 'rb',
    'haas': 'haas',
    'sauber': 'audi',
    'kick sauber': 'audi',
    'audi': 'audi',
    'stake f1': 'audi',
    'audi f1': 'audi',
    'cadillac': 'cadillac',
    'andretti': 'cadillac',
};

// Official 2026 team car images sourced from formula1.com/en/teams
const TEAM_CAR_IMAGES = {
    mercedes: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/mercedes/2026mercedescarright.webp',
    ferrari: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/ferrari/2026ferraricarright.webp',
    mclaren: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/mclaren/2026mclarencarright.webp',
    red_bull: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/redbullracing/2026redbullracingcarright.webp',
    aston_martin: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/astonmartin/2026astonmartincarright.webp',
    alpine: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/alpine/2026alpinecarright.webp',
    williams: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/williams/2026williamscarright.webp',
    rb: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/racingbulls/2026racingbullscarright.webp',
    haas: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/haasf1team/2026haasf1teamcarright.webp',
    audi: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/audi/2026audicarright.webp',
    cadillac: 'https://media.formula1.com/image/upload/c_lfill,h_224/q_auto/d_common:f1:2026:fallback:car:2026fallbackcarright.webp/v1740000000/common/f1/2026/cadillac/2026cadillaccarright.webp',
};

function resolveTeamId(raw) {
    if (!raw) return null;
    const key = raw.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
    for (const [alias, id] of Object.entries(TEAM_ALIASES)) {
        if (key.includes(alias) || alias.includes(key)) return id;
    }
    return null;
}

function getTeamColor(constructorId) {
    const id = resolveTeamId(constructorId);
    return TEAMS[id]?.color || '#555';
}

function getTeamName(constructorId) {
    const id = resolveTeamId(constructorId);
    return TEAMS[id]?.name || constructorId || 'Unknown';
}

function getTeamAbbr(constructorId) {
    const id = resolveTeamId(constructorId);
    return TEAMS[id]?.abbr || '???';
}

// --- Team Logo System (Wikipedia thumbnails + CSS fallback) ---
const _teamLogoCache = {};

async function fetchTeamLogos(constructorStandings) {
    if (!constructorStandings?.length) return;
    const promises = constructorStandings.map(async (s) => {
        const cId = s.Constructor?.constructorId;
        const wikiUrl = s.Constructor?.url;
        if (!cId || _teamLogoCache[cId]) return;
        try {
            const thumbUrl = await F1API.getWikipediaThumbnail(wikiUrl);
            if (thumbUrl) _teamLogoCache[cId] = thumbUrl;
        } catch (e) { /* silent */ }
    });
    await Promise.allSettled(promises);
}

function getTeamLogoUrl(constructorId) {
    return _teamLogoCache[constructorId] || null;
}

function teamLogoHTML(constructorId, size = 64) {
    const url = getTeamLogoUrl(constructorId);
    const teamColor = getTeamColor(constructorId);
    const abbr = getTeamAbbr(constructorId);
    const scaledSize = Math.round(size * 1.25);
    const fs = Math.max(scaledSize * 0.2, 10);

    if (url) {
        return `<img src="${url}" alt="${abbr}" class="team-logo-img" style="width:${scaledSize}px;height:${scaledSize}px;" onerror="this.outerHTML='<div class=\\'team-logo-badge\\' style=\\'width:${scaledSize}px;height:${scaledSize}px;background:${teamColor};font-size:${fs}px\\'>${abbr}</div>'">`;
    }
    return `<div class="team-logo-badge" style="width:${scaledSize}px;height:${scaledSize}px;background:${teamColor};font-size:${fs}px">${abbr}</div>`;
}

function teamLogoSmallHTML(constructorId) {
    const url = getTeamLogoUrl(constructorId);
    const teamColor = getTeamColor(constructorId);
    const abbr = getTeamAbbr(constructorId);
    const smallSize = 32;

    if (url) {
        return `<img src="${url}" alt="${abbr}" class="team-logo-sm" style="width:${smallSize}px;height:${smallSize}px" onerror="this.outerHTML='<span class=\\'team-dot\\' style=\\'background:${teamColor};width:12px;height:12px\\'></span>'">`;
    }
    return `<span class="team-dot" style="background:${teamColor};width:12px;height:12px"></span>`;
}

function getTeamCarUrl(constructorId) {
    const id = resolveTeamId(constructorId);
    return TEAM_CAR_IMAGES[id] || null;
}

function teamCarHTML(constructorId) {
    const url = getTeamCarUrl(constructorId);
    if (!url) return '';
    const name = getTeamName(constructorId);
    return `<img src="${url}" alt="${name} car" class="team-car-img" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
}

// --- Circuit Image System (Wikipedia list-based circuit layouts) ---
const _circuitImageCache = {};

const WIKI_LIST_CIRCUIT_LAYOUTS = {
    albertparkcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Albert_Park_Circuit_2021.svg/250px-Albert_Park_Circuit_2021.svg.png',
    shanghaiinternationalcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Shanghai_International_Racing_Circuit_track_map.svg/250px-Shanghai_International_Racing_Circuit_track_map.svg.png',
    suzukainternationalracingcourse: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Suzuka_circuit_map--2005.svg/250px-Suzuka_circuit_map--2005.svg.png',
    miamiinternationalautodrome: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Hard_Rock_Stadium_Circuit_2022.svg/250px-Hard_Rock_Stadium_Circuit_2022.svg.png',
    circuitgillesvilleneuve: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Circuit_Gilles_Villeneuve.svg/250px-Circuit_Gilles_Villeneuve.svg.png',
    circuitdemonaco: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Monte_Carlo_Formula_1_track_map.svg/250px-Monte_Carlo_Formula_1_track_map.svg.png',
    circuitdebarcelonacatalunya: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Circuit_de_Catalunya_moto_2021.svg/250px-Circuit_de_Catalunya_moto_2021.svg.png',
    redbullring: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Spielberg_bare_map_numbers_contextless_2021_corner_names.svg/250px-Spielberg_bare_map_numbers_contextless_2021_corner_names.svg.png',
    silverstonecircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Silverstone_Circuit_vector_map.png/250px-Silverstone_Circuit_vector_map.png',
    circuitdespafrancorchamps: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Spa-Francorchamps_of_Belgium.svg/250px-Spa-Francorchamps_of_Belgium.svg.png',
    hungaroring: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Hungaroring.svg/250px-Hungaroring.svg.png',
    circuitzandvoort: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Zandvoort_Circuit.png/250px-Zandvoort_Circuit.png',
    monzacircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Monza_track_map.svg/250px-Monza_track_map.svg.png',
    autodromonazionaledimonza: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Monza_track_map.svg/250px-Monza_track_map.svg.png',
    madring: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Madring_%282026%29.svg/250px-Madring_%282026%29.svg.png',
    bakucitycircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Baku_Formula_One_circuit_map.svg/250px-Baku_Formula_One_circuit_map.svg.png',
    marinabaystreetcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Marina_Bay_circuit_2023.svg/250px-Marina_Bay_circuit_2023.svg.png',
    circuitoftheamericas: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Austin_circuit.svg/250px-Austin_circuit.svg.png',
    autodromohermanosrodriguez: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez_2015.svg/250px-Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez_2015.svg.png',
    interlagoscircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Aut%C3%B3dromo_Jos%C3%A9_Carlos_Pace_%28AKA_Interlagos%29_track_map.svg/250px-Aut%C3%B3dromo_Jos%C3%A9_Carlos_Pace_%28AKA_Interlagos%29_track_map.svg.png',
    autodromojosecarlospace: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Aut%C3%B3dromo_Jos%C3%A9_Carlos_Pace_%28AKA_Interlagos%29_track_map.svg/250px-Aut%C3%B3dromo_Jos%C3%A9_Carlos_Pace_%28AKA_Interlagos%29_track_map.svg.png',
    lasvegasgrandprix: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Las_Vegas_Strip_Circuit_2023.png/250px-Las_Vegas_Strip_Circuit_2023.png',
    lasvegasstripcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Las_Vegas_Strip_Circuit_2023.png/250px-Las_Vegas_Strip_Circuit_2023.png',
    lasvegasstripstreetcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Las_Vegas_Strip_Circuit_2023.png/250px-Las_Vegas_Strip_Circuit_2023.png',
    lusailinternationalcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Lusail_International_Circuit_2023.svg/250px-Lusail_International_Circuit_2023.svg.png',
    losailinternationalcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Lusail_International_Circuit_2023.svg/250px-Lusail_International_Circuit_2023.svg.png',
    yasmarinacircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Yas_Marina_Circuit.png/250px-Yas_Marina_Circuit.png',
    bahraininternationalcircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Bahrain_International_Circuit--Grand_Prix_Layout.svg/250px-Bahrain_International_Circuit--Grand_Prix_Layout.svg.png',
    jeddahcornichecircuit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Jeddah_Street_Circuit_2021.svg/250px-Jeddah_Street_Circuit_2021.svg.png',
};

function normalizeCircuitLayoutKey(value) {
    if (!value) return '';
    let raw = value;
    try {
        raw = decodeURIComponent(raw);
    } catch (e) { /* keep raw */ }
    return String(raw)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function promoteWikipediaThumb(url, width = 320) {
    if (!url) return null;
    return url.replace(/\/\d+px-/, `/${width}px-`);
}

function demoteWikipediaThumb(url, width = 250) {
    if (!url) return null;
    return url.replace(/\/\d+px-/, `/${width}px-`);
}

function buildCircuitLayoutCandidates(baseKey) {
    if (!baseKey) return [];
    const candidates = new Set([baseKey]);
    candidates.add(baseKey.replace(/grandprix/g, ''));
    candidates.add(baseKey.replace(/formulaone/g, ''));
    candidates.add(baseKey.replace(/streetcircuit/g, 'circuit'));
    candidates.add(baseKey.replace(/internationalautodrome/g, 'autodrome'));
    return Array.from(candidates).filter(Boolean);
}

function getCircuitLayoutFromWikiList(circuitUrl, circuitName) {
    const keys = [];

    if (circuitUrl) {
        const clean = String(circuitUrl).replace(/#.*$/, '');
        const slug = clean.split('/wiki/')[1] || '';
        if (slug) keys.push(normalizeCircuitLayoutKey(slug));
    }

    if (circuitName) {
        keys.push(normalizeCircuitLayoutKey(circuitName));
    }

    for (const rawKey of keys) {
        const candidates = buildCircuitLayoutCandidates(rawKey);
        for (const k of candidates) {
            const found = WIKI_LIST_CIRCUIT_LAYOUTS[k];
            if (found) return promoteWikipediaThumb(found, 320);
            const fuzzy = Object.keys(WIKI_LIST_CIRCUIT_LAYOUTS).find(mapKey => k.includes(mapKey) || mapKey.includes(k));
            if (fuzzy) return promoteWikipediaThumb(WIKI_LIST_CIRCUIT_LAYOUTS[fuzzy], 320);
        }
    }
    return null;
}

async function fetchCircuitImage(circuitUrl, circuitName = '') {
    const key = `${circuitUrl || ''}|${circuitName || ''}`;
    if ((!circuitUrl && !circuitName) || _circuitImageCache[key] !== undefined) return;

    const listedLayout = getCircuitLayoutFromWikiList(circuitUrl, circuitName);
    if (listedLayout) {
        _circuitImageCache[key] = listedLayout;
        return;
    }

    try {
        const thumbUrl = await F1API.getWikipediaThumbnail(circuitUrl);
        _circuitImageCache[key] = thumbUrl ? promoteWikipediaThumb(thumbUrl, 360) : null;
    } catch (e) {
        _circuitImageCache[key] = null;
    }
}

function getCircuitImageUrl(circuitUrl, circuitName = '') {
    const key = `${circuitUrl || ''}|${circuitName || ''}`;
    if (_circuitImageCache[key] !== undefined) {
        return _circuitImageCache[key] || null;
    }
    return getCircuitLayoutFromWikiList(circuitUrl, circuitName);
}

function circuitImageHTML(circuitUrl, size = 120, circuitName = '') {
    const url = getCircuitImageUrl(circuitUrl, circuitName);
    if (url) {
        const fallbackUrl = demoteWikipediaThumb(url, 250) || url;
        const escapedFallback = String(fallbackUrl).replace(/"/g, '&quot;');
        return `<div class="circuit-layout-shell" style="--layout-size:${size}px"><img src="${url}" data-fallback-src="${escapedFallback}" alt="Circuit layout" class="circuit-layout-img" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallbackTried){this.dataset.fallbackTried='1';if(this.dataset.fallbackSrc&&this.src!==this.dataset.fallbackSrc){this.src=this.dataset.fallbackSrc;return;}}this.closest('.circuit-layout-shell').style.display='none'"></div>`;
    }
    return '';
}

// --- Country Code -> Flag Emoji ---
const COUNTRY_FLAGS = {
    'Australia': '🇦🇺', 'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿', 'Bahrain': '🇧🇭',
    'Belgium': '🇧🇪', 'Brazil': '🇧🇷', 'Canada': '🇨🇦', 'China': '🇨🇳',
    'France': '🇫🇷', 'Germany': '🇩🇪', 'Hungary': '🇭🇺', 'India': '🇮🇳',
    'Italy': '🇮🇹', 'Japan': '🇯🇵', 'Mexico': '🇲🇽', 'Monaco': '🇲🇨',
    'Netherlands': '🇳🇱', 'Portugal': '🇵🇹', 'Qatar': '🇶🇦', 'Russia': '🇷🇺',
    'Saudi Arabia': '🇸🇦', 'Singapore': '🇸🇬', 'Spain': '🇪🇸', 'Turkey': '🇹🇷',
    'UAE': '🇦🇪', 'UK': '🇬🇧', 'USA': '🇺🇸',
    'United States': '🇺🇸', 'United Kingdom': '🇬🇧',
    'Great Britain': '🇬🇧', 'Las Vegas': '🇺🇸', 'Miami': '🇺🇸',
    'Argentina': '🇦🇷', 'Finland': '🇫🇮', 'Thailand': '🇹🇭',
    'Denmark': '🇩🇰', 'Switzerland': '🇨🇭', 'New Zealand': '🇳🇿',
    'Colombia': '🇨🇴', 'Indonesia': '🇮🇩', 'Sweden': '🇸🇪',
    'Emilia Romagna': '🇮🇹', 'Lombardia': '🇮🇹',
    'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Korea': '🇰🇷',
    'Malaysia': '🇲🇾', 'Vietnam': '🇻🇳',
    'Dutch': '🇳🇱', 'British': '🇬🇧', 'Spanish': '🇪🇸',
    'German': '🇩🇪', 'French': '🇫🇷', 'Italian': '🇮🇹',
    'Australian': '🇦🇺', 'Canadian': '🇨🇦', 'Mexican': '🇲🇽',
    'Japanese': '🇯🇵', 'Brazilian': '🇧🇷', 'Chinese': '🇨🇳',
    'American': '🇺🇸', 'Thai': '🇹🇭', 'Finnish': '🇫🇮',
    'Danish': '🇩🇰', 'Monegasque': '🇲🇨', 'Argentine': '🇦🇷',
    'Norwegian': '🇳🇴', 'Polish': '🇵🇱', 'Swedish': '🇸🇪',
    'Portuguese': '🇵🇹', 'Austrian': '🇦🇹', 'Belgian': '🇧🇪',
    'Swiss': '🇨🇭', 'Irish': '🇮🇪', 'Hungarian': '🇭🇺',
    'Russian': '🇷🇺', 'Czech': '🇨🇿', 'Venezuelan': '🇻🇪',
    'Chilean': '🇨🇱', 'Peruvian': '🇵🇪', 'Indian': '🇮🇳',
    'Singapore': '🇸🇬', 'South Korean': '🇰🇷', 'Turkish': '🇹🇷',
    'Israel': '🇮🇱', 'Israeli': '🇮🇱',
    'Norway': '🇳🇴', 'Poland': '🇵🇱', 'Ireland': '🇮🇪',
    'Czech Republic': '🇨🇿', 'Venezuela': '🇻🇪', 'Chile': '🇨🇱',
    'Peru': '🇵🇪', 'New Zealander': '🇳🇿',
};

// --- Country ISO Codes for Flag Images (flagcdn.com) ---
const COUNTRY_ISO_CODES = {
    'Australia': 'au', 'Austria': 'at', 'Azerbaijan': 'az', 'Bahrain': 'bh',
    'Belgium': 'be', 'Brazil': 'br', 'Canada': 'ca', 'China': 'cn',
    'France': 'fr', 'Germany': 'de', 'Hungary': 'hu', 'India': 'in',
    'Italy': 'it', 'Japan': 'jp', 'Mexico': 'mx', 'Monaco': 'mc',
    'Netherlands': 'nl', 'Portugal': 'pt', 'Qatar': 'qa', 'Russia': 'ru',
    'Saudi Arabia': 'sa', 'Singapore': 'sg', 'Spain': 'es', 'Turkey': 'tr',
    'UAE': 'ae', 'UK': 'gb', 'USA': 'us',
    'United States': 'us', 'United Kingdom': 'gb',
    'Great Britain': 'gb', 'Las Vegas': 'us', 'Miami': 'us',
    'Argentina': 'ar', 'Finland': 'fi', 'Thailand': 'th',
    'Denmark': 'dk', 'Switzerland': 'ch', 'New Zealand': 'nz',
    'Colombia': 'co', 'Indonesia': 'id', 'Sweden': 'se',
    'South Africa': 'za', 'South Korea': 'kr', 'Korea': 'kr',
    'Malaysia': 'my', 'Vietnam': 'vn', 'Norway': 'no', 'Poland': 'pl',
    'Ireland': 'ie', 'Czech Republic': 'cz', 'Venezuela': 've',
    'Chile': 'cl', 'Peru': 'pe', 'Israel': 'il',
    'Dutch': 'nl', 'British': 'gb', 'Spanish': 'es', 'German': 'de',
    'French': 'fr', 'Italian': 'it', 'Australian': 'au', 'Canadian': 'ca',
    'Mexican': 'mx', 'Japanese': 'jp', 'Brazilian': 'br', 'Chinese': 'cn',
    'American': 'us', 'Thai': 'th', 'Finnish': 'fi', 'Danish': 'dk',
    'Monegasque': 'mc', 'Argentine': 'ar', 'Norwegian': 'no',
    'Polish': 'pl', 'Swedish': 'se', 'Portuguese': 'pt', 'Austrian': 'at',
    'Belgian': 'be', 'Swiss': 'ch', 'Irish': 'ie', 'Hungarian': 'hu',
    'Russian': 'ru', 'Czech': 'cz', 'Venezuelan': 've', 'Chilean': 'cl',
    'Peruvian': 'pe', 'Indian': 'in', 'South Korean': 'kr', 'Turkish': 'tr',
    'Israeli': 'il', 'New Zealander': 'nz', 'Singaporean': 'sg',
    'Emilia Romagna': 'it', 'Lombardia': 'it',
};

function getCountryISO(country) {
    if (!country) return null;
    if (COUNTRY_ISO_CODES[country]) return COUNTRY_ISO_CODES[country];
    for (const [key, code] of Object.entries(COUNTRY_ISO_CODES)) {
        if (country.toLowerCase().includes(key.toLowerCase())) return code;
    }
    return null;
}

// Valid flagcdn.com PNG widths
const FLAGCDN_WIDTHS = [20, 40, 80, 160, 320, 640, 1280, 2560];
function nearestFlagWidth(desired) {
    for (const w of FLAGCDN_WIDTHS) {
        if (w >= desired) return w;
    }
    return FLAGCDN_WIDTHS[FLAGCDN_WIDTHS.length - 1];
}

function flagFallbackBadge(iso, widthPx, heightPx) {
    const fs = Math.max(heightPx * 0.45, 8);
    return `<span class="flag-fallback-badge" style="display:inline-flex;align-items:center;justify-content:center;width:${widthPx}px;height:${heightPx}px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:3px;font-size:${fs}px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.5px;vertical-align:middle;flex-shrink:0">${(iso || '??').toUpperCase()}</span>`;
}

function countryFlagHTML(country, size = 20) {
    const iso = getCountryISO(country);
    const w = nearestFlagWidth(Math.ceil(size * 1.5));
    const w2x = nearestFlagWidth(Math.ceil(size * 3));
    const imgW = Math.ceil(size * 1.5);
    const imgH = size;
    if (!iso) return flagFallbackBadge('?', imgW, imgH);
    const fb = flagFallbackBadge(iso, imgW, imgH).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<img src="https://flagcdn.com/w${w}/${iso}.png" srcset="https://flagcdn.com/w${w2x}/${iso}.png 2x" width="${imgW}" height="${imgH}" alt="${country}" class="country-flag" loading="lazy" onerror="this.outerHTML='${fb}'">`;
}

function countryFlagLargeHTML(country, size = 48) {
    const iso = getCountryISO(country);
    const w = nearestFlagWidth(Math.ceil(size * 1.5));
    const w2x = nearestFlagWidth(Math.ceil(size * 3));
    const imgW = Math.ceil(size * 1.5);
    const imgH = size;
    if (!iso) return flagFallbackBadge('?', imgW, imgH);
    const fb = flagFallbackBadge(iso, imgW, imgH).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<img src="https://flagcdn.com/w${w}/${iso}.png" srcset="https://flagcdn.com/w${w2x}/${iso}.png 2x" width="${imgW}" height="${imgH}" alt="${country}" class="country-flag country-flag-lg" loading="lazy" onerror="this.outerHTML='${fb}'">`;
}

function getCountryFlag(country) {
    return countryFlagHTML(country, 14);
}

// --- Date Formatting ---
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr, timeStr) {
    if (!dateStr) return '';
    const dt = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(dateStr);
    return dt.toLocaleString('en-US', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

function formatTimeOnly(timeStr) {
    if (!timeStr) return '';
    const dt = new Date(`1970-01-01T${timeStr}`);
    if (Number.isNaN(dt.getTime())) return String(timeStr).replace(/:\d{2}$/, '').replace('Z', '');
    return dt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    });
}

function formatLocalTime(dateLike, withSeconds = false) {
    const dt = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: true,
    });
}

function getTimeDiff(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };
    return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        passed: false,
    };
}

function formatLapTime(seconds) {
    if (!seconds && seconds !== 0) return '-';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3);
    return m > 0 ? `${m}:${s.padStart(6, '0')}` : `${s}s`;
}

// --- Driver Headshot/Image (Improved matching) ---
let _enrichedDrivers = null;

async function loadEnrichedDrivers() {
    if (!_enrichedDrivers) {
        _enrichedDrivers = await F1API.getEnrichedDrivers().catch(() => ({}));
    }
    return _enrichedDrivers;
}

function findDriverEntry(firstName, lastName, driverNumber, enrichedDrivers) {
    if (!enrichedDrivers) return null;
    const norm = F1API.normalizeStr;

    // Strategy 1: exact last name
    const lnKey = norm(lastName);
    if (lnKey && enrichedDrivers[lnKey]) return enrichedDrivers[lnKey];

    // Strategy 2: full name
    const fnKey = norm((firstName || '') + (lastName || ''));
    if (fnKey && enrichedDrivers[fnKey]) return enrichedDrivers[fnKey];

    // Strategy 3: by driver number
    if (driverNumber && enrichedDrivers['num_' + driverNumber]) return enrichedDrivers['num_' + driverNumber];

    // Strategy 4: by acronym (first 3 letters of last name)
    if (lastName && lastName.length >= 3) {
        const acr = 'acr_' + lastName.substring(0, 3).toLowerCase();
        if (enrichedDrivers[acr]) return enrichedDrivers[acr];
    }

    // Strategy 5: fuzzy match - search through all entries
    const keys = Object.keys(enrichedDrivers);
    for (const key of keys) {
        if (key.startsWith('acr_') || key.startsWith('num_')) continue;
        const entry = enrichedDrivers[key];
        // Match by stored last name
        if (entry.lastName && norm(entry.lastName) === lnKey) return entry;
        // Partial key match
        if (lnKey && key.includes(lnKey)) return entry;
        if (lnKey && lnKey.includes(key) && key.length > 3) return entry;
        // Match first name + check if last names overlap
        if (firstName && entry.firstName) {
            const fnNorm = norm(firstName);
            const entryFn = norm(entry.firstName);
            if (fnNorm === entryFn && lnKey && norm(entry.lastName) && (
                lnKey.startsWith(norm(entry.lastName).substring(0, 3)) ||
                norm(entry.lastName).startsWith(lnKey.substring(0, 3))
            )) return entry;
        }
    }

    return null;
}

function getDriverHeadshot(firstName, lastName, enrichedDrivers, driverNumber) {
    // Check manual overrides first
    const normLast = F1API.normalizeStr(lastName);
    if (normLast && DRIVER_PHOTO_OVERRIDES[normLast]?.headshot) {
        return DRIVER_PHOTO_OVERRIDES[normLast].headshot;
    }
    const entry = findDriverEntry(firstName, lastName, driverNumber, enrichedDrivers);
    return entry?.headshot || null;
}

function getDriverHeadshotHiRes(firstName, lastName, enrichedDrivers, driverNumber) {
    const normLast = F1API.normalizeStr(lastName);
    if (normLast && DRIVER_PHOTO_OVERRIDES[normLast]?.headshotHiRes) {
        return DRIVER_PHOTO_OVERRIDES[normLast].headshotHiRes;
    }
    const entry = findDriverEntry(firstName, lastName, driverNumber, enrichedDrivers);
    return entry?.headshotHiRes || entry?.headshot || null;
}

function getDriverTeamColor(firstName, lastName, enrichedDrivers, driverNumber) {
    const entry = findDriverEntry(firstName, lastName, driverNumber, enrichedDrivers);
    return entry?.teamColor || null;
}

function getDriverPhotoOverride(lastName) {
    const normLast = F1API.normalizeStr(lastName);
    return normLast ? DRIVER_PHOTO_OVERRIDES[normLast] || null : null;
}

function driverImgHTML(firstName, lastName, enrichedDrivers, sizeClass, teamColor, driverNumber) {
    const url = getDriverHeadshot(firstName, lastName, enrichedDrivers, driverNumber);
    const initials = (lastName || '??').substring(0, 3).toUpperCase();
    const bgColor = teamColor || getDriverTeamColor(firstName, lastName, enrichedDrivers, driverNumber) || '#333';
    const override = getDriverPhotoOverride(lastName);
    const objectPosition = override?.avatarObjectPosition || '50% 0%';
    if (url) {
        return `<img src="${url}" alt="${lastName}" class="driver-avatar ${sizeClass || ''}" style="border:2px solid ${bgColor};object-position:${objectPosition}" loading="lazy" onerror="this.outerHTML='<span class=\\'driver-initials ${sizeClass || ''}\\' style=\\'background:${bgColor}\\'>${initials}</span>'">`;
    }
    return `<span class="driver-initials ${sizeClass || ''}" style="background:${bgColor}">${initials}</span>`;
}

function driverCardImgHTML(firstName, lastName, enrichedDrivers, driverNumber) {
    const url = getDriverHeadshotHiRes(firstName, lastName, enrichedDrivers, driverNumber);
    const override = getDriverPhotoOverride(lastName);
    const cardStyle = ` style="object-position:${override?.cardObjectPosition || '50% 0%'}"`;
    if (url) {
        return `<img src="${url}" alt="${lastName}" loading="lazy"${cardStyle} onerror="this.style.display='none'">`;
    }
    return '';
}

// --- Inline Driver Badge (with photo) ---
function inlineDriverHTML(firstName, lastName, constructorId, enrichedDrivers, driverNumber) {
    const teamColor = getTeamColor(constructorId);
    const img = driverImgHTML(firstName, lastName, enrichedDrivers, '', teamColor, driverNumber);
    return `
        <span class="inline-driver">
            ${img}
            <span class="team-bar" style="background:${teamColor}"></span>
            <span class="name-block">
                <span class="first">${firstName || ''}</span>
                <span class="last">${lastName || ''}</span>
            </span>
        </span>`;
}

// --- Team Badge Inline (with logo) ---
function inlineTeamHTML(constructorId) {
    const name = getTeamName(constructorId);
    const logoImg = teamLogoSmallHTML(constructorId);
    return `<span class="team-badge-inline">${logoImg} ${name}</span>`;
}

// --- Tire Compound Helpers ---
const TIRE_COMPOUNDS = {
    SOFT:         { color: '#FF3333', label: 'S', bg: 'rgba(255,51,51,0.15)' },
    MEDIUM:       { color: '#FFD700', label: 'M', bg: 'rgba(255,215,0,0.15)' },
    HARD:         { color: '#EEEEEE', label: 'H', bg: 'rgba(238,238,238,0.15)' },
    INTERMEDIATE: { color: '#43B02A', label: 'I', bg: 'rgba(67,176,42,0.15)' },
    WET:          { color: '#0070C0', label: 'W', bg: 'rgba(0,112,192,0.15)' },
    UNKNOWN:      { color: '#888888', label: '?', bg: 'rgba(136,136,136,0.15)' },
};

function getTireCompound(compound) {
    if (!compound) return TIRE_COMPOUNDS.UNKNOWN;
    const c = compound.toUpperCase();
    return TIRE_COMPOUNDS[c] || TIRE_COMPOUNDS.UNKNOWN;
}

function tireCompoundHTML(compound) {
    const tire = getTireCompound(compound);
    return `<span class="tire-badge" style="background:${tire.bg};color:${tire.color};border-color:${tire.color}">${tire.label}</span>`;
}

function tireCompoundLabelHTML(compound) {
    const tire = getTireCompound(compound);
    const name = compound ? compound.charAt(0) + compound.slice(1).toLowerCase() : 'Unknown';
    return `<span class="tire-compound-label"><span class="tire-badge" style="background:${tire.bg};color:${tire.color};border-color:${tire.color}">${tire.label}</span> ${name}</span>`;
}

// --- Weather Helpers ---
function weatherIconHTML(airTemp, rainfall, trackTemp) {
    let icon = SVG_ICONS.sun;
    if (rainfall && rainfall > 0) icon = SVG_ICONS.rain;
    else if (airTemp && airTemp < 15) icon = SVG_ICONS.cloudy;
    else if (airTemp && airTemp > 35) icon = SVG_ICONS.hot;
    const parts = [];
    if (airTemp !== null && airTemp !== undefined) parts.push(`${Number(airTemp).toFixed(1)}°C`);
    if (trackTemp !== null && trackTemp !== undefined) parts.push(`Track: ${Number(trackTemp).toFixed(1)}°C`);
    return `<span class="weather-info">${icon} ${parts.join(' · ')}</span>`;
}

// --- Race Control Flag Helpers ---
function raceControlFlagHTML(flag) {
    const flags = {
        'GREEN': { icon: SVG_ICONS.flagGreen, label: 'Green Flag', cls: 'rc-green' },
        'YELLOW': { icon: SVG_ICONS.flagYellow, label: 'Yellow Flag', cls: 'rc-yellow' },
        'DOUBLE YELLOW': { icon: SVG_ICONS.flagYellow + SVG_ICONS.flagYellow, label: 'Double Yellow', cls: 'rc-yellow' },
        'RED': { icon: SVG_ICONS.flagRed, label: 'Red Flag', cls: 'rc-red' },
        'CHEQUERED': { icon: SVG_ICONS.flagChequered, label: 'Chequered Flag', cls: 'rc-checkered' },
        'BLACK AND WHITE': { icon: SVG_ICONS.flagBW, label: 'Black & White', cls: 'rc-bw' },
        'BLUE': { icon: SVG_ICONS.flagBlue, label: 'Blue Flag', cls: 'rc-blue' },
        'CLEAR': { icon: SVG_ICONS.checkCircle, label: 'Clear', cls: 'rc-green' },
    };
    const f = flags[flag?.toUpperCase()] || { icon: SVG_ICONS.whiteFlag, label: flag || 'Unknown', cls: '' };
    return `<span class="rc-flag ${f.cls}">${f.icon} ${f.label}</span>`;
}

const UI_ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"></path><path d="M5 10v10h14V10"></path></svg>',
    drivers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"></circle><path d="M5 20c1.3-3.2 4.1-5 7-5s5.7 1.8 7 5"></path></svg>',
    teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><path d="M3.5 20c1-2.7 3-4.2 4.5-4.2S11.5 17.3 12.5 20"></path><path d="M11.5 20c1-2.7 3-4.2 4.5-4.2s3.5 1.5 4.5 4.2"></path></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4M16 2v4M3 10h18"></path></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M2 12c2.3-4.2 5.7-6.3 10-6.3s7.7 2.1 10 6.3c-2.3 4.2-5.7 6.3-10 6.3S4.3 16.2 2 12z"></path></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"></path><path d="M5 5c4-3 7 3 11 0v8c-4 3-7-3-11 0"></path></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6l4 2"></path></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.4 6.4"></path><path d="M3 12A9 9 0 0 1 18.4 5.6"></path><path d="M7 20H5v-2"></path><path d="M17 4h2v2"></path></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H5a2 2 0 0 0 0 4h2"></path><path d="M17 6h2a2 2 0 0 1 0 4h-2"></path></svg>'
};

function iconHTML(svg, className = 'ui-inline-icon') {
    return `<span class="${className}" aria-hidden="true">${svg}</span>`;
}

function getSessionChipIcon(sessionLabel, mode = 'next') {
    if (mode === 'live') return UI_ICONS.live;
    const label = String(sessionLabel || '').toLowerCase();
    if (label.includes('race') || label.includes('sprint')) return UI_ICONS.flag;
    if (label.includes('quali') || label.includes('shootout')) return UI_ICONS.schedule;
    return UI_ICONS.clock;
}

function iconForSectionHeading(text) {
    const label = String(text || '').toLowerCase();
    if (label.includes('driver')) return UI_ICONS.drivers;
    if (label.includes('team') || label.includes('constructor')) return UI_ICONS.teams;
    if (label.includes('schedule') || label.includes('weekend') || label.includes('calendar')) return UI_ICONS.schedule;
    if (label.includes('race') || label.includes('lap')) return UI_ICONS.flag;
    if (label.includes('point') || label.includes('standings') || label.includes('leader')) return UI_ICONS.trophy;
    if (label.includes('live') || label.includes('radio')) return UI_ICONS.live;
    return UI_ICONS.flag;
}

function decorateSectionHeaderIcons(root = document) {
    root.querySelectorAll('.section-header h2:not([data-iconized])').forEach((h2) => {
        const icon = iconForSectionHeading(h2.textContent || '');
        h2.insertAdjacentHTML('afterbegin', `${iconHTML(icon, 'section-title-icon')}`);
        h2.setAttribute('data-iconized', 'true');
    });
}

function initGlobalIconDecoration() {
    decorateSectionHeaderIcons(document);
    if (window.__f1GlobalIconObserver) return;
    window.__f1GlobalIconObserver = new MutationObserver(() => {
        decorateSectionHeaderIcons(document);
    });
    window.__f1GlobalIconObserver.observe(document.body, { childList: true, subtree: true });
}

function formatLocalSessionStart(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZoneName: 'short'
        });
    } catch (e) {
        return new Date(ts).toString();
    }
}

// --- Navigation ---
function buildNav(activePage) {
    const pages = [
        { id: 'home', label: 'Home', href: 'index.html', icon: UI_ICONS.home },
        { id: 'drivers', label: 'Drivers', href: 'drivers.html', icon: UI_ICONS.drivers },
        { id: 'teams', label: 'Teams', href: 'teams.html', icon: UI_ICONS.teams },
        { id: 'schedule', label: 'Schedule', href: 'schedule.html', icon: UI_ICONS.schedule },
    ];

    const nav = document.getElementById('main-nav');
    nav.className = 'main-nav';
    nav.innerHTML = `
        <div class="nav-container">
            <a href="index.html" class="nav-logo">
                <span class="logo-f1">F1</span>
                <span class="logo-text">Pulse</span>
            </a>
            <div class="nav-links" id="nav-links">
                ${pages.map((p) => `<a href="${p.href}" class="${p.id === activePage ? 'active' : ''}">${iconHTML(p.icon, 'nav-link-icon')}<span>${p.label}</span></a>`).join('')}
            </div>
            <div id="nav-live-indicator" style="display:none"></div>
            <div class="nav-toggle" id="nav-toggle" onclick="toggleNav()">
                <span></span><span></span><span></span>
            </div>
        </div>`;
}

function toggleNav() {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.toggle('open');
}

const RECENT_RACES_STORAGE_KEY = 'f1pulse_recent_races_v1';

function getRecentRaces() {
    try {
        const raw = localStorage.getItem(RECENT_RACES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveRecentRace(race) {
    if (!race?.season || !race?.round) return;

    const normalized = {
        season: String(race.season),
        round: String(race.round),
        raceName: race.raceName || 'Grand Prix',
        circuitName: race.Circuit?.circuitName || race.circuitName || '',
        country: race.Circuit?.Location?.country || race.country || '',
        date: race.date || '',
        timestamp: Date.now(),
    };

    const existing = getRecentRaces();
    const deduped = existing.filter((item) => !(String(item.season) === normalized.season && String(item.round) === normalized.round));
    deduped.unshift(normalized);
    localStorage.setItem(RECENT_RACES_STORAGE_KEY, JSON.stringify(deduped.slice(0, 8)));
}

function createQuickActionsDock(activePage) {
    if (document.getElementById('quick-actions-dock')) return;

    const dock = document.createElement('div');
    dock.id = 'quick-actions-dock';
    dock.className = 'quick-actions-dock';
    dock.innerHTML = `
        <button id="quick-actions-toggle" class="quick-actions-toggle" type="button" aria-label="Open quick actions">Quick</button>
        <div id="quick-actions-panel" class="quick-actions-panel" aria-hidden="true">
            <div class="quick-actions-title">Quick Actions</div>
            <div class="quick-actions-links">
                <a href="index.html" class="quick-actions-link ${activePage === 'home' ? 'active' : ''}">Home (H)</a>
                <a href="drivers.html" class="quick-actions-link ${activePage === 'drivers' ? 'active' : ''}">Drivers (D)</a>
                <a href="teams.html" class="quick-actions-link ${activePage === 'teams' ? 'active' : ''}">Teams (T)</a>
                <a href="schedule.html" class="quick-actions-link ${activePage === 'schedule' ? 'active' : ''}">Schedule (S)</a>
                <button id="quick-open-next-race" class="quick-actions-link quick-actions-btn" type="button">Open Next Race (N)</button>
            </div>
            <div class="quick-actions-recent-wrap">
                <div class="quick-actions-subtitle">Recently Viewed Races</div>
                <div id="quick-actions-recent" class="quick-actions-recent"></div>
            </div>
        </div>`;
    document.body.appendChild(dock);

    const panel = dock.querySelector('#quick-actions-panel');
    const toggle = dock.querySelector('#quick-actions-toggle');
    const nextRaceBtn = dock.querySelector('#quick-open-next-race');

    function renderRecentLinks() {
        const recentContainer = dock.querySelector('#quick-actions-recent');
        if (!recentContainer) return;
        const races = getRecentRaces();
        if (!races.length) {
            recentContainer.innerHTML = '<div class="quick-actions-empty">No races viewed yet.</div>';
            return;
        }
        recentContainer.innerHTML = races.slice(0, 5).map((r) => {
            const href = `race-detail.html?season=${encodeURIComponent(r.season)}&round=${encodeURIComponent(r.round)}`;
            return `<a href="${href}" class="quick-recent-race">R${r.round} · ${r.raceName}</a>`;
        }).join('');
    }

    function openPanel() {
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        renderRecentLinks();
    }

    function closePanel() {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }

    function togglePanel() {
        if (panel.classList.contains('open')) closePanel();
        else openPanel();
    }

    toggle?.addEventListener('click', togglePanel);

    document.addEventListener('click', (e) => {
        if (!dock.contains(e.target)) closePanel();
    });

    nextRaceBtn?.addEventListener('click', async () => {
        nextRaceBtn.disabled = true;
        nextRaceBtn.textContent = 'Loading...';
        try {
            const nextRace = await F1API.getNextRace();
            if (nextRace?.season && nextRace?.round) {
                window.location.href = `race-detail.html?season=${encodeURIComponent(nextRace.season)}&round=${encodeURIComponent(nextRace.round)}`;
                return;
            }
            window.location.href = 'schedule.html';
        } catch (e) {
            window.location.href = 'schedule.html';
        }
    });

    if (!window.__f1QuickActionsBound) {
        window.__f1QuickActionsBound = true;
        document.addEventListener('keydown', (e) => {
            const tag = String(document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable) return;

            const key = String(e.key || '').toLowerCase();
            if (key === '?') {
                e.preventDefault();
                const activePanel = document.getElementById('quick-actions-panel');
                if (activePanel) activePanel.classList.toggle('open');
                return;
            }
            if (key === 'h') window.location.href = 'index.html';
            if (key === 'd') window.location.href = 'drivers.html';
            if (key === 't') window.location.href = 'teams.html';
            if (key === 's') window.location.href = 'schedule.html';
            if (key === 'n') {
                const btn = document.getElementById('quick-open-next-race');
                btn?.click();
            }
        });
    }
}

function createFloatingStandingsWidget(activePage) {
    if (document.getElementById('floating-standings-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'floating-standings-widget';
    widget.className = 'floating-standings-widget';
    widget.innerHTML = `
        <button id="floating-standings-toggle" class="floating-standings-toggle" type="button" aria-label="Open standings widget">${iconHTML(UI_ICONS.trophy, 'floating-toggle-icon')}Rank</button>
        <div id="floating-standings-panel" class="floating-standings-panel" aria-hidden="true">
            <div class="floating-standings-header">
                <strong>${iconHTML(UI_ICONS.trophy, 'floating-label-icon')}Points Ranking</strong>
                <div class="floating-standings-controls">
                    <button id="floating-standings-refresh" class="floating-standings-refresh" type="button" aria-label="Refresh ranking panel">${iconHTML(UI_ICONS.refresh, 'floating-btn-icon')}</button>
                    <button id="floating-standings-close" class="floating-standings-close" type="button" aria-label="Close ranking panel">${iconHTML(UI_ICONS.close, 'floating-btn-icon')}</button>
                </div>
            </div>
            <div class="floating-standings-tabs">
                <button id="floating-mode-drivers" class="floating-standings-tab active" data-mode="drivers" type="button">${iconHTML(UI_ICONS.drivers, 'floating-tab-icon')}Drivers</button>
                <button id="floating-mode-constructors" class="floating-standings-tab" data-mode="constructors" type="button">${iconHTML(UI_ICONS.teams, 'floating-tab-icon')}Teams</button>
            </div>
            <input id="floating-standings-search" class="ui-input floating-standings-search" type="search" placeholder="Filter by name...">
            <div id="floating-standings-body" class="floating-standings-body"><div class="quick-actions-empty">Loading rankings...</div></div>
            <div id="floating-standings-updated" class="floating-standings-updated">Updated: --</div>
            <div class="floating-standings-footer">
                <a href="drivers.html" class="floating-standings-link ${activePage === 'drivers' ? 'active' : ''}">${iconHTML(UI_ICONS.drivers, 'floating-link-icon')}Open Drivers</a>
                <a href="teams.html" class="floating-standings-link ${activePage === 'teams' ? 'active' : ''}">${iconHTML(UI_ICONS.teams, 'floating-link-icon')}Open Teams</a>
            </div>
        </div>`;
    document.body.appendChild(widget);

    const panel = widget.querySelector('#floating-standings-panel');
    const toggle = widget.querySelector('#floating-standings-toggle');
    const closeBtn = widget.querySelector('#floating-standings-close');
    const refreshBtn = widget.querySelector('#floating-standings-refresh');
    const body = widget.querySelector('#floating-standings-body');
    const search = widget.querySelector('#floating-standings-search');
    const updated = widget.querySelector('#floating-standings-updated');
    const tabs = [...widget.querySelectorAll('.floating-standings-tab')];

    const state = {
        mode: 'drivers',
        driverStandings: [],
        constructorStandings: [],
        enrichedDrivers: null,
        loadedAt: 0,
    };

    function renderRows() {
        if (!body) return;
        if (updated) {
            updated.textContent = `Updated: ${state.loadedAt ? formatLocalTime(new Date(state.loadedAt), true) : '--'}`;
        }
        const q = String(search?.value || '').trim().toLowerCase();

        if (state.mode === 'drivers') {
            const rows = (state.driverStandings || []).filter((s) => {
                const name = `${s.Driver?.givenName || ''} ${s.Driver?.familyName || ''}`.toLowerCase();
                return !q || name.includes(q);
            });

            if (!rows.length) {
                body.innerHTML = '<div class="quick-actions-empty">No drivers match this filter.</div>';
                return;
            }

            body.innerHTML = rows.slice(0, 22).map((s) => {
                const d = s.Driver;
                const cId = s.Constructors?.[0]?.constructorId;
                const color = getTeamColor(cId);
                return `<button type="button" class="floating-rank-row" data-driver="${d?.driverId || ''}" data-team="${cId || ''}">
                    <span class="floating-rank-pos">P${s.position}</span>
                    <span class="floating-rank-driver">${driverImgHTML(d?.givenName, d?.familyName, state.enrichedDrivers || {}, '', color, d?.permanentNumber)} <strong>${d?.givenName || ''} ${d?.familyName || ''}</strong></span>
                    <span class="floating-rank-points">${s.points} pts</span>
                </button>`;
            }).join('');

            body.querySelectorAll('.floating-rank-row[data-driver]').forEach((rowBtn) => {
                rowBtn.addEventListener('click', () => {
                    const driverId = rowBtn.getAttribute('data-driver');
                    const teamId = rowBtn.getAttribute('data-team');
                    if (driverId) openDriverModal(driverId, teamId || undefined);
                });
            });
            return;
        }

        const rows = (state.constructorStandings || []).filter((s) => {
            const name = String(getTeamName(s.Constructor?.constructorId) || '').toLowerCase();
            return !q || name.includes(q);
        });

        if (!rows.length) {
            body.innerHTML = '<div class="quick-actions-empty">No teams match this filter.</div>';
            return;
        }

        body.innerHTML = rows.slice(0, 12).map((s) => {
            const cId = s.Constructor?.constructorId;
            return `<div class="floating-rank-row static">
                <span class="floating-rank-pos">P${s.position}</span>
                <span class="floating-rank-driver">${inlineTeamHTML(cId)}</span>
                <span class="floating-rank-points">${s.points} pts</span>
            </div>`;
        }).join('');
    }

    async function loadData(force = false) {
        const stale = (Date.now() - state.loadedAt) > 60_000;
        if (!force && state.loadedAt && !stale) {
            renderRows();
            return;
        }

        body.innerHTML = '<div class="quick-actions-empty">Loading rankings...</div>';
        try {
            const [ds, cs, ed] = await Promise.all([
                F1API.getDriverStandings(),
                F1API.getConstructorStandings(),
                loadEnrichedDrivers(),
            ]);
            if (cs?.length) await fetchTeamLogos(cs);
            state.driverStandings = Array.isArray(ds) ? ds : [];
            state.constructorStandings = Array.isArray(cs) ? cs : [];
            state.enrichedDrivers = ed || {};
            state.loadedAt = Date.now();
            renderRows();
        } catch (e) {
            body.innerHTML = '<div class="quick-actions-empty">Ranking data unavailable right now.</div>';
        }
    }

    function openPanel() {
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        loadData(false);
    }

    function closePanel() {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }

    toggle?.addEventListener('click', () => {
        if (panel.classList.contains('open')) closePanel();
        else openPanel();
    });
    closeBtn?.addEventListener('click', closePanel);
    refreshBtn?.addEventListener('click', () => loadData(true));
    search?.addEventListener('input', renderRows);

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            state.mode = tab.getAttribute('data-mode') || 'drivers';
            tabs.forEach((x) => x.classList.toggle('active', x === tab));
            renderRows();
        });
    });

    document.addEventListener('click', (e) => {
        if (!widget.contains(e.target)) closePanel();
    });

    if (!window.__f1FloatingStandingsBound) {
        window.__f1FloatingStandingsBound = true;
        document.addEventListener('keydown', (e) => {
            const tag = String(document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable) return;
            if (String(e.key || '').toLowerCase() !== 'p') return;
            e.preventDefault();
            const activePanel = document.getElementById('floating-standings-panel');
            if (!activePanel) return;
            if (activePanel.classList.contains('open')) closePanel();
            else openPanel();
        });
    }
}

async function createDriverBulletinStrip() {
    if (document.getElementById('driver-bulletin-strip')) return;

    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const strip = document.createElement('section');
    strip.id = 'driver-bulletin-strip';
    strip.className = 'driver-bulletin-strip';
    strip.innerHTML = '<div class="driver-bulletin-loading">Loading driver bulletin...</div>';
    nav.insertAdjacentElement('afterend', strip);
    document.body.classList.add('has-bulletin-strip');
    syncBulletinLayoutMetrics();

    if (!window.__f1BulletinMetricsBound) {
        window.__f1BulletinMetricsBound = true;
        window.addEventListener('resize', syncBulletinLayoutMetrics);
    }

    try {
        const [standings, ed] = await Promise.all([
            F1API.getDriverStandings(),
            loadEnrichedDrivers(),
        ]);

        if (!standings?.length) {
            strip.style.display = 'none';
            document.body.classList.remove('has-bulletin-strip');
            syncBulletinLayoutMetrics();
            return;
        }

        const sorted = [...standings].sort((a, b) => (parseFloat(b.points) || 0) - (parseFloat(a.points) || 0));
        const maxPoints = Math.max(parseFloat(sorted[0]?.points) || 0, 1);
        const items = sorted.map((s) => {
            const d = s.Driver;
            const cId = s.Constructors?.[0]?.constructorId;
            const teamColor = getTeamColor(cId);
            const avatar = driverImgHTML(d?.givenName, d?.familyName, ed, 'driver-bulletin-avatar', teamColor, d?.permanentNumber);
            const href = `drivers.html?driver=${encodeURIComponent(d?.driverId || '')}&constructor=${encodeURIComponent(cId || '')}`;
            const pct = Math.max(8, Math.min(100, ((parseFloat(s.points) || 0) / maxPoints) * 100));
            return `<a href="${href}" class="driver-bulletin-item" title="P${s.position} · ${d?.givenName || ''} ${d?.familyName || ''} · ${s.points} pts">
                <span class="driver-bulletin-pos">P${s.position}</span>
                ${avatar}
                <span class="driver-bulletin-name">${d?.familyName || 'Driver'}</span>
                <span class="driver-bulletin-pts">${s.points} pts</span>
                <span class="driver-bulletin-micro"><span style="width:${pct.toFixed(1)}%;background:${teamColor}"></span></span>
            </a>`;
        }).join('');

        strip.innerHTML = `
            <div class="driver-bulletin-label">Drivers Live Board</div>
            <div class="driver-bulletin-marquee">
                <div class="driver-bulletin-track">${items}${items}</div>
            </div>`;
        syncBulletinLayoutMetrics();
    } catch (e) {
        strip.style.display = 'none';
        document.body.classList.remove('has-bulletin-strip');
        syncBulletinLayoutMetrics();
    }
}

function syncBulletinLayoutMetrics() {
    const root = document.documentElement;
    const strip = document.getElementById('driver-bulletin-strip');
    const isVisible = !!strip && strip.style.display !== 'none';
    const height = isVisible ? (strip.offsetHeight || 0) : 0;
    root.style.setProperty('--bulletin-offset', `${height}px`);
}

// --- Footer ---
function buildFooter() {
    const footer = document.getElementById('main-footer');
    footer.className = 'main-footer';
    const year = new Date().getFullYear();
    footer.innerHTML = `
        <div class="footer-content">
            <div class="footer-brand">
                <span class="logo-f1">F1</span> <span>Pulse</span>
            </div>
            <div class="footer-text">
                Data provided by Jolpica-F1 API & OpenF1. Not affiliated with Formula 1.
                <br>F1 Pulse. For fans, by fans.
                <br>Arnav Dugad &copy; ${year}
            </div>
            <div class="footer-links">
                <a href="index.html">Home</a>
                <a href="drivers.html">Drivers</a>
                <a href="teams.html">Teams</a>
                <a href="schedule.html">Schedule</a>
            </div>
        </div>`;
}

// --- Loading / Error ---
function showLoading(container, message = 'Loading data', type = 'spinner') {
    if (type === 'skeleton-cards') {
        container.innerHTML = Array.from({length: 6}, (_, i) =>
            `<div class="skeleton skeleton-card" style="animation-delay:${i * 0.1}s"></div>`
        ).join('');
        return;
    }
    if (type === 'skeleton-table') {
        container.innerHTML = `<div class="table-wrapper">
            ${Array.from({length: 10}, (_, i) =>
                `<div class="skeleton skeleton-row" style="animation-delay:${i * 0.05}s"></div>`
            ).join('')}
        </div>`;
        return;
    }
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div class="loading-text">${message}...</div>
        </div>`;
}

function showError(container, message = 'Failed to load data', retryFn) {
    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--f1-red)" stroke-width="1.5" stroke-linecap="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
            <div class="error-message">${message}</div>
            <div style="color:var(--f1-gray);font-size:0.85rem;margin-bottom:var(--space-lg)">Please check your connection and try again.</div>
            ${retryFn ? `<button class="retry-btn" onclick="${retryFn}">Retry</button>` : ''}
        </div>`;
}

// --- Scroll-to-top Button ---
function initScrollTop() {
    const btn = document.createElement('button');
    btn.className = 'scroll-top-btn';
    btn.innerHTML = '↑';
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.onclick = () => window.scrollTo({ top: 0 });
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
}

function initScrollProgressRail() {
    if (document.getElementById('scroll-progress-rail')) return;

    const rail = document.createElement('div');
    rail.id = 'scroll-progress-rail';
    rail.className = 'scroll-progress-rail';
    rail.innerHTML = '<span id="scroll-progress-fill" class="scroll-progress-fill"></span>';
    document.body.appendChild(rail);

    const fill = rail.querySelector('#scroll-progress-fill');
    if (!fill) return;

    const update = () => {
        const doc = document.documentElement;
        const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 0);
        const pct = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
        fill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
}

// --- Driver Detail Modal ---
function createDriverModal() {
    if (document.getElementById('driver-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'driver-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeDriverModal()">&times;</button>
            <div id="driver-modal-body">
                <div class="loading"><div class="spinner"></div></div>
            </div>
        </div>`;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDriverModal();
    });
    document.body.appendChild(modal);
}

function closeDriverModal() {
    const modal = document.getElementById('driver-modal');
    if (modal) modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
}

async function openDriverModal(driverId, constructorId, season) {
    const modal = document.getElementById('driver-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    const body = document.getElementById('driver-modal-body');
    showLoading(body, 'Loading driver info');

    const currentSeason = season || (new Date().getFullYear());

    try {
        const [info, results, seasonStandings] = await Promise.all([
            F1API.getDriverInfo(driverId),
            F1API.getDriverSeasonResults(currentSeason, driverId),
            F1API.getDriverStandings(currentSeason).catch(() => []),
        ]);

        if (!info) { body.innerHTML = '<p style="text-align:center;color:var(--f1-gray);padding:32px">Driver information not available.</p>'; return; }

        const ed = await loadEnrichedDrivers();
        const headshot = getDriverHeadshotHiRes(info.givenName, info.familyName, ed, info.permanentNumber);
        const teamColor = constructorId ? getTeamColor(constructorId) : (getDriverTeamColor(info.givenName, info.familyName, ed, info.permanentNumber) || '#e10600');
        const raceResults = Array.isArray(results) ? results : [];

        const buildTeammateComparisonHTML = (driverPointsFallback = 0) => {
            if (!constructorId || !Array.isArray(seasonStandings) || !seasonStandings.length) return '';

            const targetTeam = resolveTeamId(constructorId);
            const sameTeam = seasonStandings.filter((s) => resolveTeamId(s.Constructors?.[0]?.constructorId) === targetTeam);
            if (sameTeam.length < 2) return '';

            const normalizedFamily = F1API.normalizeStr(info.familyName);
            const current = sameTeam.find((s) => s.Driver?.driverId === driverId)
                || sameTeam.find((s) => F1API.normalizeStr(s.Driver?.familyName) === normalizedFamily)
                || sameTeam[0];
            const teammate = sameTeam.find((s) => s.Driver?.driverId !== current?.Driver?.driverId);
            if (!current || !teammate) return '';

            const currentPts = parseFloat(current.points) || driverPointsFallback || 0;
            const matePts = parseFloat(teammate.points) || 0;
            const total = Math.max(currentPts + matePts, 1);
            const currentPct = (currentPts / total) * 100;
            const matePct = (matePts / total) * 100;
            const currentWins = parseInt(current.wins, 10) || 0;
            const mateWins = parseInt(teammate.wins, 10) || 0;

            return `
                <div class="driver-chart-section driver-compare-section">
                    <div class="driver-chart-label">Teammate Comparison</div>
                    <div class="driver-compare-head">
                        <div class="driver-compare-name">${driverImgHTML(info.givenName, info.familyName, ed, '', teamColor, info.permanentNumber)} <strong>${info.familyName || 'Driver'}</strong></div>
                        <div class="driver-compare-name">${driverImgHTML(teammate.Driver?.givenName, teammate.Driver?.familyName, ed, '', teamColor, teammate.Driver?.permanentNumber)} <strong>${teammate.Driver?.familyName || 'Teammate'}</strong></div>
                    </div>
                    <div class="driver-compare-bars">
                        <div class="driver-compare-row">
                            <span class="driver-compare-metric">Points</span>
                            <div class="driver-compare-track">
                                <span class="driver-compare-fill" style="width:${currentPct.toFixed(1)}%;background:${teamColor}"></span>
                                <span class="driver-compare-fill mate" style="width:${matePct.toFixed(1)}%"></span>
                            </div>
                            <span class="driver-compare-values">${currentPts.toFixed(1)} vs ${matePts.toFixed(1)}</span>
                        </div>
                        <div class="driver-compare-row">
                            <span class="driver-compare-metric">Wins</span>
                            <div class="driver-compare-track">
                                <span class="driver-compare-fill" style="width:${(currentWins / Math.max(currentWins, mateWins, 1) * 100).toFixed(1)}%;background:${teamColor}"></span>
                                <span class="driver-compare-fill mate" style="width:${(mateWins / Math.max(currentWins, mateWins, 1) * 100).toFixed(1)}%"></span>
                            </div>
                            <span class="driver-compare-values">${currentWins} vs ${mateWins}</span>
                        </div>
                    </div>
                </div>`;
        };

        // Compute real stats from season results
        let statsHTML = '';
        if (raceResults.length) {
            let totalPoints = 0, wins = 0, podiums = 0, dnfs = 0, fastestLaps = 0;
            let totalFinishPos = 0, finishCount = 0, totalGridPos = 0, gridCount = 0;
            let positionsGained = 0, bestFinish = 99, bestGrid = 99;

            raceResults.forEach(r => {
                const res = r.Results?.[0];
                if (!res) return;
                totalPoints += parseFloat(res.points) || 0;
                const pos = parseInt(res.position);
                const grid = parseInt(res.grid);
                if (pos === 1) wins++;
                if (pos <= 3) podiums++;
                if (pos && pos < 100) { totalFinishPos += pos; finishCount++; bestFinish = Math.min(bestFinish, pos); }
                if (grid && grid < 100) { totalGridPos += grid; gridCount++; bestGrid = Math.min(bestGrid, grid); }
                if (pos && grid) positionsGained += grid - pos;
                if (res.status && res.status !== 'Finished' && !res.status.startsWith('+')) dnfs++;
                if (res.FastestLap?.rank === '1') fastestLaps++;
            });

            const avgFinish = finishCount ? (totalFinishPos / finishCount).toFixed(1) : '-';
            const avgGrid = gridCount ? (totalGridPos / gridCount).toFixed(1) : '-';
            const avgGained = finishCount ? (positionsGained / finishCount).toFixed(1) : '-';

            const ptsPerRace = raceResults.length > 0 ? (totalPoints / raceResults.length).toFixed(1) : '0.0';
            const podiumPct = raceResults.length > 0 ? ((podiums / raceResults.length) * 100).toFixed(0) : '0';
            const pointsFinishes = raceResults.filter(r => parseFloat(r.Results?.[0]?.points) > 0).length;
            const completionRate = raceResults.length > 0 ? Math.round((finishCount / raceResults.length) * 100) : 0;
            const visualScaleMax = Math.max(totalPoints, wins * 25, podiums * 12, fastestLaps * 10, 1);

            const visualBarsHTML = `
                <div class="driver-chart-section driver-visual-stats">
                    <div class="driver-chart-label">${iconHTML(UI_ICONS.live, 'driver-chart-icon')}Performance Visuals</div>
                    <div class="driver-visual-overview">
                        <div class="driver-completion-ring" style="--completion:${completionRate};--team-color:${teamColor}">
                            <span>${completionRate}%</span>
                            <small>Finish Rate</small>
                        </div>
                        <div class="driver-visual-bars">
                            <div class="driver-visual-bar-row"><span>Points</span><div class="driver-visual-bar-track"><span style="width:${((totalPoints / visualScaleMax) * 100).toFixed(1)}%;background:var(--f1-red)"></span></div><strong>${totalPoints.toFixed(1)}</strong></div>
                            <div class="driver-visual-bar-row"><span>Wins</span><div class="driver-visual-bar-track"><span style="width:${(((wins * 25) / visualScaleMax) * 100).toFixed(1)}%;background:#FFD700"></span></div><strong>${wins}</strong></div>
                            <div class="driver-visual-bar-row"><span>Podiums</span><div class="driver-visual-bar-track"><span style="width:${(((podiums * 12) / visualScaleMax) * 100).toFixed(1)}%;background:var(--f1-success)"></span></div><strong>${podiums}</strong></div>
                            <div class="driver-visual-bar-row"><span>Fastest Laps</span><div class="driver-visual-bar-track"><span style="width:${(((fastestLaps * 10) / visualScaleMax) * 100).toFixed(1)}%;background:var(--f1-purple)"></span></div><strong>${fastestLaps}</strong></div>
                        </div>
                    </div>
                </div>`;

            statsHTML = `
            ${visualBarsHTML}
            <div class="driver-modal-stats">
                <div class="driver-stat-header-row">
                    <span class="driver-stat-header-label">${currentSeason} Season Statistics</span>
                    <span class="driver-stat-header-races">${raceResults.length} Races</span>
                </div>
                <div class="driver-stat-grid">
                    <div class="driver-stat-item stat-highlight">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-red)" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <div class="driver-stat-value" style="color:var(--f1-red)">${totalPoints}</div>
                        <div class="driver-stat-label">Points</div>
                    </div>
                    <div class="driver-stat-item ${wins > 0 ? 'stat-gold' : ''}">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2"><circle cx="12" cy="8" r="6"></circle><path d="M12 14l-4 8h8l-4-8z"></path></svg>
                        </div>
                        <div class="driver-stat-value" style="color:#FFD700">${wins}</div>
                        <div class="driver-stat-label">Wins</div>
                    </div>
                    <div class="driver-stat-item ${podiums > 0 ? 'stat-success' : ''}">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-success)" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 9 7 9"></path><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 9 17 9"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0012 0V2z"></path></svg>
                        </div>
                        <div class="driver-stat-value" style="color:var(--f1-success)">${podiums}</div>
                        <div class="driver-stat-label">Podiums</div>
                    </div>
                    <div class="driver-stat-item ${fastestLaps > 0 ? 'stat-purple' : ''}">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-purple)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                        <div class="driver-stat-value" style="color:var(--f1-purple)">${fastestLaps}</div>
                        <div class="driver-stat-label">Fastest Laps</div>
                    </div>
                    <div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                        </div>
                        <div class="driver-stat-value">${ptsPerRace}</div>
                        <div class="driver-stat-label">Pts/Race</div>
                    </div>
                    <div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                        </div>
                        <div class="driver-stat-value">${avgFinish}</div>
                        <div class="driver-stat-label">Avg Finish</div>
                    </div>
                    <div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </div>
                        <div class="driver-stat-value">${avgGrid}</div>
                        <div class="driver-stat-label">Avg Grid</div>
                    </div>
                    <div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${parseFloat(avgGained) > 0 ? 'var(--f1-success)' : parseFloat(avgGained) < 0 ? 'var(--f1-red)' : 'var(--f1-gray)'}" stroke-width="2"><polyline points="${parseFloat(avgGained) >= 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"></polyline></svg>
                        </div>
                        <div class="driver-stat-value" style="color:${parseFloat(avgGained) > 0 ? 'var(--f1-success)' : parseFloat(avgGained) < 0 ? 'var(--f1-red)' : 'var(--f1-gray)'}">${parseFloat(avgGained) > 0 ? '+' : ''}${avgGained}</div>
                        <div class="driver-stat-label">Avg Pos Gained</div>
                    </div>
                    ${bestFinish < 99 ? `<div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-warning)" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                        </div>
                        <div class="driver-stat-value" style="color:var(--f1-warning)">P${bestFinish}</div>
                        <div class="driver-stat-label">Best Finish</div>
                    </div>` : ''}
                    ${bestGrid < 99 ? `<div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path></svg>
                        </div>
                        <div class="driver-stat-value">P${bestGrid}</div>
                        <div class="driver-stat-label">Best Quali</div>
                    </div>` : ''}
                    <div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                        <div class="driver-stat-value">${pointsFinishes}</div>
                        <div class="driver-stat-label">Points Finishes</div>
                    </div>
                    ${podiums > 0 ? `<div class="driver-stat-item">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-gray)" stroke-width="2"><path d="M12 20V10"></path><path d="M18 20V4"></path><path d="M6 20v-4"></path></svg>
                        </div>
                        <div class="driver-stat-value">${podiumPct}%</div>
                        <div class="driver-stat-label">Podium Rate</div>
                    </div>` : ''}
                    ${dnfs > 0 ? `<div class="driver-stat-item stat-danger">
                        <div class="driver-stat-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--f1-red)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                        </div>
                        <div class="driver-stat-value" style="color:var(--f1-red)">${dnfs}</div>
                        <div class="driver-stat-label">DNFs</div>
                    </div>` : ''}
                </div>
            </div>`;

            statsHTML += buildTeammateComparisonHTML(totalPoints);

            // Build Points Progression & Position History charts
            const chartPoints = [];
            const chartPositions = [];
            let cumPoints = 0;
            raceResults.forEach(r => {
                const res = r.Results?.[0];
                if (!res) return;
                cumPoints += parseFloat(res.points) || 0;
                chartPoints.push({ round: r.round, name: r.raceName, pts: cumPoints });
                const pos = parseInt(res.position);
                if (pos && pos < 100) {
                    chartPositions.push({ round: r.round, name: r.raceName, pos });
                }
            });

            if (chartPoints.length >= 2) {
                const chartW = 560, chartH = 170, pad = 34;
                const maxPts = Math.max(...chartPoints.map(c => c.pts), 1);
                const w = chartW - pad * 2;
                const h = chartH - pad;
                const step = w / (chartPoints.length - 1);

                const pointsPath = chartPoints.map((c, i) => {
                    const x = pad + i * step;
                    const y = chartH - pad - (c.pts / maxPts) * h + 5;
                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');

                const areaPath = pointsPath + ` L${(pad + (chartPoints.length - 1) * step).toFixed(1)},${(chartH - pad + 5).toFixed(1)} L${pad},${(chartH - pad + 5).toFixed(1)} Z`;

                const dots = chartPoints.map((c, i) => {
                    const x = pad + i * step;
                    const y = chartH - pad - (c.pts / maxPts) * h + 5;
                    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${teamColor}" stroke="var(--f1-surface)" stroke-width="1.5"><title>R${c.round}: ${c.pts} pts</title></circle>`;
                }).join('');

                const yLabels = [0, Math.round(maxPts / 2), Math.round(maxPts)].map(v => {
                    const y = chartH - pad - (v / maxPts) * h + 5;
                    return `<text x="${pad - 6}" y="${y.toFixed(1)}" text-anchor="end" fill="var(--f1-gray)" font-size="9" font-family="var(--font-primary)">${v}</text><line x1="${pad}" y1="${y.toFixed(1)}" x2="${pad + w}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
                }).join('');

                statsHTML += `
                <div class="driver-chart-section">
                    <div class="driver-chart-label">${iconHTML(UI_ICONS.trophy, 'driver-chart-icon')}Points Progression</div>
                    <div class="driver-chart-meta">
                        <span>Total ${chartPoints[chartPoints.length - 1]?.pts || 0} pts</span>
                        <span>Avg ${(chartPoints[chartPoints.length - 1]?.pts / chartPoints.length).toFixed(1)} pts/race</span>
                        <span>Rounds ${chartPoints.length}</span>
                    </div>
                    <svg class="driver-chart-svg chart-points" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
                        ${yLabels}
                        <path d="${areaPath}" fill="${teamColor}" opacity="0.08"/>
                        <path d="${pointsPath}" fill="none" stroke="${teamColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                        ${dots}
                    </svg>
                </div>`;
            }

            if (chartPositions.length >= 2) {
                const chartW = 560, chartH = 170, pad = 34;
                const maxPos = Math.min(Math.max(...chartPositions.map(c => c.pos), 5) + 2, 22);
                const w = chartW - pad * 2;
                const h = chartH - pad;
                const step = w / (chartPositions.length - 1);

                const posPath = chartPositions.map((c, i) => {
                    const x = pad + i * step;
                    const y = pad + ((c.pos - 1) / (maxPos - 1)) * h;
                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');

                const dots = chartPositions.map((c, i) => {
                    const x = pad + i * step;
                    const y = pad + ((c.pos - 1) / (maxPos - 1)) * h;
                    const color = c.pos === 1 ? '#FFD700' : c.pos <= 3 ? 'var(--f1-success)' : c.pos <= 10 ? teamColor : 'var(--f1-gray)';
                    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}" stroke="var(--f1-surface)" stroke-width="1.5"><title>R${c.round}: P${c.pos}</title></circle>`;
                }).join('');

                const yLabels = [1, Math.round(maxPos / 2), maxPos].map(v => {
                    const y = pad + ((v - 1) / (maxPos - 1)) * h;
                    return `<text x="${pad - 6}" y="${y.toFixed(1)}" text-anchor="end" fill="var(--f1-gray)" font-size="9" font-family="var(--font-primary)">P${v}</text><line x1="${pad}" y1="${y.toFixed(1)}" x2="${pad + w}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
                }).join('');

                // Podium zone highlight
                const podiumY = pad;
                const podiumH = ((3 - 1) / (maxPos - 1)) * h;
                const podiumZone = `<rect x="${pad}" y="${podiumY}" width="${w}" height="${podiumH}" fill="rgba(0,210,122,0.03)" rx="4"/>`;

                // Points zone highlight (top 10)
                const p10Y = pad;
                const p10H = ((10 - 1) / (maxPos - 1)) * h;
                const pointsZone = `<rect x="${pad}" y="${p10Y}" width="${w}" height="${p10H}" fill="rgba(255,255,255,0.01)" rx="4"/>`;

                statsHTML += `
                <div class="driver-chart-section">
                    <div class="driver-chart-label">${iconHTML(UI_ICONS.flag, 'driver-chart-icon')}Race Positions</div>
                    <div class="driver-chart-meta">
                        <span>Best P${Math.min(...chartPositions.map((c) => c.pos))}</span>
                        <span>Avg P${(chartPositions.reduce((sum, c) => sum + c.pos, 0) / chartPositions.length).toFixed(1)}</span>
                        <span>Samples ${chartPositions.length}</span>
                    </div>
                    <svg class="driver-chart-svg chart-positions" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
                        ${yLabels}
                        ${pointsZone}
                        ${podiumZone}
                        <path d="${posPath}" fill="none" stroke="${teamColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
                        ${dots}
                    </svg>
                </div>`;
            }
        } else {
            const teammateOnlyHTML = buildTeammateComparisonHTML(0);
            statsHTML = `
                <div class="driver-chart-section driver-no-data-panel">
                    <div class="driver-chart-label">${iconHTML(UI_ICONS.schedule, 'driver-chart-icon')}Season Visuals</div>
                    <p style="color:var(--f1-gray)">No completed race statistics available for this driver in ${currentSeason} yet.</p>
                </div>
                ${teammateOnlyHTML}`;
        }

        const resultsHTML = raceResults.length ? `
            <div class="driver-modal-results">
                <h3 style="margin-bottom:var(--space-md)">${iconHTML(UI_ICONS.flag, 'driver-chart-icon')}${currentSeason} Race Results</h3>
                <div class="table-wrapper">
                    <table class="results-table">
                        <thead><tr><th>Round</th><th>Race</th><th>Grid</th><th>Pos</th><th>Status</th><th style="text-align:right">Points</th></tr></thead>
                        <tbody>
                            ${raceResults.map(r => {
                                const res = r.Results?.[0];
                                if (!res) return '';
                                const gridPos = parseInt(res.grid) || 0;
                                const finPos = parseInt(res.position) || 0;
                                const diff = gridPos - finPos;
                                const diffHTML = diff > 0 ? `<span class="pos-change up">&#9650;${diff}</span>` : diff < 0 ? `<span class="pos-change down">&#9660;${Math.abs(diff)}</span>` : '<span class="pos-change same">=</span>';
                                const fl = res.FastestLap?.rank === '1' ? ' <span class="fastest-lap-badge">FL</span>' : '';
                                const statusText = res.status === 'Finished' || res.status?.startsWith('+') ? res.status : `<span style="color:var(--f1-red)">${res.status || ''}</span>`;
                                return `<tr>
                                    <td>R${r.round}</td>
                                    <td>${countryFlagHTML(r.Circuit?.Location?.country, 14)} ${r.raceName || ''}</td>
                                    <td>${res.grid || '-'}</td>
                                    <td class="pos-cell">${res.position || res.positionText || '-'} ${diffHTML}${fl}</td>
                                    <td style="font-size:0.8rem">${statusText}</td>
                                    <td class="points-cell">${res.points || '0'}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : '';

        const modalOverride = getDriverPhotoOverride(info.familyName);
        const modalObjectPosition = modalOverride?.cardObjectPosition || '50% 0%';

        body.innerHTML = `
            <div class="driver-modal-header">
            ${headshot ? `<img src="${headshot}" alt="${info.familyName}" class="driver-modal-img" style="border-color:${teamColor};object-position:${modalObjectPosition}" onerror="this.style.display='none'">` : ''}
                <div class="driver-modal-info">
                    <h2>${info.givenName || ''} <span class="text-red">${info.familyName || ''}</span></h2>
                    <p>${countryFlagHTML(info.nationality, 20)} ${info.nationality || ''}</p>
                    <p>Born: ${info.dateOfBirth ? formatDate(info.dateOfBirth) : 'Unknown'}</p>
                    <p>Number: <strong style="font-size:1.2rem;color:${teamColor}">#${info.permanentNumber || '?'}</strong></p>
                    ${constructorId ? `<p>Team: ${teamLogoSmallHTML(constructorId)} <strong>${getTeamName(constructorId)}</strong></p>` : ''}
                    ${info.url ? `<a href="${info.url}" target="_blank" rel="noopener" class="section-link" style="margin-top:var(--space-sm);display:inline-block">Wikipedia &rarr;</a>` : ''}
                </div>
            </div>
            ${statsHTML}
            ${resultsHTML}`;
    } catch (err) {
        showError(body, 'Failed to load driver details.');
        console.error(err);
    }
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDriverModal();
});

// --- Live Session Check ---
function parseSessionDate(date, time) {
    if (!date) return null;
    const candidate = new Date(`${date}T${time || '14:00:00Z'}`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function collectRaceSessions(race) {
    const sessions = [];
    const push = (label, src) => {
        if (!src?.date) return;
        const dt = parseSessionDate(src.date, src.time);
        if (!dt) return;
        sessions.push({ label, ts: dt.getTime(), date: src.date, time: src.time || '14:00:00Z' });
    };

    push('FP1', race.FirstPractice);
    push('FP2', race.SecondPractice);
    push('FP3', race.ThirdPractice);
    push('Sprint Shootout', race.SprintShootout);
    push('Sprint Quali', race.SprintQualifying);
    push('Sprint', race.Sprint);
    push('Quali', race.Qualifying);
    push('Race', { date: race.date, time: race.time });

    return sessions.sort((a, b) => a.ts - b.ts);
}

function formatCountdownCompact(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds}s`;
}

function renderNavSessionIndicator() {
    const indicator = document.getElementById('nav-live-indicator');
    const state = window.__f1NavChipState || { mode: 'none' };
    if (!indicator) return;

    if (state.mode === 'none') {
        indicator.style.display = 'none';
        indicator.className = '';
        indicator.innerHTML = '';
        indicator.removeAttribute('data-tooltip');
        return;
    }

    indicator.style.display = '';

    if (state.mode === 'live') {
        indicator.className = 'nav-live nav-chip-live';
        indicator.innerHTML = `<span class="live-dot"></span>${iconHTML(getSessionChipIcon(state.sessionName, 'live'), 'nav-chip-icon')}<span class="nav-chip-label">LIVE ${state.sessionName || 'Session'}</span>`;
        indicator.title = state.meetingName ? `${state.meetingName}` : 'Live session';
        indicator.setAttribute('aria-label', indicator.title);
        indicator.removeAttribute('data-tooltip');
        indicator.onclick = () => { window.location.href = 'schedule.html'; };
        return;
    }

    const remaining = (state.targetTs || 0) - Date.now();
    if (remaining <= 0) {
        window.__f1NavChipState = { mode: 'none' };
        indicator.style.display = 'none';
        return;
    }

    indicator.className = 'nav-live nav-chip-next';
    const localStart = state.localStart || formatLocalSessionStart(state.targetTs);
    indicator.innerHTML = `${iconHTML(getSessionChipIcon(state.sessionLabel, 'next'), 'nav-chip-icon')}<span class="nav-chip-tag">NEXT</span><span class="nav-chip-label">${state.sessionLabel || 'Session'}</span><span class="nav-chip-time">${formatCountdownCompact(remaining)}</span>`;
    indicator.title = `${state.raceName || 'Upcoming'} • ${state.date || ''} ${state.time || ''} UTC`;
    indicator.setAttribute('data-tooltip', localStart ? `Local start: ${localStart}` : 'Next session start time unavailable');
    indicator.setAttribute('aria-label', localStart ? `${state.sessionLabel || 'Session'} starts at ${localStart}` : 'Next session');
    indicator.onclick = () => {
        if (state.season && state.round) {
            window.location.href = `race-detail.html?season=${encodeURIComponent(state.season)}&round=${encodeURIComponent(state.round)}`;
            return;
        }
        window.location.href = 'schedule.html';
    };
}

async function syncNavSessionState(forceSchedule = false) {
    if (window.__f1NavChipSyncing) return;
    window.__f1NavChipSyncing = true;

    try {
        const sessions = await F1API.getOpenF1Sessions({ session_key: 'latest' }).catch(() => []);
        const latest = Array.isArray(sessions) && sessions.length ? sessions[sessions.length - 1] : null;
        const now = Date.now();
        const liveEnd = latest?.date_end ? Date.parse(latest.date_end) : NaN;

        if (Number.isFinite(liveEnd) && liveEnd > now) {
            window.__f1NavChipState = {
                mode: 'live',
                sessionName: latest.session_name || 'Session',
                meetingName: latest.meeting_name || '',
            };
            renderNavSessionIndicator();
            return;
        }

        const cache = window.__f1ScheduleCache;
        const stale = !cache || (now - (cache.fetchedAt || 0) > 5 * 60 * 1000);
        if (forceSchedule || stale) {
            const schedule = await F1API.getSchedule('current').catch(() => []);
            window.__f1ScheduleCache = {
                fetchedAt: Date.now(),
                races: Array.isArray(schedule) ? schedule : [],
            };
        }

        const races = window.__f1ScheduleCache?.races || [];
        let nextSession = null;
        for (const race of races) {
            const sessionsForRace = collectRaceSessions(race);
            for (const s of sessionsForRace) {
                if (s.ts > now && (!nextSession || s.ts < nextSession.ts)) {
                    nextSession = {
                        ...s,
                        season: race.season || new Date().getFullYear(),
                        round: race.round,
                        raceName: race.raceName,
                    };
                }
            }
        }

        if (!nextSession) {
            window.__f1NavChipState = { mode: 'none' };
            renderNavSessionIndicator();
            return;
        }

        window.__f1NavChipState = {
            mode: 'next',
            sessionLabel: nextSession.label,
            targetTs: nextSession.ts,
            season: nextSession.season,
            round: nextSession.round,
            raceName: nextSession.raceName,
            date: nextSession.date,
            time: (nextSession.time || '').replace('Z', ''),
            localStart: formatLocalSessionStart(nextSession.ts),
        };
        renderNavSessionIndicator();
    } finally {
        window.__f1NavChipSyncing = false;
    }
}

async function checkLiveSession() {
    if (window.__f1NavChipSyncTimer) clearInterval(window.__f1NavChipSyncTimer);
    if (window.__f1NavChipRenderTimer) clearInterval(window.__f1NavChipRenderTimer);

    await syncNavSessionState(true);
    renderNavSessionIndicator();

    window.__f1NavChipRenderTimer = setInterval(() => {
        renderNavSessionIndicator();
    }, 1000);

    window.__f1NavChipSyncTimer = setInterval(() => {
        syncNavSessionState(false);
    }, 30_000);
}

// --- Init page ---
function initPage(activePage) {
    const pageClass = `page-${activePage || 'generic'}`;
    document.body.classList.add(pageClass);
    buildNav(activePage);
    createDriverBulletinStrip();
    buildFooter();
    injectGlobalPageVisualLayer(activePage);
    initScrollProgressRail();
    initScrollTop();
    createDriverModal();
    createQuickActionsDock(activePage);
    createFloatingStandingsWidget(activePage);
    initGlobalIconDecoration();
    checkLiveSession();
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            document.getElementById('nav-links')?.classList.remove('open');
        });
    });
}

function injectGlobalPageVisualLayer(activePage) {
    if (activePage === 'home') return;
    if (document.getElementById('global-page-visual-layer')) return;

    const layer = document.createElement('div');
    layer.id = 'global-page-visual-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `
        <span class="global-visual-orb global-visual-orb-a"></span>
        <span class="global-visual-orb global-visual-orb-b"></span>
        <span class="global-visual-grid"></span>`;
    document.body.appendChild(layer);
}

