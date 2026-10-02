'use strict';

(() => {
    let data = null;
    let timer = null;
    const STATE_CLASS = { here: 'ok', rust: 'warn', online: 'muted', offline: 'muted' };

    const fmtHours = h => h == null ? null : `${h.toLocaleString()}h`;
    const age = t => t ? dur(Date.now() - t).split(' ')[0] : null;

    function memberCard(g, m) {
        const tags = [
            m.rustHours != null ? `<span class="tag">${fmtHours(m.rustHours)} Rust</span>` : (m.steamId && m.publicProfile === false ? '<span class="tag">private profile</span>' : ''),
            m.created ? `<span class="tag">acct ${age(m.created)}</span>` : m.memberSince ? `<span class="tag">since ${esc(m.memberSince)}</span>` : '',
            m.vac ? '<span class="tag red">VAC</span>' : '',
            m.gameBans ? `<span class="tag red">${m.gameBans} game ban${m.gameBans > 1 ? 's' : ''}</span>` : '',
            !m.steamId ? '<span class="tag">name only</span>' : ''
        ].join('');
        const status = m.state === 'here'
            ? `<b class="ok">On your server</b>${m.session != null ? ` · ${dur(m.session * 1000)}` : ''}`
            : `<span class="${STATE_CLASS[m.state]}">${esc(m.stateLabel)}</span>${m.lastHere ? ` · last here ${ago(m.lastHere)}` : ''}`;
        const avatar = m.avatar ? `<img class="avatar" src="${esc(m.avatar)}" alt="">` : `<div class="avatar ph">${esc((m.name || '?')[0])}</div>`;
        const link = m.steamId ? `<a href="https://steamcommunity.com/profiles/${esc(m.steamId)}" target="_blank" rel="noopener" class="muted small">Steam</a>` : '';
        return `<div class="item flat tracked ${m.state}">
            ${avatar}<span class="state-dot ${m.state}"></span>
            <div class="grow"><div class="title">${esc(m.name || 'Unknown')} ${link}</div>
            <div class="sub">${status}</div><div>${tags}</div></div>
            <button class="icon-btn" data-remove="${esc(g.id)}|${esc(m.key)}" title="Stop tracking">✕</button>
        </div>`;
    }

    function render() {
        const out = $('#tracked-body');
        if (!data) { out.innerHTML = empty('Loading…'); return; }
        const srv = data.server ? `Watching <b>${esc(data.server.name || data.server.ip)}</b>` : 'No live server connected — only Steam status is checked';
        $('#tracked-status').innerHTML = `${srv} · checked ${data.lastPoll ? ago(data.lastPoll) : 'not yet'}${data.hasKey ? '' : '<br><span class="flame">Add a Steam API key in Settings to see hours, bans and Steam status.</span>'}${data.error ? `<br><span class="flame">${esc(data.error)}</span>` : ''}`;

        out.innerHTML = data.groups.map(g => {
            const on = g.members.filter(m => m.state === 'here').length;
            return `<div class="group-card">
                <div class="row-between"><h3 style="margin:0">${esc(g.name)}</h3>
                <span class="${on ? 'ok' : 'muted'} small">${on}/${g.members.length} on server</span>
                <button class="icon-btn" data-del-group="${esc(g.id)}" title="Delete group">✕</button></div>
                <div class="list">${g.members.map(m => memberCard(g, m)).join('') || '<p class="hint">No players yet.</p>'}</div>
                <form class="row add-member" data-group="${esc(g.id)}">
                    <input placeholder="Steam profile link, SteamID64 or exact in-game name" required>
                    <button class="btn small" type="submit">Add</button>
                </form>
            </div>`;
        }).join('') || empty('Make a group (e.g. "Neighbours" or "Clan at F12"), then add players by Steam profile link or in-game name.');

        const q = ($('#tracked-filter')?.value || '').toLowerCase();
        const players = data.serverPlayers.filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => b.seconds - a.seconds);
        $('#tracked-server').innerHTML = players.slice(0, 200).map(p => `
            <div class="log-row"><span class="grow">${esc(p.name)}</span><span class="muted">${dur(p.seconds * 1000)}</span>
            ${data.groups.length ? `<button class="btn ghost small" data-track="${esc(p.name)}">Track</button>` : ''}</div>`).join('')
            || empty(data.server ? 'The server isn’t sharing its player list right now.' : 'Connect to a server to see who’s on.');
        $('#tracked-count').textContent = data.serverPlayers.length ? `${data.serverPlayers.length} online` : '';

        $('#tracked-history').innerHTML = data.history.map(h => `
            <div class="log-row"><span class="ic ${h.joined ? 'ok' : 'muted'}">${h.joined ? '●' : '○'}</span>
            <span class="grow">${esc(h.name)} <span class="muted">(${esc(h.group)})</span> ${h.joined ? 'joined' : 'left'}</span><span class="muted">${ago(h.t)}</span></div>`).join('')
            || empty('Joins and leaves of tracked players show up here.');

        bind();
    }

    function bind() {
        $$('#tracked-body [data-remove]').forEach(b => b.onclick = async () => {
            const [g, key] = b.dataset.remove.split('|');
            await api(`/api/tracked/groups/${encodeURIComponent(g)}/members/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
            load();
        });
        $$('#tracked-body [data-del-group]').forEach(b => b.onclick = async () => {
            if (!confirm('Delete this group?')) return;
            await api(`/api/tracked/groups/${encodeURIComponent(b.dataset.delGroup)}`, { method: 'DELETE' }).catch(() => {});
            load();
        });
        $$('#tracked-body .add-member').forEach(f => f.onsubmit = async e => {
            e.preventDefault();
            const input = f.querySelector('input');
            try {
                await api(`/api/tracked/groups/${encodeURIComponent(f.dataset.group)}/members`, { method: 'POST', body: { input: input.value } });
                input.value = '';
                load();
            } catch (err) { toast({ kind: 'alarm', label: 'Couldn’t add player', text: err.message }); }
        });
        const track = async (name, group) => {
            try {
                await api(`/api/tracked/groups/${encodeURIComponent(group.id)}/members`, { method: 'POST', body: { input: name } });
                toast({ kind: 'teamOnline', label: 'Tracking', text: `${name} → ${group.name}` });
                load();
            } catch (err) { toast({ kind: 'alarm', label: 'Couldn’t add player', text: err.message }); }
        };
        // One group: add straight away. Several: swap the button for a group picker.
        $$('#tracked-server [data-track]').forEach(b => b.onclick = () => {
            const groups = data.groups;
            if (groups.length === 1) return track(b.dataset.track, groups[0]);
            const pick = document.createElement('select');
            pick.className = 'track-pick';
            pick.innerHTML = `<option value="">Add to…</option>${groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}`;
            b.replaceWith(pick);
            pick.focus();
            pick.onchange = () => { const g = groups.find(x => x.id === pick.value); if (g) track(b.dataset.track, g); };
            pick.onblur = () => { if (!pick.value) pick.replaceWith(b); };
        });
    }

    async function load() {
        try { data = await api('/api/tracked'); } catch (e) { data = null; $('#tracked-body').innerHTML = empty(esc(e.message)); return; }
        render();
    }

    $('#tracked-new').onsubmit = async e => {
        e.preventDefault();
        const input = $('#tracked-new input');
        await api('/api/tracked/groups', { method: 'POST', body: { name: input.value } }).catch(() => {});
        input.value = '';
        load();
    };
    $('#tracked-refresh').onclick = async () => {
        $('#tracked-refresh').disabled = true;
        try { data = await api('/api/tracked/refresh', { method: 'POST' }); render(); } catch { /* shown on next load */ }
        $('#tracked-refresh').disabled = false;
    };
    $('#tracked-filter').oninput = render;

    bus.on('tab:tracked', () => {
        load();
        clearInterval(timer);
        timer = setInterval(() => $('#panel > section[data-panel="tracked"]').classList.contains('active') ? load() : clearInterval(timer), 30000);
    });
    bus.on('alert', a => { if (a.kind === 'trackedOnline' || a.kind === 'trackedOffline') load(); });
})();
