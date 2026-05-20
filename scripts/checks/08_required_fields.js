/**
 * Each paper entry in data/papers.yaml needs a minimum field set or the
 * build silently emits half-rendered cards (no abstract text, missing
 * date → "Invalid date", etc.). Same for people.yaml.
 *
 * Required-field set comes from a quick survey of templates that read
 * each field. If a field is rendered without {{#if}} guard, it's required.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED = {
    'data/papers.yaml': ['title', 'authors', 'permalink', 'date', 'journal',
                         'research_areas', 'abstract', 'short_abstract'],
    'data/people.yaml': ['name', 'permalink', 'position', 'description'],
    'data/research_areas.yaml': ['title', 'permalink'],
};

module.exports = {
    name: 'required-fields',
    run() {
        let ok = true;
        for (const [rel, fields] of Object.entries(REQUIRED)) {
            const full = path.join(ROOT, rel);
            if (!fs.existsSync(full)) continue;
            let entries;
            try { entries = yaml.load(fs.readFileSync(full, 'utf8')); }
            catch { continue; /* yaml-valid catches */ }
            if (!Array.isArray(entries)) continue;
            for (const e of entries) {
                if (!e) continue;
                const missing = fields.filter(f =>
                    e[f] == null || (typeof e[f] === 'string' && e[f].trim() === '')
                );
                if (missing.length > 0) {
                    const id = e.permalink || e.name || e.title || '(unknown)';
                    console.error(`⛔ required-fields: ${rel}: "${id}" missing ${missing.join(', ')}`);
                    ok = false;
                }
            }
        }
        return ok;
    },
};
