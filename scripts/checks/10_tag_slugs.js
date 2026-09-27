/**
 * Run `build/lint_tags.js` locally on pre-commit. Same check runs
 * in CI. See build/lint_tags.js for details.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
    name: 'tag-slugs',
    run() {
        const r = spawnSync('node', ['build/lint_tags.js'], {
            cwd: ROOT,
            stdio: ['ignore', 'ignore', 'inherit'],
        });
        return r.status === 0;
    },
};
