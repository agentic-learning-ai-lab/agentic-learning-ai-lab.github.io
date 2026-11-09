#!/usr/bin/env node

/**
 * Start a new version of a published lab technical report.
 *
 *   npm run tr:revise -- <slug>
 *
 * Creates a new-version draft of the paper's Zenodo record with a reserved
 * DOI and writes that DOI to the paper's `doi:` in data/papers.yaml. The
 * report number stays. Until the new version is published the paper's PDF
 * is no longer frozen, so `paper:add` with the updated source rebuilds it;
 * `tr:publish` then publishes the new version. PI only: needs ZENODO_TOKEN.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { api, footnote } = require('./zenodo');
const { zenodoId } = require('./pdf_lock');

const ROOT = path.resolve(__dirname, '..');
const PAPERS = path.join(ROOT, 'data/papers.yaml');

function fail(msg) {
    console.error(`✗ ${msg}`);
    process.exit(1);
}

async function main() {
    const slug = process.argv[2];
    if (!slug) fail('Usage: npm run tr:revise -- <slug>');
    const text = fs.readFileSync(PAPERS, 'utf8');
    const paper = yaml.load(text).find(p => p.permalink === slug);
    if (!paper) fail(`No paper "${slug}" in data/papers.yaml.`);
    const id = zenodoId(paper);
    if (!id || !paper.report_number) fail(`"${slug}" is not a technical report with a Zenodo doi:.`);
    if (paper.pdf_override) fail(`"${slug}" has pdf_override:; remove it so the new version's PDF is built from source.`);

    const dep = await api('GET', `/deposit/depositions/${id}`);
    if (!dep.submitted) fail(`${paper.doi} is not published yet: rebuild with paper:add, then tr:publish.`);

    // Zenodo returns the open draft if a new version was already started.
    const started = await api('POST', `/deposit/depositions/${id}/actions/newversion`);
    let draft = await api('GET', started.links.latest_draft);
    let reserved = draft.metadata.prereserve_doi && draft.metadata.prereserve_doi.doi;
    if (!reserved) {
        draft = await api('PUT', `/deposit/depositions/${draft.id}`, { metadata: { ...draft.metadata, prereserve_doi: true } });
        reserved = draft.metadata.prereserve_doi.doi;
    }
    if (reserved === paper.doi) fail(`Zenodo returned the same DOI ${reserved}; check https://zenodo.org/deposit/${draft.id}`);

    // Rewrite only this paper's doi: line.
    const old = `doi: ${paper.doi}`;
    if (text.split(old).length !== 2) fail(`Expected one "${old}" line in data/papers.yaml; edit it by hand to doi: ${reserved}`);
    fs.writeFileSync(PAPERS, text.replace(old, `doi: ${reserved}`));

    console.log(`✅ ${paper.report_number}: new version drafted on Zenodo (https://zenodo.org/deposit/${draft.id})`);
    console.log(`   doi: ${paper.doi} → ${reserved} in data/papers.yaml\n`);
    console.log('Next:');
    console.log('  1. Update the page-1 footnote in the source:');
    console.log(`     ${footnote(paper.report_number, reserved)}`);
    console.log(`  2. npm run paper:add -- ${slug} <source.zip>   (rebuilds the PDF; it is unfrozen until publication)`);
    console.log('  3. Commit, push, open the PR; then on its branch:');
    console.log(`     npm run tr:publish -- ${slug}`);
}

main().catch((e) => {
    console.error(`✗ tr:revise: ${e.message}`);
    process.exit(1);
});
