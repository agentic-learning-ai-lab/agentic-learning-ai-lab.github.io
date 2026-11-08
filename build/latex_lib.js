/**
 * LaTeX-specific helpers shared by latex_pack, latex_fetch, latex_update,
 * clean_latex and arxiv_source. Kept apart from latex_pack so no two
 * scripts require each other.
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
/** Paths (relative to root) of the files under root ending in ext. */
async function listFiles(root, ext) {
  const out = [];
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(ext)) out.push(path.relative(root, full));
    }
  };
  await walk(root);
  return out;
}

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

  // The cleaner drops every file no .tex references, which keeps unused
  // draft figures out of the public tarball. Restore what the compile
  // still needs: a .bbl (a source that ships no .bib), fonts and
  // templates, which carry no author text, and any file a kept class or
  // style file names (fairmeta.cls loads its font and logo from assets/).
  const keepExt = /\.(bbl|bst|cls|sty|clo|cfg|def|fd|tfm|vf|enc|map|pfb|afm|ttf|otf)$/i;
  const all = await listFiles(latexDir, '');
  // Only class and style files the cleaner kept, with their comments
  // stripped, can name a file to restore.
  const keptTemplates = (await listFiles(cleanedDir, '')).filter(rel => /\.(cls|sty)$/i.test(rel));
  const named = new Set();
  for (const t of keptTemplates) {
    const text = (await fs.readFile(path.join(cleanedDir, t), 'latin1'))
      .split('\n').map(l => l.replace(/(^|[^\\])%.*/, '$1')).join('\n');
    for (const rel of all) {
      const stem = rel.replace(/\.[^./]+$/, '').split(path.sep).join('/');
      if (stem.length >= 4 && text.includes(stem)) named.add(rel);
    }
  }
  for (const rel of all) {
    const dest = path.join(cleanedDir, rel);
    if (await fs.pathExists(dest)) continue;
    // A figure epstopdf already converted is kept only beside its kept .eps.
    const eps = rel.match(/^(.*)-eps-converted-to\.pdf$/i);
    const keep = keepExt.test(rel) || named.has(rel) ||
      (eps && await fs.pathExists(path.join(cleanedDir, eps[1] + '.eps')));
    if (keep) await fs.copy(path.join(latexDir, rel), dest);
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
 * Prefers main.tex or ms.tex by convention — but still verifies the
 * preferred file actually contains \documentclass (a stub main.tex that
 * just \inputs the real preamble doesn't satisfy our compile contract).
 */
async function findMainTexFile(latexDir) {
  const files = await fs.readdir(latexDir);

  const hasDocumentclass = async (file) => {
    const content = await fs.readFile(path.join(latexDir, file), 'utf8');
    return content.includes('\\documentclass');
  };

  for (const preferred of ['main.tex', 'ms.tex']) {
    if (files.includes(preferred) && await hasDocumentclass(preferred)) {
      return preferred;
    }
  }
  for (const file of files.filter(f => f.endsWith('.tex'))) {
    if (file === 'main.tex' || file === 'ms.tex') continue; // tried above
    if (await hasDocumentclass(file)) return file;
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
