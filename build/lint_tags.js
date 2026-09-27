/**
 * lint_tags.js — assert every tag slug on a paper exists in
 * data/tags.yaml's controlled vocabulary.
 *
 * Failure mode this catches: a typo in `data/papers.yaml`'s `tags:`
 * list (e.g. `- wrold-models`). Without this lint, the typo would
 * silently drop the paper from /tags/world-models/ and render an
 * unmatched chip on the paper card — the build never fails, the
 * mistake ships.
 *
 * Also enforces, per tag in tags.yaml:
 *   - slug is present, kebab-case, and unique.
 *   - label, monogram, description are present.
 *   - cluster is one of CLUSTERS (the /tags/ index drops unknown ones).
 *
 * Exit code: 0 if clean, 1 if any mismatches. CI + pre-commit both
 * invoke this file directly; the pre-commit wrapper is at
 * scripts/checks/10_tag_slugs.js.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const CLUSTERS = Object.keys(require('./tag_clusters'));

function loadYaml(rel) {
    const full = path.join(ROOT, rel);
    return yaml.load(fs.readFileSync(full, 'utf8'));
}

function main() {
    const tags = loadYaml('data/tags.yaml');
    const papers = loadYaml('data/papers.yaml');

    let ok = true;

    // 1. tag slugs unique
    const slugCounts = new Map();
    for (const t of tags) {
        slugCounts.set(t.slug, (slugCounts.get(t.slug) || 0) + 1);
    }
    for (const [slug, n] of slugCounts) {
        if (n > 1) {
            console.error(`⛔ tags.yaml: slug "${slug}" appears ${n} times`);
            ok = false;
        }
    }

    const validSlugs = new Set(tags.map(t => t.slug));

    // 2. slug shape, required fields, known cluster
    for (const t of tags) {
        if (typeof t.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.slug)) {
            console.error(`⛔ tags.yaml: entry "${t.label || '(no label)'}" has missing or non-kebab-case slug: ${JSON.stringify(t.slug)}`);
            ok = false;
        }
        for (const f of ['label', 'monogram', 'description']) {
            if (!t[f]) {
                console.error(`⛔ tags.yaml: "${t.slug}" is missing ${f}:`);
                ok = false;
            }
        }
        if (!CLUSTERS.includes(t.cluster)) {
            console.error(`⛔ tags.yaml: "${t.slug}" has cluster "${t.cluster}" (expected one of ${CLUSTERS.join(', ')})`);
            ok = false;
        }
    }

    // 3. every paper tag is in the vocabulary
    for (const p of papers) {
        const list = p.tags || [];
        if (new Set(list).size !== list.length) {
            console.error(`⛔ papers.yaml: "${p.permalink}" lists the same tag more than once`);
            ok = false;
        }
        for (const t of list) {
            if (!validSlugs.has(t)) {
                console.error(
                    `⛔ papers.yaml: "${p.permalink}" tags: contains unknown slug "${t}"\n` +
                    `     (must appear in data/tags.yaml)`
                );
                ok = false;
            }
        }
    }

    if (ok) {
        console.log(`✓ Tags clean (${tags.length} vocabulary, ${papers.length} papers checked)`);
    }
    return ok;
}

if (require.main === module) {
    process.exit(main() ? 0 : 1);
}

module.exports = { main };
