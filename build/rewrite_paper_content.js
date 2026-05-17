#!/usr/bin/env node

/**
 * Rewrite arxiv-extracted `<img src="./assets/<rel>">` references inside
 * each research/<slug>/paper-content.json to absolute CDN URLs, using
 * the current assets-manifest.json.
 *
 * Runs as part of `npm run build` after build:arxiv:pdf (which emits
 * paper-content.json) and after the author has run `npm run sync:r2`
 * (which populates the manifest entries for the asset binaries). Both
 * are gated by the in-flight build pipeline so the order works out:
 *
 *   author: npm run sync:r2       # populates manifest entries
 *   author: npm run build         # ...includes build:rewrite-paper-content
 *
 * Idempotent. The regex matches only `./assets/...` — once rewritten to
 * `https://cdn.agenticlearning.ai/.../<file>`, a re-run finds no
 * matches and produces no further change. If a manifest entry is
 * missing for a referenced asset, the relative path is left in place
 * (graceful fallback to LFS-served local URL).
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
    data.html = before.replace(/src="\.\/assets\/([^"]+)"/g, (match, assetRel) => {
      const logicalPath = `/research/${slug}/assets/${assetRel}`;
      const cdnUrl = manifest[logicalPath];
      if (cdnUrl) return `src="${cdnUrl}"`;
      missed++;
      if (missedKeys.length < 5) missedKeys.push(logicalPath);
      return match;
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
