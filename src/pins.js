const crypto = require('crypto');
const { Persisted } = require('./persist');

const COLORS = ['#e4572e', '#f0c23c', '#7cc043', '#3fa9f5', '#9b6bff', '#ff5fa2', '#ffffff'];
const ICONS = ['pin', 'home', 'skull', 'loot', 'raid', 'eye', 'flag', 'star'];
const clean = (s, n) => String(s ?? '').trim().slice(0, n);
const coord = v => v !== null && v !== '' && v !== undefined && Number.isFinite(+v) ? Math.round(+v * 10) / 10 : null;
const position = (x, y) => coord(x) !== null && coord(y) !== null ? { x: coord(x), y: coord(y) } : { x: null, y: null };

class Pins {
    constructor(file) {
        this.store = new Persisted(file, { pins: [] });
    }

    get list() { return this.store.data.pins; }

    add(body, decayTable) {
        const pin = {
            id: crypto.randomUUID().slice(0, 8),
            kind: body.kind === 'decay' ? 'decay' : 'marker',
            ...position(body.x, body.y),
            label: clean(body.label, 60),
            note: clean(body.note, 300),
            color: COLORS.includes(body.color) ? body.color : COLORS[0],
            icon: ICONS.includes(body.icon) ? body.icon : 'pin',
            created: Date.now()
        };
        if (pin.kind === 'decay') Object.assign(pin, this.decay(body, decayTable));
        else if (pin.x === null || pin.y === null) throw new Error('A map marker needs a position');
        this.list.push(pin);
        this.store.flush();
        return pin;
    }

    decay(body, table) {
        const d = table.find(x => x.name.toLowerCase() === String(body.name || '').trim().toLowerCase());
        if (!d) throw new Error('Unknown structure — pick one from the list');
        const hp = Number(body.hp) > 0 ? Math.min(Number(body.hp), d.hp) : d.hp;
        const end = Number(body.end) > Date.now() ? Number(body.end) : Date.now() + d.s * 1000 * hp / d.hp;
        return { name: d.name, hp, maxHp: d.hp, end: Math.round(end), total: d.s * 1000, warned: false };
    }

    update(id, body, decayTable) {
        const pin = this.list.find(p => p.id === id);
        if (!pin) throw new Error('No such pin');
        if ('label' in body) pin.label = clean(body.label, 60);
        if ('note' in body) pin.note = clean(body.note, 300);
        if (COLORS.includes(body.color)) pin.color = body.color;
        if (ICONS.includes(body.icon)) pin.icon = body.icon;
        if (coord(body.x) !== null && coord(body.y) !== null) { pin.x = coord(body.x); pin.y = coord(body.y); }
        if (pin.kind === 'decay' && (body.hp || body.name)) Object.assign(pin, this.decay({ name: pin.name, ...body }, decayTable));
        this.store.flush();
        return pin;
    }

    remove(id) {
        const before = this.list.length;
        this.store.data.pins = this.list.filter(p => p.id !== id);
        if (this.list.length !== before) this.store.flush();
    }

    due(warnMs) {
        const out = [];
        for (const p of this.list) {
            if (p.kind !== 'decay' || p.warned || p.end - Date.now() > warnMs) continue;
            p.warned = true;
            out.push(p);
        }
        if (out.length) this.store.touch();
        return out;
    }
}

module.exports = { Pins, COLORS, ICONS };
