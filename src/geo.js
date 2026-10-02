const GRID = 146.25;

const correctedSize = size => {
    const r = size % GRID;
    return r < 120 ? size - r : size + (GRID - r);
};

const letters = n => {
    let out = '';
    n += 1;
    while (n > 0) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
};

const gridOf = (x, y, mapSize) => {
    const size = correctedSize(mapSize);
    if (x < 0 || y < 0 || x > size || y > size) return 'Ocean';
    return letters(Math.floor(x / GRID)) + Math.max(0, Math.floor((size - y) / GRID));
};

const MONUMENT_NAMES = {
    AbandonedMilitaryBase: 'Abandoned Military Base', airfield_display_name: 'Airfield', arctic_base_a: 'Arctic Research Base',
    bandit_camp: 'Bandit Camp', dome_monument_name: 'The Dome', excavator: 'Giant Excavator', ferryterminal: 'Ferry Terminal',
    fishing_village_display_name: 'Fishing Village', gas_station: "Oxum's Gas Station", harbor_2_display_name: 'Harbor',
    harbor_display_name: 'Harbor', junkyard_display_name: 'Junkyard', large_fishing_village_display_name: 'Large Fishing Village',
    large_oil_rig: 'Large Oil Rig', launchsite: 'Launch Site', lighthouse_display_name: 'Lighthouse',
    military_tunnels_display_name: 'Military Tunnels', mining_outpost_display_name: 'Mining Outpost',
    mining_quarry_hqm_display_name: 'HQM Quarry', mining_quarry_stone_display_name: 'Stone Quarry',
    mining_quarry_sulfur_display_name: 'Sulfur Quarry', missile_silo_monument: 'Missile Silo', oil_rig_small: 'Oil Rig',
    outpost: 'Outpost', power_plant_display_name: 'Power Plant', satellite_dish_display_name: 'Satellite Dish',
    sewer_display_name: 'Sewer Branch', stables_a: 'Ranch', stables_b: 'Barn', supermarket: 'Supermarket',
    swamp_c: 'Swamp', train_yard_display_name: 'Train Yard', underwater_lab: 'Underwater Lab',
    water_treatment_plant_display_name: 'Water Treatment', jungle_ziggurat: 'Jungle Ziggurat', radtown: 'Radtown',
    apartmentcomplex: 'Apartment Complex'
};

const monumentName = token => {
    if (/^(train_tunnel|DungeonBase)/.test(token) || token.includes('/')) return null;
    if (MONUMENT_NAMES[token]) return MONUMENT_NAMES[token];
    return token.replace(/_display_name|_monument(_name)?$/g, '').replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
};

const describe = (x, y, mapMeta) => {
    if (!mapMeta) return '';
    const grid = gridOf(x, y, mapMeta.mapSize);
    let best = null;
    for (const m of mapMeta.monuments) {
        const name = monumentName(m.token);
        if (!name) continue;
        const d = Math.hypot(m.x - x, m.y - y);
        if (!best || d < best.d) best = { name, d };
    }
    return best && best.d < GRID * 1.5 ? `${best.name} (${grid})` : grid;
};

module.exports = { GRID, gridOf, monumentName, describe };
