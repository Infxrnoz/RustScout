// Draws a Rust map from its .map file layers: ground texture (splat) colours, hill shading from the
// heightmap, and sea/lakes/rivers from the height and water layers. Returns a PNG (no grid, no pins —
// the app draws those itself).
const zlib = require('zlib');

// Splat channels: dirt, snow, sand, rock, grass, forest, stones, gravel.
const SPLAT = [[138, 112, 78], [235, 240, 245], [214, 196, 146], [120, 116, 108], [102, 132, 60], [70, 98, 46], [140, 136, 126], [150, 140, 120]];

function render({ height, water, splat }, px = 2048) {
    const hres = Math.round(Math.sqrt(height.length / 2));
    const wres = water ? Math.round(Math.sqrt(water.length / 2)) : 0;
    const sres = Math.round(Math.sqrt(splat.length / 8));
    // Heights are 0..32767 for -500..+500 m, so 0.5 is sea level.
    const H = (x, z) => height.readUInt16LE((Math.max(0, Math.min(hres - 1, z)) * hres + Math.max(0, Math.min(hres - 1, x))) * 2) / 32768;
    const img = Buffer.alloc(px * px * 4);
    for (let iy = 0; iy < px; iy++) {
        const v = 1 - (iy + 0.5) / px; // row 0 of the image is the north edge
        for (let ix = 0; ix < px; ix++) {
            const u = (ix + 0.5) / px;
            const hx = Math.min(hres - 1, Math.floor(u * hres)), hz = Math.min(hres - 1, Math.floor(v * hres));
            const h = H(hx, hz);
            const sx = Math.min(sres - 1, Math.floor(u * sres)), sz = Math.min(sres - 1, Math.floor(v * sres));
            let r = 0, g = 0, b = 0, tot = 0;
            for (let c = 0; c < 8; c++) {
                const w = splat[(c * sres + sz) * sres + sx];
                r += SPLAT[c][0] * w; g += SPLAT[c][1] * w; b += SPLAT[c][2] * w; tot += w;
            }
            if (tot) { r /= tot; g /= tot; b /= tot; }
            const step = Math.max(1, Math.round(hres / px));
            const dzx = (H(hx + step, hz) - H(hx - step, hz)) * 300 / step, dzz = (H(hx, hz + step) - H(hx, hz - step)) * 300 / step;
            const shade = Math.max(0.55, Math.min(1.25, 1 - dzx * 0.9 + dzz * 0.9));
            r *= shade; g *= shade; b *= shade;
            const wl = water ? water.readUInt16LE((Math.min(wres - 1, Math.floor(v * wres)) * wres + Math.min(wres - 1, Math.floor(u * wres))) * 2) / 32768 : 0;
            const surface = Math.max(0.5, wl);
            if (h < surface) {
                const d = Math.min(1, (surface - h) * 40); // deeper = darker
                r = 40 + 30 * (1 - d); g = 92 + 40 * (1 - d); b = 120 + 30 * (1 - d);
            }
            const i = (iy * px + ix) * 4;
            img[i] = Math.max(0, Math.min(255, r));
            img[i + 1] = Math.max(0, Math.min(255, g));
            img[i + 2] = Math.max(0, Math.min(255, b));
            img[i + 3] = 255;
        }
    }
    return png(img, px, px);
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const v of buf) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
}
function png(rgba, w, h) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { render };
