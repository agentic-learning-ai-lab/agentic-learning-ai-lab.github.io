#!/usr/bin/env node

/**
 * Add a paper's full-paper view from its LaTeX source in one command.
 * Needs only `gh auth login` and the paper's entry in data/papers.yaml
 * with `enable_full_paper: true`; no R2 credentials, LaTeX or Docker.
 *
 *   npm run paper:add -- <slug> <source.zip|source-dir> <paper.pdf>
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

function main() {
    // The PDF is required: packing a new source drops the old local PDF,
    // and the slim Cloudflare build never compiles one.
    const [slug, source, pdf] = process.argv.slice(2);
    if (!slug || !source || !pdf) {
        console.error('Usage: npm run paper:add -- <slug> <source.zip|source-dir> <paper.pdf>');
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

main();
