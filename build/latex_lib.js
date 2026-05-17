/**
 * LaTeX-specific helpers shared by latex_pack, latex_fetch, latex_update,
 * clean_latex, and build_arxiv_papers' compile path.
 *
 * Lives here (not in build_arxiv_papers or latex_pack) so the dep graph
 * stays a DAG:
 *
 *   r2_lib  ←  latex_lib
 *      ↑          ↑
 *      ├── latex_pack ───┐
 *      ├── latex_fetch ──┤
 *      ├── latex_update ─┤
 *      └── build_arxiv_papers ─┘  (also requires latex_fetch for the
 *                                  R2 download branch in compile)
 *
 * Before this split, build_arxiv_papers and latex_pack each required the
 * other (cleanLatexSource lived in the former, manifestKey in the latter),
 * which only worked because of a load-bearing lazy require. See the PR #4
 * code review for why that pattern is fragile.
 */

const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(require('child_process').exec);

/**
 * Logical manifest path for a paper's source tarball. The build pipeline
 * and CDN never reference this path directly — it's the lookup key in
 * assets-manifest.json that maps to the actual content-addressed R2 URL.
 */
function manifestKey(slug) {
  return `/research/${slug}/latex.tar.gz`;
}

/**
 * Locate the arxiv_latex_cleaner binary.
 *
 * Priority: local venv (.venv/bin/arxiv_latex_cleaner) → PATH. Local
 * developers run `npm run setup:python` once to create the venv; the
 * `arxiv-latex-cleaner` pip dep is declared in build/requirements.txt.
 */
async function findArxivLatexCleaner() {
  const venvBin = path.join(__dirname, '..', '.venv/bin/arxiv_latex_cleaner');
  if (await fs.pathExists(venvBin)) return venvBin;
  try {
    await execAsync('arxiv_latex_cleaner --help');
    return 'arxiv_latex_cleaner';
  } catch {
    throw new Error(
      'arxiv_latex_cleaner not found. Run `npm run setup:python` to install the build venv, ' +
      'or `pip install arxiv-latex-cleaner` system-wide.'
    );
  }
}

/**
 * Strip author comments from a LaTeX source tree in place.
 *
 * Privacy boundary: the repo is public and so is the R2 bucket. Author
 * comments routinely contain TODOs, reviewer responses ("R2 said..."),
 * commented-out figures from alternate experiments, internal scratch,
 * and funding details. We strip them BEFORE the source is tarred and
 * uploaded — latex_pack.packOne() is the only path that uploads, and it
 * always calls this function first.
 *
 * Idempotent: re-cleaning an already-cleaned tree produces no further
 * changes.
 *
 * @param {string} latexDir - tree to clean in place
 * @returns {Promise<{stripped: number}>}
 */
async function cleanLatexSource(latexDir) {
  const cleaner = await findArxivLatexCleaner();

  const parent = path.dirname(latexDir);
  const base = path.basename(latexDir);
  const cleanedDir = path.join(parent, `${base}_arXiv`);

  // arxiv_latex_cleaner writes to <input>_arXiv/. Wipe stale output from
  // a previous interrupted run before starting.
  await fs.remove(cleanedDir);

  const preCount = await countCommentLines(latexDir);

  // --keep_bib: don't drop .bib files (they go into the tarball).
  // Defaults: no image resizing, no PDF compression.
  await execAsync(`"${cleaner}" --keep_bib "${base}"`, { cwd: parent });

  if (!await fs.pathExists(cleanedDir)) {
    throw new Error(`arxiv_latex_cleaner did not produce ${cleanedDir}`);
  }

  await fs.remove(latexDir);
  await fs.move(cleanedDir, latexDir);

  const postCount = await countCommentLines(latexDir);
  const stripped = preCount - postCount;
  console.log(`    🧹 cleaned ${path.relative(process.cwd(), latexDir)}: stripped ${stripped} comment lines`);
  return { stripped };
}

/**
 * Count non-magic author-comment lines across `.tex` files in a tree.
 * `.sty` / `.cls` are skipped (third-party stylesheets with intentional
 * license/header comments; the cleaner doesn't touch them either).
 * `%!TEX` magic comments are functional engine hints — also excluded.
 */
async function countCommentLines(latexDir) {
  let count = 0;
  const entries = await fs.readdir(latexDir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(latexDir, ent.name);
    if (ent.isDirectory()) {
      count += await countCommentLines(full);
    } else if (ent.name.endsWith('.tex')) {
      const content = await fs.readFile(full, 'utf8');
      for (const line of content.split('\n')) {
        if (/^\s*%/.test(line) && !/^\s*%\s*!TEX/i.test(line)) count++;
      }
    }
  }
  return count;
}

/**
 * Find the main .tex file in a directory (one with \documentclass).
 * Prefers main.tex or ms.tex by convention.
 */
async function findMainTexFile(latexDir) {
  const files = await fs.readdir(latexDir);
  const preferred = files.find(f => f === 'main.tex' || f === 'ms.tex');
  if (preferred) return preferred;

  for (const file of files.filter(f => f.endsWith('.tex'))) {
    const content = await fs.readFile(path.join(latexDir, file), 'utf8');
    if (content.includes('\\documentclass')) {
      return file;
    }
  }
  return null;
}

module.exports = {
  manifestKey,
  cleanLatexSource,
  findArxivLatexCleaner,
  countCommentLines,
  findMainTexFile,
};
