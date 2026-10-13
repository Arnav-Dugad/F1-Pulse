/* Apply the saved palette before styles paint. All preferences remain local. */
var PulseStore = (() => {
    const memory = new Map(), prefix = 'f1pulse_v3:';
    const read = (key, fallback) => {
        try { const raw = localStorage.getItem(prefix + key); if (raw !== null) return JSON.parse(raw); } catch { /* Private storage may be unavailable. */ }
        return memory.has(key) ? memory.get(key) : fallback;
    };
    const write = (key, value) => { memory.set(key, value); try { localStorage.setItem(prefix + key, JSON.stringify(value)); return true; } catch { return false; } };
    const favourites = kind => { const rows = read(`favourites:${kind}`, []); return Array.isArray(rows) ? rows.filter(id => typeof id === 'string').slice(0, 100) : []; };
    const isFavourite = (kind, id) => favourites(kind).includes(String(id));
    const toggleFavourite = (kind, id) => { const rows = favourites(kind), key = String(id); write(`favourites:${kind}`, rows.includes(key) ? rows.filter(row => row !== key) : [...rows, key]); return isFavourite(kind, key); };
    const applyTheme = value => {
        const theme = ['dark', 'light', 'system'].includes(value) ? value : 'dark';
        const effective = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
        document.documentElement.dataset.theme = effective;
        document.documentElement.style.colorScheme = effective;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'light' ? '#f4f6fa' : '#101318');
        return theme;
    };
    if (typeof document !== 'undefined') {
        applyTheme(read('theme', 'dark'));
        if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(read('theme', 'dark')));
    }
    return { read, write, favourites, isFavourite, toggleFavourite, applyTheme };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PulseStore;
