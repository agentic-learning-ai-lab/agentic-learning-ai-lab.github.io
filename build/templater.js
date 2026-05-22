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

            // Check the manifest, not the filesystem: paper.pdf is
            // gitignored and CF Pages cloud builds don't run pull:r2,
            // so fs.existsSync was false on prod even when the PDF
            // was on R2. Falling through to {{pdf}} (= arxiv URL) was
            // the symptom on agenticlearning.ai.
            const localPdfLogical = `/research/${paper.permalink}/paper.pdf`;
            if (loadAssetsManifest()[localPdfLogical]) {
                paper.has_local_pdf = true;
                paper.local_pdf = localPdfLogical;
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
    }
    else if (input === "project.hbs") {
        // Marketing landing pages at /<permalink>/. Opt in via
        // `project_page: true` in data/papers.yaml — content lives in
        // data/projects/<permalink>.md (frontmatter + markdown body).
        //
        // The permalink doubles as a top-level URL path, so it MUST NOT
        // collide with a reserved route.
        const RESERVED = new Set([
            'research', 'people', 'areas', 'contact',
            'assets', 'css', 'includes', 'build', 'data',
            'templates', 'notes', 'out', 'staging', 'node_modules',
        ]);

        const { loadOne } = require('./project_page_loader');

        for (const paper of documents.papers) {
            if (!paper.project_page) continue;

            if (RESERVED.has(paper.permalink)) {
                throw new Error(
                    `permalink "${paper.permalink}" collides with a reserved top-level path; ` +
                    `rename in data/papers.yaml before enabling project_page.`
                );
            }

            const projectData = loadOne(paper.permalink);
            if (!projectData) {
                throw new Error(
                    `papers.yaml has project_page: true for "${paper.permalink}" ` +
                    `but data/projects/${paper.permalink}.md doesn't exist.`
                );
            }

            // Attach the loaded MD data as paper.project_page (replaces
            // the boolean sentinel with the rich object the template
            // expects). Fall back to top-level fields for missing links.
            paper.project_page = projectData;
            paper.project_page.links = paper.project_page.links || {};
            if (!paper.project_page.links.arxiv && paper.arxiv) {
                paper.project_page.links.arxiv = paper.arxiv;
            }
            // PDF link: prefer the self-hosted copy at
            // research/<slug>/paper.pdf (served via CDN) over whatever
            // external URL the YAML's top-level `pdf:` points at —
            // usually arXiv's mirror, which we'd rather not send
            // landing-page visitors to. Mirrors the has_local_pdf
            // logic in the paper.hbs branch above.
            if (!paper.project_page.links.pdf) {
                const localPdfPath = path.join(__dirname, '..', 'research', paper.permalink, 'paper.pdf');
                if (fs.existsSync(localPdfPath)) {
                    const logical = `/research/${paper.permalink}/paper.pdf`;
                    const manifest = loadAssetsManifest();
                    if (manifest[logical]) {
                        paper.project_page.links.pdf = manifest[logical];
                    } else {
                        paper.project_page.links.pdf = logical;
                        _cdnMisses.add(logical);
                    }
                } else if (paper.pdf) {
                    paper.project_page.links.pdf = paper.pdf;
                }
            }

            // Convention: if assets/projects/<slug>/style.css exists,
            // link it in the project page <head>. Lets a project carry
            // page-scoped CSS (e.g., color-coded inline badges that
            // don't belong in the site-wide stylesheet) without
            // touching the global index.css. No flag in the MD
            // frontmatter — file presence is the signal.
            const projectCssPath = path.join(
                __dirname, '..',
                'assets/projects', paper.permalink, 'style.css'
            );
            if (fs.existsSync(projectCssPath)) {
                // Resolve through the manifest so CF Pages reads the
                // stylesheet from cdn.agenticlearning.ai instead of
                // expecting a same-origin /assets/... path (the slim
                // out/ doesn't include project asset subtrees).
                const logical = `/assets/projects/${paper.permalink}/style.css`;
                const manifest = loadAssetsManifest();
                if (manifest[logical]) {
                    paper.project_page.custom_css_href = manifest[logical];
                } else {
                    paper.project_page.custom_css_href = logical;
                    _cdnMisses.add(logical);
                }
            }

            // Inline a per-project custom HTML partial if requested.
            // Path is relative to assets/projects/<slug>/.
            if (paper.project_page.custom_html) {
                const customPath = path.join(
                    __dirname, '..',
                    'assets/projects', paper.permalink, paper.project_page.custom_html
                );
                if (fs.existsSync(customPath)) {
                    paper.project_page.custom_html_inline = fs.readFileSync(customPath, 'utf8');
                } else {
                    console.warn(`  ⚠️  project_page.custom_html points at missing file: ${customPath}`);
                }
            }

            const output_new = output.replace("{{permalink}}", paper.permalink);
            fs.mkdirSync(path.dirname(output_new), { recursive: true });
            fs.writeFileSync(output_new, template(paper));
        }
    } else {
        // ensure the parent dir exists. After PR #18 the committed
        // build output (`contact/index.html`, `people/index.html`,
        // `areas/index.html`, etc.) is gitignored — fresh clones have
        // no `contact/`, `people/`, `areas/` directories at all,
        // so the write fails without mkdir.
        fs.mkdirSync(path.dirname(output) || '.', { recursive: true });
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
    // Sort within each section (current / alumni) by position group, then
    // last name within the group. Last name = final token after stripping
    // any parenthesized middle names (e.g. "Amelia (Hui) Dai" → "Dai").
    const positionPriority = {
        'Assistant Professor': 0,
        'PhD Student': 1,
        'Master Student': 2,
        'Visiting Researcher': 3,
        'Undergraduate Student': 4,
    };
    const lastName = (n) => (n || '').replace(/\([^)]+\)/g, '').trim().split(/\s+/).pop().toLowerCase();
    const sortPeople = (arr) => arr.sort((a, b) => {
        const pa = positionPriority[a.position] ?? 99;
        const pb = positionPriority[b.position] ?? 99;
        if (pa !== pb) return pa - pb;
        return lastName(a.name).localeCompare(lastName(b.name));
    });
    const people_current = sortPeople(people.filter(x => x.current));
    const people_alumni = sortPeople(people.filter(x => !x.current));

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

    // {{pictureCdn '/assets/images/papers/foo.png' alt='hero' class='tw-w-full'}}
    //   →  <picture>
    //        <source srcset="<webp-cdn-url>" type="image/webp">
    //        <img src="<png-cdn-url>" alt="hero" class="tw-w-full" loading="lazy">
    //      </picture>
    //
    // Use for any <img> element that should benefit from WebP. The PNG
    // fallback inside <img> guarantees correctness on browsers without
    // WebP support.
    //
    // Hash options:
    //   alt    — alt text (escaped)
    //   class  — class attribute (raw passthrough for Tailwind class lists)
    //   eager  — true: omit loading=lazy and add fetchpriority=high
    //            (for above-the-fold LCP images)
    //
    // Edge case: if `logicalPath` itself already ends in .webp (a paper
    // that ships a WebP-only source image — see poodle/osiris/ssl
    // childs-perspective), no PNG fallback exists, so we skip the
    // <source> tag and emit a single <img> pointing at the webp. Old
    // browsers without WebP support will fail on these specific images;
    // that's the existing data contract, not a regression from this PR.
    function webpVariant(logicalPath) {
        return logicalPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    }
    handlebars.registerHelper('pictureCdn', function (logicalPath, options) {
        if (!logicalPath) return '';
        const manifest = loadAssetsManifest();
        const hash = (options && options.hash) || {};

        // Resolve the primary image URL (the "fallback" inside <img>).
        const primaryUrl = manifest[logicalPath] || (_cdnMisses.add(logicalPath), logicalPath);

        // Resolve a separate WebP source ONLY when the original isn't
        // already .webp. Same URL on both branches → redundant source,
        // emit just <img>.
        const isAlreadyWebp = /\.webp$/i.test(logicalPath);
        const webpPath = webpVariant(logicalPath);
        const webpUrl = !isAlreadyWebp && manifest[webpPath];

        const escapedAlt = handlebars.escapeExpression(hash.alt || '');
        const altAttr = ` alt="${escapedAlt}"`;
        const classAttr = hash.class ? ` class="${hash.class}"` : '';
        const loadingAttr = hash.eager ? ' fetchpriority="high"' : ' loading="lazy"';

        const sourceTag = webpUrl
            ? `<source srcset="${webpUrl}" type="image/webp">`
            : '';
        const out = `<picture>${sourceTag}<img src="${primaryUrl}"${altAttr}${classAttr}${loadingAttr}></picture>`;
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
    function getPeopleMap() {
        if (!_peopleMap) {
            const peopleData = parseDocuments().people;
            _peopleMap = new Map(peopleData.map(p => [p.name, p.permalink]));
        }
        return _peopleMap;
    }
    handlebars.registerHelper('formatAuthorsWithLinks', function (authors) {
        const peopleMap = getPeopleMap();

        if (!authors || authors.length === 0) {
            return "";
        }

        const formattedAuthors = authors.map(author => {
            if (peopleMap.has(author)) {
                return `<a href="/people/${peopleMap.get(author)}/">${author}</a>`;
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

    // Build a shared affiliation-index map for project-page authors.
    //
    // Returns { orderedAffs: [aff1, aff2, ...], authorAffIndex: [[1],[2],[3,2],[1],...] }.
    // - orderedAffs: unique affiliation strings in first-seen order.
    // - authorAffIndex[i]: array of 1-based superscript numbers for authors[i]
    //   (multi-aff authors get multiple indices, e.g. Mozer at DeepMind+CU).
    // - `affiliations[i].aff` accepts a string OR an array of strings.
    // - Null entries (or positions beyond affs.length) are treated as
    //   lab members → "New York University".
    function buildProjectAffMap(authors, affiliations) {
        const affs = Array.isArray(affiliations) ? affiliations : [];
        const orderedAffs = [];
        const authorAffIndex = [];
        for (let i = 0; i < authors.length; i++) {
            const a = affs[i];
            let affNames;
            if (a == null) {
                affNames = ['New York University'];
            } else if (Array.isArray(a.aff)) {
                affNames = a.aff;
            } else if (a.aff) {
                affNames = [a.aff];
            } else {
                authorAffIndex.push(null);
                continue;
            }
            const indices = [];
            for (const affName of affNames) {
                let idx = orderedAffs.indexOf(affName);
                if (idx === -1) {
                    orderedAffs.push(affName);
                    idx = orderedAffs.length - 1;
                }
                indices.push(idx + 1);
            }
            authorAffIndex.push(indices.length ? indices : null);
        }
        // Single-affiliation shortcut: if everyone shares one
        // affiliation, drop the superscripts entirely — the
        // affiliations line just shows the name. Avoids the visually
        // noisy `Jack Lu¹, Ryan Teehan¹, …` + `¹New York University`
        // when there's nothing to disambiguate.
        const singleAff = orderedAffs.length === 1;
        if (singleAff) {
            return { orderedAffs, authorAffIndex: authors.map(() => null), singleAff };
        }
        return { orderedAffs, authorAffIndex, singleAff };
    }

    // {{formatAuthorsForProjectPage authors affiliations}}
    //
    // Renders author names with numbered superscripts pointing into the
    // affiliations list below. Each author:
    //   1. If `affiliations[i]` is non-null, link name to aff.url
    //      (external collaborator).
    //   2. Else look up in people.yaml → link to /people/<permalink>/.
    //   3. Else plain text.
    // Superscript number is the 1-based index of the author's affiliation
    // in the deduplicated `orderedAffs` list — matches the numbering
    // emitted by formatAffiliationsForProjectPage.
    handlebars.registerHelper('formatAuthorsForProjectPage', function (authors, affiliations) {
        const peopleMap = getPeopleMap();
        const affs = Array.isArray(affiliations) ? affiliations : [];
        if (!authors || authors.length === 0) return "";

        const { authorAffIndex } = buildProjectAffMap(authors, affiliations);

        const formatted = authors.map((author, i) => {
            const aff = affs[i];
            // Resolve link target in priority order:
            //   1. peopleMap lookup on the display name — if the author
            //      is in data/people.yaml, always route to /people/<slug>/.
            //      Keeps traffic to lab members on the lab's own bio
            //      page (where their publications, affiliation, and
            //      contact are curated) even when the project page
            //      frontmatter happens to also list their personal URL.
            //   2. explicit aff.url — for external collaborators with
            //      a homepage outside the lab.
            //   3. plain text — unknown author with no link.
            // The display name prefers aff.name when given so authors
            // can override how the name renders on the project page
            // (e.g., expanding initials) without touching papers.yaml.
            let nameHtml;
            const displayName = (aff && aff.name) || author;
            if (peopleMap.has(displayName)) {
                nameHtml = `<a href="/people/${peopleMap.get(displayName)}/">${displayName}</a>`;
            } else if (aff && aff.url) {
                nameHtml = `<a href="${aff.url}" target="_blank" rel="noopener">${displayName}</a>`;
            } else {
                nameHtml = displayName;
            }
            const idxList = authorAffIndex[i];
            const sup = idxList && idxList.length
                ? `<sup class="tw-text-sm">${idxList.join(',')}</sup>`
                : '';
            // Equal-contribution asterisk. Rendered as a *trailing*
            // superscript after the affiliation number so co-first-authors
            // read as "Jack Lu¹*" — matches the standard academic
            // convention. The matching "* Equal contribution" footnote
            // is emitted by formatAffiliationsForProjectPage when any
            // entry has equal: true.
            const eqMark = (aff && aff.equal) ? `<sup class="tw-text-sm">*</sup>` : '';
            return `${nameHtml}${sup}${eqMark}`;
        });

        let result;
        if (formatted.length === 1) {
            result = formatted[0];
        } else if (formatted.length === 2) {
            result = formatted[0] + ' and ' + formatted[1];
        } else {
            result = formatted.slice(0, -1).join(', ') + ', and ' + formatted[formatted.length - 1];
        }
        return new handlebars.SafeString(result);
    });

    // {{formatAffiliationsForProjectPage authors affiliations equalLabel}}
    //
    // Emits a numbered, deduplicated affiliations line that pairs with
    // the superscripts on the authors line. Format:
    //   <sup>1</sup>NYU, <sup>2</sup>CU Boulder, <sup>3</sup>Google DeepMind
    //
    // If any affiliation entry has `equal: true`, also emits an
    // "* <equalLabel>" footnote on a second line. Default label is
    // "Equal contribution"; pass a custom value for cases like
    // "Equal advising" (when * marks senior-author equal advising,
    // not first-author equal contribution).
    handlebars.registerHelper('formatAffiliationsForProjectPage', function (authors, affiliations, equalLabel) {
        if (!authors || authors.length === 0) return "";
        const { orderedAffs, singleAff } = buildProjectAffMap(authors, affiliations);
        const affs = Array.isArray(affiliations) ? affiliations : [];
        const hasEqual = affs.some(a => a && a.equal);
        // Single-affiliation: no number prefix on the affiliations
        // line — pairs with the no-superscript rendering in
        // formatAuthorsForProjectPage.
        const affLine = singleAff
            ? orderedAffs[0]
            : orderedAffs.map((a, i) => `<sup class="tw-text-xs">${i + 1}</sup>${a}`).join(', ');
        // Handlebars passes the helper options object as the last
        // arg when the template invocation has fewer positional
        // args; treat anything non-string as "use default".
        const label = (typeof equalLabel === 'string' && equalLabel.length > 0) ? equalLabel : 'Equal contribution';
        const eqLine = hasEqual ? `<br><sup class="tw-text-xs">*</sup>${label}` : '';
        return new handlebars.SafeString(affLine + eqLine);
    });
}

function ensureArrayExists(obj, prop) {
    if (!(prop in obj)) {
        obj[prop] = [];
    }
}
