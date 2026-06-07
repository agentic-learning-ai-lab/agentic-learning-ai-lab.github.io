#!/usr/bin/env node

/**
 * Inject bibliography entries into a paper-content.json whose
 * `<ul class="ltx_biblist">` came back empty from arXiv's HTML
 * extraction.
 *
 * Root cause for the gap: arXiv strips `.bbl` files from source
 * uploads, and the HTML extractor doesn't run BibTeX itself. Papers
 * with `\bibliography{ref}` + BibTeX style (apalike, plain, etc.)
 * therefore land with no References list and every `\cite{key}` shows
 * as `<span class="ltx_missing_citation">key</span>`.
 *
 * Strategy here (per notes/bbl-injection.md, option B):
 *
 *  1. Locate a `main.bbl` for the paper. Either already cached at
 *     .cache/latex-build/<slug>/main.bbl (from a prior PDF compile),
 *     or generate one by fetching the latex.tar.gz from R2 + running
 *     latexmk/bibtex on the cached source.
 *  2. Pipe the .bbl (with `\newblock` stripped — pandoc otherwise
 *     swallows the immediately-following `{...}` group) through
 *     pandoc to convert each `\bibitem` body to HTML.
 *  3. Reassemble as a `<ul id="bib.L1" class="ltx_biblist">` containing
 *     one `<li class="ltx_bibitem" id="bib.bib<N>">` per entry. The
 *     `<span class="ltx_tag ...>` carries the `[label]` from the .bbl
 *     (e.g. "Brier, 1950" under apalike).
 *  4. Rewrite each `<span class="ltx_ref ltx_missing_citation ...">key</span>`
 *     into `<a class="ltx_ref" href="#bib.bib<N>">label</a>`, matching
 *     the structure of natively-extracted papers.
 *
 * Idempotent: skip if the bibliography is already populated.
 *
 * Usage:
 *   node build/inject_bbl.js <slug>
 *
 * Invoked automatically from build_arxiv_papers.js after each HTML
 * download; this CLI is a standalone entry point for re-runs.
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function paperContentPath(slug) {
  return path.join(ROOT, 'research', slug, 'paper-content.json');
}

/**
 * Cheap test: does the bibliography section already have any
 * `<li class="ltx_bibitem">` entries? If yes, we're done.
 */
function bibIsPopulated(html) {
  // Look for an empty <ul id="bib.L1" ...></ul> or empty <section
  // class="ltx_bibliography"> ... </section>. If neither matches the
  // "empty" pattern, assume populated and skip.
  const emptyUlList = /<ul[^>]*id="bib\.L1"[^>]*>\s*<\/ul>/.test(html);
  if (emptyUlList) return false;
  // Native arXiv extraction sometimes uses a different list wrapper —
  // check the section's bibitem count directly.
  const sectionMatch = html.match(
    /<section[^>]*class="[^"]*\bltx_bibliography\b[^"]*"[\s\S]*?<\/section>/
  );
  if (!sectionMatch) return true; // no bib section at all; nothing to fix
  return /class="[^"]*\bltx_bibitem\b/.test(sectionMatch[0]);
}

/**
 * Locate or generate main.bbl for `slug`. Returns absolute path to the
 * file, or null if we can't produce one.
 */
