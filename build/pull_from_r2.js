#!/usr/bin/env node

/**
 * Disaster-recovery helper: hydrate local working tree from the R2
 * mirror.
 *
 * Use case: you've cloned the repo with GIT_LFS_SKIP_SMUDGE=1 (or LFS
 * bandwidth is exhausted), so binary files in the working tree are
 * pointer text files instead of real binaries. This script walks
 * assets-manifest.json, downloads each CDN URL back to its logical
 * path, and replaces the local LFS pointer with the real file.
 *
 * Idempotent. Skips files where the local copy is already a real
 * binary at the right size (cheap first-byte check + size compare).
 *
 * No R2 credentials required — only reads the public CDN.
 *
 * Usage:
 *   node build/pull_from_r2.js            # download everything in manifest
 *   node build/pull_from_r2.js <prefix>   # only paths starting with <prefix>
 *
 * Examples:
 *   node build/pull_from_r2.js assets/projects/poodle/
 *   node build/pull_from_r2.js research/
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

function downloadTo(url, dst) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        const file = fs.createWriteStream(dst);
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(dst);
                return downloadTo(res.headers.location, dst).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dst);
                return reject(new Error(`${res.statusCode} for ${url}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
        }).on('error', reject);
    });
}

function isLikelyLfsPointer(filepath) {
    if (!fs.existsSync(filepath)) return false;
    const stat = fs.statSync(filepath);
    if (stat.size > 1024) return false; // pointers are ~130 bytes
    try {
        const head = fs.readFileSync(filepath, 'utf8').slice(0, 64);
        return head.startsWith('version https://git-lfs');
    } catch {
        return false;
    }
}

async function main() {
    const prefix = process.argv[2] || '';
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`No manifest at ${MANIFEST_PATH}; nothing to pull.`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entries = Object.entries(manifest).filter(([logical]) =>
        logical.startsWith('/') && logical.slice(1).startsWith(prefix)
    );
    console.log(`${entries.length} manifest entries match prefix "${prefix || '(all)'}"`);

    let pulled = 0, skipped = 0, failed = 0;
    let i = 0;
    for (const [logical, cdnUrl] of entries) {
        i++;
        const dst = path.join(ROOT, logical.replace(/^\//, ''));
        if (fs.existsSync(dst) && !isLikelyLfsPointer(dst)) {
            skipped++;
            continue;
        }
        try {
            await downloadTo(cdnUrl, dst);
            pulled++;
            if (pulled % 20 === 0) {
                process.stdout.write(`  ${pulled} pulled (${i}/${entries.length})...\r`);
            }
        } catch (err) {
            console.error(`\n  ✗ ${logical}: ${err.message}`);
            failed++;
        }
    }
    console.log(`\n📊 pull:r2 — pulled ${pulled}, skipped ${skipped} (already real), failed ${failed}`);
    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error('pull failed:', err);
    process.exit(1);
});
