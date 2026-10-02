'use strict';

(() => {
    function renderTeam() {
        const members = [...(S.team?.members || [])].sort((a, b) => b.isOnline - a.isOnline || b.isAlive - a.isAlive);
        const stats = S.teamLog?.members || {};
        const online = members.filter(m => m.isOnline).length;
        $('#team-summary').innerHTML = `<div><b>${online}</b><span>online</span></div><div><b>${members.length}</b><span>members</span></div>
            <div><b>${(S.teamLog?.deaths || []).filter(d => Date.now() - d.t < 86400e3).length}</b><span>deaths 24h</span></div>`;
        $('#team-list').innerHTML = members.map(p => {
            const st = stats[p.steamId] || {};
            const status = !p.isOnline ? `offline${st.lastOnline ? ` · seen ${ago(st.lastOnline)}` : ''}`
                : !p.isAlive ? 'dead' : `alive ${p.spawnTime ? dur(Date.now() - p.spawnTime * 1000) : ''}`;
            const role = p.steamId === S.team.leaderSteamId ? '<span class="tag gold">LEADER</span>' : '';
            const hasPos = p.x || p.y;
            return `<div class="item member ${p.isOnline ? '' : 'dim'}" data-x="${p.x}" data-y="${p.y}">
                <div class="player-dot ${!p.isOnline ? 'offline' : !p.isAlive ? 'dead' : ''}"></div>
                <div class="grow"><div class="title">${esc(p.name)} ${role}</div>
                <div class="sub">${status}${st.deaths ? ` · ${st.deaths} deaths` : ''}</div></div>
                <span class="grid">${hasPos ? gridOf(p.x, p.y) : ''}</span>
            </div>`;
        }).join('') || empty('No team info — you need to be in a team in game.');
        $$('#team-list .item').forEach(el => el.onclick = () => flyTo(+el.dataset.x, +el.dataset.y, 1));

        const log = S.teamLog?.log || [];
        const ICON = { teamDeath: '✕', teamOnline: '●', teamOffline: '○', teamRespawn: '↺' };
        $('#team-log').innerHTML = log.slice(0, 50).map(e => `
            <div class="log-row ${e.kind}"><span class="ic">${ICON[e.kind] || '·'}</span><span class="grow">${esc(e.text)}</span><span class="muted">${ago(e.t)}</span></div>`).join('')
            || empty('Team activity shows up here as it happens.');
    }

    bus.on('team', renderTeam);
    bus.on('reset', renderTeam);
})();
