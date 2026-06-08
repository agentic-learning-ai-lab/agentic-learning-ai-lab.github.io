#!/usr/bin/env node

/**
 * Pre-merge audit of paper-content.json files. Catches the regressions
 * we ran into during the bibliography normalization work (PRs #41-43):
 *
 *   1. Empty bibliography on a paper with `enable_full_paper: true`
 *      (build:arxiv:pdf ran but inject_bbl didn't persist for a paper
 *      whose .bbl was missing from the arXiv tarball — symptom that
 *      shipped on BBC).
 *   2. Long bibitem tag — `<span class="ltx_tag_bibitem">` containing
 *      ≥2 commas indicates a full author list that normalize_bib_tags
 *      missed. Caused the visible-newline-in-tag glitch on
 *      temporal-straightening.
 *   3. Leftover `ltx_missing_citation` spans — inject_bbl's
 *      rewriteCitations failed for some keys (means the .bbl entry
 *      keys don't match the in-text `\cite{}` keys).
 *
 * Exits 0 on clean audit, 1 on any failure. Wired into
 * .github/workflows/pr-checks.yml so the same fingerprints fail PRs
 * instead of slipping into main.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const PAPERS_YAML = path.join(ROOT, 'data/papers.yaml');

function loadPapers() {
  return yaml.load(fs.readFileSync(PAPERS_YAML, 'utf8'));
}

function loadPaperContent(slug) {
  const p = path.join(ROOT, 'research', slug, 'paper-content.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Extract bibitem <li>s and per-bibitem tag span content. Plain regex
// because we only need to scan, not parse — the alternative (jsdom)
// would multiply CI install time for no real precision win.
function bibitems(html) {
  return [...html.matchAll(/<li[^>]*\bltx_bibitem\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map(m => m[1]);
}
function tagText(body) {
  const m = body.match(
    /<span\s+class="ltx_tag[^"]*ltx_tag_bibitem[^"]*"[^>]*>([\s\S]*?)<\/span>/
  );
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function audit() {
  const papers = loadPapers();
  const failures = [];

  for (const paper of papers) {
    const slug = paper.permalink;
    const wantsFullPaper = !!paper.enable_full_paper;
    const pc = loadPaperContent(slug);

    // Missing paper-content.json — only matters for enable_full_paper
    // entries; for everyone else the file is irrelevant.
    if (!pc) {
      if (wantsFullPaper) {
        failures.push({
          slug,
          rule: 'missing paper-content',
          msg: `enable_full_paper:true but research/${slug}/paper-content.json missing`,
        });
      }
      continue;
    }

    const html = pc.html || '';
    const items = bibitems(html);

    // Rule 1: empty bibliography on a paper that opted into full HTML.
    // Detect explicitly by looking for the empty <ul> arxiv emits when
    // it found no bibitems. (A paper without a bibliography section
    // at all is rare but not a failure.)
    if (wantsFullPaper && /<ul[^>]*ltx_biblist[^>]*>\s*<\/ul>/.test(html)) {
      failures.push({
        slug,
        rule: 'empty biblist',
        msg: 'enable_full_paper:true and <ul class="ltx_biblist"></ul> is empty — ' +
             'admin needs to run `npm run build:arxiv:pdf` (auto-injects via inject_bbl) ' +
             'after `npm run latex:update <slug>`',
      });
    }

    // Rule 2: long bibitem tags. Two or more commas in the rendered
    // tag text indicates a full author list that normalize_bib_tags
    // missed. The canonical short form has at most one comma
    // ("Last, F." form for some bibstyles); we use ≥2 as the bar.
    let longTags = 0;
    for (const body of items) {
      const t = tagText(body);
      if (!t) continue;
      if (t.split(',').length - 1 >= 2) longTags++;
    }
    if (longTags > 0) {
      failures.push({
        slug,
        rule: 'long bibitem tags',
        msg: `${longTags} bibitem tag(s) still carry a full author list (≥2 commas) — ` +
             `run \`node build/normalize_bib_tags.js ${slug}\``,
      });
    }

    // Rule 3: leftover missing-citation spans. inject_bbl rewrites
    // `<span class="ltx_ref ltx_missing_citation">key</span>` into
    // `<a class="ltx_ref" href="#bib.bibN">label</a>`. Any remaining
    // span means a `\cite{key}` couldn't find a matching `\bibitem{key}`
    // in the .bbl — usually a stale citation or .bbl/.tex mismatch.
    const missingCites = (html.match(/\bltx_missing_citation\b/g) || []).length;
    if (missingCites > 0) {
      failures.push({
        slug,
        rule: 'unresolved citations',
        msg: `${missingCites} \`ltx_missing_citation\` span(s) left in the page — ` +
             `cite keys missing from the .bbl. Check the LaTeX source for stale \\cite{} keys.`,
      });
    }
  }

  // Report
  if (failures.length === 0) {
    console.log(`✓ Bibliography audit clean (${loadPapers().length} papers checked)`);
    return 0;
  }

  console.error(`\n⛔ Bibliography audit: ${failures.length} issue(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.slug}: ${f.rule}`);
    console.error(`    ${f.msg}`);
  }
  console.error('');
  return 1;
}

if (require.main === module) {
  process.exit(audit());
}

module.exports = { audit };
