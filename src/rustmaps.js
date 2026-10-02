// RustMaps v4 API (free key from rustmaps.com): heatmap tile layers and monument positions for procedural maps.
const fs = require('fs');
const path = require('path');

const API = 'https://api.rustmaps.com/v4';
const TTL = 12 * 3600e3;
const pendingGen = new Map();

const pick = d => ({
    id: d.id, size: d.size, seed: d.seed, url: d.url || `https://rustmaps.com/map/${d.size}_${d.seed}`,
    imageUrl: d.imageUrl, tileBaseUrl: d.tileBaseUrl, isCustomMap: !!d.isCustomMap,
    heatMaps: (d.heatMaps || []).map(h => ({ name: h.name, url: h.url })),
    monuments: (d.monuments || []).map(m => ({ type: m.type, size: m.sizeCategory, icon: m.iconPath, x: m.coordinates?.x, y: m.coordinates?.y })),
    biomes: d.biomePercentages || null
});

// The public API doesn't list heatmaps (only rustmaps.com's own page does), but the tiles live on the CDN
// next to the map image as <map folder>/<layer>/tiles/{z}/{x}/{y}.png. Probe which layers this map has.
const HEAT_LAYERS = ['Nodes', 'Hemp', 'Berries', 'PlayerSpawns', 'Bears', 'Boars', 'Horses', 'Tigers', 'Panthers', 'Crocodiles', 'Snakes', 'Tier0', 'Tier1', 'Tier2'];

async function discoverHeatMaps(imageUrl) {
    if (!imageUrl) return [];
    const base = imageUrl.slice(0, imageUrl.lastIndexOf('/') + 1);
    const found = await Promise.all(HEAT_LAYERS.map(async name => {
        const url = `${base}${name.toLowerCase()}/tiles/`;
        try {
            const res = await fetch(`${url}-2/0/0.png`, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
            return res.ok ? { name, url } : null;
        } catch {
            return null;
        }
    }));
    return found.filter(Boolean);
}

async function call(key, url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        // Only declare JSON when there is a body: RustMaps 400s a bodiless GET that says it's JSON.
        headers: { 'X-API-Key': key, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
        signal: AbortSignal.timeout(15000)
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

// Returns { ready: true, map } or { ready: false, state } — generation of a new seed takes a few minutes.
async function lookup(key, size, seed, cacheDir) {
    if (!key) return { ready: false, state: 'no-key' };
    // RustMaps seeds are 32-bit signed; anything outside that isn't a world seed it can look up.
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) return { ready: false, state: 'unknown-seed' };
    const file = path.join(cacheDir, `${size}_${seed}.json`);
    try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Date.now() - cached.at < TTL) return { ready: true, map: cached.map };
    } catch { /* not cached */ }

    const r = await call(key, `${API}/maps/${size}/${seed}?staging=false`);
    if (r.status === 401 || r.status === 403) throw new Error('RustMaps rejected the API key');
    if (r.status === 200 && r.body?.data) {
        const map = pick(r.body.data);
        if (!map.heatMaps.length) map.heatMaps = await discoverHeatMaps(map.imageUrl);
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ at: Date.now(), map }));
        return { ready: true, map };
    }
    // 409 = generation already running; 404 = never generated, so ask RustMaps to generate it once.
    if (r.status === 409) return { ready: false, state: 'generating' };
    if (r.status === 404) {
        const k = `${size}_${seed}`;
        if (!pendingGen.has(k) || Date.now() - pendingGen.get(k) > 10 * 60e3) {
            pendingGen.set(k, Date.now());
            const g = await call(key, `${API}/maps`, { method: 'POST', body: JSON.stringify({ size, seed, staging: false }) });
            if (g.status === 401 || g.status === 403) throw new Error('RustMaps rejected the API key');
            if (g.status === 429) return { ready: false, state: 'rate-limited' };
        }
        return { ready: false, state: 'generating' };
    }
    throw new Error(`RustMaps answered ${r.status}`);
}

// Custom maps are identified by their RustMaps id rather than seed/size.
async function lookupById(key, id, cacheDir) {
    if (!key) return { ready: false, state: 'no-key' };
    if (!/^[0-9a-f]{32}$/i.test(id)) return { ready: false, state: 'unknown-seed' };
    const file = path.join(cacheDir, `id_${id}.json`);
    try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Date.now() - cached.at < TTL) return { ready: true, map: cached.map };
    } catch { /* not cached */ }

    const r = await call(key, `${API}/maps/${id}`);
    if (r.status === 401 || r.status === 403) throw new Error('RustMaps rejected the API key');
    if (r.status === 404) return { ready: false, state: 'not-on-rustmaps' };
    if (r.status !== 200 || !r.body?.data) throw new Error(`RustMaps answered ${r.status}`);
    const map = pick(r.body.data);
    if (!map.heatMaps.length) map.heatMaps = await discoverHeatMaps(map.imageUrl);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), map }));
    return { ready: true, map };
}

module.exports = { lookup, lookupById };
