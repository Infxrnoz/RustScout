'use strict';

(() => {
    const listen = (sel, fn) => $(sel).querySelectorAll('.item[data-x]').forEach(el =>
        el.onclick = () => focusVending(el.dataset.id, +el.dataset.x, +el.dataset.y));

    function renderSearch() {
        const q = $('#shop-search').value.trim().toLowerCase();
        const inStock = $('#shop-instock').checked;
        const out = $('#shop-results');
        const vms = S.markers.filter(m => m.type === MARKER.vending);
        $('#shop-stats').innerHTML = `<div><b>${vms.length}</b><span>shops</span></div>
            <div><b>${vms.reduce((n, v) => n + (v.sellOrders || []).filter(o => o.amountInStock).length, 0)}</b><span>listings in stock</span></div>
            <div><b>${S.targetIds.size}</b><span>sulfur shops</span></div>`;
        if (!q) {
            out.innerHTML = markerDataMissing() ? empty(NO_MARKER_DATA)
                : S.snapshot?.status === 'online' && !vms.length ? empty('This server is reporting no vending machines right now.')
                : '';
            return;
        }
        const rows = [];
        for (const vm of vms) {
            for (const o of vm.sellOrders || []) {
                if (inStock && !o.amountInStock) continue;
                const hay = `${itemName(o.itemId)} ${itemName(o.currencyId)} ${S.items[o.itemId]?.s ?? ''}`.toLowerCase();
                if (hay.includes(q)) rows.push({ vm, o });
            }
        }
        rows.sort((a, b) => (a.o.costPerItem / a.o.quantity) - (b.o.costPerItem / b.o.quantity));
        out.innerHTML = rows.slice(0, 150).map(({ vm, o }) => `
            <div class="item" data-id="${vm.id}" data-x="${vm.x}" data-y="${vm.y}">
                ${icon(o.itemId, 'icon')}
                <div class="grow"><div class="title">${o.quantity}× ${esc(itemName(o.itemId))}${o.itemIsBlueprint ? ' <span class="tag">BP</span>' : ''}</div>
                <div class="sub">${icon(o.currencyId)} ${o.costPerItem}× ${esc(itemName(o.currencyId))} · ${o.amountInStock} in stock · ${esc(vm.name || 'Shop')}</div></div>
                <span class="grid">${gridOf(vm.x, vm.y)}</span>
            </div>`).join('') || empty('No matches.');
        listen('#shop-results');
    }

    function renderSales() {
        $('#sales-feed').innerHTML = S.sales.slice(0, 40).map(s => `
            <div class="item" data-id="${s.mid}" data-x="${s.x}" data-y="${s.y}">
                ${icon(s.itemId, 'icon')}
                <div class="grow"><div class="title">${s.qty}× ${esc(itemName(s.itemId))} <span class="muted">→</span> ${s.paid}× ${esc(itemName(s.currencyId))}</div>
                <div class="sub">${esc(s.name || 'Shop')} · ${ago(s.t)}</div></div>
                <span class="grid">${s.x != null ? gridOf(s.x, s.y) : ''}</span>
            </div>`).join('') || empty('No sales seen yet. Leave this running — sales are detected as stock drops.');
        listen('#sales-feed');
    }

    async function loadSales() {
        try { S.sales = await api('/api/sales?limit=100'); } catch { S.sales = []; }
        renderSales();
    }

    $('#shop-search').oninput = renderSearch;
    $('#shop-instock').onchange = renderSearch;
    bus.on('markers', renderSearch);
    bus.on('reset', () => { renderSearch(); loadSales(); });
    bus.on('sales', sales => {
        S.sales = [...sales, ...S.sales].slice(0, 200);
        renderSales();
    });
    setInterval(renderSales, 30000);
})();
