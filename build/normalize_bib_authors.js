#!/usr/bin/env node

/**
 * Normalize the AUTHOR-LIST format in every bibitem's first <span
 * class="ltx_bibblock"> so the References section reads consistently
 * across papers.
 *
 * Canonical form: surname-first, given-name-as-given (no abbreviation).
 * Preserving the full first name matters for disambiguation when many
 * authors share a surname — common in CS for east-Asian names (Li,
 * Wang, Chen, Zhang, Kim, etc.); collapsing to initials would create
 * spurious ambiguity in the References section.
 *
 *   "Jacob Devlin, Ming-Wei Chang, Kenton Lee, and Kristina Toutanova."
 *      → "Devlin, Jacob, Chang, Ming-Wei, Lee, Kenton, and Toutanova, Kristina"
 *   "A. Abdolmaleki, J. T. Springenberg, Y. Tassa (2018)."
 *      → "Abdolmaleki, A., Springenberg, J. T., Tassa, Y. (2018)."
 *
 * Note: an apalike-style source that ships initials stays in initials
 * (we don't fabricate full first names from "A."). Papers whose bibtex
 * carried full first names keep them.
 *
 * Why apalike: it's the dominant ML-conference convention (NeurIPS,
 * ICML), matches the short-cite tag this build already emits
 * (normalize_bib_tags.js — "Last et al. (YYYY)"), and is what apalike
 * .bbl injection (inject_bbl.js) already produces. About half the
 * corpus is already in this form; this pass brings the rest in line.
 *
 * Detection: an author block whose first author starts with
 * "Lastname, Initial." (single word + comma + uppercase letter + period)
 * is already apalike — skip. Otherwise the author list is "F. Lastname"
 * (initials) or "Firstname Lastname" (full first names) and we rewrite.
 *
 * Idempotent: re-running on already-normalized output is a no-op.
 *
 * Usage:
 *   node build/normalize_bib_authors.js              # normalize every paper-content.json
 *   node build/normalize_bib_authors.js <slug>       # just one
 *   node build/normalize_bib_authors.js --dry-run    # report changes without writing
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function paperContentPath(slug) {
  return path.join(ROOT, 'research', slug, 'paper-content.json');
}

async function allSlugs() {
  const dir = path.join(ROOT, 'research');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await fs.pathExists(paperContentPath(e.name))) slugs.push(e.name);
  }
  return slugs;
}

// Particles that belong with the surname rather than the given name.
// Common Dutch/German/Spanish/French/Portuguese name elements.
const SURNAME_PARTICLES = new Set([
  'van', 'von', 'de', 'der', 'den', 'da', 'do', 'dos', 'das',
  'di', 'del', 'della', 'la', 'le', 'el', 'al', 'bin', 'ben',
  'ten', 'ter', 'zu', 'zum', 'zur', 'du',
]);

/**
 * Convert a given-name token to its initial form.
 *   "Jacob"      → "J."
 *   "A."         → "A."     (already an initial; preserved)
 *   "Ming-Wei"   → "M.-W."  (hyphenated → initials joined by '-')
 *   "Mary"       → "M."
 *   ""           → ""
 */
function toInitial(token) {
  if (!token) return '';
  if (/^[A-Z]\.$/.test(token)) return token;       // "A."  → "A."
  if (/^[A-Z]\.-[A-Z]\.$/.test(token)) return token; // already hyphen-joined
  if (token.includes('-')) {
    return token.split('-').map(t => t[0] ? t[0].toUpperCase() + '.' : '').join('-');
  }
  // Single character "A" without period → add period.
  if (/^[A-Z]$/.test(token)) return token + '.';
  // Word starting with uppercase letter → first letter + period.
  const ch = token[0];
  if (ch && ch.toUpperCase() === ch && /[A-Z]/.test(ch)) return ch + '.';
  return token; // unrecognized — pass through
}

/**
 * Parse one author chunk into { given, surname }. Given names are
 * preserved verbatim — no abbreviation. Initials in the source stay
 * initials; full first names stay full.
 *
 *   "Jacob Devlin"        → { given: "Jacob",     surname: "Devlin" }
 *   "Ming-Wei Chang"      → { given: "Ming-Wei",  surname: "Chang" }
 *   "A. Abdolmaleki"      → { given: "A.",        surname: "Abdolmaleki" }
 *   "J. T. Springenberg"  → { given: "J. T.",     surname: "Springenberg" }
 *   "van der Smith"       → { given: "",          surname: "van der Smith" }
 *   "A. van der Smith"    → { given: "A.",        surname: "van der Smith" }
 *   "Anthropic"           → { given: "",          surname: "Anthropic" }  (corporate; single word)
 *
 * The particle rule pulls lowercase tokens immediately before the last
 * word into the surname so "van der Smith" stays intact. Stops at the
 * first non-particle as it walks backwards.
 */
