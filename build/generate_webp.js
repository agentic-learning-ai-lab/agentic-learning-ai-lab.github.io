#!/usr/bin/env node

/**
 * Emit a WebP sibling next to every PNG/JPG source under the scoped
 * directories. The original stays committed (archival / fallback /
 * og:image compatibility); the .webp is the wire-format default served
 * via the {{pictureCdn}} helper or — for arxiv inline figures —
 * substituted by build/rewrite_paper_content.js.
 *
 * Per-source encoding choice:
 *   - Site images (hero/card/background/headshot): q98 lossy. The eye
 *     can't tell at full size; massive size win on AI-art content.
 *   - Arxiv inline figures: LOSSLESS. Academic figures contain text
 *     labels, line-art, and matplotlib output where lossy artifacts
 *     (mosquito noise on glyphs) would be visible even at q98.
 *     Lossless still beats PNG by ~20-30% on these files and removes
 *     the quality-risk axis entirely.
 *
 * Skip-if-newer cache: if `<basename>.webp` is newer than its source,
 * do nothing. Sub-second re-run.
 *
 * Atomic write: encode to .tmp, rename on success. SIGKILL or OOM
 * mid-encode otherwise leaves a truncated .webp that the mtime-based
 * cache would happily reuse on the next run.
 */

const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const glob = require('glob');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_EXTS = new Set(['.png', '.jpg', '.jpeg']);

// Per-source-dir encoding. Each entry: a glob (POSIX-relative to repo root)
// and the sharp `.webp({...})` options to apply.
const SOURCES = [
  // Site images — hero/card/background/headshot. q98 lossy.
  { glob: 'assets/images/papers/*.{png,jpg,jpeg}',     opts: { quality: 98 } },
  { glob: 'assets/images/background/*.{png,jpg,jpeg}', opts: { quality: 98 } },
  { glob: 'assets/images/home/*.{png,jpg,jpeg}',       opts: { quality: 98 } },
  { glob: 'assets/images/people/*.{png,jpg,jpeg}',     opts: { quality: 98 } },
  // Project page assets — marketing-style figures + hero shots.
  // Treated like site images (q98 lossy). For pages that need
  // pixel-perfect lossless renders, hand-drop .webp directly and
  // skip generation by removing the source .png.
  { glob: 'assets/projects/**/*.{png,jpg,jpeg}',       opts: { quality: 98 } },
  // Arxiv inline figures — text + line-art. Lossless.
  { glob: 'research/*/assets/**/*.{png,jpg,jpeg}',     opts: { lossless: true } },
];

async function generateOne(sourcePath, opts) {
  const webpPath = sourcePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

  if (await fs.pathExists(webpPath)) {
    const [src, dst] = await Promise.all([fs.stat(sourcePath), fs.stat(webpPath)]);
    if (dst.mtime >= src.mtime) return { skipped: true };
  }

  const tmpPath = `${webpPath}.tmp`;
  try {
    await sharp(sourcePath).webp(opts).toFile(tmpPath);
    await fs.move(tmpPath, webpPath, { overwrite: true });
  } catch (err) {
    await fs.remove(tmpPath).catch(() => {});
    throw err;
  }
  return { skipped: false, webpPath };
}

async function main() {
  let generated = 0, skipped = 0, failed = 0;
  let savedBytes = 0;

  for (const source of SOURCES) {
    const files = glob.sync(source.glob, { cwd: ROOT, nodir: true });
    if (files.length === 0) continue;
    const modeLabel = source.opts.lossless ? 'lossless' : `q${source.opts.quality}`;
    console.log(`\n[${modeLabel}] ${source.glob} (${files.length} candidate${files.length === 1 ? '' : 's'})`);

    for (const rel of files) {
      const ext = path.extname(rel).toLowerCase();
      if (!SOURCE_EXTS.has(ext)) continue;
      const sourcePath = path.join(ROOT, rel);
      try {
        const res = await generateOne(sourcePath, source.opts);
        if (res.skipped) {
          skipped++;
        } else {
          const srcSize = (await fs.stat(sourcePath)).size;
          const dstSize = (await fs.stat(res.webpPath)).size;
          savedBytes += (srcSize - dstSize);
          generated++;
          const savedPct = ((1 - dstSize / srcSize) * 100).toFixed(0);
          // Only log individual writes for site dirs (small set). Arxiv
          // figures are ~1000 files; collapse them into summary only.
          if (!source.glob.startsWith('research/')) {
            console.log(`  ${rel} → .webp (${savedPct}% smaller)`);
          }
        }
      } catch (err) {
        console.error(`  Failed: ${rel}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\nWebP generation: ${generated} created · ${skipped} up-to-date${failed ? ` · ${failed} failed` : ''}`);
  if (generated > 0) {
    const savedMb = (savedBytes / 1024 / 1024).toFixed(1);
    console.log(`  saved ${savedMb} MB across ${generated} file${generated === 1 ? '' : 's'}`);
  }
}

main().catch(err => {
  console.error('WebP generation failed:', err);
  process.exit(1);
});
