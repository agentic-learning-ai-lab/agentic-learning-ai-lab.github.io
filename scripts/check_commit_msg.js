#!/usr/bin/env node

/**
 * commit-msg hook. Receives the commit message file path as argv[2]
 * (husky passes it through from git's `commit-msg` hook signature).
 *
 * Why this needs to be commit-msg, NOT pre-commit:
 *   git's pre-commit hook fires BEFORE the message is resolved. For
 *   `git commit -m "..."` the -m string isn't written to
 *   COMMIT_EDITMSG until later. So checking the message in
 *   pre-commit would only catch editor-style commits, silently
 *   missing the much-more-common `git commit -m "..."` form — which
 *   is the form that hit the PR #11 [skip ci] trap.
 *
 * Block commit messages containing `[skip ci]` (or any of its
 * variants — GitHub Actions, CF Pages, and most CI systems parse
 * these anywhere in the message and suppress workflow runs).
 *
 * If you genuinely need to skip CI for a commit:
 *   - Write `skip-CI` (hyphen) or `[skip-ci]` instead.
 *   - Or `git commit --no-verify` to bypass.
 */

const fs = require('fs');

const FORBIDDEN = [
    '[skip ci]', '[ci skip]', '[no ci]', '[skip actions]',
    '[actions skip]', '***NO_CI***',
];

const msgPath = process.argv[2];
if (!msgPath || !fs.existsSync(msgPath)) {
    // No message path → nothing to check (some git flows skip the hook
    // with `--no-verify` already, or pass a different arg). Allow.
    process.exit(0);
}

const msg = fs.readFileSync(msgPath, 'utf8');
// Strip lines that start with `#` (git's comment markers — these are
// stripped by git before the commit lands, so they don't end up in the
// real commit message body).
const live = msg.split('\n').filter(l => !l.startsWith('#')).join('\n');
const hits = FORBIDDEN.filter(t => live.toLowerCase().includes(t.toLowerCase()));

if (hits.length > 0) {
    console.error('⛔ commit-msg: commit message contains CI-skip token(s):');
    for (const t of hits) console.error(`   "${t}"`);
    console.error('   Even in prose (e.g., a commit message explaining a workflow uses');
    console.error('   `[skip ci]` as a guard), these tokens kill the production deploy');
    console.error('   on squash-merge — squash concatenates all constituent commit bodies.');
    console.error('   Reword (e.g., "skip-CI" with a hyphen) or use `git commit --no-verify`.');
    process.exit(1);
}
