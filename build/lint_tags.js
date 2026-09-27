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
 * Also enforces:
 *   - Every tag slug in tags.yaml is unique.
 *   - Every related: entry in tags.yaml points at an existing slug.
 *
 * Exit code: 0 if clean, 1 if any mismatches. CI + pre-commit both
 * invoke this file directly; the pre-commit wrapper is at
 * scripts/checks/10_tag_slugs.js.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');

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

    // 2. every related: entry points at a real slug
    for (const t of tags) {
        for (const r of (t.related || [])) {
            if (!validSlugs.has(r)) {
                console.error(`⛔ tags.yaml: "${t.slug}".related references unknown tag "${r}"`);
                ok = false;
            }
        }
    }

    // 3. every paper tag is in the vocabulary
    for (const p of papers) {
        for (const t of (p.tags || [])) {
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
