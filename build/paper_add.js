#!/usr/bin/env node

/**
 * Add or update a paper on the site in one command, once its entry is in
 * data/papers.yaml. Needs only `gh auth login` (and Python 3 for a full
 * paper); no R2 credentials, LaTeX or Docker.
 *
 *   npm run paper:add -- <slug>                  # first build from arXiv, or image only
 *   npm run paper:add -- <slug> <source.zip|dir>  # build from any other source
 *   npm run paper:add -- <slug> arxiv             # rebuild from a new arXiv version
 *
 * Steps:
 *   1. push the current branch if origin does not have it yet
 *   2. hero image (if `image:` is set and the file exists): thumbnail and
 *      WebP copies, then upload
 *   3. full paper (if `enable_full_paper: true` and there is something to
 *      build: a source is given, or an arXiv paper has no build yet):
 *      latex:pack --local  clean the source → research/<slug>/latex.tar.gz
 *      upload              the tarball (manifest commit on the branch)
 *      paper:build         latexml-lab compiles the PDF and converts the HTML
 *      upload              the PDF and figures
 *   4. git add papers.yaml (+ paper-content.json), ready to commit
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

// Download the arXiv e-print into .cache/arxiv/<slug>/src.
async function fromArxiv(slug, arxivUrl) {
    const { ensureLatexSource } = require('./arxiv_source');
    const id = (arxivUrl.match(/\d{4}\.\d{4,5}(v\d+)?/) || [])[0];
    if (!id) {
        console.error(`✗ Cannot read an arXiv ID from "${arxivUrl}".`);
        process.exit(1);
    }
    const dir = path.join(ROOT, '.cache/arxiv', slug);
    fs.rmSync(dir, { recursive: true, force: true });
    await ensureLatexSource(id, path.join(dir, 'src'));
    return path.join(dir, 'src');
}

// Hero image: make the thumbnail and WebP copies the site serves, then
// upload all three. Both generators skip files that are up to date.
function addImage(slug, paper) {
    if (!paper.image) {
        console.log(`\n· ${slug}: no image: in papers.yaml, so no card image`);
        return;
    }
    const image = paper.image.replace(/^\//, '');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8'));
    if (!fs.existsSync(path.join(ROOT, image)) && manifest[paper.image]) {
        console.log(`\n· ${slug}: hero image already on R2`);
        return;
    }
    if (!fs.existsSync(path.join(ROOT, image))) {
        console.error(`✗ ${slug}: image: is ${paper.image}, but ${image} does not exist. Put the image there, or remove the image: line.`);
        process.exit(1);
    }
    run('node', ['build/generate_thumbnails.js']);
    run('node', ['build/generate_webp.js']);
    const stem = path.basename(image).replace(/\.[^.]+$/, '');
    const files = [image, image.replace(/\.[^.]+$/, '.webp'), `assets/images/thumbnails/${stem}.png`]
        .filter(f => fs.existsSync(path.join(ROOT, f)));
    run('node', ['build/upload.js', ...files]);
}

async function addFullPaper(slug, paper, source, branch, resume) {
    if (resume) {
        console.log(`\n· ${slug}: source already uploaded; finishing the build`);
    } else {
        // The comment stripper (arxiv_latex_cleaner) lives in the repo's venv.
        if (!fs.existsSync(path.join(ROOT, '.venv/bin/arxiv_latex_cleaner'))) {
            run('npm', ['run', 'setup:python']);
        }
        if (!source || source === 'arxiv') source = await fromArxiv(slug, paper.arxiv);
        run('node', ['build/latex_pack.js', '--local', slug, source]);
        run('node', ['build/upload.js', `research/${slug}/latex.tar.gz`]);
        run('git', ['pull', '--autostash', '--no-rebase', 'origin', branch]);
    }

    run('node', ['build/paper_build.js', slug]);
    // A PDF locked by build/pdf_lock.js stays as it is on R2.
    const pdf = `research/${slug}/paper.pdf`;
    run('node', ['build/upload.js', `research/${slug}/assets`, ...(fs.existsSync(path.join(ROOT, pdf)) ? [pdf] : [])]);
}

async function main() {
    const [slug, source, extra] = process.argv.slice(2);
    if (!slug || extra) {
        console.error('Usage: npm run paper:add -- <slug> [<source.zip|source-dir>]\n' +
            '       Uploads the hero image, and with enable_full_paper: true builds the PDF and\n' +
            '       full-paper page from the source (from the arxiv: URL when no source is given).');
        process.exit(1);
    }

    const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
    const paper = papers.find(p => p.permalink === slug);
    if (!paper) {
        console.error(`✗ No paper with permalink "${slug}" in data/papers.yaml. Add its entry first (CONTRIBUTING.md, Step 1).`);
        process.exit(1);
    }
    if (source && !paper.enable_full_paper) {
        console.error(`✗ A source was given but "${slug}" has no \`enable_full_paper: true\` in data/papers.yaml.`);
        process.exit(1);
    }
    if (source === 'arxiv' && !paper.arxiv) {
        console.error(`✗ "${slug}" has no arxiv: URL in data/papers.yaml.`);
        process.exit(1);
    }
    if (source && source !== 'arxiv' && !fs.existsSync(source)) {
        console.error(`✗ Not found: ${source}`);
        process.exit(1);
    }
    // Build the full paper when there is something new to build. A rerun
    // with no source (to add an image later) leaves a built paper alone.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8'));
    const tarball = manifest[`/research/${slug}/latex.tar.gz`];
    const built = !!tarball;
    // Uploaded source but no finished build (an earlier run stopped):
    // resume from the uploaded source.
    let resume = false;
    if (built && !source && paper.enable_full_paper) {
        const contentFile = path.join(ROOT, 'research', slug, 'paper-content.json');
        const content = fs.existsSync(contentFile) ? JSON.parse(fs.readFileSync(contentFile, 'utf8')) : {};
        resume = content.latex_tarball !== tarball || !manifest[`/research/${slug}/paper.pdf`];
    }
    let buildFull = false;
    if (paper.enable_full_paper) {
        if (source) buildFull = true;
        else if (resume) buildFull = true;
        else if (!built && paper.arxiv) buildFull = true;
        else if (!built) {
            console.error(`✗ "${slug}" has no arxiv: URL. Pass the source: npm run paper:add -- ${slug} <source.zip>`);
            process.exit(1);
        } else {
            console.log(`· ${slug}: full paper already built; pass a zip (or \`arxiv\` for a new arXiv version) to rebuild it`);
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

    addImage(slug, paper);
    if (buildFull) await addFullPaper(slug, paper, source, branch, resume && !source);
    run('git', ['pull', '--autostash', '--no-rebase', 'origin', branch]);

    const content = `research/${slug}/paper-content.json`;
    run('git', ['add', 'data/papers.yaml', ...(buildFull ? [content] : [])]);
    console.log(`\n✅ ${slug}: ready. Review \`git status\`, then commit and push:\n` +
        `   git commit -m "Add ${slug}" && git push\n` +
        '   The pull request\'s Cloudflare preview shows the page.');
}

main().then(() => process.exit(0), (e) => {
    console.error(`✗ paper:add stopped: ${e.message}`);
    process.exit(1);
});
