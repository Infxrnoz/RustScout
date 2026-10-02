'use strict';

// Screenshot reading (OCR) for decay HP and plant genes. tesseract.js runs in the browser and is only
// downloaded the first time a screenshot is scanned.
const Scan = (() => {
    const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    let worker = null;

    function loadLib() {
        if (window.Tesseract) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = LIB;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not download the OCR engine (needs internet the first time)'));
            document.head.appendChild(s);
        });
    }

    async function getWorker() {
        if (!worker) {
            await loadLib();
            // If the language data fails to download, forget the failed attempt so the next scan retries.
            worker = Tesseract.createWorker('eng').catch(e => {
                worker = null;
                throw new Error(`Could not start the screenshot reader (${e?.message || e}). Check your internet and try again.`);
            });
        }
        return worker;
    }

    function loadImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); };
            img.onerror = () => reject(new Error('That file is not an image'));
            img.src = URL.createObjectURL(blob);
        });
    }

    // Rust's UI text is light on dark. Turn it into black-on-white, which Tesseract reads far better.
    // 'white' keeps only near-white pixels (text on coloured boxes); 'bright' keeps any bright colour.
    function binarize(img, mode, crop) {
        const sx = crop ? crop.x * img.width : 0, sy = crop ? crop.y * img.height : 0;
        const sw = crop ? crop.w * img.width : img.width, sh = crop ? crop.h * img.height : img.height;
        const scale = Math.min(3, Math.max(1, 2000 / sw));
        const c = document.createElement('canvas');
        c.width = Math.round(sw * scale);
        c.height = Math.round(sh * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
            const v = mode === 'white' ? Math.min(px[i], px[i + 1], px[i + 2]) : Math.max(px[i], px[i + 1], px[i + 2]);
            const ink = v > (mode === 'white' ? 185 : 150);
            px[i] = px[i + 1] = px[i + 2] = ink ? 0 : 255;
        }
        ctx.putImageData(d, 0, 0);
        return c;
    }

    async function text(blob, { modes = ['white', 'bright'], whitelist = '', psm = '11', crop = null } = {}) {
        const img = await loadImage(blob);
        const w = await getWorker();
        await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: psm });
        const out = [];
        for (const mode of modes) out.push((await w.recognize(binarize(img, mode, crop))).data.text);
        return out.join('\n');
    }

    // Find each letter as a connected blob of ink, group blobs into rows, and redraw every row with even
    // spacing. Tesseract misreads the gaps between gene boxes; one clean row of six glyphs it reads well.
    function glyphRows(canvas) {
        const { width: w, height: h } = canvas;
        const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        const label = new Int32Array(w * h);
        const boxes = [];
        const stack = [];
        for (let start = 0; start < w * h; start++) {
            if (label[start] || px[start * 4] !== 0) continue;
            const b = { x0: w, y0: h, x1: 0, y1: 0, n: 0 };
            label[start] = boxes.length + 1;
            stack.push(start);
            while (stack.length) {
                const i = stack.pop();
                const x = i % w, y = (i - x) / w;
                b.n++;
                if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
                if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
                for (const j of [i - 1, i + 1, i - w, i + w]) {
                    if (j < 0 || j >= w * h || label[j] || px[j * 4] !== 0) continue;
                    if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
                    label[j] = boxes.length + 1;
                    stack.push(j);
                }
            }
            boxes.push(b);
        }
        const glyphs = boxes.filter(b => b.n > 30).map(b => ({ ...b, bw: b.x1 - b.x0 + 1, bh: b.y1 - b.y0 + 1, cy: (b.y0 + b.y1) / 2 }))
            .sort((a, b) => a.cy - b.cy);
        // Rows by vertical centre; then keep only glyphs of that row's typical letter height.
        const rows = [];
        for (const g of glyphs) {
            const row = rows.find(r => Math.abs(r.cy - g.cy) < Math.max(r.h, g.bh) * 0.4);
            if (row) row.glyphs.push(g); else rows.push({ cy: g.cy, h: g.bh, glyphs: [g] });
        }
        for (const r of rows) {
            const hs = r.glyphs.map(g => g.bh).sort((a, b) => a - b);
            r.typical = hs[Math.floor(hs.length / 2)];
            r.glyphs = r.glyphs.filter(g => g.bh > r.typical * 0.75 && g.bh < r.typical * 1.3 && g.bw < r.typical * 1.6);
        }
        const out = [];
        for (const r of rows) {
            r.glyphs.sort((a, b) => a.x0 - b.x0);
            for (let i = 0; i + 6 <= r.glyphs.length && r.glyphs.length % 6 === 0; i += 6) {
                const six = r.glyphs.slice(i, i + 6);
                const cell = Math.round(Math.max(...six.map(g => g.bw)) * 1.6), lineH = Math.round(r.typical * 2);
                const c = document.createElement('canvas');
                c.width = cell * 6 + cell;
                c.height = lineH;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, c.width, c.height);
                six.forEach((g, k) => ctx.drawImage(canvas, g.x0, g.y0, g.bw, g.bh,
                    Math.round(cell / 2 + k * cell + (cell - g.bw) / 2), Math.round((lineH - g.bh) / 2), g.bw, g.bh));
                out.push(c);
            }
        }
        return out;
    }

    // Each detected row of six letter blobs, read on its own. Falls back to whole-image text.
    async function genes(blob) {
        const img = await loadImage(blob);
        const w = await getWorker();
        await w.setParameters({ tessedit_char_whitelist: 'GYHWX', tessedit_pageseg_mode: '7' });
        const found = [];
        for (const mode of ['white', 'bright']) {
            for (const row of glyphRows(binarize(img, mode))) {
                const t = (await w.recognize(row)).data.text.replace(/[^GYHWX]/g, '');
                if (t.length === 6 && !found.includes(t)) found.push(t);
            }
            if (found.length) return found;
        }
        return parseGenes(await text(blob, { whitelist: 'GYHWX ', psm: '6' }));
    }

    /* ---- parsers ---- */

    // Hammer view shows the structure name and "current / max" HP. OCR often reads the thin slash
    // as "1", "7" or "17", so digit runs are also split around one or two dropped characters.
    function parseDecay(raw, table) {
        const t = raw.toUpperCase().replace(/[|\\]/g, '/').replace(/[OQ](?=\d)|(?<=\d)[OQ]/g, '0');
        const flat = t.replace(/[^A-Z0-9]+/g, ' ');
        const named = table.filter(d => flat.includes(d.name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ')))
            .sort((a, b) => b.name.length - a.name.length);
        const maxes = new Set(named.length ? named.map(d => d.hp) : table.map(d => d.hp));
        const fits = (a, b) => a > 0 && a <= b && maxes.has(b);
        let hp = null, max = null;
        for (const m of t.matchAll(/(\d{1,5})\s*\/\s*(\d{2,5})/g)) {
            if (fits(+m[1], +m[2])) { hp = +m[1]; max = +m[2]; break; }
        }
        if (hp === null) {
            outer: for (const drop of [1, 2]) {
                for (const m of t.matchAll(/\d{4,12}/g)) {
                    const s = m[0];
                    for (let i = 1; i + drop < s.length; i++) {
                        if (!/^[17]+$/.test(s.slice(i, i + drop))) continue;
                        const a = +s.slice(0, i), b = +s.slice(i + drop);
                        if (s[i + drop] !== '0' && fits(a, b)) { hp = a; max = b; break outer; }
                    }
                }
            }
        }
        let item = named.find(d => max === null || d.hp === max) || named[0] || null;
        if (!item && max !== null) {
            const same = table.filter(d => d.hp === max);
            if (same.length === 1) item = same[0];
        }
        return { item, hp, max };
    }

    // Gene strings: six of G/Y/H/W/X per plant, often OCR'd with spaces between the boxes.
    function parseGenes(raw) {
        const found = new Set();
        const loose = [];
        for (const line of raw.toUpperCase().split('\n')) {
            const runs = line.replace(/[^A-Z]/g, '').match(/[GYHWX]+/g) || [];
            for (const r of runs) if (r.length === 6) found.add(r);
            if (/^[\sGYHWX]+$/.test(line) && line.trim()) loose.push(...line.replace(/\s/g, ''));
        }
        // Boxes read one letter per line: regroup in sixes when that splits evenly.
        if (!found.size && loose.length && loose.length % 6 === 0)
            for (let i = 0; i < loose.length; i += 6) found.add(loose.slice(i, i + 6).join(''));
        return [...found];
    }

    /* ---- input plumbing: button, paste, drag-and-drop ---- */

    function images(list) {
        return [...(list || [])].filter(f => f.type?.startsWith('image/') || f.kind === 'file').map(f => f.getAsFile ? f.getAsFile() : f).filter(Boolean);
    }

    // onFiles gets image Blobs; active() says whether this target should take pasted images right now.
    // onReject(message) is called when something that isn't an image is dropped or picked.
    function attach({ button, drop, multiple, active, onFiles, onReject = () => {} }) {
        const NOT_IMAGE = 'Only screenshots (PNG / JPG images) can be scanned.';
        const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: !!multiple, hidden: true });
        document.body.appendChild(input);
        button.onclick = () => input.click();
        input.onchange = () => { const f = images(input.files); const n = input.files.length; input.value = ''; f.length ? onFiles(f) : n && onReject(NOT_IMAGE); };
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drop-hover'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drop-hover'));
        drop.addEventListener('drop', e => {
            e.preventDefault();
            drop.classList.remove('drop-hover');
            const f = images(e.dataTransfer.files);
            f.length ? onFiles(f) : e.dataTransfer.files.length && onReject(NOT_IMAGE);
        });
        document.addEventListener('paste', e => {
            if (!active()) return;
            const f = images(e.clipboardData?.items).filter(b => b.type.startsWith('image/'));
            if (!f.length) return;
            e.preventDefault();
            onFiles(f);
        });
    }

    return { text, genes, parseDecay, parseGenes, attach };
})();
