'use strict';

(() => {
    const WEIGHT = { G: 0.6, Y: 0.6, H: 0.6, W: 1, X: 1 };
    const GENES = 'GYHWX';

    const saved = store.get('breeder', {});
    $('#breed-pool').value = saved.pool || 'GGYHYW\nYGHGYX\nGYYWGH\nHGGYYW';
    $('#breed-target').value = saved.target || 'GGGGYY';
    $('#breed-max').value = saved.max || 4;
    const save = () => store.set('breeder', { pool: $('#breed-pool').value, target: $('#breed-target').value, max: $('#breed-max').value });

    const parsePool = () => [...new Set(($('#breed-pool').value.toUpperCase().match(/[GYHWX]{6}/g) || []))];
    const counts = genome => {
        const c = { G: 0, Y: 0, H: 0, W: 0, X: 0 };
        for (const g of genome) c[g]++;
        return c;
    };

    function cross(clones) {
        const slots = [];
        for (let i = 0; i < 6; i++) {
            const w = {};
            for (const c of clones) w[c[i]] = (w[c[i]] || 0) + WEIGHT[c[i]];
            const max = Math.max(...Object.values(w));
            slots.push(Object.keys(w).filter(g => Math.abs(w[g] - max) < 1e-9));
        }
        return slots;
    }

    function evaluate(slots, target) {
        const tc = counts(target);
        let pHit = 0, eDist = 0;
        const walk = (i, acc, p) => {
            if (i === 6) {
                const c = counts(acc);
                const d = [...GENES].reduce((s, g) => s + Math.abs(c[g] - tc[g]), 0) / 2;
                eDist += d * p;
                if (d === 0) pHit += p;
                return;
            }
            for (const g of slots[i]) walk(i + 1, acc + g, p / slots[i].length);
        };
        walk(0, '', 1);
        return { pHit, eDist };
    }

    function* multisets(n, k, start = 0, acc = []) {
        if (acc.length === k) { yield acc; return; }
        for (let i = start; i < n; i++) yield* multisets(n, k, i, [...acc, i]);
    }

    function solve() {
        save();
        const pool = parsePool();
        const target = $('#breed-target').value.toUpperCase().replace(/[^GYHWX]/g, '');
        const max = Math.min(6, Math.max(1, Number($('#breed-max').value) || 4));
        const out = $('#breed-result');
        $('#breed-pool-count').textContent = `${pool.length} unique clones`;
        if (target.length !== 6) { out.innerHTML = empty('Target needs exactly 6 genes, e.g. GGGGYY.'); return; }
        if (!pool.length) { out.innerHTML = empty('Paste clone genes above — six letters each, like GYYHGW.'); return; }

        const t0 = performance.now();
        const results = [];
        let tried = 0;
        for (let k = 1; k <= max; k++) {
            for (const combo of multisets(pool.length, k)) {
                if (++tried > 250000) break;
                const clones = combo.map(i => pool[i]);
                const slots = cross(clones);
                const { pHit, eDist } = evaluate(slots, target);
                results.push({ clones, slots, pHit, eDist, k });
            }
        }
        results.sort((a, b) => b.pHit - a.pHit || a.eDist - b.eDist || a.k - b.k);
        const top = [];
        const seen = new Set();
        for (const r of results) {
            const key = r.slots.map(s => s.join('/')).join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            top.push(r);
            if (top.length === 6) break;
        }

        const unreachable = !top[0]?.pHit
            ? `<p class="hint flame">${target} can’t come out of a single cross with these clones. Below are the closest ones: plant the best, add the result to the pool and solve again.</p>` : '';
        out.innerHTML = `<p class="hint">Checked ${tried.toLocaleString()} combinations in ${Math.round(performance.now() - t0)} ms.</p>${unreachable}` + top.map((r, i) => {
            const genome = r.slots.map(s => s.length === 1
                ? `<span class="gene g-${s[0]}">${s[0]}</span>`
                : `<span class="gene tie">${s.join('/')}</span>`).join('');
            const recipe = Object.entries(r.clones.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {}))
                .map(([c, n]) => `<span class="clone">${n}× ${[...c].map(g => `<i class="g-${g}">${g}</i>`).join('')}</span>`).join(' ');
            const certain = r.slots.every(s => s.length === 1);
            return `<div class="breed-card ${i === 0 ? 'best' : ''}">
                <div class="row-between"><div class="genome">${genome}</div>
                <b class="${r.pHit === 1 ? 'ok' : r.pHit > 0 ? 'flame' : 'muted'}">${Math.round(r.pHit * 100)}% hit</b></div>
                <div class="sub">Plant around the centre: ${recipe}</div>
                ${certain ? `<button class="btn ghost small" data-add="${r.slots.map(s => s[0]).join('')}">Add result to pool</button>` : ''}
            </div>`;
        }).join('');
        $$('#breed-result [data-add]').forEach(b => b.onclick = () => {
            $('#breed-pool').value = `${$('#breed-pool').value.trim()}\n${b.dataset.add}`;
            solve();
        });
    }

    $('#breed-solve').onclick = solve;

    Scan.attach({
        button: $('#breed-scan'), drop: $('#breed-pool'), multiple: true,
        onReject: msg => { $('#breed-scan-status').textContent = msg; },
        active: () => $('#panel > section[data-panel="breeder"]').classList.contains('active'),
        async onFiles(files) {
            const status = $('#breed-scan-status');
            const before = new Set(parsePool());
            const added = [];
            try {
                for (const [i, f] of files.entries()) {
                    status.textContent = `Reading ${i + 1}/${files.length}… (first scan downloads the OCR engine, ~5 MB)`;
                    const genes = await Scan.genes(f);
                    for (const g of genes) if (!before.has(g)) { before.add(g); added.push(g); }
                }
                if (added.length) {
                    const pool = $('#breed-pool');
                    pool.value = [pool.value.trim(), ...added].filter(Boolean).join('\n');
                    pool.oninput();
                }
                status.textContent = added.length ? `Added ${added.join(', ')}. Double-check them against the game.` : 'No new 6-letter gene strings found. Crop to the gene boxes and try again.';
            } catch (e) {
                status.textContent = e.message;
            }
        }
    });
    $('#breed-pool').oninput = () => { $('#breed-pool-count').textContent = `${parsePool().length} unique clones`; save(); };
    bus.on('tab:breeder', solve);
})();
