#!/usr/bin/env node

/**
 * Assemble the deployable bundle in ./out/ by copying the small set of
 * artifacts a browser actually requests from the same origin.
 *
 * Why this is small: every binary asset (paper PDFs, paper figures,
 * project images, hero videos, headshots, paper cards, thumbnails,
 * backgrounds) is served from cdn.agenticlearning.ai via R2, with
 * URLs baked into the rendered HTML at build time by the cdnUrl /
 * pictureCdn Handlebars helpers. The rendered HTML in `out/` only
 * references same-origin paths for:
 *   - HTML / JS / CSS bundles
 *   - favicons in /assets/images/favicons/ (linked from <link rel>)
 *   - the lab logo at /assets/images/logos/logo.svg
 *   - /assets/search-index.json (loaded by /search.js)
 * Everything else is a `https://cdn.agenticlearning.ai/...` URL.
 *
 * So `out/` is HTML + small same-origin assets, ~5 MB total.
 *
 * Used by:
 *   - npm run preview                 (local: build + serve out/)
 *   - npm run build:cf                (Cloudflare Pages cloud build —
 *                                      uses the slim flow, no LFS pull)
 *   - .github/workflows/deploy.yml    (legacy GH Pages — will be
 *                                      retired in favor of CF)
 *
 * Idempotent: removes copied dirs first to ensure a clean copy. Cheap
 * (sub-second) because there's so little to copy.
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');

// Top-level files that go directly into out/ root.
const FILES = [
  'index.html',
  'index.js',
  'search.js',
  'person.js',
  'paper-view.js',
  'research.js',
  'site.webmanifest',
  'favicon.ico',
  // CF Pages / Netlify-style redirects file. Picked up by Cloudflare
  // Pages at deploy time to serve 301/302 redirects without a
  // function. Used to preserve legacy /<slug>/ URLs that were
  // renamed during migration.
  '_redirects',
];

// Top-level directories copied into out/ recursively. These are all
// small (HTML + small CSS), no binary blobs.
const DIRS = [
  'people',     // people/index.html + people/<slug>/index.html × N
  'contact',
  'css',        // Tailwind output (~150 KB minified)
  'areas',
  'includes',   // lab-header.html / lab-attribution.html (consumed
                // by external lab project repos)
];

// Same-origin asset SUBTREES that templates link to as raw
// /assets/... paths (not via cdnUrl). Tiny — favicons and the lab
// logo. Everything else under assets/ stays out of out/ — it's on R2.
const ASSET_SUBDIRS = [
  'images/favicons',
  'images/logos',
];

// Single same-origin files under assets/ that templates / scripts
// fetch by path (not via cdnUrl).
const ASSET_FILES = [
  'search-index.json',  // loaded by /search.js for client-side search
];

// research/<slug>/ contains the embedded paper HTML view + a bunch
// of LFS-tracked binaries (paper.pdf, paper-content.json, assets/
// figure images). Only the rendered index.html is referenced from
// the rest of the site as a same-origin URL — the PDF and figures
// resolve to CDN URLs in the rendered HTML via the cdnUrl helper +
// rewrite_paper_content.js. So we copy ONLY each research/<slug>/
// index.html, skipping the binary subtree.
async function copyResearchHtmlOnly() {
  const src = path.join(ROOT, 'research');
  const dst = path.join(OUT, 'research');
  if (!await fs.pathExists(src)) {
    console.warn('  ⚠️  missing dir: research');
    return 0;
  }
  // Top-level research/index.html (the listing page).
  await fs.remove(dst);
  await fs.ensureDir(dst);
  const topIndex = path.join(src, 'index.html');
  if (await fs.pathExists(topIndex)) {
    await fs.copy(topIndex, path.join(dst, 'index.html'));
  }
  // Per-paper subdirs: copy only index.html.
  const entries = await fs.readdir(src, { withFileTypes: true });
  let copied = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const subSrc = path.join(src, e.name);
    const subDst = path.join(dst, e.name);
    const subIndex = path.join(subSrc, 'index.html');
    if (await fs.pathExists(subIndex)) {
      await fs.ensureDir(subDst);
      await fs.copy(subIndex, path.join(subDst, 'index.html'));
      copied++;
    }
  }
  return copied;
}

async function copyAssetWhitelist() {
  const src = path.join(ROOT, 'assets');
  const dst = path.join(OUT, 'assets');
  if (!await fs.pathExists(src)) return 0;
  await fs.remove(dst);
  let copied = 0;
  for (const sub of ASSET_SUBDIRS) {
    const subSrc = path.join(src, sub);
    const subDst = path.join(dst, sub);
    if (!await fs.pathExists(subSrc)) continue;
    await fs.copy(subSrc, subDst);
    copied++;
  }
  for (const f of ASSET_FILES) {
    const fSrc = path.join(src, f);
    const fDst = path.join(dst, f);
    if (!await fs.pathExists(fSrc)) continue;
    await fs.copy(fSrc, fDst, { overwrite: true });
    copied++;
  }
  return copied;
}

async function main() {
  // Project page output already lives at out/<slug>/ from build_pages.js
  // (project.hbs route). Preserve those by NOT wiping out/ wholesale —
  // remove only the dirs/files we're about to repopulate, leaving any
  // out/<slug>/ project page subdirectories untouched.
  await fs.ensureDir(OUT);

  for (const f of FILES) {
    const src = path.join(ROOT, f);
    const dst = path.join(OUT, f);
    if (!await fs.pathExists(src)) {
      console.warn(`  ⚠️  missing: ${f}`);
      continue;
    }
    await fs.copy(src, dst, { overwrite: true });
  }

  for (const d of DIRS) {
    const src = path.join(ROOT, d);
    const dst = path.join(OUT, d);
    if (!await fs.pathExists(src)) {
      console.warn(`  ⚠️  missing dir: ${d}`);
      continue;
    }
    await fs.remove(dst);
    await fs.copy(src, dst);
  }

  const researchCopied = await copyResearchHtmlOnly();
  const assetWlCopied = await copyAssetWhitelist();

  console.log(`✓ assembled out/ — ${FILES.length} files, ${DIRS.length} dirs, ` +
              `${researchCopied} research/<slug>/ HTMLs, ` +
              `${assetWlCopied} same-origin asset paths (favicons/logos/search-index)`);

  // Spot-check: how many project pages ended up in out/
  const entries = await fs.readdir(OUT, { withFileTypes: true });
  const knownTopLevel = new Set([
    ...DIRS, 'research', 'assets',
    ...FILES.filter(f => !f.includes('.')),
  ]);
  const projectDirs = entries.filter(e =>
    e.isDirectory() && !knownTopLevel.has(e.name)
  );
  if (projectDirs.length > 0) {
    console.log(`   project pages present in out/: ${projectDirs.map(e => e.name).join(', ')}`);
  }
}

main().catch(err => {
  console.error('assemble failed:', err);
  process.exit(1);
});
