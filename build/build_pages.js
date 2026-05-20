const { execSync } = require('child_process');

const pages = [
    { template: 'index.hbs', output: 'index.html' },
    { template: 'contact.hbs', output: 'contact/index.html' },
    { template: 'people.hbs', output: 'people/index.html' },
    { template: 'research.hbs', output: 'research/index.html' },
    { template: 'paper.hbs', output: 'research/{{permalink}}/index.html' },
    { template: 'person.hbs', output: 'people/{{permalink}}/index.html' },
    { template: 'research_area.hbs', output: 'areas/{{permalink}}/index.html' },
    // Marketing landing pages for papers with project_page.enabled: true.
    // Emit directly to out/<slug>/ so they don't clutter the repo root.
    // assemble_output.js copies the rest of the site into out/ alongside.
    // The deployed URL is still agenticlearning.ai/<slug>/ — preserves the
    // old per-project-repo URLs which were already in arXiv abstracts.
    { template: 'project.hbs', output: 'out/{{permalink}}/index.html' },
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
