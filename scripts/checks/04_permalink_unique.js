/**
 * Permalinks (and tag slugs) are forever. Two entries sharing one is a
 * confusing bug:
 *   - Visitors see a "stale" page when they expected the other.
 *   - Template generators silently overwrite one output dir with the
 *     other's content.
 *
 * Checks data/papers.yaml, data/people.yaml, data/research_areas.yaml,
 * and data/tags.yaml for unique identifiers within each file. Field
 * name is `permalink:` in the first three, `slug:` in tags.yaml.
 * Cross-file overlap is intentionally allowed (e.g., paper permalink
 * "poodle" + research-area permalink "poodle" wouldn't actually collide
 * because they live at different URL paths).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');

const TARGETS = [
    { rel: 'data/papers.yaml', idField: 'permalink' },
    { rel: 'data/people.yaml', idField: 'permalink' },
    { rel: 'data/research_areas.yaml', idField: 'permalink' },
    { rel: 'data/tags.yaml', idField: 'slug' },
];

module.exports = {
    name: 'permalink-unique',
    run() {
        let ok = true;
        for (const { rel, idField } of TARGETS) {
            const full = path.join(ROOT, rel);
            if (!fs.existsSync(full)) continue;
            let entries;
            try { entries = yaml.load(fs.readFileSync(full, 'utf8')); }
            catch { continue; /* yaml-valid will catch */ }
            if (!Array.isArray(entries)) continue;
            const seen = new Map();
            for (const e of entries) {
                if (!e || !e[idField]) continue;
                const id = e[idField];
                if (seen.has(id)) {
                    console.error(`⛔ permalink-unique: ${rel}: duplicate ${idField} "${id}"`);
                    console.error(`     first:  ${seen.get(id)}`);
                    console.error(`     second: ${e.title || e.name || e.label || '(unknown)'}`);
                    ok = false;
                } else {
                    seen.set(id, e.title || e.name || e.label || '(unknown)');
                }
            }
        }
        return ok;
    },
};