async function ensureBbl(slug) {
  // First, check the PDF-compile cache. resolveLatexSourceForCompile()
  // extracts the R2 tarball into .cache/latex-build/<slug>/latex/, then
  // compileLatex() runs latexmk in that directory and leaves main.bbl
  // there. We piggy-back on those artifacts.
  const cacheBbl = path.join(ROOT, '.cache', 'latex-build', slug, 'latex', 'main.bbl');
  if (await fs.pathExists(cacheBbl)) return cacheBbl;

  // Next, check the transient latex/ tree (after `npm run latex:fetch`).
  const localTree = path.join(ROOT, 'research', slug, 'latex');
  const localBbl = path.join(localTree, 'main.bbl');
  if (await fs.pathExists(localBbl)) return localBbl;
  if (await fs.pathExists(path.join(localTree, 'main.tex'))) {
    if (await compileBbl(localTree)) return localBbl;
  }

  // Nothing cached and no local tree — bail with a hint. We don't try
  // to auto-fetch the R2 tarball here; that's the caller's job (the
  // build:arxiv:pdf path normally runs first and leaves the .bbl
  // behind, satisfying the cacheBbl branch above).
  console.warn(
    `  bbl-inject: ${slug}: no .bbl found at .cache/latex-build/${slug}/main.bbl ` +
    `or research/${slug}/latex/main.bbl — skip. Run ` +
    `'npm run latex:fetch ${slug}' or 'npm run build:arxiv:pdf' first.`
  );
  return null;
}

/**
 * Compile main.tex with the same xelatex+bibtex+xelatex pattern
 * build_arxiv_papers.js uses for the PDF, but stopping after the .bbl
 * is produced. Returns true on success.
 */
async function compileBbl(dir) {
  // Detect engine the same way as build_arxiv_papers.js
  const mainTex = await fs.readFile(path.join(dir, 'main.tex'), 'utf8');
  const usesXetex =
    /^\s*%!TEX\s+program\s*=\s*xelatex/m.test(mainTex) ||
    /\\usepackage(\[[^\]]*\])?\{(fontspec|xeCJK|polyglossia|mathspec)\}/.test(mainTex) ||
    /\\usepackage(\[[^\]]*\])?\{[^}]*xelatex[^}]*\}/.test(mainTex);
  const engine = usesXetex ? 'xelatex' : 'pdflatex';
  const env = { ...process.env, TEXINPUTS: `${dir}:` };
  const opts = { cwd: dir, env, stdio: 'pipe' };
  try {
    spawnSync(engine, ['-interaction=nonstopmode', 'main.tex'], opts);
    spawnSync('bibtex', ['main'], opts);
    return await fs.pathExists(path.join(dir, 'main.bbl'));
  } catch (err) {
    console.warn(`  bbl-inject: compile failed: ${err.message}`);
    return false;
  }
}

/**
 * Strip the common LaTeX-isms in labels and titles: `~` (non-breaking
 * space), `{...}` style-protecting braces, `\&`, `\textit{...}` etc.,
 * em-dashes (`--` → `–`). Not a full LaTeX parser — handles the cases
 * we see in apalike/plain style .bbl outputs.
 */
function stripLatex(s) {
  return String(s)
    .replace(/\\(textit|textbf|emph|em|texttt)\s*\{([^}]*)\}/g, '$2')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ')
    .replace(/\\&/g, '&')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a .bbl into per-entry objects { key, label, blocks }.
 * - blocks: an array of LaTeX strings, one per `\newblock` segment.
 *   In apalike: blocks[0]=authors+year, blocks[1]=title, blocks[2]=venue.
 *   In plain: similar shape. The title position is consistent across
 *   the styles we see in arxiv-uploaded .bbl outputs (always after
 *   the first \newblock).
 *
 * The title-for-tooltip extraction lives in paper-view.js — it reads
 * the rendered HTML's `.ltx_bib_title` span (or falls back to
 * bibblocks[1]) — so we don't carry a `title:` field on the entry.
 */
