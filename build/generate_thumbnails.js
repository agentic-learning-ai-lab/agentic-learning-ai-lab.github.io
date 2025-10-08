const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const THUMBNAIL_SIZE = 256;

// Source and destination directories
const assetsDir = path.resolve(__dirname, '../assets/images');
const thumbnailDir = path.resolve(__dirname, '../assets/images/thumbnails');

// Ensure thumbnail directory exists
fs.ensureDirSync(thumbnailDir);

// Generate center-cropped square thumbnail
async function generateThumbnail(sourcePath, thumbnailPath) {
    try {
        // Get image dimensions
        const { stdout: dimensionsOutput } = await execAsync(
            `sips -g pixelWidth -g pixelHeight "${sourcePath}"`
        );

        const widthMatch = dimensionsOutput.match(/pixelWidth: (\d+)/);
        const heightMatch = dimensionsOutput.match(/pixelHeight: (\d+)/);

        if (!widthMatch || !heightMatch) {
            throw new Error('Could not determine image dimensions');
        }

        const width = parseInt(widthMatch[1]);
        const height = parseInt(heightMatch[1]);

        // Calculate scaling to cover the thumbnail area
        const scale = Math.max(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
        const scaledWidth = Math.round(width * scale);
        const scaledHeight = Math.round(height * scale);

        // Create a temporary file (always use png for temp to avoid webp issues)
        const tempPath = thumbnailPath.replace(/\.[^.]+$/, '.temp.png');

        // Step 1: Resize to cover the thumbnail area (one dimension will be larger than THUMBNAIL_SIZE)
        // Convert to png if source is webp
        await execAsync(
            `sips -z ${scaledHeight} ${scaledWidth} "${sourcePath}" --out "${tempPath}" -s format png`
        );

        // Step 2: Center crop to square
        await execAsync(
            `sips -c ${THUMBNAIL_SIZE} ${THUMBNAIL_SIZE} "${tempPath}" --out "${thumbnailPath}" -s format png`
        );

        // Clean up temp file
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }

        return true;
    } catch (error) {
        throw error;
    }
}

// Get all image files from papers and people directories
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

            // Skip non-image files
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                continue;
            }

            const sourcePath = path.join(dir, file);
            // Convert webp to png for thumbnails since sips can't write webp
            const thumbnailFile = ext === '.webp' ? file.replace('.webp', '.png') : file;
            const thumbnailPath = path.join(thumbnailDir, thumbnailFile);

            // Skip if thumbnail already exists and is newer than source
            if (fs.existsSync(thumbnailPath)) {
                const sourceStats = fs.statSync(sourcePath);
                const thumbStats = fs.statSync(thumbnailPath);

                if (thumbStats.mtime >= sourceStats.mtime) {
                    skippedCount++;
                    continue; // Thumbnail is up to date
                }
            }

            try {
                await generateThumbnail(sourcePath, thumbnailPath);
                thumbnailCount++;
                console.log(`✓ Generated thumbnail: ${name}/${file}`);
            } catch (error) {
                console.error(`✗ Failed to generate thumbnail for ${file}:`, error.message);
            }
        }
    }

    console.log(`\n📸 Thumbnail generation complete:`);
    console.log(`   ${thumbnailCount} thumbnails created/updated`);
    console.log(`   ${skippedCount} thumbnails already up to date`);
}

generateThumbnails().catch(console.error);
