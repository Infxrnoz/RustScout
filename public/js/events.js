'use strict';

(() => {
    const TIMER_TYPES = ['cargo', 'heli', 'ch47', 'crate', 'vendor'];
    const metaFor = key => Object.values(EVENT_META).find(m => m.key === key);

    function renderEvents() {
        const snap = S.events || { active: [], last: {}, log: [] };
        $('#event-timers').innerHTML = TIMER_TYPES.map(type => {
            const meta = metaFor(type);
            const live = snap.active.filter(e => e.type === type);
            const last = snap.last[type] || {};
            const state = live.length
                ? `<b class="live">LIVE</b> <span data-since="${live[0].since}">${dur(Date.now() - live[0].since)}</span>`
                : last.despawn ? `gone ${ago(last.despawn)}` : last.spawn ? `seen ${ago(last.spawn)}` : '<span class="muted">not seen</span>';
            return `<div class="timer ${live.length ? 'on' : ''}" style="--c:${meta.color}" ${live.length ? `data-x="${live[0].x}" data-y="${live[0].y}"` : ''}>
                <div class="code">${meta.code}</div><div class="name">${meta.name}</div><div class="state">${state}</div>
                ${live.length ? `<div class="where">${esc(live[0].where)}</div>` : last.duration ? `<div class="where">lasted ${dur(last.duration)}</div>` : ''}
            </div>`;
        }).join('');
        $$('#event-timers .timer[data-x]').forEach(el => el.onclick = () => flyTo(+el.dataset.x, +el.dataset.y, 0));

        $('#event-log').innerHTML = snap.log.slice(0, 60).map(e => {
            const meta = metaFor(e.kind.replace('Gone', ''));
            return `<div class="log-row"><span class="ic" style="color:${meta?.color || 'inherit'}">${meta?.code || '·'}</span><span class="grow">${esc(e.text)}</span><span class="muted">${ago(e.t)}</span></div>`;
        }).join('') || empty(markerDataMissing() ? NO_MARKER_DATA : 'Events get logged here as they spawn and despawn.');
    }

    function renderAlerts() {
        $('#alert-log').innerHTML = S.alerts.slice(0, 60).map(a => `
            <div class="log-row" style="--c:${ALERT_STYLE[a.kind] || '#3fa9f5'}"><span class="ic dot"></span>
            <span class="grow"><b>${esc(a.label)}</b> ${esc(a.text)}</span><span class="muted">${ago(a.t)}</span></div>`).join('')
            || empty('Alerts from this session appear here.');
    }

    function renderLayerToggles() {
        $('#layer-toggles').innerHTML = Object.entries(LAYER_NAMES).map(([k, name]) =>
            `<label class="check"><input type="checkbox" data-layer="${k}" ${layerEnabled(k) ? 'checked' : ''}> ${name}</label>`).join('');
        $$('#layer-toggles input').forEach(cb => cb.onchange = () => {
            const saved = store.get('layers', {});
            saved[cb.dataset.layer] = cb.checked;
            store.set('layers', saved);
            if (S.mapMeta) cb.checked ? layers[cb.dataset.layer].addTo(map) : layers[cb.dataset.layer].remove();
        });
    }

    bus.on('events', renderEvents);
    bus.on('reset', renderEvents);
    bus.on('alert', renderAlerts);
    bus.on('ready', () => { renderLayerToggles(); renderAlerts(); });
    setInterval(() => $$('#event-timers [data-since]').forEach(el => el.textContent = dur(Date.now() - Number(el.dataset.since))), 1000);
})();