function parseBibitems(bbl) {
  const items = [];
  const regex = /\\bibitem(?:\[([^\]]*)\])?\{([^}]+)\}([\s\S]*?)(?=\\bibitem\{|\\bibitem\[|\\end\{thebibliography\}|$)/g;
  let m;
  while ((m = regex.exec(bbl)) !== null) {
    const [, labelRaw, key, bodyRaw] = m;
    const blocks = bodyRaw
      .split(/\\newblock/)
      .map(s => s.trim())
      .filter(Boolean);
    items.push({
      key: key.trim(),
      label: stripLatex(labelRaw || ''),
      blocks,
    });
  }
  return items;
}

/**
 * Convert one bib entry's blocks (per-`\newblock` LaTeX fragments) into
 * an array of HTML strings via pandoc. Sends one well-formed
 * minimal-document per block — keeps pandoc's interpretation contained
 * (no cross-entry interference) and trivially preserves per-block
 * boundaries so we can wrap each in its own <span class="ltx_bibblock">.
 */
function pandocBlocksToHtml(blocks) {
  if (blocks.length === 0) return [];
  // Batch into one pandoc run via a sentinel that survives LaTeX
  // unchanged. We separate blocks with a `\par` (which pandoc emits as
  // a paragraph break) and split the output by `<p>...</p>`. Faster
  // than spawning pandoc per block.
  const wrapped =
    `\\documentclass{article}\n\\begin{document}\n` +
    blocks.join('\n\n\\par\n\n') +
    `\n\\end{document}\n`;
  const proc = spawnSync('pandoc', ['-f', 'latex', '-t', 'html5'], {
    input: wrapped,
    encoding: 'utf8',
  });
  if (proc.status !== 0) {
    throw new Error(`pandoc exited ${proc.status}: ${proc.stderr}`);
  }
  const out = proc.stdout;
  const paragraphs = [...out.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].trim());
  // pandoc may collapse adjacent paragraphs or split one across two —
  // in practice with our `\par` separator we get exactly one <p> per
  // block. If counts mismatch, fall back to dumping everything as one
  // block rather than mis-aligning.
  return paragraphs.length === blocks.length ? paragraphs : [paragraphs.join(' ')];
}

/**
 * Render one entry's HTML — apalike-style layout used by arXiv ar5iv
 * when the paper's .bbl is shipped intact:
 *
 *   <li id="bib.bibN" class="ltx_bibitem">
 *     <span class="ltx_tag ltx_bib_author-year ...">Alur et al. (2025)</span>
 *     <span class="ltx_bibblock">Alur, R., Stadie, B. C., ... (2025).</span>
 *     <span class="ltx_bibblock"><span class="ltx_text ltx_bib_title">Title</span>.</span>
 *     <span class="ltx_bibblock">Venue.</span>
 *   </li>
 *
 * Tag carries the SHORT apalike label reformatted as "Authors (year)".
 * Long author lists (BBC's 10-author paper) would overflow the tag's
 * inline-block container if we used the full list there — hence the
 * short form. The full author list still appears as the first body
 * block, matching the "Agrawal et al. (2015) Pulkit Agrawal, Joao
 * Carreira, and Jitendra Malik. Learning to see by moving." style.
 *
 * The title block gets `.ltx_bib_title` so paper-view.js can read it
 * for the in-text citation tooltip without index heuristics.
 */
function renderBibitem(entry, index) {
  const id = `bib.bib${index + 1}`;

  // Tag from the apalike label "Authors, YYYY" → "Authors (YYYY)".
  // Fall back to numeric index if there's no label.
  let tagInner = escapeHtml(entry.label || `${index + 1}`);
  if (entry.label) {
    const lastComma = entry.label.lastIndexOf(', ');
    if (lastComma > -1) {
      const authors = entry.label.slice(0, lastComma);
      const year = entry.label.slice(lastComma + 2);
      tagInner = `${escapeHtml(authors)} (${escapeHtml(year)})`;
    }
  }

  // Body = ALL .bbl segments in order. In apalike that's
  // [0]=full authors+year line, [1]=title, [2]=venue. The title block
  // gets `.ltx_bib_title` for paper-view.js's tooltip lookup.
  const blocksHtml = pandocBlocksToHtml(entry.blocks);
  const bodyBlocks = blocksHtml
    .map((b, i) => {
      const inner = i === 1
        ? `<span class="ltx_text ltx_bib_title">${b}</span>`
        : b;
      return `<span class="ltx_bibblock">${inner}</span>`;
    })
    .join('\n');

  return (
    `<li id="${id}" class="ltx_bibitem">\n` +
    `<span class="ltx_tag ltx_bib_author-year ltx_role_refnum ltx_tag_bibitem">${tagInner}</span>\n` +
    `${bodyBlocks}\n` +
    `</li>`
  );
}

