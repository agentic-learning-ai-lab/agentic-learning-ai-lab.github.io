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

        const files = fs.readdirSync(dir);

        for (const file of files) {
            const ext = path.extname(file).toLowerCase();

            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                continue;
            }

            const sourcePath = path.join(dir, file);
            // Output as PNG (sharp handles WebP input natively)
            const thumbnailFile = file.replace(/\.[^.]+$/, '.png');
            const thumbnailPath = path.join(thumbnailDir, thumbnailFile);

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
