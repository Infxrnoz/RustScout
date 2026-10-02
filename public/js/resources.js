'use strict';

const resources = (() => {
    const KEYS = [
        [/mining outpost/, 'miningoutpost'], [/large fishing|fishing village/, 'fishing'], [/^outpost$/, 'outpost'],
        [/bandit/, 'bandit'], [/harbou?r/, 'harbor'], [/satellite/, 'satellite'], [/sewer/, 'sewer'],
        [/large oil/, 'largeoil'], [/small oil|^oil ?rig$/, 'smalloil'], [/train ?yard/, 'trainyard'], [/airfield/, 'airfield'],
        [/ferry/, 'ferry'], [/power ?plant/, 'powerplant'], [/radtown/, 'radtown'], [/water treatment/, 'watertreatment'],
        [/launch/, 'launch'], [/military tunnel/, 'miltunnels'], [/missile silo/, 'silo'], [/junkyard/, 'junkyard'],
        [/excavator/, 'excavator'], [/arctic/, 'arctic'], [/gas station/, 'gas'], [/supermarket/, 'supermarket'],
        [/lighthouse/, 'lighthouse'], [/ranch|stables a/, 'ranch'], [/barn|stables/, 'barn'], [/dome/, 'dome'],
        [/underwater lab/, 'uwlab'], [/water well/, 'waterwell'], [/^cave/, 'cave']
    ];
    const keyOf = name => {
        const n = String(name).toLowerCase().replace(/_/g, ' ');
        return KEYS.find(([re]) => re.test(n))?.[1] ?? null;
    };

    const GREEN = ['harbor', 'satellite', 'sewer', 'airfield', 'ferry', 'powerplant', 'radtown', 'watertreatment', 'silo'];
    const BLUE = ['smalloil', 'trainyard', 'airfield', 'ferry', 'powerplant', 'radtown', 'watertreatment', 'largeoil', 'launch', 'miltunnels', 'silo'];
    const RED = ['largeoil', 'launch', 'miltunnels', 'silo'];
    const RECYCLERS = ['bandit', 'outpost', 'fishing', 'launch', 'miltunnels', 'airfield', 'powerplant', 'watertreatment', 'trainyard',
        'sewer', 'satellite', 'dome', 'harbor', 'junkyard', 'excavator', 'arctic', 'silo', 'ferry', 'radtown', 'largeoil', 'smalloil',
        'uwlab', 'gas', 'supermarket', 'miningoutpost', 'lighthouse', 'ranch', 'barn'];
    const SAFE = ['outpost', 'bandit', 'fishing'];
    const DIESEL = ['radtown', 'junkyard', 'dome', 'powerplant', 'airfield', 'watertreatment', 'smalloil', 'largeoil', 'miltunnels', 'silo'];

    const NO_SOURCE = 'Not available: neither Rust+ nor RustMaps publish where these are.';
    
    const TOPO = { Field: 1, Forest: 32, Forestside: 64, Swamp: 8192, Riverside: 32768, Lakeside: 131072 };
    const BLOCKED = 128 | 262144 | 16384 | 65536 | 1024 | 2097152 | 2048 | 524288; 
    const zone = (id, name, color, icon, rules, note) => ({ id, name, color, icon, zone: rules, note });
    const FOREST_PLANT = [{ biomes: [1, 2, 4], any: TOPO.Forest }];
    const hot = (id, name, layerName, color) => ({ id, name, heat: layerName, color, icon: HEAT_ICON[layerName] });
    const GROUPS = [
        ['Ores', [
            hot('h-nodes', 'All Ore Nodes', 'Nodes', '#ff8a3d'),
            { id: 'o-stone', name: 'Stone Ore', icon: 'stones', color: '#b9b4ad', ore: 'stone' },
            { id: 'o-metal', name: 'Metal Ore', icon: 'metal.ore', color: '#c98b5d', ore: 'metal' },
            { id: 'o-sulfur', name: 'Sulfur Ore', icon: 'sulfur.ore', color: '#f2d43c', ore: 'sulfur' },
            { id: 'o-hqm', name: 'HQM Ore', icon: 'hq.metal.ore', color: '#7fb0d9', ore: 'hqm' },
            { name: 'HQM Pickups', off: NO_SOURCE }
        ]],
        ['Gatherables', [
            hot('h-hemp', 'Hemp', 'Hemp', '#7fd04a'), hot('h-berries', 'Berries', 'Berries', '#e53950'),
            { id: 'diesel', name: 'Diesel', color: '#d4a017', icon: 'diesel_barrel', keys: DIESEL },
            zone('z-mushrooms', 'Mushrooms', '#c98a5a', 'mushroom', FOREST_PLANT, 'forest terrain in forest, tundra or jungle'),
            zone('z-crops', 'Crops', '#e8c547', 'corn', [{ biomes: [0, 1, 2, 4], any: TOPO.Riverside | TOPO.Lakeside }, ...FOREST_PLANT],
                'corn & pumpkins by rivers and lakes; potatoes in forest'),
            zone('z-roses', 'Roses', '#e0457b', 'rose', FOREST_PLANT, 'forest terrain in forest, tundra or jungle'),
            zone('z-orchids', 'Orchids', '#b57be0', 'orchid', FOREST_PLANT, 'forest terrain in forest, tundra or jungle'),
            zone('z-sunflowers', 'Sunflowers', '#f2c230', 'sunflower', FOREST_PLANT, 'forest terrain in forest, tundra or jungle'),
            zone('z-woodpiles', 'Woodpiles', '#9a6b3c', 'wood', [{ biomes: [1, 2, 3], any: TOPO.Field | TOPO.Forest | TOPO.Forestside | TOPO.Swamp }],
                'fields, forests and swamps in forest, tundra or snow'),
            { name: 'Beehives', off: 'Not available: beehives are player-placed, and wild hives have no spawn table in the game files, Rust+ or RustMaps.' }
        ]],
        ['Loot', [
            { id: 'green', name: 'Green Card', color: '#4caf50', icon: 'keycard_green', fac: 'card_green', keys: GREEN },
            { id: 'blue', name: 'Blue Card', color: '#3f8cff', icon: 'keycard_blue', fac: 'card_blue', keys: BLUE },
            { id: 'red', name: 'Red Card', color: '#e53935', icon: 'keycard_red', fac: 'card_red', keys: RED },
            { id: 'o-junkpile', name: 'Junkpiles', icon: 'scrap', color: '#a8a39a', ore: 'junkpile' },
            { id: 'o-divesite', name: 'Dive Sites', icon: 'diving.mask', color: '#2fb5d6', ore: 'divesite' },
            { name: 'Blueprint Fragments', off: 'Not available: fragments come from crate loot, not a map spawn.' }
        ]],
        ['Monuments', [
            { id: 'recycler', name: 'Recyclers', color: '#7fd04a', fac: 'recycler', keys: RECYCLERS },
            { id: 'f-research', name: 'Research Tables', icon: 'research.table', color: '#5fa8ff', fac: 'research' },
            { id: 'f-refinery', name: 'Refineries', icon: 'small.oil.refinery', color: '#e07b39', fac: 'refinery' },
            { id: 'f-turret', name: 'Turrets', icon: 'autoturret', color: '#ff5252', fac: 'turret' },
            { id: 'f-sam', name: 'SAM Sites', icon: 'samsite', color: '#ff9e40', fac: 'sam' },
            { id: 'f-pumpjack', name: 'Pumpjacks', icon: 'mining.pumpjack', color: '#9c7c4b', fac: 'pumpjack' },
            { id: 'f-repair', name: 'Repair Benches', icon: 'box.repair.bench', color: '#c0c0c0', fac: 'repair' },
            { id: 'f-workbench', name: 'Workbenches', icon: 'workbench1', color: '#b98c5a', fac: 'workbench' },
            { id: 'safe', name: 'Safe Zones', color: '#9bdcff', keys: SAFE },
            { id: 'waterwell', name: 'Water Wells', color: '#3fa9f5', icon: 'water', keys: ['waterwell'], rmOnly: true },
            { id: 'cave', name: 'Caves', color: '#b08a5a', keys: ['cave'], rmOnly: true },
            { id: 'h-spawns', name: 'Player Spawns', heat: 'PlayerSpawns', color: '#c9c9c9' }
        ]],
        ['Wildlife', [
            hot('h-bears', 'Bears', 'Bears', '#a0643c'), hot('h-boars', 'Boars', 'Boars', '#d9907a'),
            hot('h-horses', 'Horses', 'Horses', '#c8a46e'), hot('h-tigers', 'Tigers', 'Tigers', '#ff9933'),
            hot('h-panthers', 'Panthers', 'Panthers', '#8f7fd0'), hot('h-crocs', 'Crocodiles', 'Crocodiles', '#5fa05f'),
            hot('h-snakes', 'Snakes', 'Snakes', '#b8c84a'),
            zone('z-polarbears', 'Polar Bears', '#3fa4ff', 'bearmeat', [{ biomes: [3] }], 'anywhere in the snow biome'),
            zone('z-chickens', 'Chickens', '#f5e6c4', 'chicken.raw', [{ biomes: [1] }], 'anywhere in the forest biome'),
            zone('z-stags', 'Stags', '#c58a52', 'deermeat.raw', [{ biomes: [1, 2, 4] }], 'forest, tundra and jungle biomes'),
            zone('z-wolves', 'Wolves', '#9aa3ad', 'wolfmeat.raw', [{ biomes: [0, 1, 2] }], 'desert, forest and tundra biomes'),
            { name: 'Sharks', icon: 'fish.smallshark', off: NO_SOURCE }
        ]]
    ];
    const FILTERS = GROUPS.flatMap(([, items]) => items).filter(f => f.id);

    const layer = L.layerGroup();
    let enabled = new Set(store.get('resourceFilters', []));

    function monuments() {
        if (!S.mapMeta) return [];
        const half = S.mapMeta.mapSize / 2;
        const rm = heat.info?.state === 'ready' ? heat.info.map.monuments : null;
        if (rm) return rm.filter(m => Number.isFinite(m.x)).map(m => ({ name: m.type, x: m.x + half, y: m.y + half }));
        return (S.mapMeta.monuments || []).filter(m => monumentName(m.token)).map(m => ({ name: monumentName(m.token), x: m.x, y: m.y }));
    }

    const heatLayer = name => heat.info?.state === 'ready' ? heat.info.map.heatMaps.find(h => h.name === name) : null;
    let drawToken = 0;

    const terrainState = { url: null, state: 'none', grid: null, error: null };
    const zoneCache = new Map();

    async function loadTerrain(meta) {
        const url = meta?.levelUrl || null;
        if (url === terrainState.url && terrainState.state !== 'error') return;
        Object.assign(terrainState, { url, grid: null, ores: null, facilities: null, error: null, state: url ? 'loading' : 'none' });
        render();
        if (!url) return;
        try {
            const res = await fetch(`/api/terrain?url=${encodeURIComponent(url)}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
            const buf = await res.arrayBuffer();
            if (terrainState.url !== url) return;
            const view = new DataView(buf);
            const resN = view.getUint32(0, true), size = view.getUint32(4, true);
            const bc = view.getUint32(8, true), sc = view.getUint32(12, true), N = resN * resN;
            const biomeW = new Uint8Array(buf, 16, N * bc);
            const splatW = new Uint8Array(buf, 16 + N * bc, N * sc);
            const topoAt = 16 + N * (bc + sc);
            const topo = new Int32Array(buf.slice(topoAt, topoAt + N * 4));
            const oreAt = topoAt + N * 4;
            const KINDS = ['stone', 'metal', 'sulfur', 'hqm', 'junkpile', 'divesite'];
            const ores = buf.byteLength >= oreAt + N * 16
                ? Object.fromEntries(KINDS.filter((k, n) => buf.byteLength >= oreAt + (n + 1) * N * 4)
                    .map((k, n) => [k, new Float32Array(buf.slice(oreAt + n * N * 4, oreAt + (n + 1) * N * 4))]))
                : null;
            terrainState.facilities = await fetch(`/api/facilities?url=${encodeURIComponent(url)}`).then(r => r.ok ? r.json() : null).catch(() => null);
            if (terrainState.url !== url) return;
            const biome = new Uint8Array(N);
            for (let i = 0; i < N; i++) {
                let best = 0;
                for (let c = 1; c < bc; c++) if (biomeW[c * N + i] > biomeW[best * N + i]) best = c;
                biome[i] = best;
            }
            terrainState.grid = { res: resN, size, bc, sc, biome, topo };
            terrainState.ores = ores ? { res: resN, size, values: ores } : null;
            terrainState.state = 'ready';
        } catch (e) {
            if (terrainState.url !== url) return;
            Object.assign(terrainState, { state: 'error', error: e.message });
        }
        render();
        draw();
        heat.render();
    }

    function oreGrid(kind) {
        const o = terrainState.ores;
        return o ? { res: o.res, size: o.size, values: o.values[kind] } : null;
    }

    function zoneOverlay(f) {
        const key = `${terrainState.url}|${f.id}`;
        if (zoneCache.has(key)) return zoneCache.get(key);
        const { res, biome, topo } = terrainState.grid;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = res;
        const g = canvas.getContext('2d');
        const img = g.createImageData(res, res);
        const [r, gr, b] = f.color.match(/\w\w/g).map(h => parseInt(h, 16));
        let cells = 0;
        for (let z = 0; z < res; z++) {
            for (let x = 0; x < res; x++) {
                const i = z * res + x;
                if (topo[i] & BLOCKED) continue;
                const hit = f.zone.some(rule => rule.biomes.includes(biome[i]) && (!rule.any || (topo[i] & rule.any)));
                if (!hit) continue;
                cells++;
                const o = ((res - 1 - z) * res + x) * 4; 
                img.data[o] = r; img.data[o + 1] = gr; img.data[o + 2] = b; img.data[o + 3] = 120;
            }
        }
        g.putImageData(img, 0, 0);
        const result = { url: canvas.toDataURL(), share: cells / (res * res) };
        zoneCache.set(key, result);
        return result;
    }

    async function draw() {
        const token = ++drawToken;
        layer.clearLayers();
        if (!S.mapMeta) return;
        const meta = S.mapMeta;

        if (terrainState.state === 'ready') {
            const half = meta.mapSize / 2;
            for (const f of FILTERS.filter(x => x.zone && enabled.has(x.id))) {
                const z = zoneOverlay(f);
                L.imageOverlay(z.url, [[-half, -half], [half, half]], { pane: 'heat', opacity: 0.85, className: 'zone-overlay' }).addTo(layer);
            }
        }

        for (const f of FILTERS.filter(x => x.ore && enabled.has(x.id))) {
            const grid = oreGrid(f.ore);
            if (!grid) continue;
            const o = gridDensity(`${meta.levelUrl}|ore:${f.ore}`, grid.values, grid.res, grid.size);
            for (const p of o.hotspots.slice(0, 15)) {
                L.marker([p.lat, p.lng], {
                    icon: L.divIcon({ className: '', html: `<div class="hot-pin" style="--c:${f.color}">${shortIcon(f.icon, '')}</div>`, iconSize: [0, 0] }),
                    zIndexOffset: 400
                }).bindTooltip(`${esc(f.name)} hotspot · ${gridOf(...Object.values(fromLatLng(L.latLng(p.lat, p.lng))))}<br>${Math.round(p.v * 100)}% of the best spot`, { direction: 'top' })
                    .addTo(layer);
            }
        }

        for (const f of FILTERS.filter(x => x.heat && enabled.has(x.id))) {
            const h = heatLayer(f.heat);
            if (!h) continue;
            const overlay = await densityOverlay(h.url, meta.mapSize).catch(() => null);
            if (token !== drawToken || S.mapMeta !== meta || !overlay) return;
            for (const p of overlay.hotspots.slice(0, 15)) {
                const inner = f.icon ? shortIcon(f.icon, '') : `<b>${esc(f.name[0])}</b>`;
                L.marker([p.lat, p.lng], {
                    icon: L.divIcon({ className: '', html: `<div class="hot-pin" style="--c:${f.color}">${inner}</div>`, iconSize: [0, 0] }),
                    zIndexOffset: 400
                }).bindTooltip(`${esc(f.name)} hotspot · ${gridOf(...Object.values(fromLatLng(L.latLng(p.lat, p.lng))))}<br>${Math.round(p.v * 100)}% of peak density`, { direction: 'top' })
                    .addTo(layer);
            }
        }

        const facs = terrainState.facilities;
        if (facs) {
            for (const f of FILTERS.filter(x => x.fac && enabled.has(x.id))) {
                for (const p of facs.filter(x => x.t === f.fac)) {
                    const inner = f.icon ? shortIcon(f.icon, '') : '';
                    L.marker(toLatLng(p.x, p.y), {
                        icon: L.divIcon({ className: '', html: `<div class="fac-pin" style="--c:${f.color}">${inner}</div>`, iconSize: [0, 0] }),
                        zIndexOffset: 450
                    }).bindTooltip(`${esc(f.name.replace(/s$/, ''))} · ${esc(p.m.replace(/_/g, ' '))}<br>${gridOf(p.x, p.y)}`, { direction: 'top' }).addTo(layer);
                }
            }
        }

        const list = monuments().map(m => ({ ...m, key: keyOf(m.name) })).filter(m => m.key);
        for (const m of list) {
            const hits = FILTERS.filter(f => f.keys && enabled.has(f.id) && f.keys.includes(m.key) && !(f.fac && facs));
            if (!hits.length) continue;
            const html = `<div class="res-pin">${hits.map(f => `<i style="--c:${f.color}" title="${esc(f.name)}"></i>`).join('')}</div>`;
            L.marker(toLatLng(m.x, m.y), { icon: L.divIcon({ className: '', html, iconSize: [0, 0] }), zIndexOffset: 500 })
                .bindTooltip(`${esc(m.name)}<br>${hits.map(f => esc(f.name)).join(' · ')}`, { direction: 'top' })
                .addTo(layer);
        }
        layer.addTo(map);
    }

    function rmMissing() {
        if (S.mapMeta?.mapFile) return 'RustMaps heatmaps need a live server (its seed); for a map file, use the ore and spawn-zone filters.';
        return {
            'no-key': 'Needs a RustMaps API key (Settings → Integrations).',
            custom: 'This server runs a custom map that isn’t on RustMaps, so RustMaps has no data for it.',
            'not-on-rustmaps': 'This server runs a custom map that isn’t on RustMaps, so RustMaps has no data for it.',
            generating: 'RustMaps is still generating this map — try again in a few minutes.',
            'rate-limited': 'RustMaps is rate-limiting requests — try again in a few minutes.',
            'unknown-seed': 'The server didn’t report its map seed, so RustMaps can’t be looked up.',
            loading: 'Loading RustMaps data…',
            error: `RustMaps lookup failed: ${heat.info?.error || 'unknown error'}`
        }[heat.info?.state] || 'Needs RustMaps data for this map.';
    }

    function render() {
        const box = $('#res-body');
        if (!box) return;
        const haveRm = heat.info?.state === 'ready';
        box.innerHTML = GROUPS.map(([title, items]) => `
            <div class="res-group">${title}</div>
            <div class="res-grid">${items.map(f => {
                const needsRm = (f.rmOnly && !haveRm) || (f.heat && !heatLayer(f.heat));
                const zoneOff = (f.zone || f.ore) && (terrainState.state !== 'ready' || (f.ore && !terrainState.ores)) && ({
                    ready: 'Ore model unavailable for this map file.',
                    none: 'Needs the server’s map file. Custom-map servers publish one; procedural servers don’t.',
                    loading: 'Reading the server’s map file…',
                    error: `Couldn’t read the map file: ${terrainState.error}`
                }[terrainState.state]);
                const facOff = f.fac && !f.keys && !terrainState.facilities && ({
                    loading: 'Reading the server’s map file…',
                    error: `Couldn’t read the map file: ${terrainState.error}`
                }[terrainState.state] || 'Needs the server’s map file (custom-map servers publish one; procedural servers don’t).');
                const off = f.off || zoneOff || facOff || (needsRm ? (haveRm ? 'RustMaps has no data for this on this map.' : rmMissing()) : '');
                const tip = off || (f.fac && terrainState.facilities ? `Exact ${f.name.toLowerCase()} positions from this server's map file and Rust's monument layouts.`
                    : f.ore ? `Marks where ${f.name.toLowerCase().replace(/ ore$/, '')} ${/ore$/i.test(f.name) ? 'nodes are' : 'are'} most likely, from this server's map file and Rust's spawn tables.`
                    : f.heat ? `Marks the densest ${f.name.toLowerCase()} spawn spots from RustMaps.`
                    : f.zone ? `Shades where ${f.name.toLowerCase()} can spawn: ${f.note}. Exact spots are random.` : '');
                const swatch = f.icon ? shortIcon(f.icon, '') : f.color ? `<i style="--c:${f.color}"></i>` : '<i class="none"></i>';
                return `<label class="res-item ${off ? 'off' : ''}" title="${esc(tip)}">
                    <input type="checkbox" ${off ? 'disabled' : ''} data-res="${f.id || ''}" ${f.id && enabled.has(f.id) && !off ? 'checked' : ''}>
                    ${swatch}<span>${esc(f.name)}</span></label>`;
            }).join('')}</div>`).join('');
        $$('#res-body input[data-res]:not([disabled])').forEach(cb => cb.onchange = () => {
            cb.checked ? enabled.add(cb.dataset.res) : enabled.delete(cb.dataset.res);
            store.set('resourceFilters', [...enabled]);
            draw();
        });
    }

    const showTab = tab => {
        $$('[data-restab]').forEach(b => b.classList.toggle('active', b.dataset.restab === tab));
        $('#res-body').hidden = tab !== 'markers';
        $('#heat-body').hidden = tab !== 'heat';
        store.set('resTab', tab);
    };
    $$('[data-restab]').forEach(b => b.onclick = () => showTab(b.dataset.restab));
    showTab(store.get('resTab', 'markers'));

    bus.on('mapLoaded', () => { draw(); render(); loadTerrain(S.mapMeta); });
    bus.on('heatReady', () => { draw(); render(); });
    bus.on('ready', render);

    return { draw, render, oreGrid, active: () => enabled.size > 0 };
})();
