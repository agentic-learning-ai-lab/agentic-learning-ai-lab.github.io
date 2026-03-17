'use strict';
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const handlebarsFactory = require('handlebars');
const moment = require('moment');

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

doTemplating(process.argv[2], process.argv[3]);

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
