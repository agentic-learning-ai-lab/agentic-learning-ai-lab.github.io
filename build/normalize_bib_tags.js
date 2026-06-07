#!/usr/bin/env node

/**
 * Normalize bibitem tags across paper-content.json files so every
 * paper shows the same compact author-year form in its References
 * list. Without this, native arXiv extraction emits long lists like
 * "Y. Bai, D. Tran, A. Bar, Y. LeCun, T. Darrell, and J. Malik (2025)"
 * in the `<span class="ltx_tag>`, while injected (via inject_bbl.js)
 * apalike-style entries already arrive in short form "Alur et al.
 * (2025)". The mismatch is visible side-by-side in the rendered page.
 *
 * Output convention (matches apalike's bracket label rendering):
 *   - 1 author:   "Last (YYYY)"
 *   - 2 authors:  "Last1 and Last2 (YYYY)"
 *   - 3+ authors: "Last1 et al. (YYYY)"
 *
 * The full author list stays in the body's first `<span class="ltx_bibblock">`
 * (or in the existing `<span class="ltx_tag>` content before this script
 * runs — we move it into a leading bibblock if it isn't already there).
 *
 * Idempotent: a normalized tag has form `<short> (YYYY)` with at most
 * three tokens before " (year)". If it already matches that shape and
 * the leading bibblock contains a full author list, we leave it alone.
 *
 * Usage:
 *   node build/normalize_bib_tags.js              # normalize every paper-content.json
 *   node build/normalize_bib_tags.js <slug>       # just one
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function paperContentPath(slug) {
  return path.join(ROOT, 'research', slug, 'paper-content.json');
}

/**
 * Walk `research/<slug>/paper-content.json` files. Returns array of slugs.
 */
async function allSlugs() {
  const dir = path.join(ROOT, 'research');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const pc = paperContentPath(e.name);
    if (await fs.pathExists(pc)) slugs.push(e.name);
  }
  return slugs;
}

/**
 * Extract a last name from an author token like "F. Last", "F.M. Last",
 * "van der Smith", or a single-word org "Anthropic". Returns the last
 * whitespace-separated chunk, with surrounding punctuation trimmed.
 */
function lastName(authorChunk) {
  const trimmed = authorChunk.trim().replace(/^\(|\)$/g, '');
  const parts = trimmed.split(/\s+/);
  return (parts[parts.length - 1] || trimmed).replace(/[.,;]+$/, '');
}

/**
 * Build a short author-year tag from a full author list + year.
 *
 * `authors` can arrive in any of these forms:
 *   "F. Last"                           (1)
 *   "F. Last and G. Other"              (2, no comma)
 *   "F. Last, G. Other, and H. Third"   (3+, Oxford comma)
 *   "F. Last, G. Other, et al."         (apalike "et al." sentinel)
 *   "F. Last et al."                    (already short, leave alone)
 */
function shortenTag(authors, year) {
  // Detect + strip trailing "et al." sentinel (apalike emits this).
  const hadEtAl = /\b(?:and\s+)?et\s*al\.?\s*,?\s*$/i.test(authors);
  let cleaned = authors.replace(/[,\s]*(?:and\s+)?et\s*al\.?\s*,?\s*$/i, '').trim();
  // Normalize the conjunction: turn " and " (no preceding comma) into
  // ", " so a single split-on-comma yields one chunk per author.
  cleaned = cleaned.replace(/\s+and\s+/gi, ', ');
  const chunks = cleaned.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  const lastNames = chunks.map(lastName).filter(Boolean);

  let authorPart;
  if (lastNames.length === 0) {
    // Nothing parseable — leave the original (sans year).
    authorPart = cleaned || authors.trim();
  } else if (hadEtAl || lastNames.length >= 3) {
    authorPart = `${lastNames[0]} et al.`;
  } else if (lastNames.length === 2) {
    authorPart = `${lastNames[0]} and ${lastNames[1]}`;
  } else {
    authorPart = lastNames[0];
  }
  return year ? `${authorPart} (${year})` : authorPart;
}

/**
 * Inspect a tag's text content. Returns { authors, year } or null if
 * the shape doesn't parse. The caller always re-runs shortenTag —
 * idempotent because shortenTag's output also parses cleanly back
 * into the same form.
 */
function parseTag(tagText) {
  const trimmed = tagText.trim();
  // "Authors (YYYY)" with optional trailing comma/space inside parens
  // (apalike sometimes emits "Lastname et al.,  (2025)").
  const m1 = trimmed.match(/^(.+?)[\s,]*\((\d{4}[a-z]?)\)\s*\.?$/);
  if (m1) return { authors: m1[1].trim().replace(/,\s*$/, ''), year: m1[2] };
  // "Authors, YYYY" unbracketed (apalike .bbl [label] form).
  const m2 = trimmed.match(/^(.+?),\s*(\d{4}[a-z]?)\s*\.?$/);
  if (m2) return { authors: m2[1].trim(), year: m2[2] };
  // Year missing — observed on some arXiv-extracted papers where the
  // original BibTeX had no year field. Still want to shorten the
  // author list; just emit "Last et al." with no trailing parens.
  const m3 = trimmed.match(/^(.+?\bet\s*al\.?)\s*$/i);
  if (m3) return { authors: m3[1].trim(), year: '' };
  return null;
}

