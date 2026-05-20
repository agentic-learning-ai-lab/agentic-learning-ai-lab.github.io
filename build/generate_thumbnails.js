const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const THUMBNAIL_SIZE = 256;

const assetsDir = path.resolve(__dirname, '../assets/images');
const thumbnailDir = path.resolve(__dirname, '../assets/images/thumbnails');

fs.ensureDirSync(thumbnailDir);

async function generateThumbnail(sourcePath, thumbnailPath) {
    await sharp(sourcePath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'center'
        })
        .png()
        .toFile(thumbnailPath);
    return true;
}

async function generateThumbnails() {
    const imageDirs = [
        { dir: path.join(assetsDir, 'papers'), name: 'papers' },
        { dir: path.join(assetsDir, 'people'), name: 'people' },
        { dir: path.join(assetsDir, 'home'), name: 'home' }
    ];

    let thumbnailCount = 0;
    let skippedCount = 0;

    for (const { dir, name } of imageDirs) {
        if (!fs.existsSync(dir)) {
            console.log(`Directory not found: ${dir}`);
            continue;
        }

        // Sort so primary sources (.jpg/.jpeg/.png) come before their
        // .webp companion, then dedupe by stem — at most one thumbnail
        // per source image. Without this, foo.jpg AND foo.webp would
        // each try to write the same foo.png thumbnail; build:webp
        // refreshes the .webp's mtime every build, which kept beating
        // the just-written thumbnail's mtime and re-encoding it through
        // sharp on every run — producing byte-different thumbnails
        // each build and a dirty manifest after sync:r2.
        const EXT_PRIORITY = { '.jpg': 0, '.jpeg': 0, '.png': 0, '.webp': 1 };
        const files = fs.readdirSync(dir)
            .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
            .sort((a, b) => {
                const pa = EXT_PRIORITY[path.extname(a).toLowerCase()];
                const pb = EXT_PRIORITY[path.extname(b).toLowerCase()];
                if (pa !== pb) return pa - pb;
                return a.localeCompare(b);
            });
        const stemsSeen = new Set();

        for (const file of files) {
            const stem = file.replace(/\.[^.]+$/, '');
            if (stemsSeen.has(stem)) continue;
            stemsSeen.add(stem);

            const sourcePath = path.join(dir, file);
            // Output as PNG (sharp handles WebP input natively)
            const thumbnailPath = path.join(thumbnailDir, `${stem}.png`);

            if (fs.existsSync(thumbnailPath)) {
                const sourceStats = fs.statSync(sourcePath);
                const thumbStats = fs.statSync(thumbnailPath);

                if (thumbStats.mtime >= sourceStats.mtime) {
                    skippedCount++;
                    continue;
                }
            }

            try {
                await generateThumbnail(sourcePath, thumbnailPath);
                thumbnailCount++;
                console.log(`  Generated thumbnail: ${name}/${file}`);
            } catch (error) {
                console.error(`  Failed to generate thumbnail for ${file}: ${error.message}`);
            }
        }
    }

    console.log(`\nThumbnail generation complete:`);
    console.log(`  ${thumbnailCount} created/updated`);
    console.log(`  ${skippedCount} already up to date`);
}

generateThumbnails().catch(console.error);
