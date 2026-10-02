const fs = require('fs');
const path = require('path');

class Persisted {
    constructor(file, fallback) {
        this.file = file;
        try {
            this.data = { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
        } catch (e) {
            this.data = fallback;
            if (e.code !== 'ENOENT') {
                try { fs.renameSync(file, `${file}.bad-${Date.now()}`); } catch {  }
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
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);
    }
}

module.exports = { Persisted };
