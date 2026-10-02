// Copies servers already paired in rustplusplus (instances/*.json) into data/servers.json.
const fs = require('fs');
const path = require('path');

const instancesDir = process.argv[2] || path.join(__dirname, '..', '..', 'rustplusplus', 'instances');
const serversFile = path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data'), 'servers.json');

let store = { active: null, list: {} };
try { store = JSON.parse(fs.readFileSync(serversFile, 'utf8')); } catch { /* first run */ }

let added = 0;
for (const file of fs.readdirSync(instancesDir).filter(f => f.endsWith('.json'))) {
    const instance = JSON.parse(fs.readFileSync(path.join(instancesDir, file), 'utf8'));
    const full = Object.values(instance.serverList || {}).map(s => ({
        name: s.title, ip: s.serverIp, port: s.appPort, playerId: s.steamId, playerToken: s.playerToken
    }));
    const lite = Object.values(instance.serverListLite || {}).flatMap(users => Object.values(users)).map(s => ({
        name: null, ip: s.serverIp, port: s.appPort, playerId: s.steamId, playerToken: s.playerToken
    }));
    for (const s of [...full, ...lite]) {
        if (!s.ip || !s.port || !s.playerId || !s.playerToken) continue;
        const id = `${s.ip}:${s.port}`;
        if (store.list[id]?.name && !s.name) s.name = store.list[id].name;
        store.list[id] = {
            id, name: s.name || id, ip: s.ip, port: Number(s.port),
            playerId: String(s.playerId), playerToken: String(s.playerToken)
        };
        added++;
        console.log(`imported ${store.list[id].name}`);
    }
}

fs.mkdirSync(path.dirname(serversFile), { recursive: true });
fs.writeFileSync(serversFile, JSON.stringify(store, null, 2));
console.log(`${added} server(s) imported into ${serversFile}. Restart the app to load them.`);
