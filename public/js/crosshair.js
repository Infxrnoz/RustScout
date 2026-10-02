'use strict';

// Draws a custom crosshair centred on (cx, cy). Shared by the Settings preview and the in-game overlay.
// c: { style: 'cross'|'t'|'circle'|'dot', size, gap, thickness, color, opacity, outline, dot }
const CROSSHAIR_DEFAULT = { on: false, style: 'cross', size: 8, gap: 4, thickness: 2, color: '#00ff66', opacity: 1, outline: true, dot: false };

function drawCrosshair(ctx, cx, cy, c) {
    c = { ...CROSSHAIR_DEFAULT, ...c };
    const shapes = [];
    const arm = (x1, y1, x2, y2) => shapes.push(g => { g.beginPath(); g.moveTo(cx + x1, cy + y1); g.lineTo(cx + x2, cy + y2); g.stroke(); });
    if (c.style === 'cross' || c.style === 't') {
        const a = c.gap, b = c.gap + c.size;
        if (c.style === 'cross') arm(0, -a, 0, -b);
        arm(0, a, 0, b);
        arm(-a, 0, -b, 0);
        arm(a, 0, b, 0);
    }
    if (c.style === 'circle') shapes.push(g => { g.beginPath(); g.arc(cx, cy, c.size, 0, Math.PI * 2); g.stroke(); });
    const dotR = c.style === 'dot' ? c.size / 2 : c.dot ? Math.max(1, c.thickness * 0.75) : 0;
    const fills = dotR ? [g => { g.beginPath(); g.arc(cx, cy, dotR, 0, Math.PI * 2); g.fill(); }] : [];

    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.lineCap = 'butt';
    if (c.outline) {
        // A thin black edge keeps it visible on snow and in bright daylight.
        ctx.strokeStyle = ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = c.thickness + 2;
        shapes.forEach(s => s(ctx));
        if (dotR) { ctx.beginPath(); ctx.arc(cx, cy, dotR + 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = ctx.fillStyle = c.color;
    ctx.lineWidth = c.thickness;
    shapes.forEach(s => s(ctx));
    fills.forEach(f => f(ctx));
    ctx.restore();
}
