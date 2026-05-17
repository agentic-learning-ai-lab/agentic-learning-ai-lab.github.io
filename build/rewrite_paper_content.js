#!/usr/bin/env node

/**
 * Rewrite arxiv-extracted `<img src="./assets/<rel>">` references inside
 * each research/<slug>/paper-content.json to absolute CDN URLs.
 *
 * Preference order per match:
 *   1. lossless WebP sibling (if `assets-manifest.json` has an entry)
 *   2. original PNG/JPG CDN URL (if entry exists)
 *   3. leave the relative path untouched (warned, falls back to LFS)
 *
 * Why WebP first: academic figures are bandwidth-heavy on the Full
 * Paper HTML view (a paper can pull 1-5 MB of figures). Lossless WebP
 * is ~20-30% smaller than PNG with no quality risk. See
 * build/generate_webp.js for the lossless encoder choice.
 *
 * Runs as part of `npm run build` after build:arxiv:pdf (which emits
 * paper-content.json) and after the author has run `npm run sync:r2`
 * (which populates the manifest entries for the asset binaries). Build
 * pipeline order in package.json: build:arxiv:pdf →
 * build:rewrite-paper-content → build:compress → build:pages.
 *
 * Idempotent. The regex matches only `./assets/...` — once rewritten to
 * `https://cdn.agenticlearning.ai/.../<file>`, a re-run finds no
 * matches and produces no further change.
 *
 * Safe to run with no manifest, e.g. a fresh clone: the script logs
 * "no manifest, skipping" and exits 0. Build doesn't fail.
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

async function main() {
  if (!await fs.pathExists(MANIFEST_PATH)) {
    console.log('No assets-manifest.json yet — skipping paper-content rewrite.');
    return;
  }
  const manifest = await fs.readJson(MANIFEST_PATH);

  // Reverse index: CDN URL → logical path. Used to upgrade already-CDN'd
  // PNG/JPG references in paper-content.json (from earlier rewrites) to
  // their newly-available .webp siblings. Without this, content rewritten
  // before the WebP generation step ran would be "frozen" on PNG.
  const urlToLogical = {};
  for (const [logical, url] of Object.entries(manifest)) {
    urlToLogical[url] = logical;
  }

  const files = glob.sync('research/**/paper-content.json', { cwd: ROOT });
  let rewritten = 0, unchanged = 0, missed = 0;
  const missedKeys = [];

  for (const rel of files) {
    const slugMatch = rel.match(/^research\/([^/]+)\//);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    const abs = path.join(ROOT, rel);
    const data = await fs.readJson(abs);
    if (typeof data.html !== 'string') continue;

    const before = data.html;

    // Pass 1: rewrite ./assets/<rel> → best-available CDN URL (prefer webp).
    data.html = data.html.replace(/src="\.\/assets\/([^"]+)"/g, (match, assetRel) => {
      const logicalPath = `/research/${slug}/assets/${assetRel}`;
      const webpPath = logicalPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
      const webpUrl = webpPath !== logicalPath ? manifest[webpPath] : null;
      if (webpUrl) return `src="${webpUrl}"`;
      const cdnUrl = manifest[logicalPath];
      if (cdnUrl) return `src="${cdnUrl}"`;
      missed++;
      if (missedKeys.length < 5) missedKeys.push(logicalPath);
      return match;
    });

    // Pass 2: upgrade existing CDN PNG/JPG URLs to their .webp sibling
    // when one is now available. Catches paper-content.json files that
    // were rewritten before WebP generation ran (e.g. PR #6 vintage).
    data.html = data.html.replace(/src="(https:\/\/cdn\.agenticlearning\.ai\/[^"]+\.(?:png|jpg|jpeg))"/g, (match, oldUrl) => {
      const logical = urlToLogical[oldUrl];
      if (!logical) return match;
      const webpLogical = logical.replace(/\.(png|jpg|jpeg)$/i, '.webp');
      const webpUrl = manifest[webpLogical];
      return webpUrl ? `src="${webpUrl}"` : match;
    });

    if (data.html !== before) {
      // Atomic write: write to .tmp + rename. A SIGKILL mid-write
      // otherwise leaves a truncated paper-content.json that the next
      // build's regex-based detection can't catch (no marker, no size
      // check). Mirrors the pattern in build/generate_webp.js.
      const tmp = `${abs}.tmp`;
      try {
        await fs.writeJson(tmp, data, { spaces: 2 });
        await fs.move(tmp, abs, { overwrite: true });
      } catch (err) {
        await fs.remove(tmp).catch(() => {});
        throw err;
      }
      rewritten++;
    } else {
      unchanged++;
    }
  }

  console.log(`paper-content rewrite: ${rewritten} updated · ${unchanged} unchanged`);
  if (missed > 0) {
    console.warn(`⚠️  ${missed} asset reference(s) had no manifest entry — left as relative paths:`);
    for (const k of missedKeys) console.warn(`     ${k}`);
    if (missed > missedKeys.length) console.warn(`     ...and ${missed - missedKeys.length} more`);
    console.warn(`   Run \`npm run sync:r2\` to publish those assets to R2.`);
  }
}

main().catch(err => {
  console.error('paper-content rewrite failed:', err);
  process.exit(1);
});
