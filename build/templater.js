'use strict';
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const handlebarsFactory = require('handlebars');
const moment = require('moment');
const assert = require('assert');
const toSlug = require('slugg');

const SLIDES = 'Slides';
const NOTES = 'Notes';
const REFERENCES = 'References';

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

doTemplating(process.argv[2], process.argv[3]);

function doTemplating(input, output) {
    const handlebars = handlebarsFactory.create();
    registerHelpers(handlebars);
    registerPartials(handlebars);

    const template = compileTemplate(handlebars, input);
    const documents = parseDocuments();

    // Uncomment to see documents; useful while tweaking the templates
    // console.log(require("util").inspect(documents, { depth: Infinity }));

    if (input === "paper.hbs") {
        // Generate individual papers
        for (const paper of documents.papers) {
            const output_new = output.replace("{{permalink}}", paper.permalink);
            if (!fs.existsSync(path.dirname(output_new))){
                fs.mkdirSync(path.dirname(output_new));
            }
            fs.writeFileSync(output_new, template(paper));
        }
    }
    else if (input == "person.hbs") {
        // Generate individual person
        for (const person of documents.people) {
            console.log(person.name)
            const output_new = output.replace("{{permalink}}", person.permalink);
            if (!fs.existsSync(path.dirname(output_new))){
                fs.mkdirSync(path.dirname(output_new));
            }
            var papers_ = [];
            for (const paper of documents.papers) {
                // console.log(paper.title);
                for (const author of paper.authors) {
                    // console.log(author);
                    if (person.name === author) {
                        papers_.push(paper);
                        // console.log("Match!");
                        // console.log(person.name + " " + paper.title);
                        break;
                    }
                }
            }
            person.papers = papers_;
            console.log(person.papers);
            fs.writeFileSync(output_new, template(person));
        }

    }
    else if (input == "research_area.hbs") {
        // Generate individual research area
        for (const ra of documents.research_areas) {
            const output_new = output.replace("{{permalink}}", ra.permalink);
            console.log(output_new);
            if (!fs.existsSync(path.dirname(output_new))){
                console.log(path.dirname(output_new));
                fs.mkdirSync(path.dirname(output_new));
            }
            const papers = [];
            for (const p of documents.papers){
                for (const ra2 of p.research_areas){
                    console.log(ra2, ra.permalink);
                    if (ra2 === ra.permalink){
                        papers.push(p);
                    }
                }
            }
            ra.papers = papers;
            console.log("papers");
            console.log(papers);
            fs.writeFileSync(output_new, template(ra));
        }

    } else {
        fs.writeFileSync(output, template(documents));
    }

}

function compileTemplate(handlebars, input) {
    // console.log("Input: " + input);
    return handlebars.compile(fs.readFileSync(input, { encoding: 'utf-8' }));
}

function parseDocuments() {
    const research_areas = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/research_areas.yaml')));
    const papers = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml')));
    const people = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml')));
    const people_current = people.filter(x => x.current);
    const people_alumni = people.filter(x => !x.current);
    console.log(people_alumni);

    // Normalize the data
    for (const ra of research_areas) {
        // console.log(ra);
        ensureArrayExists(ra, 'title');
        ensureArrayExists(ra, 'image');
        ensureArrayExists(ra, 'Description');
    }
    for (const p of papers) {
        // console.log(p);
        ensureArrayExists(p, 'title');
        ensureArrayExists(p, 'image');
        ensureArrayExists(p, 'short_abstract');
    }
    for (const p of people) {
        // console.log(p);
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
    // handlebars.registerHelper('date', d => moment.utc(new Date(d).toISOString()).format('MMMM Do'));
    // handlebars.registerHelper('shortDate', d => moment.utc(new Date(d).toISOString()).format('MMM D'));
    // handlebars.registerHelper('maybeLink', v => {
    //     if (typeof v === 'string') {
    //         return v;
    //     }

    //     assert (typeof v === 'object' && v !== null, 'Links must be either strings or objects');

    //     const keys = Object.keys(v);
    //     assert(keys.length === 1, 'Link objects must have a single key');
    //     const key = keys[0];

    //     return new handlebars.SafeString('<a href="' + v[key] + '">' + key + '</a>');
    // });
    // handlebars.registerHelper('lectureSlug', l => 'lecture-' + toSlug(l.Title));
    // handlebars.registerHelper('assignmentSlug', l => 'assignment-' + toSlug(l.Label));

    // Use UI.registerHelper..

    handlebars.registerHelper('formatDate', function (date, format) {
      return moment.utc(date).format(format);
    });
    handlebars.registerHelper('formatAuthors', function (authors) {
        console.log(authors);
        if (authors.length == 0) {
          return "";
        }
        else if (authors.length == 1) {
          return authors[0];
        } else if (authors.length == 2) {
          return authors[0] + ' and ' + authors[1];
        } else {
          return authors.slice(0, -1).join(', ') + (', and ') + authors[authors.length - 1];
        }
    });

    handlebars.registerHelper('formatAuthorsWithLinks', function (authors) {
        console.log('formatAuthorsWithLinks', authors);

        // Load people data to check for existing pages
        const peopleData = parseDocuments().people;
        const peopleMap = new Map(peopleData.map(p => [p.name, p.permalink]));

        if (!authors || authors.length == 0) {
          return "";
        }

        // Format each author with link if they have a page
        const formattedAuthors = authors.map(author => {
            if (peopleMap.has(author)) {
                return `<a href="/people/${peopleMap.get(author)}/">${author}</a>`;
            }
            return author;
        });

        // Join with proper formatting
        let result;
        if (formattedAuthors.length == 1) {
          result = formattedAuthors[0];
        } else if (formattedAuthors.length == 2) {
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

function copyArrayInto(source, dest, keyName) {
    if (source && source[keyName]) {
        dest[keyName].push(...source[keyName]);
    }
}
