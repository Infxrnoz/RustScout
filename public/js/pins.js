'use strict';

// Your own map pins and decay timers. Stored by the backend per server, so decay alerts still
// reach Discord when no browser is open.
const Pins = (() => {
    const COLORS = ['#e4572e', '#f0c23c', '#7cc043', '#3fa9f5', '#9b6bff', '#ff5fa2', '#ffffff'];
    const ICONS = { pin: '📍', home: '🏠', skull: '💀', loot: '💰', raid: '💣', eye: '👁', flag: '🚩', star: '⭐' };
    const markers = new Map();
    let picking = null;

    const usable = () => S.mapMeta && !S.preview && S.snapshot;
    const left = p => p.end - Date.now();
    const countdown = ms => ms > 0 ? dur(ms) : 'GONE';

    function pinHtml(p) {
        if (p.kind === 'decay') {
            const ms = left(p);
            return `<div class="user-pin decay ${ms < 1800e3 ? 'low' : ''}" style="--c:${p.color}">
                <span class="glyph">⏳</span><span class="txt">${esc(p.label || p.name)}<b class="pin-count" data-end="${p.end}">${countdown(ms)}</b></span></div>`;
        }
        return `<div class="user-pin" style="--c:${p.color}"><span class="glyph">${ICONS[p.icon] || ICONS.pin}</span>${p.label ? `<span class="txt">${esc(p.label)}</span>` : ''}</div>`;
    }

    function popupHtml(p) {
        const grid = gridOf(p.x, p.y);
        const decay = p.kind === 'decay'
            ? `<div class="sub">${esc(p.name)} · ${p.hp}/${p.maxHp} HP when logged</div>
               <div class="sub">Falls in <b class="pin-count" data-end="${p.end}">${countdown(left(p))}</b> (${new Date(p.end).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })})</div>
               <form class="row pin-hp"><input type="number" min="1" max="${p.maxHp}" placeholder="New HP reading" class="num"><button class="btn small">Update</button></form>`
            : '';
        return `<div class="pin-pop"><div class="title">${esc(p.label || (p.kind === 'decay' ? p.name : 'Pin'))} <span class="muted">${grid}</span></div>
            ${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}${decay}
            <div class="row"><button class="btn ghost small" data-edit>Edit</button><button class="btn ghost small" data-del>Delete</button></div></div>`;
    }

    function render() {
        layers.pins.clearLayers();
        markers.clear();
        if (!usable()) return;
        for (const p of S.pins) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            const m = L.marker(toLatLng(p.x, p.y), {
                draggable: true, zIndexOffset: 900,
                icon: L.divIcon({ className: '', html: pinHtml(p), iconSize: [0, 0] })
            }).bindPopup(() => popupHtml(p), { minWidth: 220 });
            m.on('dragend', () => save(p.id, fromLatLng(m.getLatLng())));
            m.on('popupopen', e => wirePopup(p, e.popup.getElement()));
            m.addTo(layers.pins);
            markers.set(p.id, m);
        }
    }

    function wirePopup(p, el) {
        el.querySelector('[data-del]').onclick = () => { map.closePopup(); remove(p.id); };
        el.querySelector('[data-edit]').onclick = () => openForm(p.kind, p, p);
        const hp = el.querySelector('.pin-hp');
        if (hp) hp.onsubmit = e => { e.preventDefault(); save(p.id, { hp: hp.querySelector('input').value }); map.closePopup(); };
    }

    async function add(body) {
        try { return await api('/api/pins', { method: 'POST', body }); } catch (e) { toast({ kind: 'alarm', label: 'Pin', text: e.message }); return null; }
    }
    async function save(id, body) {
        try { await api(`/api/pins/${id}`, { method: 'PUT', body }); } catch (e) { toast({ kind: 'alarm', label: 'Pin', text: e.message }); }
    }
    async function remove(id) {
        try { await api(`/api/pins/${id}`, { method: 'DELETE' }); } catch (e) { toast({ kind: 'alarm', label: 'Pin', text: e.message }); }
    }

    // Small form inside a map popup, for a new pin (at pos) or editing an existing one.
    function openForm(kind, pos, existing) {
        const p = existing || {};
        const isDecay = kind === 'decay';
        const html = `<form class="pin-form">
            <div class="title">${existing ? 'Edit' : 'New'} ${isDecay ? 'decay timer' : 'pin'} <span class="muted">${gridOf(pos.x, pos.y)}</span></div>
            ${isDecay && !existing ? `<input name="name" list="decay-options" placeholder="Structure (e.g. Stone Wall)" required>
                <input name="hp" type="number" min="1" placeholder="Current HP (blank = full)">` : ''}
            <input name="label" maxlength="60" placeholder="Label${isDecay ? ' (optional)' : ' (e.g. Enemy base)'}" value="${esc(p.label || '')}">
            <input name="note" maxlength="300" placeholder="Note (optional)" value="${esc(p.note || '')}">
            ${isDecay ? '' : `<div class="pin-icons">${Object.entries(ICONS).map(([k, g]) =>
                `<label><input type="radio" name="icon" value="${k}" ${(p.icon || 'pin') === k ? 'checked' : ''}><span>${g}</span></label>`).join('')}</div>`}
            <div class="pin-colors">${COLORS.map(c =>
                `<label><input type="radio" name="color" value="${c}" ${(p.color || COLORS[0]) === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div>
            <button class="btn small">${existing ? 'Save' : isDecay ? 'Start countdown' : 'Drop pin'}</button></form>`;
        const popup = L.popup({ minWidth: 230 }).setLatLng(toLatLng(pos.x, pos.y)).setContent(html).openOn(map);
        const form = popup.getElement().querySelector('form');
        form.querySelector('input:not([type=radio])').focus();
        form.onsubmit = async e => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(form));
            map.closePopup();
            if (existing) await save(existing.id, body);
            else await add({ ...body, kind, x: pos.x, y: pos.y });
        };
    }

    // Right-click (long-press on touch) drops a pin or a decay timer.
    map.on('contextmenu', e => {
        if (!usable()) return;
        const pos = fromLatLng(e.latlng);
        const popup = L.popup({ className: 'pin-menu' }).setLatLng(e.latlng).setContent(
            `<div class="pin-choice"><button class="btn small" data-k="marker">📍 Drop pin</button><button class="btn small" data-k="decay">⏳ Decay timer</button></div>`).openOn(map);
        popup.getElement().querySelectorAll('[data-k]').forEach(b => b.onclick = () => openForm(b.dataset.k, pos));
    });

    // One-shot "click the map to place this" mode, used by the decay list's Place button.
    function pick(onPicked) {
        picking = onPicked;
        map.getContainer().classList.add('picking');
        toast({ kind: 'teamOnline', label: 'Place on map', text: 'Click the map where it is (Esc to cancel)' });
    }
    const stopPicking = () => { picking = null; map.getContainer().classList.remove('picking'); };
    map.on('click', e => {
        if (!picking) return;
        const fn = picking;
        stopPicking();
        fn(fromLatLng(e.latlng));
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && picking) stopPicking(); });

    function locate(id) {
        const p = S.pins.find(x => x.id === id);
        if (!p || !Number.isFinite(p.x)) return;
        flyTo(p.x, p.y, 1);
        setTimeout(() => markers.get(id)?.openPopup(), 650);
    }

    setInterval(() => {
        $$('.pin-count[data-end]').forEach(el => { el.textContent = countdown(Number(el.dataset.end) - Date.now()); });
    }, 1000);

    bus.on('pins', render);
    bus.on('mapLoaded', render);
    bus.on('reset', render);

    return { add, save, remove, pick, locate, countdown };
})();
