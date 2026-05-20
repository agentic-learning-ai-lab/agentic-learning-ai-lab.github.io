#!/usr/bin/env node

/**
 * One-shot: walk assets-manifest.json, HEAD each R2 object, and
 * CopyObject (in-place, MetadataDirective=REPLACE) any whose stored
 * Content-Type doesn't match what the extension would map to today.
 *
 * Why we need this: `sync_to_r2.js` skips uploads on a manifest cache
 * hit (the content hash is already in the manifest), so when we add a
 * new MIME mapping (e.g., '.css' → 'text/css'), the previously-uploaded
 * objects keep their old Content-Type until we explicitly fix them.
 * R2 (S3-compatible) metadata is immutable on PUT; only CopyObject
 * with MetadataDirective=REPLACE can update it in place.
 *
 * Idempotent. Safe to re-run — only objects with mismatched
 * Content-Type get touched.
 *
 * Usage:
 *   npm run fix:r2:mime
 *   npm run fix:r2:mime -- --ext css,csv     # restrict to specific extensions
 *   npm run fix:r2:mime -- --dry-run         # report what would change
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

const BUCKET = process.env.R2_BUCKET || 'agenticlearning-assets';
const CDN_BASE = (process.env.R2_CDN_BASE_URL || 'https://cdn.agenticlearning.ai').replace(/\/$/, '');

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
});

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
  }[ext] || 'application/octet-stream';
}

function keyFromCdnUrl(cdnUrl) {
  // CDN URL shape: <CDN_BASE>/<hash>/<filename>. Key in R2 = "<hash>/<filename>".
  const prefix = CDN_BASE + '/';
  if (!cdnUrl.startsWith(prefix)) return null;
  return cdnUrl.slice(prefix.length);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const extArg = args.find(a => a.startsWith('--ext'))?.split('=')[1] ||
    args[args.indexOf('--ext') + 1];
  const extFilter = extArg ? new Set(extArg.split(',').map(e => '.' + e.replace(/^\./, ''))) : null;

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Object.entries(manifest);
  console.log(`Scanning ${entries.length} manifest entries${extFilter ? ' (ext: ' + [...extFilter].join(',') + ')' : ''}${dryRun ? ' (dry-run)' : ''}`);

  let checked = 0, fixed = 0, alreadyOk = 0, skipped = 0, errors = 0;
  for (const [logical, cdnUrl] of entries) {
    const ext = path.extname(logical).toLowerCase();
    if (extFilter && !extFilter.has(ext)) { skipped++; continue; }
    const key = keyFromCdnUrl(cdnUrl);
    if (!key) { skipped++; continue; }
    const expected = expectedContentType(logical);

    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      const current = head.ContentType || '';
      checked++;
      if (current === expected) {
        alreadyOk++;
        continue;
      }
      console.log(`  ${dryRun ? 'would fix' : 'fixing'}: ${logical}  (${current} → ${expected})`);
      if (!dryRun) {
        await s3.send(new CopyObjectCommand({
          Bucket: BUCKET,
          Key: key,
          CopySource: `/${BUCKET}/${encodeURIComponent(key)}`,
          ContentType: expected,
          MetadataDirective: 'REPLACE',
        }));
      }
      fixed++;
    } catch (err) {
      console.error(`  ✗ ${logical}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n📊 fix:r2:mime — checked ${checked}, ${dryRun ? 'would-fix' : 'fixed'} ${fixed}, already OK ${alreadyOk}, skipped ${skipped}, errors ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('fix failed:', err);
  process.exit(1);
});
