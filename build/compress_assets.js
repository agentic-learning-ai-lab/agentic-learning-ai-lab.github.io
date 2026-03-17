#!/usr/bin/env node

// Compress paper assets (images) downloaded from arXiv.
// Resizes PNGs and JPGs in research assets to max 1400px width using sips.
// Uses a .compressed marker directory for caching.
//
// Usage:
//   node build/compress_assets.js           # Compress with caching
//   node build/compress_assets.js --force   # Force re-compress all

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const MAX_WIDTH = 1400;
const RESEARCH_DIR = path.resolve(__dirname, '../research');
const MARKER_DIR_NAME = '.compressed';

/**
 * Get image dimensions via sips
 */
async function getImageWidth(imagePath) {
  const { stdout } = await execAsync(`sips -g pixelWidth "${imagePath}"`);
  const match = stdout.match(/pixelWidth: (\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Compress a single image in-place
 */
async function compressImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const width = await getImageWidth(imagePath);

  if (!width || width <= MAX_WIDTH) {
    return { skipped: true, reason: 'already small' };
  }

  const originalSize = (await fs.stat(imagePath)).size;

  // Resize to max width, maintaining aspect ratio
  await execAsync(`sips --resampleWidth ${MAX_WIDTH} "${imagePath}"`);

  // Set JPEG quality
  if (ext === '.jpg' || ext === '.jpeg') {
    await execAsync(`sips -s formatOptions 80 "${imagePath}"`);
  }

  const compressedSize = (await fs.stat(imagePath)).size;
  return { originalSize, compressedSize, skipped: false };
}

/**
 * Process all assets in research directories
 */
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

    // If force, remove all markers
    if (force && await fs.pathExists(markerDir)) {
      await fs.remove(markerDir);
    }

    await fs.ensureDir(markerDir);

    // Find all images recursively
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
      // Marker path: relative path from assets dir, stored in .compressed/
      const relPath = path.relative(assetsDir, imagePath);
      const markerPath = path.join(markerDir, relPath);

      // Check cache
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
        // Create marker (ensure subdirectory exists for nested paths)
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

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  compressAllAssets(force).catch(error => {
    console.error('Compression failed:', error);
    process.exit(1);
  });
}

module.exports = { compressAllAssets };
