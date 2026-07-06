/**
 * Pre-commit gate: audit every enable_full_paper paper's paper-content.json
 * for empty <ul class="ltx_biblist">, over-long bibitem tags, and leftover
 * `ltx_missing_citation` spans.
 *
 * Same check that runs in CI (.github/workflows/pr-checks.yml). Running
 * it pre-commit catches a paper that landed with enable_full_paper: true
 * but a missed `npm run latex:update <slug>` before the build — the exact
 * class of failure PR #53 shipped and CI caught after push.
 *
 * Shared logic in build/check_bibliography.js.
 */

const { audit } = require('../../build/check_bibliography');

module.exports = {
    name: 'bibliography',
    run() {
        // audit() returns 0 on pass, 1 on fail; convert to boolean for the
        // pre-commit orchestrator.
        return audit() === 0;
    },
};
