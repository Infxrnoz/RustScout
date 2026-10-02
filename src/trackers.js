const { Persisted } = require('./persist');
const { describe } = require('./geo');

const EVENT_TYPES = { 2: 'explosion', 4: 'ch47', 5: 'cargo', 6: 'crate', 8: 'heli', 9: 'vendor' };
const EVENT_NAMES = { explosion: 'Explosion', ch47: 'Chinook', cargo: 'Cargo Ship', crate: 'Locked Crate', heli: 'Patrol Helicopter', vendor: 'Travelling Vendor' };

// Online/offline/death/respawn transitions of team members, plus where each death happened.
class TeamTracker {
    constructor(file) {
        this.store = new Persisted(file, { deaths: [], log: [], members: {} });
        this.prev = null;
    }

    update(team, now, mapMeta) {
        const out = [];
        const members = team?.members || [];
        const prev = this.prev;
        this.prev = Object.fromEntries(members.map(m => [m.steamId, m]));
        if (!prev) return out; // first sample only establishes the baseline

        for (const m of members) {
            const before = prev[m.steamId];
            const rec = this.store.data.members[m.steamId] ??= { name: m.name, deaths: 0, onlineSince: null, lastOnline: null };
            rec.name = m.name;
            if (m.isOnline) rec.lastOnline = now;
            if (!before) continue;

            if (!before.isOnline && m.isOnline) {
                rec.onlineSince = now;
                out.push({ kind: 'teamOnline', name: m.name, steamId: m.steamId, text: `${m.name} came online` });
            }
            if (before.isOnline && !m.isOnline) {
                rec.onlineSince = null;
                out.push({ kind: 'teamOffline', name: m.name, steamId: m.steamId, text: `${m.name} went offline` });
            }
            if (before.isAlive && !m.isAlive) {
                // The dead member's reported position is their corpse; fall back to the last live sample.
                const x = m.x || before.x;
                const y = m.y || before.y;
                const where = describe(x, y, mapMeta);
                rec.deaths++;
                this.store.data.deaths.push({ t: now, steamId: m.steamId, name: m.name, x, y, where, alive: before.spawnTime ? now / 1000 - before.spawnTime : null });
                this.store.data.deaths = this.store.data.deaths.slice(-300);
                out.push({ kind: 'teamDeath', name: m.name, steamId: m.steamId, x, y, text: `${m.name} died at ${where}` });
            }
            if (!before.isAlive && m.isAlive && m.isOnline) {
                out.push({ kind: 'teamRespawn', name: m.name, steamId: m.steamId, text: `${m.name} respawned` });
            }
        }

        if (out.length) {
            this.store.data.log.push(...out.map(e => ({ t: now, kind: e.kind, text: e.text })));
            this.store.data.log = this.store.data.log.slice(-500);
            this.store.touch();
        }
        return out;
    }
}

// Spawn/despawn of map events, with "last seen" timers per event type.
class EventTracker {
    constructor(file) {
        this.store = new Persisted(file, { active: {}, last: {}, log: [] });
        this.primed = false;
    }

    update(markers, now, mapMeta) {
        const out = [];
        const active = this.store.data.active;
        const seen = new Set();

        for (const m of markers) {
            const type = EVENT_TYPES[m.type];
            if (!type) continue;
            const id = String(m.id);
            seen.add(id);
            if (active[id]) {
                active[id].x = m.x;
                active[id].y = m.y;
                continue;
            }
            active[id] = { id, type, since: now, x: m.x, y: m.y, where: describe(m.x, m.y, mapMeta) };
            if (!this.primed) continue; // events already running when we connected aren't news
            const last = this.store.data.last[type] ??= {};
            last.spawn = now;
            out.push({ kind: type, x: m.x, y: m.y, text: `${EVENT_NAMES[type]} ${type === 'explosion' ? 'at' : 'spawned at'} ${active[id].where}` });
        }

        for (const [id, e] of Object.entries(active)) {
            if (seen.has(id)) continue;
            delete active[id];
            const last = this.store.data.last[e.type] ??= {};
            last.despawn = now;
            last.duration = now - e.since;
            if (e.type !== 'explosion' && this.primed) {
                out.push({ kind: `${e.type}Gone`, x: e.x, y: e.y, text: `${EVENT_NAMES[e.type]} left the map (${Math.round((now - e.since) / 60000)}m)` });
            }
        }

        this.primed = true;
        if (out.length) {
            this.store.data.log.push(...out.map(e => ({ t: now, kind: e.kind, text: e.text })));
            this.store.data.log = this.store.data.log.slice(-500);
        }
        this.store.touch();
        return out;
    }

    snapshot() {
        return { active: Object.values(this.store.data.active), last: this.store.data.last, log: this.store.data.log.slice(-100).reverse() };
    }
}

// Server population samples for the pop graph (7 days, one sample per minute at most).
class PopTracker {
    constructor(file) {
        this.store = new Persisted(file, { samples: [] });
    }

    add(info, now) {
        const s = this.store.data.samples;
        if (s.length && now - s[s.length - 1][0] < 60000) return;
        s.push([now, info.players, info.queuedPlayers || 0, info.maxPlayers]);
        const cutoff = now - 7 * 86400e3;
        while (s.length && s[0][0] < cutoff) s.shift();
        this.store.touch();
    }
}

module.exports = { TeamTracker, EventTracker, PopTracker, EVENT_NAMES };