function renderBibList(entries) {
  const items = entries.map((e, i) => renderBibitem(e, i));
  return `<ul id="bib.L1" class="ltx_biblist">\n${items.join('\n')}\n</ul>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Rewrite all `<span class="ltx_ref ltx_missing_citation ...">key</span>`
 * spans to anchor links pointing at our injected bib entries. Keys not
 * in the lookup map are left as-is (defensive — flagged by build:arxiv
 * later as "missing citation").
 */
function rewriteCitations(html, entries) {
  const keyToIdx = new Map(entries.map((e, i) => [e.key, i]));
  // No `title=` attribute on the rewritten anchors — paper-view.js
  // sets `data-ref-title` from the rendered bibitem and drives its
  // own positioned tooltip. Emitting `title=` would stack a browser-
  // default tooltip on top, producing the "double tooltip" effect.
  return html.replace(
    /<span\s+class="ltx_ref ltx_missing_citation[^"]*"[^>]*>([^<]+)<\/span>/g,
    (full, keyText) => {
      const key = keyText.trim();
      const idx = keyToIdx.get(key);
      if (idx === undefined) return full;
      const id = `bib.bib${idx + 1}`;
      const label = entries[idx].label || key;
      // Native arXiv emits `(Author, <a>year</a>)` — only the year is
      // the clickable link, the author prefix stays plain text inside
      // the surrounding <cite>. Split the apalike label by its last
      // ", " to recover the prefix; if there's no comma (rare style),
      // fall back to linking the whole label.
      const lastComma = label.lastIndexOf(', ');
      if (lastComma > -1) {
        const prefix = label.slice(0, lastComma + 2); // includes ", "
        const year = label.slice(lastComma + 2);
        return `${escapeHtml(prefix)}<a class="ltx_ref" href="#${id}">${escapeHtml(year)}</a>`;
      }
      return `<a class="ltx_ref" href="#${id}">${escapeHtml(label)}</a>`;
    }
  );
}

async function injectOne(slug) {
  const pcPath = paperContentPath(slug);
  if (!await fs.pathExists(pcPath)) {
    console.log(`  bbl-inject: ${slug}: no paper-content.json; skip`);
    return false;
  }
  const data = await fs.readJson(pcPath);
  if (bibIsPopulated(data.html)) {
    console.log(`  bbl-inject: ${slug}: bibliography already populated; skip`);
    return false;
  }
  const bblPath = await ensureBbl(slug);
  if (!bblPath) return false;

  const bbl = await fs.readFile(bblPath, 'utf8');
  const entries = parseBibitems(bbl);
  if (entries.length === 0) {
    console.warn(`  bbl-inject: ${slug}: no \\bibitem entries in .bbl; skip`);
    return false;
  }

  const newBibUl = renderBibList(entries);
  let html = data.html.replace(
    /<ul[^>]*id="bib\.L1"[^>]*>\s*<\/ul>/,
    newBibUl
  );
  html = rewriteCitations(html, entries);

  data.html = html;
  await fs.writeJson(pcPath, data, { spaces: 2 });
  console.log(`  bbl-inject: ${slug}: injected ${entries.length} entries`);
  return true;
}

if (require.main === module) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node build/inject_bbl.js <slug>');
    process.exit(1);
  }
  // Always exit 0 — the injector is a content enhancer, not a
  // correctness check. Any failure leaves paper-content.json
  // untouched (it would render with empty References, same as
  // before injection was wired up).
  injectOne(slug).catch(err => {
    console.error(`bbl-inject error: ${err.message}`);
  }).then(() => process.exit(0));
}

module.exports = { injectOne };
