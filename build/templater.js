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

    fs.writeFileSync(output, template(documents));
}

function compileTemplate(handlebars, input) {
    return handlebars.compile(fs.readFileSync(input, { encoding: 'utf-8' }));
}

function parseDocuments() {
    const research_areas = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/research_areas.yaml')));
    const papers = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml')));
    const people = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/people.yaml')));

    // Normalize the data
    for (const ra of research_areas) {
        console.log(ra)
        ensureArrayExists(ra, 'title');
        ensureArrayExists(ra, 'image');
        ensureArrayExists(ra, 'Description');
    }
    for (const p of papers) {
        console.log(p)
        ensureArrayExists(p, 'title');
        ensureArrayExists(p, 'image');
        ensureArrayExists(p, 'short_abstract');
    }
    for (const p of people) {
        console.log(p)
        ensureArrayExists(p, 'name');
        ensureArrayExists(p, 'position');
        ensureArrayExists(p, 'image');
        ensureArrayExists(p, 'url');
    }
    const recent_papers = papers.filter((p) => p['is_recent']);


    return { research_areas, papers, recent_papers, people };
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
      return moment.utc(date).format(format); // For example, "MMMM Do YYYY, h:mm:ss a"
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
