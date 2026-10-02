const dgram = require('dgram');

const HEADER = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
const INFO = Buffer.concat([HEADER, Buffer.from('TSource Engine Query\0', 'latin1')]);
const RULES = challenge => Buffer.concat([HEADER, Buffer.from([0x56]), challenge]);

function exchange(ip, port, first, build, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const sock = dgram.createSocket('udp4');
        const parts = {};
        let done = false;
        const finish = (err, data) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            sock.close();
            err ? reject(err) : resolve(data);
        };
        const timer = setTimeout(() => finish(new Error('no response')), timeout);
        sock.on('error', e => finish(e));
        sock.on('message', msg => {
            const head = msg.readInt32LE(0);
            if (head === -1) {
                if (msg[4] === 0x41) return sock.send(build(msg.subarray(5, 9)), port, ip);
                return finish(null, msg.subarray(4));
            }
            if (head === -2) {
                const total = msg[8];
                parts[msg[9]] = msg.subarray(12);
                if (Object.keys(parts).length === total) {
                    const all = Buffer.concat([...Array(total).keys()].map(i => parts[i]));
                    finish(null, all.subarray(4));
                }
            }
        });
        sock.send(first, port, ip);
    });
}

class Reader {
    constructor(buf, off = 0) { this.buf = buf; this.off = off; }
    byte() { return this.buf[this.off++]; }
    short() { const v = this.buf.readUInt16LE(this.off); this.off += 2; return v; }
    string() {
        const end = this.buf.indexOf(0, this.off);
        const s = this.buf.toString('utf8', this.off, end < 0 ? this.buf.length : end);
        this.off = end < 0 ? this.buf.length : end + 1;
        return s;
    }
}

async function info(ip, port) {
    const b = await exchange(ip, port, INFO, c => Buffer.concat([INFO, c]));
    if (b[0] !== 0x49) throw new Error('unexpected info reply');
    const r = new Reader(b, 1);
    r.byte();
    const out = { name: r.string(), map: r.string(), folder: r.string(), game: r.string() };
    r.short();
    out.players = r.byte();
    out.maxPlayers = r.byte();
    r.byte(); r.byte(); r.byte(); r.byte(); r.byte();
    out.version = r.string();
    const edf = r.byte();
    if (edf & 0x80) { out.gamePort = r.short(); }
    if (edf & 0x10) { r.off += 8; }
    if (edf & 0x40) { r.short(); r.string(); }
    if (edf & 0x20) { out.keywords = r.string(); }
    return out;
}

async function rules(ip, port) {
    const b = await exchange(ip, port, RULES(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])), RULES);
    if (b[0] !== 0x45) throw new Error('unexpected rules reply');
    const r = new Reader(b, 1);
    const n = r.short();
    const out = {};
    for (let i = 0; i < n && r.off < b.length; i++) out[r.string()] = r.string();
    return out;
}

const PLAYERS = challenge => Buffer.concat([HEADER, Buffer.from([0x55]), challenge]);
async function players(ip, port) {
    const b = await exchange(ip, port, PLAYERS(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])), PLAYERS);
    if (b[0] !== 0x44) throw new Error('unexpected players reply');
    const r = new Reader(b, 1);
    const count = r.byte();
    const out = [];
    for (let i = 0; i < count && r.off < b.length; i++) {
        r.byte();
        const name = r.string();
        const score = b.readInt32LE(r.off); r.off += 4;
        const seconds = b.readFloatLE(r.off); r.off += 4;
        if (name) out.push({ name, score, seconds: Math.round(seconds) });
    }
    return out;
}

module.exports = { info, rules, players };
