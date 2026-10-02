const fs = require('fs');
const path = require('path');

// A JSON document on disk that is written back at most every few seconds.
class Persisted {
    constructor(file, fallback) {
        this.file = file;
        try {
            this.data = { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
        } catch (e) {
            this.data = fallback;
            // Unreadable (not just missing): keep a copy instead of overwriting it on the next save.
            if (e.code !== 'ENOENT') {
                try { fs.renameSync(file, `${file}.bad-${Date.now()}`); } catch { /* best effort */ }
                console.error(`${path.basename(file)} was unreadable; started fresh and kept the old copy next to it`);
            }
        }
        this.timer = null;
    }

    touch() {
        if (this.timer) return;
        this.timer = setTimeout(() => this.flush(), 5000);
    }

    flush() {
        clearTimeout(this.timer);
        this.timer = null;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        // Write then rename, so a crash mid-write can't leave a truncated file that loads as empty.
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);
    }
}

module.exports = { Persisted };