function parseAuthor(chunk) {
  const tokens = chunk.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { given: '', surname: '' };
  if (tokens.length === 1) return { given: '', surname: tokens[0] };

  // Walk backwards from the last token: it's always part of the surname.
  // Extend the surname leftward across any contiguous particle tokens.
  let surnameStart = tokens.length - 1;
  while (surnameStart > 0 && SURNAME_PARTICLES.has(tokens[surnameStart - 1].toLowerCase())) {
    surnameStart--;
  }
  const surname = tokens.slice(surnameStart).join(' ');
  const given = tokens.slice(0, surnameStart).join(' ');
  return { given, surname };
}

/**
 * Detect if `authorList` (plain text, no HTML) is already apalike form.
 * Heuristic: the first author starts with "Lastname, X…" — a single
 * surname-word followed by a comma and an uppercase letter.
 *
 * Pattern is intentionally permissive about what follows the first
 * uppercase letter so hyphenated initials ("J.-B."), multi-initial
 * given names ("O. J."), and full first names ("Jacob") all qualify
 * as long as the *structure* is "surname, capital-letter-something".
 *
 * Negative cases:
 *   "Jacob Devlin, ..."   — "Jacob" then space (no comma) → not apalike
 *   "A. Abdolmaleki, ..."  — "A" then "." (no immediate comma) → not apalike
 *   "OpenAI Josh, ..."    — "OpenAI" then space → not apalike
 */
