'use strict';
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const handlebarsFactory = require('handlebars');
const moment = require('moment');

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');
const ASSETS_MANIFEST_PATH = path.resolve(__dirname, '../assets-manifest.json');

// Memoized once-per-process — build_pages.js spawns one templater
// subprocess per template, so this loads ~7 times per build, ~negligible.
let _manifest = null;
function loadAssetsManifest() {
    if (_manifest !== null) return _manifest;
    if (fs.existsSync(ASSETS_MANIFEST_PATH)) {
        _manifest = JSON.parse(fs.readFileSync(ASSETS_MANIFEST_PATH, 'utf-8'));
    } else {
        _manifest = {};
    }
    return _manifest;
}

// Collect cdnUrl lookups that fell back to local paths. Printed at end
// so authors notice when they've added an asset but forgotten to run
// `npm run sync:r2`. Doesn't fail the build — fallback already works.
const _cdnMisses = new Set();

doTemplating(process.argv[2], process.argv[3]);

process.on('exit', () => {
    if (_cdnMisses.size > 0) {
        console.warn(`⚠️  ${_cdnMisses.size} cdnUrl lookup(s) fell back to local (not in assets-manifest.json):`);
        for (const p of _cdnMisses) console.warn(`     ${p}`);
        console.warn(`   Run 'npm run sync:r2' and recommit assets-manifest.json to fix.`);
    }
});

function doTemplating(input, output) {
    const handlebars = handlebarsFactory.create();
    registerHelpers(handlebars);
    registerPartials(handlebars);

    const template = compileTemplate(handlebars, input);
    const documents = parseDocuments();

    if (input === "paper.hbs") {
        for (const paper of documents.papers) {
            const output_new = output.replace("{{permalink}}", paper.permalink);
            fs.mkdirSync(path.dirname(output_new), { recursive: true });

            paper.has_full_paper = !!paper.enable_full_paper;

            const localPdfPath = path.join(__dirname, '..', 'research', paper.permalink, 'paper.pdf');
            if (fs.existsSync(localPdfPath)) {
                paper.has_local_pdf = true;
                paper.local_pdf = `/research/${paper.permalink}/paper.pdf`;
            }
            paper.has_pdf_link = paper.has_local_pdf || !!paper.pdf;

            fs.writeFileSync(output_new, template(paper));
        }
    }
    else if (input === "person.hbs") {
        for (const person of documents.people) {
            const output_new = output.replace("{{permalink}}", person.permalink);
            fs.mkdirSync(path.dirname(output_new), { recursive: true });

            const papers = [];
            for (const paper of documents.papers) {
                for (const author of paper.authors) {
                    if (person.name === author) {
                        papers.push(paper);
                        break;
                    }
                }
            }
            person.papers = papers;
            fs.writeFileSync(output_new, template(person));
        }
    }
    else if (input === "research_area.hbs") {
        for (const ra of documents.research_areas) {
            const output_new = output.replace("{{permalink}}", ra.permalink);
            fs.mkdirSync(path.dirname(output_new), { recursive: true });

            const papers = [];
            for (const p of documents.papers) {
                for (const ra2 of p.research_areas) {
                    if (ra2 === ra.permalink) {
                        papers.push(p);
                    }
                }
            }
            ra.papers = papers;
            fs.writeFileSync(output_new, template(ra));
        }
    } else {
        fs.writeFileSync(output, template(documents));
    }
}

function compileTemplate(handlebars, input) {
    return handlebars.compile(fs.readFileSync(input, { encoding: 'utf-8' }));
}

