#!/usr/bin/env node

/**
 * `npm run purge:cdn` — purge CloudFlare CDN cache for R2 assets whose
 * stored Content-Type doesn't match what their extension implies. Run
 * after fix_r2_content_types.js (which corrects R2 metadata), since
 * CF caches the response with the old Content-Type for up to
 * `Cache-Control: max-age=31536000, immutable` (i.e., effectively
 * forever).
 *
 * Pass `--all` to purge every URL in the manifest (nuclear; only use
 * during incidents).
 *
 * Pass a list of URLs to purge specific entries.
 *
 * Requires:
 *   CF_API_TOKEN — token with Zone → Cache Purge → Purge permission
 *   CF_ZONE_ID   — the zone id for agenticlearning.ai
 *
 * CF's purge API accepts up to 30 URLs per call; we batch as needed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

function requireEnv(name) {
    if (!process.env[name]) {
        console.error(`Missing required env var: ${name}`);
        console.error('  CF_API_TOKEN: needs Zone → Cache Purge → Purge permission');
        console.error('  CF_ZONE_ID:   the zone id for agenticlearning.ai');
        process.exit(1);
    }
    return process.env[name];
}

function expectedContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.css': 'text/css',
        '.csv': 'text/csv',
    }[ext] || null;
}

function headCdn(url) {
    return new Promise(resolve => {
        const req = https.request(url, { method: 'HEAD' }, res => {
            resolve({ status: res.statusCode, headers: res.headers });
        });
        req.on('error', () => resolve({ status: 0, headers: {} }));
        req.setTimeout(10_000, () => { req.destroy(); resolve({ status: -1, headers: {} }); });
        req.end();
    });
}

function cfApiPurge(token, zoneId, urls) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ files: urls });
        const req = https.request(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            res => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error(`Bad JSON from CF API: ${data}`)); }
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    const token = requireEnv('CF_API_TOKEN');
    const zoneId = requireEnv('CF_ZONE_ID');
    const args = process.argv.slice(2);
    const all = args.includes('--all');
    const explicitUrls = args.filter(a => a.startsWith('http'));

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    let urlsToPurge = [];

    if (explicitUrls.length > 0) {
        urlsToPurge = explicitUrls;
        console.log(`Purging ${urlsToPurge.length} URL(s) specified on command line.`);
    } else if (all) {
        urlsToPurge = Object.values(manifest);
        console.log(`Purging ALL ${urlsToPurge.length} URLs in manifest (--all).`);
    } else {
        // Default: scan for MIME mismatches.
        console.log(`Scanning ${Object.keys(manifest).length} manifest entries for MIME mismatches...`);
        const entries = Object.entries(manifest);
        const CONC = 10;
        let done = 0;
        for (let i = 0; i < entries.length; i += CONC) {
            const batch = entries.slice(i, i + CONC);
            const results = await Promise.all(batch.map(async ([logical, url]) => {
                const expected = expectedContentType(logical);
                if (!expected) return null;
                const { status, headers } = await headCdn(url);
                if (status !== 200) return null;
                const ct = (headers['content-type'] || '').split(';')[0].trim();
                if (ct !== expected) return { url, logical, current: ct, expected };
                return null;
            }));
            for (const r of results) {
                if (r) {
                    console.log(`  mismatch: ${r.logical}  (current: ${r.current} → expected: ${r.expected})`);
                    urlsToPurge.push(r.url);
                }
            }
            done += batch.length;
            if (done % 100 === 0 || done === entries.length) {
                process.stderr.write(`  scanned ${done}/${entries.length}\r`);
            }
        }
        process.stderr.write('\n');
    }

    if (urlsToPurge.length === 0) {
        console.log('✓ Nothing to purge.');
        return;
    }
    console.log(`Purging ${urlsToPurge.length} URL(s) in batches of 30...`);
    let purged = 0;
    for (let i = 0; i < urlsToPurge.length; i += 30) {
        const batch = urlsToPurge.slice(i, i + 30);
        const result = await cfApiPurge(token, zoneId, batch);
        if (!result.success) {
            console.error(`  ✗ batch ${i / 30 + 1} failed:`, JSON.stringify(result.errors || result));
            process.exit(1);
        }
        purged += batch.length;
    }
    console.log(`✓ Purged ${purged} URL(s) from CloudFlare CDN.`);
}

main().catch(err => { console.error(err); process.exit(1); });
