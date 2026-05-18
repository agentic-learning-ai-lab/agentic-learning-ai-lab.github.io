const { execSync } = require('child_process');

const pages = [
    { template: 'index.hbs', output: 'index.html' },
    { template: 'contact.hbs', output: 'contact/index.html' },
    { template: 'people.hbs', output: 'people/index.html' },
    { template: 'research.hbs', output: 'research/index.html' },
    { template: 'paper.hbs', output: 'research/{{permalink}}/index.html' },
    { template: 'person.hbs', output: 'people/{{permalink}}/index.html' },
    { template: 'research_area.hbs', output: 'areas/{{permalink}}/index.html' },
];

let failed = 0;

for (const page of pages) {
    try {
        execSync(`node ./build/templater.js ${page.template} ${page.output}`, { stdio: 'inherit' });
        console.log(`Output: ${page.output}`);
    } catch (error) {
        console.error(`Failed: ${page.output} - ${error.message}`);
        failed++;
    }
}

if (failed > 0) {
    console.error(`\n${failed} page(s) failed to build`);
    process.exit(1);
}