/**
 * Normalize bibitem tags AND preserve the full author list as a
 * leading body block so every paper renders the same References
 * format regardless of how arXiv extracted the source:
 *
 *   <li class="ltx_bibitem">
 *     <span class="ltx_tag ...">Last et al. (YYYY)</span>           ← short
 *     <span class="ltx_bibblock">F. Last, M. Other ... (YYYY).</span> ← full (NEW for many natives)
 *     <span class="ltx_bibblock"><span class="ltx_text ltx_bib_title">…</span>.</span>
 *     <span class="ltx_bibblock">Venue.</span>
 *   </li>
 *
 * For each bibitem:
 *   1. Parse the tag content into {authors, year}.
 *   2. Compute the canonical short form.
 *   3. If the body's first bibblock doesn't already contain the full
 *      author list, prepend one ("authors (year)."). Detected via
 *      first-author-lastname presence — covers idempotent re-runs and
 *      already-plain-style natives (anticipatory-recovery, arq).
 *   4. Replace the tag's inner text with the short form.
 */
function normalizeHtml(html) {
  let changed = 0;
  let total = 0;
  const out = html.replace(
    /(<li[^>]*\bltx_bibitem\b[^>]*>)([\s\S]*?)(<\/li>)/g,
    (full, openLi, body, closeLi) => {
      // Find this bibitem's tag span.
      const tagRe = /(<span\s+class="ltx_tag[^"]*ltx_tag_bibitem[^"]*"[^>]*>)([\s\S]*?)(<\/span>)/;
      const tagMatch = body.match(tagRe);
      if (!tagMatch) return full;
      total++;
      const [tagFull, tagOpen, tagInner, tagClose] = tagMatch;
      const tagText = tagInner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const parsed = parseTag(tagText);
      if (!parsed) return full;
      const short = shortenTag(parsed.authors, parsed.year);

      // Check if body's first bibblock already carries the author list.
      // First-author lastname presence is a robust signal — apalike
      // .bbl outputs always start the first line with the lead author's
      // surname, and plain-style natives do the same.
      let lastNames = parsed.authors
        .replace(/[,\s]*(?:and\s+)?et\s*al\.?\s*,?\s*$/i, '')
        .replace(/\s+and\s+/gi, ', ')
        .split(/,\s*/).map(lastName).filter(Boolean);
      const firstLast = lastNames[0] || '';
      const firstBlockMatch = body.match(/<span\s+class="[^"]*\bltx_bibblock\b[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const firstBlockText = firstBlockMatch
        ? firstBlockMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';
      const hasAuthorsInBody = firstLast && firstBlockText.includes(firstLast);

      const tagChanged = short !== tagText;
      const willInsertAuthors = !hasAuthorsInBody && parsed.authors !== short;
      if (!tagChanged && !willInsertAuthors) return full;

      changed++;
      // Rewrite the tag's inner text to the short form.
      let newBody = body.replace(tagFull, `${tagOpen}${short}${tagClose}`);

      // Prepend a full-author bibblock if needed. Position it right
      // after the tag's `</span>` (and any whitespace), before the
      // first existing bibblock — matching the apalike-injected layout.
      if (willInsertAuthors) {
        // Year may be empty for arXiv-extracted tags missing a year
        // field — emit just "authors." in that case.
        const yearSuffix = parsed.year ? ` (${escapeHtml(parsed.year)})` : '';
        const authorsHtml = `<span class="ltx_bibblock">${escapeHtml(parsed.authors)}${yearSuffix}.</span>`;
        const newTag = `${tagOpen}${short}${tagClose}`;
        newBody = newBody.replace(newTag, `${newTag}\n${authorsHtml}`);
      }
      return `${openLi}${newBody}${closeLi}`;
    }
  );
  return { html: out, changed, total };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function normalizeOne(slug) {
  const pcPath = paperContentPath(slug);
  if (!await fs.pathExists(pcPath)) {
    console.warn(`  normalize: ${slug}: no paper-content.json`);
    return { changed: 0, total: 0 };
  }
  const data = await fs.readJson(pcPath);
  const result = normalizeHtml(data.html);
  if (result.changed > 0) {
    data.html = result.html;
    await fs.writeJson(pcPath, data, { spaces: 2 });
  }
  console.log(`  normalize: ${slug}: ${result.changed}/${result.total} tags shortened`);
  return result;
}

async function main() {
  const argSlug = process.argv[2];
  const slugs = argSlug ? [argSlug] : await allSlugs();
  let totalChanged = 0, totalTags = 0;
  for (const slug of slugs) {
    const r = await normalizeOne(slug);
    totalChanged += r.changed;
    totalTags += r.total;
  }
  if (slugs.length > 1) {
    console.log(`\nnormalize: ${totalChanged} / ${totalTags} tags rewritten across ${slugs.length} papers`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`normalize_bib_tags error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { normalizeOne, normalizeHtml, shortenTag };
