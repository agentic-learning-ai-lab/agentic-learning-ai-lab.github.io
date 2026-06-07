#!/usr/bin/env node

/**
 * Register newly-uploaded R2 objects in assets-manifest.json. Runs
 * inside the register-assets.yml GitHub Action (where R2 creds are in
 * env). The local upload.js CLI dispatches this Action AFTER the
 * pre-signed-URL uploads complete.
 *
 * Input: env var SPEC containing a JSON array of
 *   [{ logical, sha, filename }]
 * Same shape as mint_upload_urls.js's input — the local CLI passes
 * identical specs to both workflows.
 *
 * For each spec entry:
 *   1. HEAD R2 at key `<sha[:16]>/<filename>` to confirm the upload
 *      actually landed (defensive — prevents writing a manifest entry
 *      that points at a missing object).
 *   2. Write/overwrite manifest[logical] = "<CDN_BASE>/<r2Key>".
 *
 * Writes assets-manifest.json in place. The Action's next step commits
 * + pushes the diff.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

function requireEnv(name) {
    if (!process.env[name]) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return process.env[name];
}

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');
const BUCKET = process.env.R2_BUCKET || 'agenticlearning-assets';
const CDN_BASE = (process.env.R2_CDN_BASE_URL || 'https://cdn.agenticlearning.ai').replace(/\/$/, '');

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
});

async function r2ObjectExists(key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch (err) {
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return false;
        throw err;
    }
}

async function main() {
    const spec = JSON.parse(requireEnv('SPEC'));
    if (!Array.isArray(spec) || spec.length === 0) {
        console.error('SPEC must be a non-empty JSON array');
        process.exit(1);
    }
    const manifest = fs.existsSync(MANIFEST_PATH)
        ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        : {};

    let registered = 0, missing = 0;
    for (const { logical, sha, filename } of spec) {
        const r2Key = `${sha.slice(0, 16)}/${filename}`;
        const exists = await r2ObjectExists(r2Key);
        if (!exists) {
            console.error(`✗ ${logical}: R2 object missing at ${r2Key} (upload failed?)`);
            missing++;
            continue;
        }
        const cdnUrl = `${CDN_BASE}/${r2Key}`;
        manifest[logical] = cdnUrl;
        console.log(`✓ ${logical} → ${cdnUrl}`);
        registered++;
    }

    // Sort manifest keys to keep diffs stable. Use the same default
    // Array.sort() (Unicode code-unit order) as sync_to_r2.js and
    // r2_lib.js — using localeCompare here would re-shuffle entries
    // those two writers set, producing no-op diffs whenever the
    // upload flow and the local sync flow alternate.
    const sortedKeys = Object.keys(manifest).sort();
    const sorted = Object.fromEntries(sortedKeys.map(k => [k, manifest[k]]));
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`\nRegistered ${registered}/${spec.length} entries (${missing} missing on R2)`);
    if (missing > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
