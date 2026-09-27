/**
 * Permalinks are forever. Two entries sharing one is a confusing bug:
 *   - Visitors see a "stale" page when they expected the other.
 *   - Template generators silently overwrite one output dir with the
 *     other's content.
 *
 * Checks data/papers.yaml, data/people.yaml, data/research_areas.yaml
 * for unique `permalink:` values (per file). Cross-file overlap is
 * intentionally allowed (e.g., paper permalink "poodle" + research-area
 * permalink "poodle" wouldn't actually collide because they live at
 * different URL paths).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');

const TARGETS = [
    'data/papers.yaml',
    'data/people.yaml',
    'data/research_areas.yaml',
];

module.exports = {
    name: 'permalink-unique',
    run() {
        let ok = true;
        for (const rel of TARGETS) {
            const full = path.join(ROOT, rel);
            if (!fs.existsSync(full)) continue;
            let entries;
            try { entries = yaml.load(fs.readFileSync(full, 'utf8')); }
            catch { continue; /* yaml-valid will catch */ }
            if (!Array.isArray(entries)) continue;
            const seen = new Map();
            for (const e of entries) {
                if (!e || !e.permalink) continue;
                if (seen.has(e.permalink)) {
                    console.error(`⛔ permalink-unique: ${rel}: duplicate permalink "${e.permalink}"`);
                    console.error(`     first:  ${seen.get(e.permalink)}`);
                    console.error(`     second: ${e.title || e.name || '(unknown)'}`);
                    ok = false;
                } else {
                    seen.set(e.permalink, e.title || e.name || '(unknown)');
                }
            }
        }
        return ok;
    },
};
