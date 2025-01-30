const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const handlebars = require('handlebars');
const { exec } = require('child_process');
// import doTemplating from './templater.js';

// Define templates and pages
const pages = [
    { template: 'index.hbs', output: 'index.html', context: { pageTitle: 'Home' } },
    { template: 'contact.hbs', output: 'contact/index.html', context: { pageTitle: 'Contact Us' } },
    { template: 'people.hbs', output: 'people/index.html', context: { pageTitle: 'People' } },
    { template: 'research.hbs', output: 'research/index.html', context: { pageTitle: 'Research' } },
    { template: 'paper.hbs', output: 'research/{{permalink}}/index.html', context: { pageTitle: 'Research' } },
    { template: 'person.hbs', output: 'people/{{permalink}}/index.html', context: { pageTitle: 'People' } },
    { template: 'research_area.hbs', output: './{{permalink}}/index.html', context: { pageTitle: 'Research Areas' } },
];

// Compile and write each page
pages.forEach(page => {
    exec(`node ./build/templater.js ${page.template} ${page.output}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
      }
      console.log(`Output: ${page.output}`);
    });
});


// // Generate a paper page.
// const papers = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/papers.yaml')));
// for (const p of papers) {
//     // console.log(p);
//     ensureArrayExists(p, 'title');
//     ensureArrayExists(p, 'authors');
//     ensureArrayExists(p, 'image');
//     ensureArrayExists(p, 'short_abstract');
//     ensureArrayExists(p, 'abstract');
//     const output = "research/" + p.permalink + ".html";
//     // console.log(output);
//     exec(`node ./build/templater.js paper.hbs ${output}`, (error, stdout, stderr) => {
//       if (error) {
//         console.error(`Error: ${error.message}`);
//         return;
//       }
//       if (stderr) {
//         console.error(`stderr: ${stderr}`);
//         return;
//       }
//       console.log(`Output: ${output}`);
//     });
// }


// function ensureArrayExists(obj, prop) {
//     if (!(prop in obj)) {
//         obj[prop] = [];
//     }
// }