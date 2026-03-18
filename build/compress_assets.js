#!/usr/bin/env node

// Compress paper assets (images) downloaded from arXiv.
// Resizes PNGs and JPGs in research assets to max 1400px width using sharp.
// Uses a .compressed marker directory for caching.
//
// Usage:
//   node build/compress_assets.js           # Compress with caching
//   node build/compress_assets.js --force   # Force re-compress all

const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const MAX_WIDTH = 1400;
const RESEARCH_DIR = path.resolve(__dirname, '../research');
const MARKER_DIR_NAME = '.compressed';

async function compressImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width;

  if (!width || width <= MAX_WIDTH) {
    return { skipped: true, reason: 'already small' };
  }

  const originalSize = (await fs.stat(imagePath)).size;
  const tempPath = imagePath + '.tmp';

  let pipeline = sharp(imagePath)
    .resize(MAX_WIDTH, null, { withoutEnlargement: true });

  if (ext === '.jpg' || ext === '.jpeg') {
    pipeline = pipeline.jpeg({ quality: 80 });
  } else if (ext === '.png') {
    pipeline = pipeline.png();
  }

  await pipeline.toFile(tempPath);
  await fs.move(tempPath, imagePath, { overwrite: true });

  const compressedSize = (await fs.stat(imagePath)).size;
  return { originalSize, compressedSize, skipped: false };
}

async function compressAllAssets(force = false) {
  console.log('Compressing paper assets...\n');

  if (force) {
    console.log('Force mode: re-compressing all images\n');
  }

  const dirs = await fs.readdir(RESEARCH_DIR);
  let totalCompressed = 0;
  let totalSkipped = 0;
  let totalSavedBytes = 0;

  for (const dir of dirs) {
    const assetsDir = path.join(RESEARCH_DIR, dir, 'assets');
    if (!await fs.pathExists(assetsDir)) continue;

    const markerDir = path.join(assetsDir, MARKER_DIR_NAME);

    if (force && await fs.pathExists(markerDir)) {
      await fs.remove(markerDir);
    }

    await fs.ensureDir(markerDir);

    const images = [];
    async function findImages(searchDir) {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === MARKER_DIR_NAME) continue;
        const fullPath = path.join(searchDir, entry.name);
        if (entry.isDirectory()) {
          await findImages(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            images.push(fullPath);
          }
        }
      }
    }
    await findImages(assetsDir);

    if (images.length === 0) continue;

    let dirCompressed = 0;
    for (const imagePath of images) {
      const relPath = path.relative(assetsDir, imagePath);
      const markerPath = path.join(markerDir, relPath);

      if (!force && await fs.pathExists(markerPath)) {
        const imgStat = await fs.stat(imagePath);
        const markerStat = await fs.stat(markerPath);
        if (markerStat.mtime >= imgStat.mtime) {
          totalSkipped++;
          continue;
        }
      }

      try {
        const result = await compressImage(imagePath);
        await fs.ensureDir(path.dirname(markerPath));
        await fs.ensureFile(markerPath);

        if (result.skipped) {
          totalSkipped++;
        } else {
          const saved = result.originalSize - result.compressedSize;
          totalSavedBytes += saved;
          dirCompressed++;
          totalCompressed++;
        }
      } catch (err) {
        console.warn(`  Warning: Failed to compress ${path.relative(RESEARCH_DIR, imagePath)}: ${err.message}`);
      }
    }

    if (dirCompressed > 0) {
      console.log(`  ${dir}: ${dirCompressed} images compressed`);
    }
  }

  console.log(`\nCompression complete:`);
  console.log(`  Compressed: ${totalCompressed}`);
  console.log(`  Skipped: ${totalSkipped}`);
  if (totalSavedBytes > 0) {
    console.log(`  Saved: ${(totalSavedBytes / 1024 / 1024).toFixed(1)}MB`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  compressAllAssets(force).catch(error => {
    console.error('Compression failed:', error);
    process.exit(1);
  });
}

module.exports = { compressAllAssets };
