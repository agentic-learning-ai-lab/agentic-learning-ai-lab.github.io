const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

// Read all data files
let papers, people, researchAreas;
try {
    papers = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml'), 'utf8'));
    people = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml'), 'utf8'));
    researchAreas = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/research_areas.yaml'), 'utf8'));
} catch (err) {
    console.error('Failed to load YAML data files:', err.message);
    process.exit(1);
}

// Load the asset manifest so we can emit CDN URLs for the thumbnails
// instead of same-origin /assets/images/thumbnails/... paths. The slim
// out/ bundle on Cloudflare Pages doesn't ship the thumbnails subtree;
// they're served from R2 alongside every other binary asset.
const MANIFEST_PATH = path.resolve(__dirname, '../assets-manifest.json');
let manifest = {};
if (fs.existsSync(MANIFEST_PATH)) {
    try {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (err) {
        console.warn('search-index: failed to parse assets-manifest.json:', err.message);
    }
}

function cdnUrlFor(logical) {
    if (!logical) return '';
    return manifest[logical] || logical;
}

// Build search index
const searchIndex = [];

// Helper function to format authors with "and"
function formatAuthors(authors) {
    if (!authors || authors.length === 0) {
        return '';
    } else if (authors.length === 1) {
        return authors[0];
    } else if (authors.length === 2) {
        return authors[0] + ' and ' + authors[1];
    } else {
        return authors.slice(0, -1).join(', ') + ', and ' + authors[authors.length - 1];
    }
}

// Add papers to search index
papers.forEach(paper => {
    // Generate thumbnail path from image path
    // Convert .webp to .png since thumbnails are converted to PNG
    let thumbnail = '';
    if (paper.image) {
        let imageName = path.basename(paper.image);
        if (imageName.endsWith('.webp')) {
            imageName = imageName.replace('.webp', '.png');
        }
        thumbnail = cdnUrlFor(`/assets/images/thumbnails/${imageName}`);
    }

    searchIndex.push({
        type: 'paper',
        title: paper.title,
        authors: formatAuthors(paper.authors),
        abstract: paper.short_abstract || paper.abstract || '',
        image: paper.image || '',
        thumbnail: thumbnail,
        url: `/research/${paper.permalink}/`,
        keywords: [
            paper.title,
            ...(paper.authors || []),
            paper.short_abstract || '',
            ...(paper.research_areas || [])
        ].join(' ').toLowerCase()
    });
});

// Add people to search index
people.forEach(person => {
    // Generate thumbnail path from image path
    // Convert .webp to .png since thumbnails are converted to PNG
    let thumbnail = '';
    if (person.image) {
        let imageName = path.basename(person.image);
        if (imageName.endsWith('.webp')) {
            imageName = imageName.replace('.webp', '.png');
        }
        thumbnail = cdnUrlFor(`/assets/images/thumbnails/${imageName}`);
    }

    searchIndex.push({
        type: 'person',
        title: person.name,
        position: person.position || '',
        description: person.description || '',
        image: person.image || '',
        thumbnail: thumbnail,
        url: `/people/${person.permalink}/`,
        keywords: [
            person.name,
            person.position || '',
            person.description || ''
        ].join(' ').toLowerCase()
    });
});

// Add research areas to search index
researchAreas.forEach(area => {
    // Generate thumbnail path from image path
    // Convert .webp to .png since thumbnails are converted to PNG
    let thumbnail = '';
    if (area.image) {
        let imageName = path.basename(area.image);
        if (imageName.endsWith('.webp')) {
            imageName = imageName.replace('.webp', '.png');
        }
        thumbnail = cdnUrlFor(`/assets/images/thumbnails/${imageName}`);
    }

    searchIndex.push({
        type: 'research-area',
        title: area.title,
        description: area.description || '',
        image: area.image || '',
        thumbnail: thumbnail,
        url: `/areas/${area.permalink}/`,
        keywords: [
            area.title,
            area.description || ''
        ].join(' ').toLowerCase()
    });
});

// Write search index to file
const outputPath = path.resolve(__dirname, '../assets/search-index.json');
fs.ensureDirSync(path.dirname(outputPath));
fs.writeFileSync(outputPath, JSON.stringify(searchIndex, null, 2));

console.log(`Search index generated: ${searchIndex.length} items`);
