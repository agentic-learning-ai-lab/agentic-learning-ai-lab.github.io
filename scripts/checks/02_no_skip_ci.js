/**
 * Block commit messages that contain `[skip ci]` (or any of its
 * variants — GitHub Actions, CF Pages, and most CI systems parse
 * these anywhere in the message and suppress workflow runs).
 *
 * Why: PR #11's squash-merge concatenated commit message bodies and
 * picked up a `[skip ci]` that one of the constituent commits used in
 * prose. Production deploy silently didn't fire. Hours of confusion.
 * This check catches it at the source.
 *
 * If you genuinely need to skip CI for a commit:
 *   - Write `skip-CI` (hyphen) or `[skip-ci]` instead.
 *   - Or `git commit --no-verify` to bypass.
 *
 * Reads .git/COMMIT_EDITMSG (the message git is about to commit with).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MSG_PATH = path.join(ROOT, '.git', 'COMMIT_EDITMSG');

// Strings GitHub Actions / CF Pages / GitLab CI / Travis / etc. honor.
const FORBIDDEN = [
    '[skip ci]', '[ci skip]', '[no ci]', '[skip actions]',
    '[actions skip]', '***NO_CI***',
];

module.exports = {
    name: 'no-skip-ci',
    run() {
        if (!fs.existsSync(MSG_PATH)) return true;
        const msg = fs.readFileSync(MSG_PATH, 'utf8');
        // Strip lines that start with `#` (git's comment markers in the
        // edit-msg buffer) so legitimate "[skip ci]" docs in a commit
        // template don't trip the check.
        const live = msg.split('\n').filter(l => !l.startsWith('#')).join('\n');
        const hits = FORBIDDEN.filter(t => live.toLowerCase().includes(t.toLowerCase()));
        if (hits.length === 0) return true;
        console.error('⛔ no-skip-ci: commit message contains CI-skip token(s):');
        for (const t of hits) console.error(`   "${t}"`);
        console.error('   Even in prose, these tokens kill production deploys on squash-merge.');
        console.error('   Reword (e.g., "skip-CI" with a hyphen) or use `--no-verify` to bypass.');
        return false;
    },
};
