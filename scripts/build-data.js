const fs = require('fs');
const path = require('path');

const src = process.argv[2] || path.join(__dirname, '..', '..', 'rustplusplus', 'src', 'staticFiles');
const out = path.join(__dirname, '..', 'data');
fs.mkdirSync(out, { recursive: true });

const items = JSON.parse(fs.readFileSync(path.join(src, 'items.json'), 'utf8'));
const durability = JSON.parse(fs.readFileSync(path.join(src, 'rustlabsDurabilityData.json'), 'utf8'));

const compactItems = {};
for (const [id, item] of Object.entries(items)) compactItems[id] = { n: item.name, s: item.shortname };
fs.writeFileSync(path.join(out, 'items.json'), JSON.stringify(compactItems));

const TOOLS = {
    rocket: '-742865266',
    c4: '1248356124',
    satchel: '-1878475007',
    explo: '-1321651331',
    beancan: '1840822026',
    hv: '-1841918730',
    f1: '143803535'
};

const TARGETS = [
    ['Building', 'Wooden Wall', 'block'],
    ['Building', 'Stone Wall', 'block'],
    ['Building', 'Metal Wall', 'block', 'Sheet Metal Wall'],
    ['Building', 'Armored Wall', 'block'],
    ['Building', 'Stone Foundation', 'block'],
    ['Building', 'Metal Foundation', 'block', 'Sheet Metal Foundation'],
    ['Building', 'Stone Floor', 'block'],
    ['Building', 'Metal Floor', 'block', 'Sheet Metal Floor'],
    ['Building', 'Stone Doorway', 'block'],
    ['Building', 'Metal Doorway', 'block', 'Sheet Metal Doorway'],
    ['Doors', 'Wooden Door', 'item'],
    ['Doors', 'Sheet Metal Door', 'item'],
    ['Doors', 'Garage Door', 'item'],
    ['Doors', 'Armored Door', 'item'],
    ['Doors', 'Wood Double Door', 'item'],
    ['Doors', 'Sheet Metal Double Door', 'item'],
    ['Doors', 'Armored Double Door', 'item'],
    ['Hatches', 'Ladder Hatch', 'item'],
    ['Hatches', 'Triangle Ladder Hatch', 'item'],
    ['External Walls', 'High External Wooden Wall', 'item'],
    ['External Walls', 'High External Stone Wall', 'item'],
    ['External Walls', 'High External Wooden Gate', 'item'],
    ['External Walls', 'High External Stone Gate', 'item'],
    ['Windows', 'Metal Window Bars', 'item'],
    ['Windows', 'Reinforced Glass Window', 'item'],
    ['Windows', 'Strengthened Glass Window', 'item'],
    ['Windows', 'Metal horizontal embrasure', 'item', 'Metal Horizontal Embrasure'],
    ['Windows', 'Metal Vertical embrasure', 'item', 'Metal Vertical Embrasure'],
    ['Deployables', 'Tool Cupboard', 'item'],
    ['Deployables', 'Auto Turret', 'item'],
    ['Deployables', 'Flame Turret', 'item']
];

const idByName = {};
for (const [id, item] of Object.entries(items)) idByName[item.name] = id;

const tools = {};
for (const [key, id] of Object.entries(TOOLS)) tools[key] = { id, name: items[id].name, shortname: items[id].shortname, sulfur: null };

const targets = [];
for (const [category, sourceName, kind, label] of TARGETS) {
    const itemId = kind === 'item' ? idByName[sourceName] : null;
    const rows = kind === 'block' ? durability.buildingBlocks[sourceName] : durability.items[itemId];
    if (!rows) {
        console.warn(`missing durability data: ${sourceName}`);
        continue;
    }

    const costs = {};
    for (const [key, toolId] of Object.entries(TOOLS)) {
        const row = rows.find(r => r.toolId === toolId && r.group === 'explosive' && r.which !== 'soft');
        if (!row) continue;
        costs[key] = { qty: row.quantity, time: row.time };
        if (row.sulfur && row.quantity) tools[key].sulfur ??= Math.round(row.sulfur / row.quantity);
    }

    targets.push({
        key: (label || sourceName).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: label || sourceName,
        category,
        shortname: itemId ? items[itemId].shortname : null,
        armored: /armored/i.test(sourceName),
        costs
    });
}

fs.writeFileSync(path.join(out, 'raid.json'), JSON.stringify({ tools, targets }, null, 1));

const read = name => JSON.parse(fs.readFileSync(path.join(src, name), 'utf8'));
const craftSrc = read('rustlabsCraftData.json');
const recycleSrc = read('rustlabsRecycleData.json');
const decaySrc = read('rustlabsDecayData.json');

const yields = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'craft-yields.json'), 'utf8')); } catch { return {}; } })();
const craft = {};
for (const [id, c] of Object.entries(craftSrc)) {
    if (!c?.ingredients?.length) continue;
    craft[id] = { i: c.ingredients.map(x => [x.id, x.quantity]), t: c.time, wb: Number(items[c.workbench]?.name.match(/Level (\d)/)?.[1]) || null };
    if (yields[id] > 1) craft[id].n = yields[id];
}

const recycle = {};
for (const [id, r] of Object.entries(recycleSrc)) {
    const pack = e => e?.yield?.length ? e.yield.map(y => [y.id, y.probability, y.quantity]) : null;
    const entry = { r: pack(r.recycler), s: pack(r['safe-zone-recycler']) };
    if (entry.r || entry.s) recycle[id] = entry;
}

const decay = [];
const pushDecay = (name, d, itemId = null) => {
    if (!d || !d.hp) return;
    const seconds = d.decay ?? d.decayOutside ?? d.decayInside;
    if (!seconds) return;
    decay.push({ name, id: itemId, hp: d.hp, s: seconds, inside: d.decayInside ?? null, outside: d.decayOutside ?? null });
};
for (const [name, d] of Object.entries(decaySrc.buildingBlocks)) pushDecay(name, d);
for (const [id, d] of Object.entries(decaySrc.items)) if (items[id]) pushDecay(items[id].name, d, id);
decay.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(path.join(out, 'game.json'), JSON.stringify({ craft, recycle, decay }));
console.log(`wrote ${Object.keys(craft).length} recipes, ${Object.keys(recycle).length} recyclables, ${decay.length} decay entries`);
console.log(`wrote ${Object.keys(compactItems).length} items, ${targets.length} raid targets`);
console.log(Object.fromEntries(Object.entries(tools).map(([k, t]) => [k, t.sulfur])));
