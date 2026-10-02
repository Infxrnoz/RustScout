'use strict';

(() => {

    const needServer = () => {
        if (S.snapshot && !S.preview) return true;
        toast({ kind: 'alarm', label: 'Decay timer', text: 'Connect a paired server first — timers are saved per server.' });
        return false;
    };

    function fillDecayOptions() {
        $('#decay-options').innerHTML = S.game.decay.map(d => `<option value="${esc(d.name)}">`).join('');
    }

    function decayPreview() {
        const d = S.game.decay.find(x => x.name.toLowerCase() === $('#decay-name').value.trim().toLowerCase());
        const hp = Number($('#decay-hp').value);
        if (!d) { $('#decay-preview').textContent = 'Pick something from the list.'; return null; }
        $('#decay-hp').placeholder = `HP (max ${d.hp})`;
        const cur = Number.isFinite(hp) && hp > 0 ? Math.min(hp, d.hp) : d.hp;
        const secs = d.s * cur / d.hp;
        $('#decay-preview').innerHTML = `${esc(d.name)}: ${d.hp} HP decays fully in <b>${dur(d.s * 1000)}</b>. At ${cur} HP it falls in <b>${dur(secs * 1000)}</b>.`;
        return { d, cur, secs };
    }

    function renderTimers() {
        const timers = S.pins.filter(p => p.kind === 'decay').sort((a, b) => a.end - b.end);
        $('#decay-timers').innerHTML = timers.map(t => {
            const left = t.end - Date.now();
            const pct = Math.max(0, Math.min(100, left / t.total * 100));
            const placed = Number.isFinite(t.x);
            return `<div class="item flat decay ${left < 1800e3 ? 'low' : ''}">
                <div class="grow"><div class="title">${esc(t.label || t.name)}${placed ? ` <span class="muted">${gridOf(t.x, t.y)}</span>` : ''}</div>
                <div class="sub">${esc(t.name)} · <b class="pin-count" data-end="${t.end}">${Pins.countdown(left)}</b></div>
                <div class="bar"><i style="width:${pct}%"></i></div></div>
                <button class="icon-btn" data-${placed ? 'go' : 'place'}="${t.id}" title="${placed ? 'Show on map' : 'Place on map'}">${placed ? '◎' : '📍'}</button>
                <button class="icon-btn" data-del="${t.id}" title="Delete">✕</button></div>`;
        }).join('') || empty(S.snapshot && !S.preview ? 'No decay timers running.' : 'Connect a paired server to keep decay timers.');
        wireList('#decay-timers');

        const pins = S.pins.filter(p => p.kind !== 'decay');
        $('#pin-list').innerHTML = pins.map(p => `<div class="item flat">
                <span class="pin-dot" style="background:${p.color}"></span>
                <div class="grow"><div class="title">${esc(p.label || 'Pin')} <span class="muted">${gridOf(p.x, p.y)}</span></div>${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}</div>
                <button class="icon-btn" data-go="${p.id}" title="Show on map">◎</button>
                <button class="icon-btn" data-del="${p.id}" title="Delete">✕</button></div>`).join('') || empty('No pins yet.');
        wireList('#pin-list');
    }

    function wireList(sel) {
        $$(`${sel} [data-del]`).forEach(b => b.onclick = () => Pins.remove(b.dataset.del));
        $$(`${sel} [data-go]`).forEach(b => b.onclick = () => Pins.locate(b.dataset.go));
        $$(`${sel} [data-place]`).forEach(b => b.onclick = () => Pins.pick(pos => Pins.save(b.dataset.place, pos)));
    }

    async function startTimer(pos) {
        const p = decayPreview();
        if (!p || !needServer()) return;
        const made = await Pins.add({ kind: 'decay', name: p.d.name, hp: p.cur, label: $('#decay-label').value.trim(), ...pos });
        if (made) { $('#decay-label').value = ''; $('#decay-hp').value = ''; }
    }

    $('#decay-name').oninput = decayPreview;
    $('#decay-hp').oninput = decayPreview;
    $('#decay-form').onsubmit = e => { e.preventDefault(); startTimer({}); };
    $('#decay-place').onclick = () => {
        if (!$('#decay-form').reportValidity() || !decayPreview() || !needServer()) return;
        Pins.pick(pos => startTimer(pos));
    };

    const tabOpen = name => $(`#panel > section[data-panel="${name}"]`).classList.contains('active') && !$('#panel').classList.contains('collapsed');

    Scan.attach({
        button: $('#decay-scan'), drop: $('#decay-form'), active: () => tabOpen('tools'),
        onReject: msg => { $('#decay-scan-status').textContent = msg; },
        async onFiles([file]) {
            const status = $('#decay-scan-status');
            status.textContent = 'Reading screenshot… (first scan downloads the OCR engine, ~5 MB)';
            try {
                const { item, hp, max } = Scan.parseDecay(await Scan.text(file), S.game.decay);
                if (item) $('#decay-name').value = item.name;
                if (hp !== null) $('#decay-hp').value = hp;
                decayPreview();
                status.textContent = item || hp !== null
                    ? `Read: ${item ? item.name : 'unknown structure'}${hp !== null ? `, ${hp}/${max} HP` : ''}. Check it, then start the countdown.`
                    : 'Could not find a structure name or HP in that image. Crop closer to the hammer health bar and try again.';
            } catch (e) {
                status.textContent = e.message;
            }
        }
    });

    async function migrateLocalTimers() {
        const old = store.get('decayTimers', []);
        if (!old.length || !S.snapshot || S.preview) return;
        store.set('decayTimers', []);
        for (const t of old) if (t.end > Date.now()) await Pins.add({ kind: 'decay', name: t.name, label: t.label, end: t.end });
    }

    bus.on('pins', renderTimers);
    bus.on('reset', () => { renderTimers(); migrateLocalTimers(); });
    bus.on('mapLoaded', renderTimers);

    const craftable = () => Object.keys(S.game.craft).filter(id => S.items[id]);

    function renderCraft() {
        const q = $('#craft-item').value.trim().toLowerCase();
        const qty = Math.max(1, Math.floor(Number($('#craft-qty').value)) || 1);
        const id = craftable().find(i => S.items[i].n.toLowerCase() === q);
        const out = $('#craft-result');
        if (!id) { out.innerHTML = q ? empty('No recipe for that item.') : ''; return; }
        const r = S.game.craft[id];
        const times = craftsFor(id, qty);
        const made = times * (r.n || 1);
        const direct = {};
        for (const [ing, n] of r.i) direct[ing] = n * times;
        const { raw } = craftRaw({ [id]: qty });
        const hasSubRecipes = r.i.some(([ing]) => S.game.craft[ing]);
        const rows = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([i, n]) =>
            `<div class="item flat">${icon(i, 'icon')}<div class="grow">${esc(itemName(i))}</div><b>${fmt(n)}</b></div>`).join('');
        out.innerHTML = `<div class="craft-head">${icon(id, 'icon lg')}<div><div class="title">${qty}× ${esc(itemName(id))}</div>
            <div class="sub">${r.wb ? `Workbench ${r.wb} · ` : ''}${times} craft${times > 1 ? 's' : ''}${r.n > 1 ? ` (${r.n} per craft${made > qty ? `, ${made} made` : ''})` : ''} · ${dur(r.t * times * 1000)}</div></div></div>
            <div class="raid-cat">Ingredients</div><div class="list">${rows(direct)}</div>
            ${hasSubRecipes ? `<div class="raid-cat">Broken down to raw</div><div class="list">${rows(raw)}</div>` : ''}`;
    }

    $('#craft-item').oninput = renderCraft;
    $('#craft-qty').oninput = renderCraft;

    bus.on('ready', () => {
        fillDecayOptions();
        $('#craft-options').innerHTML = craftable().map(id => `<option value="${esc(S.items[id].n)}">`).join('');
    });
})();
