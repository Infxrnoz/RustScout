const { Persisted } = require('./persist');

const TYPES = { 1: 'switch', 2: 'alarm', 3: 'monitor' };

class Devices {
    constructor(file) {
        this.store = new Persisted(file, { list: {} });
    }

    get list() {
        return this.store.data.list;
    }

    add(entityId, entityType, name) {
        const id = String(entityId);
        const existing = this.list[id];
        this.list[id] = {
            id,
            type: TYPES[entityType] || existing?.type || 'switch',
            name: existing?.name || name || TYPES[entityType] || 'Device',
            value: existing?.value ?? false,
            reachable: existing?.reachable ?? true,
            items: existing?.items ?? [],
            capacity: existing?.capacity ?? 0,
            hasProtection: existing?.hasProtection ?? false,
            protectionExpiry: existing?.protectionExpiry ?? 0,
            lastTrigger: existing?.lastTrigger ?? null
        };
        this.store.flush();
        return this.list[id];
    }

    apply(entityId, payload, now = Date.now()) {
        const d = this.list[String(entityId)];
        if (!d) return false;
        const wasOn = d.value;
        d.reachable = true;
        d.value = !!payload.value;
        if (d.type === 'monitor') {
            d.items = (payload.items || []).map(i => ({ itemId: i.itemId, quantity: i.quantity, bp: !!i.itemIsBlueprint }));
            d.capacity = payload.capacity || 0;
            d.hasProtection = !!payload.hasProtection;
            d.protectionExpiry = payload.protectionExpiry || 0;
        }
        const triggered = d.type === 'alarm' && d.value && !wasOn;
        if (triggered) d.lastTrigger = now;
        this.store.touch();
        return triggered;
    }

    markUnreachable(entityId) {
        const d = this.list[String(entityId)];
        if (d) {
            d.reachable = false;
            this.store.touch();
        }
    }

    rename(entityId, name) {
        const d = this.list[String(entityId)];
        if (!d) return false;
        d.name = String(name).slice(0, 40);
        this.store.flush();
        return true;
    }

    remove(entityId) {
        delete this.list[String(entityId)];
        this.store.flush();
    }
}

module.exports = { Devices };
