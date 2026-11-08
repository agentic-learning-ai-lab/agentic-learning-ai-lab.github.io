/**
 * Pre-commit gate: an enable_full_paper paper whose LaTeX tarball is on R2
 * must have HTML converted from that tarball. Shared logic and the CI step
 * live in build/check_paper_build.js.
 */

const { audit } = require('../../build/check_paper_build');

module.exports = {
    name: 'paper-build',
    run() {
        return audit() === 0;
    },
};
