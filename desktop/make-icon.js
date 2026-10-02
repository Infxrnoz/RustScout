// Draws the RustScout icon (red map pin on a dark rounded square) as a 512×512 PNG.
// Run: node desktop/make-icon.js   → desktop/icon.png (electron-builder makes the .ico from it)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 512;
const SS = 4; // supersampling per axis for smooth edges
const px = Buffer.alloc(N * N * 4);

const inRoundedSquare = (x, y) => {
    const r = 96, m = 16;
    const cx = Math.min(Math.max(x, m + r), N - m - r), cy = Math.min(Math.max(y, m + r), N - m - r);
    return x >= m && x <= N - m && y >= m && y <= N - m && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// Point-in-triangle via barycentric signs.
const tri = (ax, ay, bx, by, cx, cy) => (x, y) => {
    const s = (px1, py1, px2, py2) => (x - px2) * (py1 - py2) - (px1 - px2) * (y - py2);
    const d1 = s(ax, ay, bx, by), d2 = s(bx, by, cx, cy), d3 = s(cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
// Map pin: a circle plus the triangle from its two tangent points down to the tip, with a ring cut out.
const C = [256, 206], R = 150, TIP = [256, 456];
const d = TIP[1] - C[1], ca = R / d, sa = Math.sqrt(1 - ca * ca);
const T1 = [C[0] - R * sa, C[1] + R * ca], T2 = [C[0] + R * sa, C[1] + R * ca];
const tipTri = tri(TIP[0], TIP[1], T1[0], T1[1], T2[0], T2[1]);
const inCircle = (x, y, r) => (x - C[0]) ** 2 + (y - C[1]) ** 2 <= r * r;
const pin = (x, y) => inCircle(x, y, R) || tipTri(x, y);
const hole = (x, y) => inCircle(x, y, 66);
const dot = (x, y) => inCircle(x, y, 28);
const BG = [20, 20, 23], RED = [224, 68, 47], LIGHT = [236, 231, 223];
for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
            const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
            if (!inRoundedSquare(fx, fy)) continue;
            let c = BG;
            if (dot(fx, fy)) c = LIGHT;
            else if (pin(fx, fy) && !hole(fx, fy)) c = RED;
            r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
        const n = SS * SS, i = (y * N + x) * 4, cover = a / 255;
        px[i] = cover ? r / cover : 0; px[i + 1] = cover ? g / cover : 0; px[i + 2] = cover ? b / cover : 0; px[i + 3] = a / n;
    }
}

// Minimal PNG writer (RGBA, no filtering).
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
// Same image as the page's favicon.
fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.png'), png);
console.log(`wrote desktop/icon.png (${Math.round(png.length / 1024)} KB)`);
