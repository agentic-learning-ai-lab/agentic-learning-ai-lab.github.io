const fs = require('fs-extra');
const path = require('path');
const handlebars = require('handlebars');
const { exec } = require('child_process');
// import doTemplating from './templater.js';

// Define templates and pages
const pages = [
    { template: 'index.hbs', output: 'index.html', context: { pageTitle: 'Home' } },
    { template: 'contact.hbs', output: 'contact.html', context: { pageTitle: 'Contact Us' } },
    { template: 'people.hbs', output: 'people.html', context: { pageTitle: 'People' } },
    { template: 'research.hbs', output: 'research.html', context: { pageTitle: 'Research' } },
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