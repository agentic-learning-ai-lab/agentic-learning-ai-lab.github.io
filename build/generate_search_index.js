const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

// Read all data files
const papers = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml'), 'utf8'));
const people = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml'), 'utf8'));
const researchAreas = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/research_areas.yaml'), 'utf8'));

// Build search index
const searchIndex = [];

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
        thumbnail = `/assets/images/thumbnails/${imageName}`;
    }

    searchIndex.push({
        type: 'paper',
        title: paper.title,
        authors: paper.authors ? paper.authors.join(', ') : '',
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
        thumbnail = `/assets/images/thumbnails/${imageName}`;
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
        thumbnail = `/assets/images/thumbnails/${imageName}`;
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
