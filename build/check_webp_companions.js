#!/usr/bin/env node

/**
 * Assert every PNG/JPG entry in `assets-manifest.json` under a path
 * where the site expects a WebP <source> also has a `.webp` sibling
 * entry.
 *
 * Motivation: `npm run upload` (the no-R2-creds student path) used to
 * upload PNGs without their WebP companions, because `build:webp` was
 * only wired into the full `npm run build` chain. Project pages
 * rendered <picture><img></picture> with no <source type="image/webp">
 * — silently degrading page-weight optimization. See PR fixing
 * update-context-tuning branch (2026-06-11).
 *
 * The upload path now runs `build:webp` inline; this check catches any
 * future regression where the pipeline fails to produce a WebP for a
 * PNG/JPG that a template will try to source.
 *
 * Paths where WebP is expected: the exact globs from generate_webp.js
 * SOURCES (assets/images/{papers,background,home,people}/,
 * assets/projects/**, research/<slug>/assets/**).
 *
 * Exit code: 0 if every expected PNG/JPG has a .webp sibling; 1 if any
 * are missing. Standalone-runnable (CI step) or invoked by the
 * pre-commit orchestrator via scripts/checks/02_webp_companions.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

// Manifest paths where the render pipeline wraps images in a
// <picture> and expects a WebP <source>. Mirrors generate_webp.js's
// SOURCES globs (as regex prefixes / patterns).
const WEBP_EXPECTED = [
    /^\/assets\/images\/papers\/[^/]+\.(png|jpg|jpeg)$/,
    /^\/assets\/images\/background\/[^/]+\.(png|jpg|jpeg)$/,
    /^\/assets\/images\/home\/[^/]+\.(png|jpg|jpeg)$/,
    /^\/assets\/images\/people\/[^/]+\.(png|jpg|jpeg)$/,
    /^\/assets\/projects\/.+\.(png|jpg|jpeg)$/,
    /^\/research\/[^/]+\/assets\/.+\.(png|jpg|jpeg)$/,
];

function isWebpExpected(logical) {
    return WEBP_EXPECTED.some(re => re.test(logical));
}

function webpSibling(logical) {
    return logical.replace(/\.(png|jpg|jpeg)$/, '.webp');
}

function run() {
    if (!fs.existsSync(MANIFEST_PATH)) return true;
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const missing = [];
    for (const logical of Object.keys(manifest)) {
        if (!isWebpExpected(logical)) continue;
        const webp = webpSibling(logical);
        if (!manifest[webp]) missing.push({ logical, webp });
    }
    if (missing.length === 0) return true;
    console.error(`⛔ webp-companions: ${missing.length} PNG/JPG entry/entries lack a matching .webp in the manifest:`);
    for (const { logical, webp } of missing) {
        console.error(`   ${logical}`);
        console.error(`     expected sibling: ${webp}`);
    }
    console.error(`   → run \`npm run build:webp && npm run sync:r2\` (or \`npm run upload\` on the no-creds path) then recommit the manifest.`);
    return false;
}

if (require.main === module) {
    process.exit(run() ? 0 : 1);
}

module.exports = { name: 'webp-companions', run };
