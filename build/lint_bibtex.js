/**
 * lint_bibtex.js — sanity check that each project page's BibTeX block
 * still names the same venue that papers.yaml does.
 *
 * Failure mode this catches: paper gets accepted to a conference, the
 * author updates `journal:` in papers.yaml ("ICLR 2026") but forgets
 * the MD's `bibtex:` block (still says `arXiv preprint ...`). Builds
 * keep passing because the bibtex is opaque text; readers see a stale
 * citation on the project page.
 *
 * Heuristic: extract the venue acronym from papers.yaml's `journal:`
 * via the `(<ACRONYM> <year>)` parenthetical that the lab's entries
 * use ("The 14th International Conference on Learning Representations
 * (ICLR 2026)"). Then check that the same acronym appears in the MD's
 * BibTeX `booktitle =` or `journal =` value. If the acronym is in
 * papers.yaml but missing from MD bibtex (or vice versa), warn.
 *
 * Skips:
 *   - papers without `project_page: true`
 *   - papers where papers.yaml `journal:` is "CoRR" (preprint sentinel)
 *     and MD bibtex uses @misc/@article with eprint — that's the
 *     correct shape for a preprint
 *
 * Exit code: 0 if clean, 1 if any mismatches.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const PAPERS_YAML = path.join(ROOT, 'data/papers.yaml');
const PROJECTS_DIR = path.join(ROOT, 'data/projects');

function extractVenue(journalText) {
    // Pull both the acronym ("ICLR") and the canonical long-form name
    // ("International Conference on Learning Representations") from a
    // papers.yaml `journal:` string like
    //   "The 14th International Conference on Learning Representations (ICLR 2026)"
    //   "Advances in Neural Information Processing Systems 37 (NeurIPS 2024)"
    // so the lint accepts either form in the MD bibtex.
    const acronymMatch = journalText.match(/\(([A-Z][A-Za-z]+)\s+\d{4}\)/);
    const acronym = acronymMatch ? acronymMatch[1] : null;
    const longForm = journalText
        .replace(/\s*\([^)]*\)\s*$/, '')      // drop trailing "(ACRONYM YYYY)"
        .replace(/^The\s+\d+(?:st|nd|rd|th)\s+/i, '')  // drop "The 14th"
        .replace(/\s+\d+\s*$/, '')             // drop trailing volume "37"
        .trim();
    return { acronym, longForm };
}

function extractBibtexVenue(mdText) {
    // Pull the value of `booktitle = {...}` or `journal = {...}`
    // from the first bibtex block in the MD frontmatter.
    const m = mdText.match(/^\s*(?:booktitle|journal)\s*=\s*[{"]([^"}]+)[}"]/m);
    return m ? m[1] : null;
}

function main() {
    const papers = yaml.load(fs.readFileSync(PAPERS_YAML, 'utf8'));
    const issues = [];

    for (const paper of papers) {
        if (!paper.project_page) continue;

        const slug = paper.permalink;
        const mdPath = path.join(PROJECTS_DIR, `${slug}.md`);
        if (!fs.existsSync(mdPath)) {
            issues.push(`${slug}: project_page: true but no data/projects/${slug}.md`);
            continue;
        }

        const { acronym, longForm } = extractVenue(paper.journal || '');
        const mdText = fs.readFileSync(mdPath, 'utf8');
        const bibVenue = extractBibtexVenue(mdText);

        // papers.yaml says preprint / CoRR — accept @misc/@article with eprint
        if (!acronym) {
            if (bibVenue && /Conference|Proceedings|Symposium/i.test(bibVenue)) {
                issues.push(`${slug}: papers.yaml says "${paper.journal}" (preprint?) but MD bibtex venue is "${bibVenue}"`);
            }
            continue;
        }

        if (!bibVenue) {
            issues.push(`${slug}: papers.yaml has venue acronym "${acronym}" but MD bibtex has no booktitle/journal line`);
            continue;
        }

        // Accept either the acronym ("ICLR") or the canonical long-form
        // name ("International Conference on Learning Representations").
        const venueMatches = bibVenue.includes(acronym)
            || (longForm && bibVenue.includes(longForm));
        if (!venueMatches) {
            issues.push(`${slug}: papers.yaml says "${acronym}" / "${longForm}" but MD bibtex venue is "${bibVenue}"`);
        }
    }

    if (issues.length === 0) {
        console.log('✅ bibtex lint: all project pages match papers.yaml venue');
        process.exit(0);
    }
    console.error(`❌ bibtex lint: ${issues.length} mismatch(es)`);
    for (const i of issues) console.error(`   ${i}`);
    process.exit(1);
}

main();
