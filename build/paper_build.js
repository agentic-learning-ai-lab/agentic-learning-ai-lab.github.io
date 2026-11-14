#!/usr/bin/env node

/**
 * Build the full-paper HTML view from the LaTeX tarball we already keep
 * on R2, without waiting for arXiv to publish its own HTML build.
 *
 *   assets-manifest.json (/research/<slug>/latex.tar.gz)
 *     → dispatch convert.yml in agentic-learning-ai-lab/latexml-lab
 *     → downloadable `latexml-lab-<slug>` artifact
 *     → research/<slug>/paper-content.json + assets/ + paper.pdf
 *
 * The remote workflow runs arXiv's own converter (latexml/ar5ivist), so
 * the output is the same `ltx_*` HTML `downloadArxivHtml` parses.
 *
 * Usage:
 *   npm run paper:build -- <slug>
 *
 * Requires `gh auth login`. The figures and PDF are new binaries — run
 * `npm run upload` (or `npm run build`) afterwards to publish them to R2
 * + the manifest. A PDF locked by build/pdf_lock.js is left in place.
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const { ROOT, loadManifest } = require('./r2_lib');
const { manifestKey } = require('./latex_lib');
const {
    checkGhAuth,
    ghDispatch,
    pollRunByCorrelation,
    waitForRun,
    downloadArtifact,
} = require('./gh_actions');
const { pdfLockReason, zenodoId } = require('./pdf_lock');

const PAPERS_YAML = path.join(ROOT, 'data/papers.yaml');
const CONVERT_REPO = 'agentic-learning-ai-lab/latexml-lab';
const CONVERT_WORKFLOW = 'convert.yml';

function usage() {
    console.error('Usage: npm run paper:build -- <slug>');
}

function findPaper(papers, slug) {
    const paper = papers.find(p => p.permalink === slug);
    if (!paper) {
        throw new Error(`No paper with permalink "${slug}" in data/papers.yaml`);
    }
    return paper;
}

/**
 * Normalize the bibliography's tags and author lists
 * (build/normalize_bib_tags.js then build/normalize_bib_authors.js).
 */
async function runNormalizers(slug) {
    try {
        const { normalizeOne } = require('./normalize_bib_tags');
        await normalizeOne(slug);
    } catch (normErr) {
        console.warn(`  normalize: ${slug} skipped — ${normErr.message}`);
    }
    try {
        const { normalizeOne: normalizeAuthors } = require('./normalize_bib_authors');
        await normalizeAuthors(slug);
    } catch (authErr) {
        console.warn(`  authors: ${slug} skipped — ${authErr.message}`);
    }
}

/**
 * Replace research/<slug>/paper-content.json + assets/ from the artifact.
 * Assets are swapped wholesale so a figure dropped from the paper does
 * not survive a re-conversion.
 */
async function installArtifact(slug, artifactDir, tarballUrl, { pdfLock = null, paper = {} } = {}) {
    const srcJson = path.join(artifactDir, 'paper-content.json');
    if (!await fs.pathExists(srcJson)) {
        throw new Error(`Artifact latexml-lab-${slug} has no paper-content.json`);
    }
    // Record which tarball this HTML came from; check_paper_build.js
    // compares it with the manifest to catch HTML left stale by a new
    // source upload.
    const content = await fs.readJson(srcJson);
    content.latex_tarball = tarballUrl;

    const destDir = path.join(ROOT, 'research', slug);
    await fs.ensureDir(destDir);

    // The PDF built from the same tarball. check_paper_build.js matches
    // pdf_sha256 against the manifest's content-hashed PDF URL.
    const srcPdf = path.join(artifactDir, 'paper.pdf');
    if (pdfLock) {
        console.log(`   keeping research/${slug}/paper.pdf (${pdfLock})`);
        // check_paper_build.js accepts a frozen PDF only for this DOI.
        if (zenodoId(paper)) content.pdf_frozen = paper.doi;
    } else if (await fs.pathExists(srcPdf)) {
        const pdfPath = path.join(destDir, 'paper.pdf');
        await fs.copy(srcPdf, pdfPath);
        content.pdf_sha256 = crypto.createHash('sha256').update(await fs.readFile(pdfPath)).digest('hex');
    } else {
        throw new Error(`Artifact latexml-lab-${slug} has no paper.pdf`);
    }
    await fs.writeJson(srcJson, content, { spaces: 2 });
    await fs.remove(path.join(destDir, 'assets'));

    const srcAssets = path.join(artifactDir, 'assets');
    if (await fs.pathExists(srcAssets)) {
        await fs.copy(srcAssets, path.join(destDir, 'assets'));
    }
    await fs.move(srcJson, path.join(destDir, 'paper-content.json'), { overwrite: true });

    console.log(`✅ wrote research/${slug}/paper-content.json + assets/${pdfLock ? '' : ' + paper.pdf'}`);
}

/**
 * Default path: convert the R2 tarball in GitHub Actions.
 */
async function fromLatexTarball(slug, paper) {
    const manifest = await loadManifest();
    const key = manifestKey(slug);
    const tarballUrl = manifest[key];
    if (!tarballUrl) {
        throw new Error(
            `No LaTeX tarball registered at ${key} in assets-manifest.json.\n` +
            `  Publish the source first:\n` +
            `    npm run latex:pack ${slug} <path-to-zip-or-dir>\n` +
            `  or, for an arXiv paper, refetch the source:\n` +
            `    npm run latex:update ${slug}\n` +
            `  Then re-run \`npm run paper:build ${slug}\`.`
        );
    }

    checkGhAuth();

    // Unique per-invocation tag, embedded in the workflow's run-name so
    // concurrent conversions can be told apart (see build/gh_actions.js).
    const correlationId = crypto.randomUUID();
    console.log(`🚀 ${slug}: dispatching ${CONVERT_WORKFLOW} in ${CONVERT_REPO}`);
    console.log(`   tarball: ${tarballUrl}`);
    ghDispatch(CONVERT_WORKFLOW, {
        tarball_url: tarballUrl,
        slug,
        correlation_id: correlationId,
    }, { repo: CONVERT_REPO });

    const runId = pollRunByCorrelation(CONVERT_WORKFLOW, correlationId, { repo: CONVERT_REPO });
    console.log(`   run #${runId}`);
    waitForRun(runId, `convert ${slug}`, { repo: CONVERT_REPO });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'latexml-lab-'));
    try {
        downloadArtifact(runId, `latexml-lab-${slug}`, tmpDir, { repo: CONVERT_REPO });
        await installArtifact(slug, tmpDir, tarballUrl, { pdfLock: await pdfLockReason(paper), paper });
    } finally {
        await fs.remove(tmpDir);
    }
}

async function main() {
    const positional = process.argv.slice(2);
    if (positional.length !== 1 || positional[0].startsWith('-')) {
        usage();
        process.exit(1);
    }
    const slug = positional[0];

    const papers = yaml.load(await fs.readFile(PAPERS_YAML, 'utf8'));
    const paper = findPaper(papers, slug);

    await fromLatexTarball(slug, paper);
    await runNormalizers(slug);

    console.log('\nNext: `npm run upload` (or `npm run build`) to publish the figures and PDF to R2.');
}

if (require.main === module) {
    main().catch(err => {
        console.error('paper:build failed:', err.message);
        process.exit(1);
    });
}

module.exports = { installArtifact, runNormalizers };
