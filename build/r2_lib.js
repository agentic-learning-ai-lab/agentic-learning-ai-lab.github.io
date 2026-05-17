/**
 * Shared R2 / assets-manifest helpers used by:
 *   - sync_to_r2.js   (bulk site asset sync)
 *   - latex_pack.js   (publish local latex/ tree → R2 tarball)
 *   - latex_fetch.js  (download R2 tarball → local latex/)
 *   - latex_update.js (re-fetch from arXiv → R2 tarball)
 *   - build_arxiv_papers.js (R2 download branch on compile)
 *
 * Keeps R2 client + manifest IO in one place so we don't drift across
 * scripts. The shared design rule: read manifest at the start, write it
 * back at the end. Multiple in-flight scripts modifying it concurrently
 * is not supported (we never run them concurrently in practice).
 */

require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');
const HASH_LEN = 16;

const BUCKET = process.env.R2_BUCKET || 'agenticlearning-assets';
const CDN_BASE = (process.env.R2_CDN_BASE_URL || 'https://cdn.agenticlearning.ai').replace(/\/$/, '');

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
    console.error('See .env (local) or GitHub Actions secrets (CI). See build/r2_lib.js.');
    process.exit(1);
  }
  return process.env[name];
}

let _s3 = null;
function s3Client() {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return _s3;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex').slice(0, HASH_LEN)));
    stream.on('error', reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
  }[ext] || 'application/octet-stream';
}

async function r2ObjectExists(key) {
  try {
    await s3Client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return false;
    throw err;
  }
}

async function uploadToR2(key, filePath, opts = {}) {
  // Read into memory (vs. stream) so the S3 SDK auto-computes the
  // Content-MD5 header — R2 then rejects the upload if bytes were
  // corrupted in flight. This is why we don't HEAD-verify after PUT:
  // the integrity check is already inline.
  const body = await fs.readFile(filePath);
  await s3Client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: opts.contentType || contentType(filePath),
    // Content-addressed paths are immutable — long cache is safe.
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

/**
 * Download an R2 object to a local file. Streams directly to disk so the
 * body never sits in memory. Used for tarball pulls during build.
 */
async function downloadFromR2(key, outputPath) {
  const res = await s3Client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await fs.ensureDir(path.dirname(outputPath));
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputPath);
    res.Body.pipe(out);
    res.Body.on('error', reject);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function loadManifest() {
  if (await fs.pathExists(MANIFEST_PATH)) {
    return await fs.readJson(MANIFEST_PATH);
  }
  return {};
}

async function saveManifest(manifest) {
  const sorted = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key];
  await fs.writeJson(MANIFEST_PATH, sorted, { spaces: 2 });
}

/**
 * Extract the R2 key (e.g. "a1b2c3.../slug.pdf") from a CDN URL. Returns
 * null if the URL doesn't point at our bucket. Used to convert manifest
 * URLs back into bucket keys for HEAD/GET.
 */
function keyFromCdnUrl(url) {
  if (!url || !url.startsWith(CDN_BASE + '/')) return null;
  return url.slice(CDN_BASE.length + 1);
}

module.exports = {
  ROOT,
  BUCKET,
  CDN_BASE,
  HASH_LEN,
  MANIFEST_PATH,
  s3Client,
  hashFile,
  contentType,
  r2ObjectExists,
  uploadToR2,
  downloadFromR2,
  loadManifest,
  saveManifest,
  keyFromCdnUrl,
};
