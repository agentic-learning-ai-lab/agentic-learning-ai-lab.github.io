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

const { ROOT, keyFromCdnUrl, loadManifest } = require('./r2_lib');
const { manifestKey } = require('./latex_lib');

const CACHE_DIR = path.join(ROOT, '.cache', 'latex-tarballs');

class TarballNotFoundError extends Error {
  constructor(message) { super(message); this.name = 'TarballNotFoundError'; }
}

/**
 * Stream an HTTPS URL to a local file via a .tmp sidecar, rename on finish.
 * A SIGINT mid-download leaves the .tmp behind (harmless — next run sees
 * the absence of the final path and re-downloads). Without the rename,
 * we'd leave a truncated final file that subsequent cache-hit checks
 * would happily reuse.
 */
function downloadViaHttps(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadViaHttps(res.headers.location, outputPath).then(resolve, reject);
        return;
      }
      if (res.statusCode === 404) {
        reject(new TarballNotFoundError(`HTTP 404 for ${url}`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      fs.ensureDirSync(path.dirname(outputPath));
      const tmpPath = `${outputPath}.tmp`;
      const out = fs.createWriteStream(tmpPath);
      res.pipe(out);
      out.on('finish', async () => {
        try {
          await fs.move(tmpPath, outputPath, { overwrite: true });
          resolve();
        } catch (err) { reject(err); }
      });
      out.on('error', async (err) => {
        await fs.remove(tmpPath).catch(() => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

/**
 * Download the tarball for `slug` into `.cache/latex-tarballs/<hash>/<slug>.tar.gz`.
 * Cache hit if the final file (no .tmp) already exists; content-addressed
 * naming means stale cache hits are not a concern (different content →
 * different hash → different cache path).
 */
async function ensureTarballCached(slug, cdnUrl) {
  const r2Key = keyFromCdnUrl(cdnUrl);
  if (!r2Key) throw new Error(`Manifest URL doesn't point at CDN: ${cdnUrl}`);
  const cachedPath = path.join(CACHE_DIR, r2Key);
  if (await fs.pathExists(cachedPath)) {
    return cachedPath;
  }
  await fs.ensureDir(path.dirname(cachedPath));

  // Public CDN GET only — no authenticated R2 fallback. A 404 here means
  // the manifest references a non-existent tarball, which is an explicit
  // author-facing bug, not a transport issue worth retrying via creds.
  try {
    await downloadViaHttps(cdnUrl, cachedPath);
  } catch (err) {
    if (err instanceof TarballNotFoundError) {
      throw new Error(
        `LaTeX tarball for "${slug}" is missing from R2 (${cdnUrl}). ` +
        `Manifest entry is stale. Run \`npm run latex:update ${slug}\` ` +
        `(arXiv) or \`npm run latex:pack ${slug}\` (position paper) to rebuild it.`
      );
    }
    throw err;
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
