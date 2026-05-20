/**
 * Run `build/lint_bibtex.js` (the same lint that runs in CI). Catches
 * the "paper got accepted, papers.yaml updated, MD bibtex still says
 * preprint" drift. Same check, faster feedback locally.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
    name: 'bibtex-lint',
    run() {
        const r = spawnSync('node', ['build/lint_bibtex.js'], {
            cwd: ROOT,
            stdio: ['ignore', 'ignore', 'inherit'],
        });
        return r.status === 0;
    },
};
