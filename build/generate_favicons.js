#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGO_PATH = path.join(PROJECT_ROOT, 'assets/images/logos/logo.png');
const FAVICON_DIR = path.join(PROJECT_ROOT, 'assets/images/favicons');
const ROOT_FAVICON = path.join(PROJECT_ROOT, 'favicon.ico');

const SIZES = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
    if (!await fs.pathExists(LOGO_PATH)) {
        console.error(`Logo not found: ${LOGO_PATH}`);
        process.exit(1);
    }

    await fs.ensureDir(FAVICON_DIR);

    for (const { name, size } of SIZES) {
        await sharp(LOGO_PATH)
            .resize(size, size)
            .png()
            .toFile(path.join(FAVICON_DIR, name));
        console.log(`  Generated ${name}`);
    }

    await fs.copy(path.join(FAVICON_DIR, 'favicon-32x32.png'), ROOT_FAVICON);
    console.log(`  Generated favicon.ico`);
}

generateFavicons().catch(err => {
    console.error('Favicon generation failed:', err);
    process.exit(1);
});
