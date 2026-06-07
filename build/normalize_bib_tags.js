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
  return null;
}

/**
 * Normalize all bibitem tags in one paper-content.json's html. Returns
 * { changed: number, total: number } so the CLI can print a summary.
 * Does NOT touch the body — bibblocks already carry the full author
 * list (either inserted by inject_bbl.js or present in plain-style
 * native extractions).
 */
function normalizeHtml(html) {
  let changed = 0;
  let total = 0;
  // Match each bibitem's tag span and capture its inner text.
  const out = html.replace(
    /(<span\s+class="ltx_tag[^"]*ltx_tag_bibitem[^"]*"[^>]*>)([\s\S]*?)(<\/span>)/g,
    (full, open, inner, close) => {
      total++;
      // Strip tags inside the tag inner — should be plain text in
      // every observed case, but defensive.
      const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const parsed = parseTag(text);
      if (!parsed) return full;
      const short = shortenTag(parsed.authors, parsed.year);
      // Idempotent skip: already in the canonical short form.
      if (short === text) return full;
      changed++;
      // Preserve the original opening/closing tags; just swap the inner.
      // No HTML escaping needed — shortenTag produces plain ASCII names
      // + parens + digits.
      return `${open}${short}${close}`;
    }
  );
  return { html: out, changed, total };
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
