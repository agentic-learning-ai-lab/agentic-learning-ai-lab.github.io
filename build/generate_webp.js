#!/usr/bin/env node

/**
 * Emit a WebP sibling next to every PNG/JPG source in the scoped image
 * directories. The original stays committed (archival / fallback / og:image
 * compatibility); the .webp is the wire-format default for hero <img>,
 * card thumbnails, and CSS backgrounds.
 *
 *   assets/images/papers/foo.png  →  assets/images/papers/foo.webp
 *
 * Templates use {{pictureCdn}} for <img> elements (gets WebP via
 * <picture> with PNG fallback) and {{cdnUrlWebp}} for CSS
 * background-image (WebP only — 97%+ browser support; degraders see no
 * background, which is acceptable for a research lab site).
 *
 * Skip-if-newer cache: if `<basename>.webp` is newer than its source,
 * do nothing. Sub-second re-run.
 */

const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const QUALITY = 85;

const ROOT = path.resolve(__dirname, '..');
const WEBP_DIRS = [
  'assets/images/papers',
  'assets/images/background',
  'assets/images/home',
  'assets/images/people',
];
const SOURCE_EXTS = new Set(['.png', '.jpg', '.jpeg']);

async function generateOne(sourcePath) {
  const webpPath = sourcePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

  if (await fs.pathExists(webpPath)) {
    const [src, dst] = await Promise.all([fs.stat(sourcePath), fs.stat(webpPath)]);
    if (dst.mtime >= src.mtime) return { skipped: true };
  }

  await sharp(sourcePath).webp({ quality: QUALITY }).toFile(webpPath);
  return { skipped: false, webpPath };
}

async function main() {
  let generated = 0, skipped = 0, failed = 0;
  let savedBytes = 0;

  for (const relDir of WEBP_DIRS) {
    const dir = path.join(ROOT, relDir);
    if (!await fs.pathExists(dir)) {
      console.log(`  (skipping nonexistent ${relDir})`);
      continue;
    }
    for (const file of await fs.readdir(dir)) {
      const ext = path.extname(file).toLowerCase();
      if (!SOURCE_EXTS.has(ext)) continue;

      const sourcePath = path.join(dir, file);
      try {
        const res = await generateOne(sourcePath);
        if (res.skipped) {
          skipped++;
        } else {
          const srcSize = (await fs.stat(sourcePath)).size;
          const dstSize = (await fs.stat(res.webpPath)).size;
          savedBytes += (srcSize - dstSize);
          generated++;
          const savedPct = ((1 - dstSize / srcSize) * 100).toFixed(0);
          console.log(`  ${relDir}/${file} → .webp (${savedPct}% smaller)`);
        }
      } catch (err) {
        console.error(`  Failed: ${relDir}/${file}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\nWebP generation: ${generated} created · ${skipped} up-to-date${failed ? ` · ${failed} failed` : ''}`);
  if (generated > 0) {
    console.log(`  saved ${(savedBytes / 1024 / 1024).toFixed(1)} MB across ${generated} files`);
  }
}

main().catch(err => {
  console.error('WebP generation failed:', err);
  process.exit(1);
});
