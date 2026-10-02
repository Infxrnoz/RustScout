'use strict';

(() => {
    let bin = store.get('recycleBin', {});
    let mode = store.get('recycleMode', 'r');
    const save = () => { store.set('recycleBin', bin); store.set('recycleMode', mode); };

    function render() {
        $$('#recycle-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        const ids = Object.keys(bin);
        $('#recycle-bin').innerHTML = ids.map(id => `
            <div class="item flat">${icon(id, 'icon')}<div class="grow">${esc(itemName(id))}</div>
            <input type="number" min="0" value="${bin[id]}" data-id="${id}" class="qty">
            <button class="icon-btn" data-del="${id}">✕</button></div>`).join('') || empty('Add items to see what they break into.');
        $$('#recycle-bin input').forEach(inp => inp.onchange = () => {
            const n = Math.max(0, Number(inp.value) || 0);
            n ? bin[inp.dataset.id] = n : delete bin[inp.dataset.id];
            save();
            render();
        });
        $$('#recycle-bin [data-del]').forEach(b => b.onclick = () => { delete bin[b.dataset.del]; save(); render(); });

        const out = {};
        for (const id of ids) {
            const entry = S.game.recycle[id];
            const yields = (mode === 's' ? entry?.s : entry?.r) || entry?.r || entry?.s || [];
            for (const [yid, p, q] of yields) out[yid] = (out[yid] || 0) + p * q * bin[id];
        }
        const rows = Object.entries(out).sort((a, b) => b[1] - a[1]);
        $('#recycle-out').innerHTML = rows.length ? `<div class="yield-grid">${rows.map(([id, n]) => `
            <div class="slot big" title="${esc(itemName(id))}">${icon(id, 'icon')}<span>${n % 1 ? n.toFixed(1) : fmt(n)}</span><em>${esc(itemName(id))}</em></div>`).join('')}</div>
            <p class="hint">Fractional numbers are expected values from random drops.</p>` : '';
    }

    function add() {
        const q = $('#recycle-item').value.trim().toLowerCase();
        const id = Object.keys(S.game.recycle).find(i => S.items[i]?.n.toLowerCase() === q);
        if (!id) return;
        bin[id] = (bin[id] || 0) + Math.max(1, Number($('#recycle-qty').value) || 1);
        $('#recycle-item').value = '';
        save();
        render();
    }

    $('#recycle-form').onsubmit = e => { e.preventDefault(); add(); };
    $$('#recycle-mode button').forEach(b => b.onclick = () => { mode = b.dataset.mode; save(); render(); });
    $('#recycle-clear').onclick = () => { bin = {}; save(); render(); };
    bus.on('ready', () => {
        $('#recycle-options').innerHTML = Object.keys(S.game.recycle).filter(id => S.items[id])
            .map(id => `<option value="${esc(S.items[id].n)}">`).join('');
        render();
    });
})();
