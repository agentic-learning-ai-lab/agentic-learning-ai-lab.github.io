#!/usr/bin/env node

/**
 * Manifest-consistency check. Run after `npm run build:cf` produces
 * out/. Greps every cdn.agenticlearning.ai URL out of the rendered
 * HTML in out/ and HEADs each one. Any 404 / 5xx is a build-broken
 * page waiting to happen.
 *
 * Failure modes this catches:
 *   - sync:r2 was skipped, manifest has stale entries, templates
 *     baked in a hash that doesn't exist on R2 anymore.
 *   - Author renamed a file locally but forgot to re-sync — manifest
 *     still has the old logical-path → hash entry; the rendered HTML
 *     points at a deleted R2 object.
 *   - Anyone hand-edits assets-manifest.json with a typo.
 *
 * Usage:
 *   npm run build:cf
 *   node build/check_manifest_consistency.js
 *
 * Exit code: 0 if every URL returns 2xx, 1 if any 4xx/5xx.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

function walkHtml(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkHtml(full, out);
        else if (e.isFile() && e.name.endsWith('.html')) out.push(full);
    }
}

function extractCdnUrls(html) {
    // Strip HTML comments first so commented-out URLs don't get checked
    const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
    const re = /https:\/\/cdn\.agenticlearning\.ai\/[^"'\s)>]+/g;
    return [...new Set(stripped.match(re) || [])];
}

function head(url) {
    return new Promise(resolve => {
        const req = https.request(url, { method: 'HEAD' }, res => {
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.setTimeout(10_000, () => { req.destroy(); resolve(-1); });
        req.end();
    });
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) {
        console.error('out/ missing — run `npm run build:cf` first');
        process.exit(1);
    }
    const htmls = [];
    walkHtml(OUT_DIR, htmls);
    console.log(`Scanning ${htmls.length} HTML files for cdn.agenticlearning.ai URLs...`);
    const urls = new Set();
    for (const f of htmls) {
        for (const u of extractCdnUrls(fs.readFileSync(f, 'utf8'))) urls.add(u);
    }
    const list = [...urls];
    console.log(`Found ${list.length} unique URLs. HEADing each...`);

    // Limited concurrency to avoid hammering R2.
    const CONC = 10;
    const failures = [];
    let done = 0;
    for (let i = 0; i < list.length; i += CONC) {
        const batch = list.slice(i, i + CONC);
        const results = await Promise.all(batch.map(async u => ({ u, code: await head(u) })));
        for (const { u, code } of results) {
            if (code !== 200) failures.push({ u, code });
        }
        done += batch.length;
        if (done % 50 === 0 || done === list.length) {
            process.stderr.write(`  ${done}/${list.length}\r`);
        }
    }
    process.stderr.write('\n');

    if (failures.length === 0) {
        console.log(`✓ all ${list.length} CDN URLs resolve`);
        return;
    }
    console.error(`✗ ${failures.length} broken CDN URL(s):`);
    for (const { u, code } of failures) console.error(`   ${code}  ${u}`);
    process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
