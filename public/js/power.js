'use strict';

(() => {
    // Typical draws in rW. Editable in the UI because patches shift these.
    const DEVICES = [
        ['Auto Turret', 10], ['SAM Site', 25], ['Ceiling Light', 2], ['Simple Light', 1], ['Search Light', 10],
        ['Flasher Light', 1], ['Siren Light', 1], ['Electric Heater', 3], ['Electric Furnace', 3], ['Water Pump', 5],
        ['Sprinkler', 1], ['Smart Alarm', 1], ['Storage Monitor', 1], ['Door Controller', 1], ['Igniter', 2],
        ['Industrial Conveyor', 1], ['Industrial Crafter', 1], ['Tesla Coil', 35], ['Elevator', 5], ['RF Broadcaster', 1]
    ];
    const BATTERIES = { small: { name: 'Small Battery', item: 'Small Rechargeable Battery', cap: 400, out: 15 }, medium: { name: 'Medium Battery', item: 'Medium Rechargeable Battery', cap: 9000, out: 50 }, large: { name: 'Large Battery', item: 'Large Rechargeable Battery', cap: 24000, out: 100 } };
    const EFFICIENCY = 0.8;

    const state = store.get('power', {
        loads: [{ name: 'Auto Turret', w: 10, n: 4, when: 'always' }, { name: 'Ceiling Light', w: 2, n: 6, when: 'night' }],
        panels: 4, panelAvg: 12, turbines: 0, turbineAvg: 30, generators: 0, genNight: true,
        batteries: { small: 0, medium: 1, large: 0 }, dayMin: 45, nightMin: 15
    });
    state.parts ??= { 'Electrical Branch': 0, 'Splitter': 0, 'Root Combiner': 0, 'Switch': 0, 'Timer': 0 };
    const save = () => store.set('power', state);

    function renderLoads() {
        $('#power-loads').innerHTML = state.loads.map((l, i) => `
            <div class="load-row">
                <input value="${esc(l.name)}" data-i="${i}" data-f="name" class="grow">
                <input type="number" min="0" value="${l.w}" data-i="${i}" data-f="w" class="num" title="rW each">
                <input type="number" min="0" value="${l.n}" data-i="${i}" data-f="n" class="num" title="count">
                <select data-i="${i}" data-f="when"><option value="always">24/7</option><option value="night">night</option><option value="day">day</option></select>
                <button class="icon-btn" data-del="${i}">✕</button>
            </div>`).join('');
        $$('#power-loads select').forEach(s => s.value = state.loads[s.dataset.i].when);
        $$('#power-loads input, #power-loads select').forEach(el => el.onchange = () => {
            const l = state.loads[el.dataset.i];
            l[el.dataset.f] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value;
            save();
            compute();
        });
        $$('#power-loads [data-del]').forEach(b => b.onclick = () => { state.loads.splice(+b.dataset.del, 1); save(); renderLoads(); compute(); });
    }

    function bindInputs() {
        for (const el of $$('#power-gen [data-k]')) {
            const k = el.dataset.k;
            const [a, b] = k.split('.');
            const val = b ? state[a][b] : state[a];
            if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
            el.onchange = () => {
                const v = el.type === 'checkbox' ? el.checked : Math.max(0, Number(el.value) || 0);
                b ? state[a][b] = v : state[a] = v;
                save();
                compute();
            };
        }
    }

    function compute() {
        const load = when => state.loads.filter(l => l.when === 'always' || l.when === when).reduce((s, l) => s + l.w * l.n, 0);
        const dayLoad = load('day'), nightLoad = load('night');
        const gen = 40 * state.generators;
        const wind = state.turbines * state.turbineAvg;
        const dayGen = state.panels * state.panelAvg + wind + gen;
        const nightGen = wind + (state.genNight ? gen : 0);

        const nightDeficit = Math.max(0, nightLoad - nightGen);
        const need = nightDeficit * state.nightMin;
        const cap = Object.entries(state.batteries).reduce((s, [k, n]) => s + BATTERIES[k].cap * n, 0);
        const out = Object.entries(state.batteries).reduce((s, [k, n]) => s + BATTERIES[k].out * n, 0);
        const surplus = dayGen - dayLoad;
        const recharge = Math.max(0, surplus) * EFFICIENCY * state.dayMin;

        const checks = [
            [dayGen >= dayLoad, `Daytime: ${dayGen} rW made vs ${dayLoad} rW used`],
            [nightDeficit === 0 || out >= nightDeficit, `Battery output ${out} rW vs ${nightDeficit} rW needed at night`],
            [cap >= need, `Storage ${fmt(cap)} rWm vs ${fmt(need)} rWm for ${state.nightMin} min of night`],
            [recharge >= need, `Recharge by day ${fmt(recharge)} rWm (80% efficient) vs ${fmt(need)} rWm`]
        ];
        const ok = checks.every(c => c[0]);

        // Suggestions: extra panels to cover day load + recharge, and batteries for the night.
        const panelsNeeded = state.panelAvg > 0
            ? Math.max(0, Math.ceil((dayLoad + need / (EFFICIENCY * Math.max(1, state.dayMin)) - wind - gen) / state.panelAvg)) : null;
        const batt = nightDeficit > 0
            ? ['large', 'medium', 'small'].map(k => ({ k, n: Math.max(Math.ceil(need / BATTERIES[k].cap), Math.ceil(nightDeficit / BATTERIES[k].out)) }))
            : [];

        $('#power-result').innerHTML = `
            <div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Survives the night' : '✕ Goes dark'}</div>
            <div class="stat-row"><div><b>${dayLoad}</b><span>rW day load</span></div><div><b>${nightLoad}</b><span>rW night load</span></div>
            <div><b>${dayGen}</b><span>rW day gen</span></div><div><b>${nightGen}</b><span>rW night gen</span></div></div>
            <div class="list">${checks.map(([pass, text]) => `<div class="log-row"><span class="ic ${pass ? 'ok' : 'flame'}">${pass ? '✓' : '✕'}</span><span class="grow">${text}</span></div>`).join('')}</div>
            <div class="raid-cat">To make it work</div>
            <div class="list">
                ${panelsNeeded != null ? `<div class="item flat"><div class="grow">Solar panels (at ${state.panelAvg} rW avg)</div><b>${panelsNeeded}</b></div>` : ''}
                ${batt.map(b => `<div class="item flat"><div class="grow">${BATTERIES[b.k].name}s alone</div><b>${b.n}</b></div>`).join('') || '<div class="item flat"><div class="grow">No batteries needed</div></div>'}
            </div>
            <p class="hint">Solar output follows the sun (0–20 rW). Wind depends on height (0–150 rW). Generator = 40 rW while fuelled.</p>`;
        renderBill();
    }

    /* ---- crafting list for the whole setup ---- */

    const itemByName = name => Object.keys(S.items).find(id => S.items[id].n.toLowerCase() === String(name).trim().toLowerCase());

    function renderBill() {
        const want = new Map();
        const missing = [];
        const add = (name, n) => {
            if (!(n > 0)) return;
            const id = itemByName(name);
            if (!id) { missing.push(name); return; }
            want.set(id, (want.get(id) || 0) + n);
        };
        for (const l of state.loads) add(l.name, l.n);
        add('Large Solar Panel', state.panels);
        add('Wind Turbine', state.turbines);
        add('Small Generator', state.generators);
        for (const [k, n] of Object.entries(state.batteries)) add(BATTERIES[k].item, n);
        for (const [name, n] of Object.entries(state.parts)) add(name, n);

        const cantCraft = [], craftable = {};
        let secs = 0, wb = 0;
        for (const [id, n] of want) {
            const r = S.game.craft[id];
            if (!r) { cantCraft.push(id); continue; }
            craftable[id] = n;
            secs += r.t * craftsFor(id, n);
            wb = Math.max(wb, r.wb || 0);
        }
        const { raw } = craftRaw(craftable);
        const rows = (entries, qty) => entries.map(([id, n]) =>
            `<div class="item flat">${icon(id, 'icon')}<div class="grow">${esc(itemName(id))}</div><b>${qty ? `×${n}` : fmt(n)}</b></div>`).join('');
        $('#power-bill').innerHTML = `
            <div class="parts-grid">${Object.entries(state.parts).map(([name, n]) =>
                `<label class="field">${esc(name)}<input type="number" min="0" class="num" data-part="${esc(name)}" value="${n}"></label>`).join('')}</div>
            ${want.size ? `<div class="raid-cat">Items (${[...want.values()].reduce((a, b) => a + b, 0)} total${wb ? ` · needs Workbench ${wb}` : ''} · ${dur(secs * 1000)} to craft)</div>
            <div class="list">${rows([...want].sort((a, b) => b[1] - a[1]), true)}</div>
            <div class="raid-cat">Raw materials</div>
            <div class="list">${rows(Object.entries(raw).sort((a, b) => b[1] - a[1]))}</div>` : empty('Nothing in the plan yet.')}
            ${cantCraft.length ? `<p class="hint">Not craftable (found or bought): ${cantCraft.map(id => esc(itemName(id))).join(', ')}.</p>` : ''}
            ${missing.length ? `<p class="hint">Unknown item names skipped: ${missing.map(esc).join(', ')}.</p>` : ''}`;
        $$('#power-bill [data-part]').forEach(el => el.onchange = () => {
            state.parts[el.dataset.part] = Math.max(0, Number(el.value) || 0);
            save();
            renderBill();
        });
    }

    $('#power-add').onclick = () => {
        const name = $('#power-device').value;
        const dev = DEVICES.find(d => d[0] === name) || [name || 'Device', 1];
        state.loads.push({ name: dev[0], w: dev[1], n: 1, when: 'always' });
        save();
        renderLoads();
        compute();
    };
    $('#power-clock').onclick = () => {
        const t = S.time;
        if (!t) return toast({ kind: 'alarm', label: 'No server clock', text: 'Connect to a server first.' });
        const c = gameClock();
        const phaseHours = c.isDay ? t.sunset - t.sunrise : 24 - (t.sunset - t.sunrise);
        const phaseMin = Math.round(phaseHours * t.secondsPerHour / 60);
        const other = Math.max(1, Math.round(t.dayLengthMinutes - phaseMin));
        if (c.isDay) { state.dayMin = phaseMin; state.nightMin = other; } else { state.nightMin = phaseMin; state.dayMin = other; }
        save();
        bindInputs();
        compute();
    };

    bus.on('ready', () => {
        $('#power-device').innerHTML = DEVICES.map(d => `<option>${d[0]}</option>`).join('');
        renderLoads();
        bindInputs();
        compute();
    });
})();