function parseDocuments() {
    const research_areas = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/research_areas.yaml')));
    const papers = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml')));
    const people = yaml.load(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml')));
    const people_current = people.filter(x => x.current);
    const people_alumni = people.filter(x => !x.current);

    // Normalize the data — ensure required fields exist
    for (const ra of research_areas) {
        ensureArrayExists(ra, 'title');
        ensureArrayExists(ra, 'image');
        ensureArrayExists(ra, 'Description');
    }
    for (const p of papers) {
        ensureArrayExists(p, 'title');
        ensureArrayExists(p, 'image');
        ensureArrayExists(p, 'short_abstract');
    }
    for (const p of people) {
        ensureArrayExists(p, 'name');
        ensureArrayExists(p, 'position');
        ensureArrayExists(p, 'image');
        ensureArrayExists(p, 'url');
    }
    const recent_papers = papers.filter((p) => p['is_recent']);

    return { research_areas, papers, recent_papers, people, people_current, people_alumni };
}

function registerPartials(handlebars) {
    for (const filename of fs.readdirSync(TEMPLATES_DIR)) {
        const filePath = path.resolve(TEMPLATES_DIR, filename);
        const partialName = path.basename(filename, '.hbs');
        const contents = fs.readFileSync(filePath, { encoding: 'utf-8' });
        handlebars.registerPartial(partialName, contents);
    }
}

function registerHelpers(handlebars) {
    // {{cdnUrl '/research/<slug>/paper.pdf'}} → 'https://cdn.agenticlearning.ai/<hash>/<slug>.pdf'
    //
    // Looks up `logicalPath` in assets-manifest.json (populated by
    // build/sync_to_r2.js). Falls back to the local path if the manifest
    // doesn't have an entry — graceful degradation lets us migrate
    // templates incrementally without breaking pages mid-migration.
    handlebars.registerHelper('cdnUrl', function (logicalPath) {
        if (!logicalPath) return '';
        const manifest = loadAssetsManifest();
        if (manifest[logicalPath]) return manifest[logicalPath];
        _cdnMisses.add(logicalPath);
        return logicalPath;
    });

    // {{cdnUrlWebp '/assets/images/papers/foo.png'}} →
    //   'https://cdn.agenticlearning.ai/<hash>/foo.webp' if a sibling
    //   .webp exists in the manifest, else the original cdnUrl.
    //
    // Used for CSS background-image (no <picture> element available).
    // Browsers without WebP support (~2%) see no background; we accept
    // that for a research lab site. For <img> elements use {{pictureCdn}}
    // which keeps a PNG fallback.
    function webpVariant(logicalPath) {
        return logicalPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    }
    handlebars.registerHelper('cdnUrlWebp', function (logicalPath) {
        if (!logicalPath) return '';
        const manifest = loadAssetsManifest();
        const webpPath = webpVariant(logicalPath);
        if (manifest[webpPath]) return manifest[webpPath];
        // No .webp in manifest — fall back to cdnUrl of the original.
        // This is the migration-friendly path: a fresh paper with no
        // sync:r2 run yet still renders correctly.
        if (manifest[logicalPath]) return manifest[logicalPath];
        _cdnMisses.add(logicalPath);
        return logicalPath;
    });

    // {{pictureCdn '/assets/images/papers/foo.png' alt='hero' class='tw-w-full'}}
    //   →  <picture>
    //        <source srcset="<webp-cdn-url>" type="image/webp">
    //        <img src="<png-cdn-url>" alt="hero" class="tw-w-full" loading="lazy">
    //      </picture>
    //
    // Use for any <img> element that should benefit from WebP. The PNG
    // fallback inside <img> guarantees correctness on browsers without
    // WebP support. Loading="lazy" is the modern default; pass
    // `eager="true"` for above-the-fold images that should preload.
    //
    // Hash options: alt, class, eager. (Handlebars block helpers receive
    // hash args via options.hash.) Class is intentionally raw — we want
    // Tailwind classes pass-through.
    handlebars.registerHelper('pictureCdn', function (logicalPath, options) {
        if (!logicalPath) return '';
        const manifest = loadAssetsManifest();
        const hash = (options && options.hash) || {};

        // Resolve PNG/JPG URL (always present — that's the original asset).
        const pngUrl = manifest[logicalPath] || (_cdnMisses.add(logicalPath), logicalPath);

        // Resolve WebP URL (optional — graceful when missing).
        const webpPath = webpVariant(logicalPath);
        const webpUrl = manifest[webpPath];

        const altAttr = ` alt="${(hash.alt || '').replace(/"/g, '&quot;')}"`;
        const classAttr = hash.class ? ` class="${hash.class}"` : '';
        const loadingAttr = hash.eager ? '' : ' loading="lazy"';

        const sourceTag = webpUrl
            ? `<source srcset="${webpUrl}" type="image/webp">`
            : '';
        const out = `<picture>${sourceTag}<img src="${pngUrl}"${altAttr}${classAttr}${loadingAttr}></picture>`;
        return new handlebars.SafeString(out);
    });

    handlebars.registerHelper('formatDate', function (date, format) {
        return moment.utc(date).format(format);
    });

    handlebars.registerHelper('formatAuthors', function (authors) {
        if (authors.length === 0) {
            return "";
        } else if (authors.length === 1) {
            return authors[0];
        } else if (authors.length === 2) {
            return authors[0] + ' and ' + authors[1];
        } else {
            return authors.slice(0, -1).join(', ') + ', and ' + authors[authors.length - 1];
        }
    });

    // Cache people map to avoid re-parsing YAML on every call
    let _peopleMap = null;
    handlebars.registerHelper('formatAuthorsWithLinks', function (authors) {
        if (!_peopleMap) {
            const peopleData = parseDocuments().people;
            _peopleMap = new Map(peopleData.map(p => [p.name, p.permalink]));
        }

        if (!authors || authors.length === 0) {
            return "";
        }

        const formattedAuthors = authors.map(author => {
            if (_peopleMap.has(author)) {
                return `<a href="/people/${_peopleMap.get(author)}/">${author}</a>`;
            }
            return author;
        });

        let result;
        if (formattedAuthors.length === 1) {
            result = formattedAuthors[0];
        } else if (formattedAuthors.length === 2) {
            result = formattedAuthors[0] + ' and ' + formattedAuthors[1];
        } else {
            result = formattedAuthors.slice(0, -1).join(', ') + ', and ' + formattedAuthors[formattedAuthors.length - 1];
        }

        return new handlebars.SafeString(result);
    });
}

function ensureArrayExists(obj, prop) {
    if (!(prop in obj)) {
        obj[prop] = [];
    }
}
