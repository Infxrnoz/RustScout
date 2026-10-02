// Tracked groups: watch other players (enemies, neighbours) for when they're on your server.
// Two signals, combined: the server's public player list (names + time connected, no key needed) and
// Steam's player summaries (needs the Steam key; public profiles also report the server they're playing on).
const crypto = require('crypto');
const { Persisted } = require('./persist');
const a2s = require('./a2s');
const steam = require('./steam');

const RUST_APPID = '252490';
const STATES = { here: 'On your server', rust: 'Playing Rust (other server)', online: 'Online in Steam', offline: 'Offline' };

class Tracking {
    constructor(file, { alert, getServer, getKey }) {
        this.store = new Persisted(file, { groups: [], status: {}, history: [] });
        this.alert = alert;
        this.getServer = getServer;
        this.getKey = getKey;
        this.serverPlayers = [];
        this.playersFrom = null;   // which server the list belongs to
        this.playersAt = 0;        // when it was last read successfully
        this.summaries = {};
        this.lastPoll = 0;
        this.error = null;
        this.timer = setInterval(() => this.poll().catch(e => { this.error = e.message; }), 60e3);
        setTimeout(() => this.poll().catch(() => {}), 5000);
    }

    get groups() { return this.store.data.groups; }

    memberKey(m) { return m.steamId || `name:${m.name.toLowerCase()}`; }

    async addGroup(name) {
        const g = { id: crypto.randomUUID().slice(0, 8), name: String(name || 'Group').slice(0, 40), members: [], created: Date.now() };
        this.groups.push(g);
        this.store.flush();
        return g;
    }

    removeGroup(id) {
        this.store.data.groups = this.groups.filter(g => g.id !== id);
        this.store.flush();
    }

    async addMember(groupId, input) {
        const g = this.groups.find(x => x.id === groupId);
        if (!g) throw new Error('group not found');
        const text = String(input || '').trim();
        if (!text) throw new Error('enter a Steam profile link, SteamID64 or in-game name');
        const steamId = await steam.resolveId(text, this.getKey());
        const member = steamId ? { steamId } : { name: text.slice(0, 64) };
        if (g.members.some(m => this.memberKey(m) === this.memberKey(member))) throw new Error('already in this group');
        g.members.push(member);
        this.store.flush();
        this.poll().catch(() => {});
        return member;
    }

    removeMember(groupId, key) {
        const g = this.groups.find(x => x.id === groupId);
        if (!g) return;
        g.members = g.members.filter(m => this.memberKey(m) !== key);
        this.store.flush();
    }

    async poll() {
        const server = this.getServer();
        const ids = [...new Set(this.groups.flatMap(g => g.members.map(m => m.steamId).filter(Boolean)))];
        const [players, sums] = await Promise.all([
            server?.queryPort ? a2s.players(server.ip, server.queryPort).catch(() => null) : null,
            this.getKey() ? steam.summaries(ids, this.getKey()).catch(e => { this.error = e.message; return null; }) : {}
        ]);
        const addr = server?.queryPort ? `${server.ip}:${server.queryPort}` : null;
        if (players) {
            this.serverPlayers = players;
            this.playersFrom = addr;
            this.playersAt = Date.now();
        } else if (!addr || this.playersFrom !== addr || Date.now() - this.playersAt > 5 * 60e3) {
            // No server, a different server, or no answer for 5 minutes: an old list would keep people "here" forever.
            this.serverPlayers = [];
        }
        if (sums) this.summaries = { ...this.summaries, ...sums };
        this.lastPoll = Date.now();
        const byName = new Map(this.serverPlayers.map(p => [p.name.toLowerCase(), p]));
        const gameAddr = server ? `${server.ip}:${server.gamePort}` : null;
        const now = Date.now();

        for (const g of this.groups) {
            for (const m of g.members) {
                const key = this.memberKey(m);
                const sum = m.steamId ? this.summaries[m.steamId] : null;
                const name = sum?.name || m.name || '';
                const listed = byName.get(name.toLowerCase());
                let state = 'offline';
                if (listed || (sum?.gameServer && gameAddr && sum.gameServer === gameAddr)) state = 'here';
                else if (sum?.gameId === RUST_APPID) state = 'rust';
                else if (sum && sum.state > 0) state = 'online';
                const prev = this.store.data.status[key] || {};
                const rec = this.store.data.status[key] = {
                    state, name, since: prev.state === state ? prev.since : now,
                    session: listed ? listed.seconds : null,
                    lastHere: state === 'here' ? now : prev.lastHere || null,
                    sessions: prev.sessions || []
                };
                if (prev.state && prev.state !== state && (prev.state === 'here' || state === 'here')) {
                    const joined = state === 'here';
                    if (joined) rec.sessions.push({ start: now, end: null });
                    else if (rec.sessions.length) rec.sessions[rec.sessions.length - 1].end = now;
                    rec.sessions = rec.sessions.slice(-50);
                    this.store.data.history.push({ t: now, group: g.name, name, joined });
                    this.store.data.history = this.store.data.history.slice(-300);
                    this.alert(joined ? 'trackedOnline' : 'trackedOffline', `${name} (${g.name}) ${joined ? 'joined' : 'left'} the server`);
                }
            }
        }
        this.store.touch();
    }

    async snapshot() {
        const key = this.getKey();
        const groups = await Promise.all(this.groups.map(async g => ({
            id: g.id, name: g.name,
            members: await Promise.all(g.members.map(async m => {
                const k = this.memberKey(m);
                const st = this.store.data.status[k] || { state: 'offline' };
                const sum = m.steamId ? this.summaries[m.steamId] : null;
                const prof = m.steamId ? await steam.profile(m.steamId, key).catch(() => null) : null;
                return {
                    key: k, steamId: m.steamId || null, name: sum?.name || prof?.name || m.name,
                    avatar: sum?.avatar || prof?.avatar || null, state: st.state, stateLabel: STATES[st.state],
                    since: st.since, session: st.session, lastHere: st.lastHere,
                    lastLogoff: sum?.lastLogoff || null, publicProfile: sum ? sum.public : prof ? !prof.private : null,
                    rustHours: prof?.rustHours ?? null, vac: prof?.vacBanned ?? null, gameBans: prof?.gameBans ?? null,
                    daysSinceBan: prof?.daysSinceBan ?? null, created: sum?.created || prof?.created || null, memberSince: prof?.memberSince || null,
                    sessions: (st.sessions || []).slice(-10)
                };
            }))
        })));
        return {
            groups, serverPlayers: this.serverPlayers, history: this.store.data.history.slice(-50).reverse(),
            lastPoll: this.lastPoll, error: this.error, hasKey: !!key, server: this.getServer()
        };
    }

    close() {
        clearInterval(this.timer);
        this.store.flush();
    }
}

module.exports = { Tracking };
