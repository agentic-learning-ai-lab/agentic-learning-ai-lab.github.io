/**
 * Block commits with binary asset files that aren't yet on R2 / not in
 * assets-manifest.json. See notes/lfs-migration.md.
 *
 * Trigger fix: `npm run upload`
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

const ASSET_PATTERNS = [
    'research/*/paper.pdf',
    'research/*/assets/**/*.{png,jpg,jpeg,gif,svg,webp}',
    'assets/images/papers/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/people/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/background/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/home/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/thumbnails/*.{png,jpg,jpeg,gif,webp}',
    'assets/projects/**/*.{png,jpg,jpeg,gif,webp,mp4,pdf,csv}',
];

function globToRegex(glob) {
    let g = glob;
    g = g.replace(/\{([^}]+)\}/g, (_, csv) => '\x00BO' + csv.split(',').join('\x00BX') + '\x00BC');
    g = g.replace(/\*\*/g, '\x00DS');
    g = g.replace(/\*/g, '\x00ST');
    g = g.replace(/[.+^$()|[\]\\]/g, '\\$&');
    g = g.replace(/\x00DS/g, '.*');
    g = g.replace(/\x00ST/g, '[^/]*');
    g = g.replace(/\x00BO/g, '(');
    g = g.replace(/\x00BX/g, '|');
    g = g.replace(/\x00BC/g, ')');
    return new RegExp('^' + g + '$');
}

const PATTERN_REGEXES = ASSET_PATTERNS.map(globToRegex);

function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (e.isFile()) out.push(path.relative(ROOT, full));
    }
}

function sha256File(filepath) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(filepath));
    return h.digest('hex');
}

function hashFromCdnUrl(cdnUrl) {
    const m = cdnUrl.match(/\/([a-f0-9]{16,64})\//);
    return m ? m[1] : null;
}

module.exports = {
    name: 'asset-manifest',
    run() {
        if (!fs.existsSync(MANIFEST_PATH)) return true;
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const candidates = [];
        for (const root of ['research', 'assets']) {
            if (fs.existsSync(path.join(ROOT, root))) walk(path.join(ROOT, root), candidates);
        }
        const unregistered = [];
        const stale = [];
        for (const rel of candidates) {
            if (!PATTERN_REGEXES.some(r => r.test(rel))) continue;
            const logical = '/' + rel;
            const cdnUrl = manifest[logical];
            if (!cdnUrl) { unregistered.push(rel); continue; }
            const expected = hashFromCdnUrl(cdnUrl);
            const actual = sha256File(path.join(ROOT, rel)).slice(0, expected ? expected.length : 16);
            if (expected && expected !== actual) stale.push(rel);
        }
        if (unregistered.length === 0 && stale.length === 0) return true;
        console.error('⛔ asset-manifest: binary assets not on R2:');
        for (const r of unregistered) console.error(`   + ${r}   (new, not in manifest)`);
        for (const r of stale)        console.error(`   ~ ${r}   (local content changed; manifest hash stale)`);
        console.error('   → run `npm run upload` to mirror to R2 + update manifest');
        return false;
    },
};
