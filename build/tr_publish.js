#!/usr/bin/env node

/**
 * Publish a lab technical report's DOI with the PDF the site serves.
 *
 *   gh pr checkout <pr> && npm run tr:publish -- <slug> [--yes]
 *
 * On the paper's pull request branch: copies title, authors, abstract and
 * date from data/papers.yaml to the Zenodo draft, uploads the CI-built
 * PDF (the exact file in assets-manifest.json), shows the record and asks
 * before publishing (a DOI is permanent), adds it to the lab community,
 * and re-runs the PR's checks so check_zenodo_pdfs.js compares the two.
 * PI only: needs ZENODO_TOKEN (build/zenodo.js).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const { api, creators, reportNote, COMMUNITY_ID } = require('./zenodo');
const { zenodoId } = require('./pdf_lock');

const ROOT = path.resolve(__dirname, '..');

function fail(msg) {
    console.error(`✗ ${msg}`);
    process.exit(1);
}

async function confirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return answer.trim() === 'publish';
}

async function main() {
    const args = process.argv.slice(2);
    const yes = args.includes('--yes');
    const slug = args.find(a => !a.startsWith('--'));
    if (!slug) fail('Usage: npm run tr:publish -- <slug> [--yes]');

    const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
    const paper = papers.find(p => p.permalink === slug);
    if (!paper) fail(`No paper "${slug}" in data/papers.yaml. Check out the paper's PR branch first.`);
    const id = zenodoId(paper);
    if (!id || !paper.report_number) fail(`"${slug}" needs report_number: and a Zenodo doi: in data/papers.yaml.`);

    let dep = await api('GET', `/deposit/depositions/${id}`);
    if (dep.submitted) fail(`${paper.doi} is already published.`);

    // The PDF must be the one CI built from the paper's current source.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8'));
    const pdfUrl = manifest[`/research/${slug}/paper.pdf`];
    const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'research', slug, 'paper-content.json'), 'utf8'));
    if (!pdfUrl || !content.pdf_sha256 || !pdfUrl.includes(`/${content.pdf_sha256.slice(0, 16)}/`)) {
        fail(`No CI-built PDF for "${slug}" in the manifest. Run npm run paper:add first.`);
    }
    const res = await fetch(pdfUrl);
    if (!res.ok) fail(`${pdfUrl}: HTTP ${res.status}`);
    const pdf = Buffer.from(await res.arrayBuffer());
    if (crypto.createHash('sha256').update(pdf).digest('hex') !== content.pdf_sha256) {
        fail(`${pdfUrl} does not match the PDF CI built.`);
    }

    // Metadata from the entry the site shows, so the two cannot drift.
    const metadata = {
        ...dep.metadata,
        title: paper.title,
        creators: creators(paper.authors),
        description: paper.abstract,
        publication_date: new Date(paper.date).toISOString().slice(0, 10),
        notes: reportNote(paper.report_number),
    };
    dep = await api('PUT', `/deposit/depositions/${id}`, { metadata });

    for (const f of dep.files || []) {
        await api('DELETE', `/deposit/depositions/${id}/files/${f.id}`);
    }
    const short = paper.title.split(':')[0].trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${paper.report_number}_${short}.pdf`;
    await api('PUT', `${dep.links.bucket}/${filename}`, pdf, { raw: true });

    console.log(`\n${paper.report_number}  ${paper.doi}`);
    console.log(`  title    ${metadata.title}`);
    console.log(`  authors  ${paper.authors.join(', ')}`);
    console.log(`  date     ${metadata.publication_date}`);
    console.log(`  file     ${filename} (${pdf.length} bytes, md5 ${crypto.createHash('md5').update(pdf).digest('hex')})`);
    console.log(`  preview  https://zenodo.org/deposit/${id}`);
    if (!yes) {
        if (!process.stdin.isTTY) fail('Not a terminal: review the draft and rerun with --yes to publish.');
        if (!await confirm('\nPublishing is permanent. Type "publish" to publish: ')) fail('Not published. The draft is updated.');
    }

    await api('POST', `/deposit/depositions/${id}/actions/publish`);
    console.log(`✅ published https://doi.org/${paper.doi}`);

    // The deposit API ignores metadata.communities: request inclusion, then
    // accept it as the community owner.
    const inclusion = await api('POST', `/records/${id}/communities`, { communities: [{ id: COMMUNITY_ID }] });
    const requestId = inclusion.processed && inclusion.processed[0] && inclusion.processed[0].request_id;
    if (requestId) {
        await api('POST', `/requests/${requestId}/actions/accept`);
        console.log('✅ added to the lab community');
    } else {
        console.warn('⚠️  community inclusion returned no request; check https://zenodo.org/communities/agentic-learning-ai-lab');
    }

    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const run = spawnSync('gh', ['run', 'list', '-b', branch, '-w', 'pr-checks.yml', '-L', '1', '--json', 'databaseId', '-q', '.[0].databaseId'],
        { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    if (branch !== 'main' && run) {
        spawnSync('gh', ['run', 'rerun', run], { cwd: ROOT, stdio: 'inherit' });
        console.log(`↻ re-running the PR checks on ${branch}; merge when check_zenodo_pdfs passes`);
    }
}

main().catch((e) => {
    console.error(`✗ tr:publish: ${e.message}`);
    process.exit(1);
});
