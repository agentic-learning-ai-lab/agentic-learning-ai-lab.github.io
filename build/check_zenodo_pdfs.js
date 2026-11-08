#!/usr/bin/env node

/**
 * Fail when a lab technical report's PDF on the site differs from the file
 * on its published Zenodo record. A DOI is permanent, so the PDF people
 * download from agenticlearning.ai must be the same bytes.
 *
 * Papers whose `doi:` is a Zenodo DOI are checked; a reserved DOI whose
 * record is not published yet is skipped. Needs network. Runs in CI.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { zenodoId, zenodoFiles } = require('./pdf_lock');

const ROOT = path.resolve(__dirname, '..');

async function md5Of(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return crypto.createHash('md5').update(Buffer.from(await res.arrayBuffer())).digest('hex');
}

async function main() {
    const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8'));
    const problems = [];
    let checked = 0;

    for (const paper of papers) {
        const id = zenodoId(paper);
        if (!id) continue;
        const files = await zenodoFiles(id);
        if (!files) continue; // reserved, not published yet
        const pdfs = files.filter(f => f.key.endsWith('.pdf'));
        const sitePdf = manifest[`/research/${paper.permalink}/paper.pdf`];
        if (pdfs.length !== 1 || !sitePdf) {
            problems.push(`${paper.permalink}: expected one PDF on Zenodo record ${id} and one on the site`);
            continue;
        }
        const siteMd5 = await md5Of(sitePdf);
        if (`md5:${siteMd5}` !== pdfs[0].checksum) {
            problems.push(`${paper.permalink}: site PDF (md5 ${siteMd5}) differs from Zenodo's ${pdfs[0].key} (${pdfs[0].checksum})`);
        }
        checked++;
    }

    if (problems.length) {
        console.error('✗ Technical report PDFs differ from their Zenodo records:');
        for (const p of problems) console.error(`   - ${p}`);
        console.error('   A published DOI is permanent: restore the PDF that is on Zenodo.');
        process.exit(1);
    }
    console.log(`✓ ${checked} technical report PDFs match Zenodo`);
}

main().catch(err => {
    console.error(`check_zenodo_pdfs: ${err.message}`);
    process.exit(1);
});
