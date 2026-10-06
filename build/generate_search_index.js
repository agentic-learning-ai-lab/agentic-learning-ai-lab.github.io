const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

// Read all data files
let papers, people, tags;
try {
    papers = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml'), 'utf8'));
    people = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml'), 'utf8'));
    tags = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/tags.yaml'), 'utf8'));
} catch (err) {
    console.error('Failed to load YAML data files:', err.message);
    process.exit(1);
}

// tag slug → label, for enriching paper keywords with human-readable
// tag labels ("world models" not "world-models"). Falls back to the
// slug itself so a paper tagged with a slug not in the vocabulary
// still contributes something searchable.
const tagLabels = new Map(tags.map(t => [t.slug, t.label]));

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
    // generate_thumbnails.js writes every thumbnail as <stem>.png
    let thumbnail = '';
    if (paper.image) {
        const imageName = path.basename(paper.image).replace(/\.[^.]+$/, '.png');
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
            ...(paper.tags || []),
            ...((paper.tags || []).map(s => tagLabels.get(s) || s)),
        ].join(' ').toLowerCase()
    });
});

// Add people to search index
people.forEach(person => {
    // Generate thumbnail path from image path
    // generate_thumbnails.js writes every thumbnail as <stem>.png
    let thumbnail = '';
    if (person.image) {
        const imageName = path.basename(person.image).replace(/\.[^.]+$/, '.png');
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

// Add tags to search index so a search for "world models" surfaces
// /tags/world-models/ alongside matching papers. Keywords are the tag's
// own words only — folding in paper titles made tags crowd out people
// and papers on unrelated queries.
tags.forEach(tag => {
    searchIndex.push({
        type: 'tag',
        title: tag.label,
        description: tag.description || '',
        image: '',
        thumbnail: '',
        url: `/tags/${tag.slug}/`,
        keywords: [
            tag.label,
            tag.slug,
            tag.description || '',
        ].join(' ').toLowerCase(),
    });
});

// Write search index to file
const outputPath = path.resolve(__dirname, '../assets/search-index.json');
fs.ensureDirSync(path.dirname(outputPath));
fs.writeFileSync(outputPath, JSON.stringify(searchIndex, null, 2));

console.log(`Search index generated: ${searchIndex.length} items`);
