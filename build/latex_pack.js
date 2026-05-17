#!/usr/bin/env node

/**
 * Publish a local LaTeX source tree to R2 as a tar.gz.
 *
 *   research/<slug>/latex/  →  arxiv_latex_cleaner  →  tar.gz  →  R2
 *
 * After successful upload + manifest update, the local tree is deleted
 * (the canonical copy lives on R2 now; re-fetch with `latex:fetch`).
 *
 * Usage:
 *   node build/latex_pack.js <slug>      # pack one paper
 *   node build/latex_pack.js --all       # pack every research/<slug>/latex/ found
 *   node build/latex_pack.js --keep <slug>  # don't delete local tree after upload
 *
 * The clean → tar boundary is *the* privacy guarantee: `.tex` never
 * reaches R2 with author comments because cleaning runs immediately
 * before tarring. See notes/latex-tarball-storage.md.
 */

const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const {
  ROOT,
  CDN_BASE,
  hashFile,
  loadManifest,
  saveManifest,
  uploadToR2,
} = require('./r2_lib');

const { cleanLatexSource, manifestKey } = require('./latex_lib');

// Build aux + macOS cruft never go into the tarball. The "source of truth"
// is .tex / .bib / .sty / .cls + figure binaries the author authored.
const TAR_EXCLUDES = [
  '*.aux', '*.log', '*.out', '*.toc', '*.bbl', '*.blg',
  '*.fls', '*.fdb_latexmk', '*.synctex.gz', '*.bcf', '*.run.xml',
  '*.cache', '*.spl', 'paper.pdf',
  '__MACOSX', '.DS_Store',
];

/**
 * Tar a directory into a destination .tar.gz file. Uses BSD/GNU tar's
 * --exclude flag for build aux. Determinism niceties (no timestamps in
 * gzip header) are nice-to-have but not required — content hash will
 * still be stable across re-packs of identical sources.
 */
async function tarDir(srcDir, destTarGz) {
  const args = [
    '-czf', destTarGz,
    ...TAR_EXCLUDES.flatMap(p => ['--exclude', p]),
    '-C', path.dirname(srcDir),
    path.basename(srcDir),
  ];
  await execFileAsync('tar', args);
}

async function packOne(slug, { keep = false } = {}) {
  const latexDir = path.join(ROOT, 'research', slug, 'latex');
  if (!await fs.pathExists(latexDir)) {
    throw new Error(`No local latex tree at ${path.relative(ROOT, latexDir)}`);
  }

  // Clean comments in place. Idempotent — re-cleaning is a no-op.
  await cleanLatexSource(latexDir);

  const tmpDir = path.join(ROOT, '.cache', 'latex-pack');
  await fs.ensureDir(tmpDir);
  const tarPath = path.join(tmpDir, `${slug}.tar.gz`);
  await fs.remove(tarPath); // re-pack may rewrite a stale tarball

  await tarDir(latexDir, tarPath);

  const hash = await hashFile(tarPath);
  const r2Key = `${hash}/${slug}.tar.gz`;
  const cdnUrl = `${CDN_BASE}/${r2Key}`;

  const manifest = await loadManifest();
  const logicalPath = manifestKey(slug);
  const alreadyAtSameUrl = manifest[logicalPath] === cdnUrl;

  if (alreadyAtSameUrl) {
    console.log(`   ⤳  ${slug}: tarball hash unchanged (${hash}); skip upload`);
  } else {
    const sizeMb = ((await fs.stat(tarPath)).size / 1024 / 1024).toFixed(2);
    console.log(`   ⬆️  ${slug}: ${sizeMb} MB → ${r2Key}`);
    await uploadToR2(r2Key, tarPath);
    manifest[logicalPath] = cdnUrl;
    await saveManifest(manifest);
  }

  await fs.remove(tarPath);

  if (!keep) {
    await fs.remove(latexDir);
    console.log(`   🗑️  ${slug}: removed local research/${slug}/latex/`);
  }

  return { slug, cdnUrl, hash, uploaded: !alreadyAtSameUrl };
}

async function packAll(opts) {
  const researchDir = path.join(ROOT, 'research');
  const slugs = [];
  for (const entry of await fs.readdir(researchDir)) {
    const latexDir = path.join(researchDir, entry, 'latex');
    if (await fs.pathExists(latexDir) && (await fs.stat(latexDir)).isDirectory()) {
      slugs.push(entry);
    }
  }
  if (slugs.length === 0) {
    console.log('No research/<slug>/latex/ trees found locally. Nothing to pack.');
    return;
  }
  console.log(`Packing ${slugs.length} paper(s):\n`);

  let uploaded = 0, cached = 0, failed = 0;
  for (const slug of slugs) {
    try {
      const r = await packOne(slug, opts);
      if (r.uploaded) uploaded++; else cached++;
    } catch (err) {
      console.error(`❌ ${slug}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\n📊 Pack summary: ⬆️ ${uploaded} uploaded · 💾 ${cached} cached · ❌ ${failed} failed`);
  if (failed > 0) process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const rest = args.filter(a => a !== '--keep');

  if (rest.includes('--all')) {
    await packAll({ keep });
    return;
  }
  if (rest.length !== 1 || rest[0].startsWith('-')) {
    console.error('Usage: latex:pack <slug>  OR  latex:pack --all  [--keep]');
    process.exit(1);
  }
  await packOne(rest[0], { keep });
}

if (require.main === module) {
  main().catch(err => {
    console.error('Pack failed:', err.message);
    process.exit(1);
  });
}

module.exports = { packOne, packAll };
