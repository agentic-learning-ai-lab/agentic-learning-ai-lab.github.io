#!/usr/bin/env node

/**
 * Add a paper's full-paper view from its LaTeX source in one command.
 * Needs only `gh auth login` and the paper's entry in data/papers.yaml
 * with `enable_full_paper: true`; no R2 credentials, LaTeX or Docker.
 *
 *   npm run paper:add -- <slug> <source.zip|source-dir> <paper.pdf>
 *   npm run paper:add -- <slug>     # source and PDF from the entry's arxiv: URL
 *
 * Steps (each one is also its own npm script):
 *   1. push the current branch if origin does not have it yet
 *   2. latex:pack --local     clean the source, write research/<slug>/latex.tar.gz
 *   3. upload                 tarball (+ PDF) to R2, manifest commit on the branch
 *   4. paper:html             convert on latexml-lab → paper-content.json + assets/
 *   5. upload                 the figures
 *   6. git add                papers.yaml + paper-content.json, ready to commit
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, args) {
    console.log(`\n$ ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
        console.error(`\n✗ paper:add stopped: \`${cmd} ${args.join(' ')}\` failed. Fix the error above and rerun paper:add (it is safe to rerun).`);
        process.exit(1);
    }
}

function git(args) {
    return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

// Download the arXiv e-print and PDF into .cache/arxiv/<slug>/.
async function fromArxiv(slug, arxivUrl) {
    const { ensureLatexSource } = require('./build_arxiv_papers');
    const id = (arxivUrl.match(/\d{4}\.\d{4,5}/) || [])[0]; // latest version, as ensureLatexSource fetches
    if (!id) {
        console.error(`✗ Cannot read an arXiv ID from "${arxivUrl}".`);
        process.exit(1);
    }
    const dir = path.join(ROOT, '.cache/arxiv', slug);
    fs.rmSync(dir, { recursive: true, force: true });
    const source = path.join(dir, 'src');
    await ensureLatexSource(id, source);
    const res = await fetch(`https://arxiv.org/pdf/${id}`);
    if (!res.ok) {
        console.error(`✗ Downloading https://arxiv.org/pdf/${id} failed: HTTP ${res.status}`);
        process.exit(1);
    }
    const pdf = path.join(dir, 'paper.pdf');
    fs.writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
    return { source, pdf };
}

async function main() {
    // The PDF is required: packing a new source drops the old local PDF,
    // and the slim Cloudflare build never compiles one.
    let [slug, source, pdf] = process.argv.slice(2);
    if (!slug || !source !== !pdf) {
        console.error('Usage: npm run paper:add -- <slug> [<source.zip|source-dir> <paper.pdf>]\n' +
            '       With only <slug>, the source and PDF come from the entry\'s arxiv: URL.');
        process.exit(1);
    }

    const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
    const paper = papers.find(p => p.permalink === slug);
    if (!paper) {
        console.error(`✗ No paper with permalink "${slug}" in data/papers.yaml. Add its entry first (CONTRIBUTING.md, Step 1).`);
        process.exit(1);
    }
    if (!paper.enable_full_paper) {
        console.error(`✗ Set \`enable_full_paper: true\` on "${slug}" in data/papers.yaml first.`);
        process.exit(1);
    }
    if (!source) {
        if (!paper.arxiv) {
            console.error(`✗ "${slug}" has no arxiv: URL in data/papers.yaml. Pass the source and PDF instead.`);
            process.exit(1);
        }
        ({ source, pdf } = await fromArxiv(slug, paper.arxiv));
    }
    for (const f of [source, pdf]) {
        if (!fs.existsSync(f)) {
            console.error(`✗ Not found: ${f}`);
            process.exit(1);
        }
    }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    if (branch === 'main') {
        console.error('✗ On main. Create a branch first: git checkout -b add-' + slug);
        process.exit(1);
    }
    if (git(['ls-remote', '--exit-code', '--heads', 'origin', branch]).status !== 0) {
        run('git', ['push', '-u', 'origin', branch]);
    }

    // The comment stripper (arxiv_latex_cleaner) lives in the repo's venv.
    if (!fs.existsSync(path.join(ROOT, '.venv/bin/arxiv_latex_cleaner'))) {
        run('npm', ['run', 'setup:python']);
    }
    run('node', ['build/latex_pack.js', '--local', slug, source]);
    fs.copyFileSync(pdf, path.join(ROOT, 'research', slug, 'paper.pdf'));
    run('node', ['build/upload.js', `research/${slug}/latex.tar.gz`, `research/${slug}/paper.pdf`]);
    run('git', ['pull', '--autostash', '--no-rebase', 'origin', branch]);

    run('node', ['build/paper_html.js', slug]);
    run('node', ['build/upload.js', `research/${slug}/assets`]);
    run('git', ['pull', '--autostash', '--no-rebase', 'origin', branch]);

    run('git', ['add', 'data/papers.yaml', `research/${slug}/paper-content.json`]);
    console.log(`\n✅ ${slug}: full paper ready. Review \`git status\`, then commit and push:\n` +
        `   git commit -m "Add the full paper for ${slug}" && git push\n` +
        '   The pull request\'s Cloudflare preview shows the page.');
}

main().then(() => process.exit(0), (e) => {
    console.error(`✗ paper:add stopped: ${e.message}`);
    process.exit(1);
});