function isAlreadyApalike(authorList) {
  return /^[A-ZÀ-Ɏ][a-zA-ZÀ-ɏ'\-]*,\s+[A-ZÀ-Ɏ]/.test(authorList.trim());
}

/**
 * Split an author list string into per-author chunks. Handles:
 *   - "X, Y, and Z"
 *   - "X, Y, Z"          (apa-style)
 *   - "X and Y"          (two authors)
 *   - "X, Y, et al."     (apalike sentinel)
 *   - "X, Y, others"     (alternative sentinel)
 *
 * Preserves a trailing "et al." / "others" as its own chunk so the
 * caller can re-emit it verbatim.
 */
function splitAuthors(s) {
  // Normalize " and " (with or without preceding comma) to ", ".
  let normalized = s.replace(/\s+and\s+/gi, ', ');
  // Pull out trailing "et al." / "others" — they shouldn't be reformatted.
  let trailer = '';
  const trailerMatch = normalized.match(/,\s*(et\s*al\.?|others)\s*$/i);
  if (trailerMatch) {
    trailer = trailerMatch[1].trim();
    normalized = normalized.slice(0, trailerMatch.index);
  }
  const chunks = normalized.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  return { chunks, trailer };
}

/**
 * Build an apalike-formatted author list from { given, surname } pairs
 * and an optional "et al." trailer. The Oxford-comma + " and " before
 * the final author mirrors apalike convention.
 *
 *   1 author:        "Devlin, J."
 *   2 authors:       "Devlin, J. and Chang, M.-W."
 *   3+ authors:      "Devlin, J., Chang, M.-W., and Lee, K."
 *   N with et al.:   "Devlin, J., Chang, M.-W., et al."
 */
function formatApalike(authors, trailer) {
  const parts = authors.map(({ given, surname }) =>
    given ? `${surname}, ${given}` : surname
  );
  if (trailer) {
    return parts.join(', ') + ', ' + trailer;
  }
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts.join(' and ');
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

/**
 * Heuristic for "looks like an organization/corporate prefix mashed
 * into a given name". Triggered by:
 *   - CamelCase within a single hyphen-segment ("OpenAI", "DeepMind")
 *     — lowercase letter immediately followed by uppercase. This is
 *     the reliable signal: a real name "Jacob Devlin" never has
 *     a lowercase-to-uppercase transition inside the given name token.
 *   - Non-letter punctuation other than '.' / '-' / "'" / "’" ("AI@Meta")
 *
 * NOT triggered by:
 *   - Hyphenated given names ("Ming-Wei", "Hung-Yi") — uppercase letters
 *     are separated by hyphens, no intra-segment camelCase.
 *   - All-caps initial abbreviations ("USVSN" for U.S.V.S.N., the
 *     condensed initials of a multi-name author). These look like
 *     orgs but in practice are usually compressed initials; rewriting
 *     to "Prashanth, USVSN Sai" preserves the original token verbatim
 *     and keeps surname-first ordering consistent with the rest.
 *
 * When triggered, we refuse the rewrite for the whole entry — mixing
 * apalike for "normal" authors with the original form for the corporate
 * one would produce a broken-looking mid-list.
 */
function looksLikeOrgPrefix(token) {
  if (token.length < 3) return false;
  // CamelCase within a single segment: lowercase then uppercase. Common
  // ML orgs ("OpenAI", "DeepMind", "HuggingFace") all run 6+ chars;
  // short CamelCase tokens are more often romanized East-Asian compound
  // given names ("JinYi", "MingYu") — the 6-char floor lets those
  // through.
  if (token.length >= 6 && /[a-z][A-Z]/.test(token)) return true;
  // Unexpected punctuation. Allow Latin-1 + Latin Extended-A and
  // Latin Extended-B (À-ɏ, U+00C0–U+024F) so names like "Çağlar",
  // "Łukasz", "Aleš", "Søren" don't trip the punctuation check.
  // U+2019 (’) is the Unicode right-single-quote in names like "O’Brien".
  if (/[^A-Za-zÀ-ɏ.\-'’]/.test(token)) return true;
  return false;
}

/**
 * Take the raw text inside one bibblock's authors prefix (up to the
 * year-or-end), produce the apalike-rewritten text. Returns null if the
 * input is already apalike or can't be confidently parsed.
 */
function rewriteAuthorList(text) {
  if (isAlreadyApalike(text)) return null;
  const { chunks, trailer } = splitAuthors(text);
  if (chunks.length === 0) return null;
  const authors = chunks.map(parseAuthor);
  // Defensive: refuse to rewrite if any parsed author has no surname
  // (means the chunk was empty or all-particles).
  if (authors.some(a => !a.surname)) return null;
  // Refuse if any author chunk contained an org-shaped given-name token
  // (e.g. "OpenAI Josh Achiam"). The original bibtex was probably
  // "OpenAI and Achiam, Josh and ..." with the conjunction elided by
  // natbib — abbreviating "OpenAI Josh" to "O. J." would corrupt the
  // citation. Leave the whole entry alone.
  for (const chunk of chunks) {
    const givenTokens = chunk.trim().split(/\s+/).slice(0, -1);
    if (givenTokens.some(looksLikeOrgPrefix)) return null;
  }
  return formatApalike(authors, trailer);
}

/**
 * Split one bibblock's text content into authors-prefix + trailer.
 * The trailer can be:
 *   - "(YYYY)."        — apalike with parenthesized year
 *   - "(YYYY[a-z]?)."  — disambiguated year ("2024a")
 *   - bare "."         — no year
 * Returns { authors, trailer } where trailer includes whatever follows
 * the author list verbatim (so we re-emit period, year, etc. unchanged).
 */
function splitBibblockAuthorPrefix(text) {
  // Year-in-parens at the end is the apalike default; preserve it.
  const yearMatch = text.match(/\s*\((\d{4}[a-z]?)\)\.\s*$/);
  if (yearMatch) {
    return {
      authors: text.slice(0, yearMatch.index).replace(/[.\s]+$/, ''),
      trailer: text.slice(yearMatch.index),
    };
  }
  // Trailing period only.
  const periodMatch = text.match(/\.\s*$/);
  if (periodMatch) {
    return {
      authors: text.slice(0, periodMatch.index).replace(/[.\s]+$/, ''),
      trailer: text.slice(periodMatch.index),
    };
  }
  return { authors: text.trim(), trailer: '' };
}

/**
 * Find the first `<span class="...ltx_bibblock...">…</span>` element in
 * `body`, walking matching `<span>`/`</span>` pairs with depth tracking
 * so nested spans (e.g. `<span>é</span>` Unicode wrappers, or `<em>` /
 * `<span class="ltx_bib_etal">` inside the author list) don't fool a
 * naïve `[\s\S]*?` regex into stopping at the first inner `</span>`.
 *
 * Returns { startIdx, fullEnd, openTag, innerText } where:
 *   - startIdx / fullEnd are the byte positions of the outer element
 *     (so the caller can splice replacement HTML in).
 *   - openTag is the literal opening tag (with its class attribute).
 *   - innerText is the textContent (nested tags already stripped).
 *
 * Returns null if no bibblock found or the markup is malformed.
 */
function findFirstBibblock(body) {
  const openRe = /<span\s+class="[^"]*\bltx_bibblock\b[^"]*"[^>]*>/g;
  const openMatch = openRe.exec(body);
  if (!openMatch) return null;
  const startIdx = openMatch.index;
  const openTag = openMatch[0];
  const innerStart = startIdx + openTag.length;
  // Walk with depth tracking. Treat self-closing tags (rare in HTML5
  // but present as `<br/>` etc.) as depth-neutral.
  const tagRe = /<(\/?)(span)\b[^>]*?(\/?)>/gi;
  tagRe.lastIndex = innerStart;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(body)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClose = m[3] === '/';
    if (isSelfClose) continue;
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return {
        startIdx,
        openTag,
        innerStart,
        innerEnd: m.index,
        fullEnd: m.index + m[0].length,
        innerHtml: body.slice(innerStart, m.index),
      };
    }
  }
  return null;
}

/**
 * Walk every bibitem's first <span class="ltx_bibblock"> and rewrite
 * its author list when it isn't already apalike. The first bibblock is
 * the leading body block that normalize_bib_tags prepended (or that
 * inject_bbl emits natively), and is always the full author list +
 * optional "(YYYY)." trailer.
 *
 * Rewriting replaces the WHOLE bibblock element with a flat
 * `<span class="ltx_bibblock">…</span>` carrying the canonical plain
 * text. Nested decorative wrappers (e.g. `<span>é</span>` around a
 * single character, or per-author `<span class="ltx_bib_etal">` runs)
 * are dropped in favor of the Unicode/plain-text form — they don't
 * carry semantic information our renderer needs.
 */
function normalizeHtml(html) {
  let changed = 0;
  let total = 0;
  const out = html.replace(
    /(<li[^>]*\bltx_bibitem\b[^>]*>)([\s\S]*?)(<\/li>)/g,
    (full, openLi, body, closeLi) => {
      const block = findFirstBibblock(body);
      if (!block) return full;
      total++;
      // Plain text inside the block — strip any nested tags.
      const plain = block.innerHtml
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const { authors, trailer } = splitBibblockAuthorPrefix(plain);
      if (!authors) return full;
      const rewritten = rewriteAuthorList(authors);
      if (rewritten === null) return full;
      // Author lists naturally end with the last initial's period (e.g.
      // "...Toutanova, K.") or with the final surname (e.g. "Toutanova,
      // Kristina"). If the trailer is just a bare ".", collapse it into
      // whatever the author list ends with to avoid producing "K..".
      let combined = rewritten + trailer;
      combined = combined.replace(/\.\.(\s|$)/g, '.$1');
      const newPlain = combined;
      // No-op detection: if our normalization output matches the
      // already-stripped input, skip the replacement entirely. Keeps
      // the changed counter honest and avoids whitespace-only diffs.
      if (newPlain === plain) return full;
      changed++;
      const newBlock = `${block.openTag}${escapeHtml(newPlain)}</span>`;
      const newBody = body.slice(0, block.startIdx) + newBlock + body.slice(block.fullEnd);
      return openLi + newBody + closeLi;
    }
  );
  return { html: out, changed, total };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function normalizeOne(slug, { dryRun = false } = {}) {
  const pcPath = paperContentPath(slug);
  if (!await fs.pathExists(pcPath)) {
    console.warn(`  authors: ${slug}: no paper-content.json`);
    return { changed: 0, total: 0 };
  }
  const data = await fs.readJson(pcPath);
  const result = normalizeHtml(data.html);
  if (result.changed > 0 && !dryRun) {
    data.html = result.html;
    await fs.writeJson(pcPath, data, { spaces: 2 });
  }
  console.log(`  authors: ${slug}: ${result.changed}/${result.total} bibblocks reshaped${dryRun ? ' (dry-run)' : ''}`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const slugs = args.filter(a => !a.startsWith('-'));
  const targets = slugs.length > 0 ? slugs : await allSlugs();
  let totalChanged = 0, totalBlocks = 0;
  for (const slug of targets) {
    const r = await normalizeOne(slug, { dryRun });
    totalChanged += r.changed;
    totalBlocks += r.total;
  }
  if (targets.length > 1) {
    console.log(`\nauthors: ${totalChanged} / ${totalBlocks} bibblocks rewritten across ${targets.length} papers`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`normalize_bib_authors error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  normalizeOne,
  normalizeHtml,
  parseAuthor,
  toInitial,
  splitAuthors,
  formatApalike,
  isAlreadyApalike,
  looksLikeOrgPrefix,
  rewriteAuthorList,
};
