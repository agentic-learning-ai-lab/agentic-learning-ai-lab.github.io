#!/usr/bin/env node

/**
 * Download a paper's LaTeX tarball from R2 and extract it to
 * research/<slug>/latex/ for local editing.
 *
 *   manifest → R2 → .cache/latex-tarballs/ → tar -xz → research/<slug>/latex/
 *
 * Author workflow: fetch → edit → `npm run latex:pack <slug>` → commit
 * manifest + paper.pdf (recompile happens via build:arxiv:pdf).
 *
 * Usage:
 *   node build/latex_fetch.js <slug>
 *
 * Reads via the public CDN URL when possible (no R2 creds needed). Falls
 * back to authenticated R2 GET if the public URL is unreachable (rare;
 * e.g. local DNS issue).
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const {
  ROOT,
  loadManifest,
  downloadFromR2,
  keyFromCdnUrl,
} = require('./r2_lib');
const { manifestKey } = require('./latex_pack');

const CACHE_DIR = path.join(ROOT, '.cache', 'latex-tarballs');

function downloadViaHttps(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadViaHttps(res.headers.location, outputPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      fs.ensureDirSync(path.dirname(outputPath));
      const out = fs.createWriteStream(outputPath);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Download the tarball for `slug` into `.cache/latex-tarballs/<hash>.tar.gz`.
 * Cache hit if the file already exists at that path. Returns the cached
 * path.
 */
async function ensureTarballCached(slug, cdnUrl) {
  // Cache key is the hash directory in the CDN URL, e.g. "ab12cd34.../slug.tar.gz".
  // Same content-addressed naming means hash collisions don't happen.
  const r2Key = keyFromCdnUrl(cdnUrl);
  if (!r2Key) throw new Error(`Manifest URL doesn't point at CDN: ${cdnUrl}`);
  const cachedPath = path.join(CACHE_DIR, r2Key);
  if (await fs.pathExists(cachedPath)) {
    return cachedPath;
  }
  await fs.ensureDir(path.dirname(cachedPath));

  // Prefer public CDN GET (no creds, served from edge). Fall back to
  // authenticated R2 GET if the public path 404s or DNS fails — useful
  // when CDN is misconfigured but R2 is otherwise reachable.
  try {
    await downloadViaHttps(cdnUrl, cachedPath);
  } catch (httpsErr) {
    console.warn(`   ⤳  CDN fetch failed (${httpsErr.message}); falling back to authenticated R2`);
    await downloadFromR2(r2Key, cachedPath);
  }
  return cachedPath;
}

/**
 * Extract a tar.gz into research/<slug>/latex/. Pre-existing dir is
 * removed first (latex_pack writes a clean tree; we mirror that here).
 */
async function extractTarball(tarPath, slug) {
  const targetDir = path.join(ROOT, 'research', slug, 'latex');
  if (await fs.pathExists(targetDir)) {
    console.log(`   ⚠️  research/${slug}/latex/ already exists, replacing`);
    await fs.remove(targetDir);
  }
  await fs.ensureDir(path.dirname(targetDir));
  // Tar was created with "-C parent latex" (basename "latex"), so extracting
  // into research/<slug>/ yields research/<slug>/latex/.
  await execFileAsync('tar', ['-xzf', tarPath, '-C', path.dirname(targetDir)]);
  return targetDir;
}

async function fetchOne(slug) {
  const manifest = await loadManifest();
  const cdnUrl = manifest[manifestKey(slug)];
  if (!cdnUrl) {
    throw new Error(
      `No tarball entry for "${slug}" in assets-manifest.json. ` +
      `Either pack a local tree first (latex:pack ${slug}) or bootstrap ` +
      `from arXiv (latex:update ${slug}).`
    );
  }

  console.log(`⬇️  ${slug}: fetching ${cdnUrl}`);
  const tarPath = await ensureTarballCached(slug, cdnUrl);
  const extracted = await extractTarball(tarPath, slug);
  console.log(`✅  ${slug}: extracted to ${path.relative(ROOT, extracted)}/`);
  return extracted;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    console.error('Usage: latex:fetch <slug>');
    process.exit(1);
  }
  await fetchOne(args[0]);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fetch failed:', err.message);
    process.exit(1);
  });
}

module.exports = { fetchOne, ensureTarballCached, CACHE_DIR };
