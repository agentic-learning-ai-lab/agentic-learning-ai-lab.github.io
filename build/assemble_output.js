#!/usr/bin/env node

/**
 * Assemble the deployable bundle in ./out/ by copying all serving
 * artifacts into one directory.
 *
 * Why: project pages (project.hbs) emit directly to `out/<slug>/`, but
 * the rest of the site (research/, people/, areas/, assets/, ...) lives
 * at repo root. To deploy a coherent bundle, we need both. This script
 * is the single source of truth for what goes in the deploy artifact.
 *
 * Used by:
 *   - npm run preview           (local: build + assemble + serve out/)
 *   - .github/workflows/deploy.yml (production: build + assemble + upload)
 *   - Cloudflare Pages          (staging: build command runs npm run build
 *                                which includes assemble; out/ is the
 *                                configured output directory)
 *
 * Idempotent: removes ./out/ first to ensure a clean copy. Cheap (sub-second)
 * because it's mostly cp -R of existing built artifacts.
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
];

// Top-level directories copied into out/ recursively. Each is the
// generated output of a specific page or asset class.
const DIRS = [
  'people',
  'research',
  'contact',
  'assets',
  'css',
  'areas',
  'includes',
];

async function main() {
  // Project page output already lives at out/<slug>/ from build_pages.js
  // (project.hbs route). Preserve those by NOT wiping out/ wholesale —
  // remove only the dirs/files we're about to repopulate, leaving any
  // out/<slug>/ project page subdirectories untouched.
  await fs.ensureDir(OUT);

  let copied = 0;
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    const dst = path.join(OUT, f);
    if (!await fs.pathExists(src)) {
      console.warn(`  ⚠️  missing: ${f}`);
      continue;
    }
    await fs.copy(src, dst, { overwrite: true });
    copied++;
  }

  for (const d of DIRS) {
    const src = path.join(ROOT, d);
    const dst = path.join(OUT, d);
    if (!await fs.pathExists(src)) {
      console.warn(`  ⚠️  missing dir: ${d}`);
      continue;
    }
    // Clean the dst dir first so removed files don't linger.
    await fs.remove(dst);
    await fs.copy(src, dst);
    copied++;
  }

  console.log(`✓ assembled out/ — copied ${FILES.length} files + ${DIRS.length} dirs`);

  // Spot-check: how many project pages ended up in out/
  const entries = await fs.readdir(OUT, { withFileTypes: true });
  const projectDirs = entries.filter(e => e.isDirectory() && !DIRS.includes(e.name));
  if (projectDirs.length > 0) {
    console.log(`   project pages present in out/: ${projectDirs.map(e => e.name).join(', ')}`);
  }
}

main().catch(err => {
  console.error('assemble failed:', err);
  process.exit(1);
});
