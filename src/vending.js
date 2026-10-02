const fs = require('fs');
const path = require('path');

const ITEMS = require('../data/items.json');

const idsFor = (...shortnames) => new Set(
    Object.keys(ITEMS).filter(id => shortnames.includes(ITEMS[id].s)).map(Number));

const SULFUR = idsFor('sulfur', 'sulfur.ore');
const TAGS = {
    scrap: idsFor('scrap'),
    cloth: idsFor('cloth'),
    lowgrade: idsFor('lowgradefuel'),
    comps: idsFor('metalblade', 'metalpipe', 'metalspring', 'gears', 'roadsigns', 'sewingkit', 'sheetmetal',
        'riflebody', 'semibody', 'smgbody', 'targeting.computer', 'techparts', 'cctv.camera', 'rope', 'tarp',
        'propanetank', 'fuse')
};

const orderKey = o => `${o.itemId}:${o.currencyId}:${o.costPerItem}:${o.quantity}:${o.itemIsBlueprint ? 1 : 0}`;

class VendingTracker {
    constructor(file) {
        this.file = file;
        this.dirty = false;
        this.state = { wipeTime: 0, machines: {}, sales: [] };
        try {
            this.state = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch { /* fresh server */ }
        this.saveTimer = setInterval(() => this.save(), 30000);
    }

    setWipe(wipeTime) {
        if (!wipeTime || this.state.wipeTime === wipeTime) return;
        this.state = { wipeTime, machines: {}, sales: [] };
        this.dirty = true;
    }

    // Returns the sales detected in this poll.
    update(markers, now = Date.now()) {
        const machines = markers.filter(m => m.type === 3);
        const known = Object.values(this.state.machines).filter(m => m.active).length;
        // An empty vending list while we know of many shops is an API hiccup, not a mass wipe.
        if (machines.length === 0 && known > 5) return [];

        const seen = new Set();
        const sales = [];
        for (const vm of machines) {
            const id = String(vm.id);
            seen.add(id);
            const prev = this.state.machines[id];
            const orders = {};
            for (const o of vm.sellOrders || []) orders[orderKey(o)] = o.amountInStock;

            if (prev) {
                for (const o of vm.sellOrders || []) {
                    const before = prev.orders[orderKey(o)];
                    const trades = before === undefined ? 0 : before - o.amountInStock;
                    if (trades <= 0) continue;
                    const sale = {
                        mid: id, t: now,
                        itemId: o.itemId, qty: trades * o.quantity,
                        currencyId: o.currencyId, paid: trades * o.costPerItem,
                        trades, bp: !!o.itemIsBlueprint
                    };
                    this.state.sales.push(sale);
                    sales.push({ ...sale, name: vm.name, x: vm.x, y: vm.y });
                }
            }

            this.state.machines[id] = {
                id, name: vm.name, x: vm.x, y: vm.y,
                firstSeen: prev?.firstSeen ?? now, lastSeen: now, active: true,
                orders
            };
        }

        for (const m of Object.values(this.state.machines)) {
            if (m.active && !seen.has(m.id)) m.active = false;
        }

        if (sales.length || machines.length) this.dirty = true;
        return sales;
    }

    targets(hours = 6, now = Date.now()) {
        const since = hours > 0 ? now - hours * 3600e3 : 0;
        const byMachine = {};
        for (const s of this.state.sales) {
            if (s.t < since) continue;
            const m = this.state.machines[s.mid];
            if (!m?.active) continue;
            const agg = byMachine[s.mid] ??= {
                id: m.id, name: m.name, x: m.x, y: m.y,
                sulfurCollected: 0, sulfurSold: 0, trades: 0, lastSale: 0,
                tags: { scrap: 0, cloth: 0, lowgrade: 0, comps: 0 }
            };
            agg.trades += s.trades;
            agg.lastSale = Math.max(agg.lastSale, s.t);
            // The owner collects the currency, so a shop taking sulfur as payment is stockpiling it.
            if (SULFUR.has(s.currencyId)) agg.sulfurCollected += s.paid;
            if (SULFUR.has(s.itemId)) agg.sulfurSold += s.qty;
            for (const [tag, ids] of Object.entries(TAGS)) {
                if (ids.has(s.currencyId)) agg.tags[tag] += s.paid;
            }
        }
        return Object.values(byMachine)
            .map(a => ({ ...a, score: a.sulfurCollected * 2 + a.sulfurSold + a.tags.comps * 5 + a.tags.scrap }))
            .sort((a, b) => b.sulfurCollected - a.sulfurCollected || b.score - a.score || b.lastSale - a.lastSale);
    }

    recentSales(limit = 100) {
        return this.state.sales.slice(-limit).reverse().map(s => {
            const m = this.state.machines[s.mid];
            return { ...s, name: m?.name, x: m?.x, y: m?.y };
        });
    }

    save() {
        if (!this.dirty) return;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.state));
        this.dirty = false;
    }

    close() {
        clearInterval(this.saveTimer);
        this.save();
    }
}

module.exports = { VendingTracker, SULFUR };
