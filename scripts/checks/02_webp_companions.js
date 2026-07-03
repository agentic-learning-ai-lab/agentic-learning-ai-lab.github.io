/**
 * Pre-commit gate: every PNG/JPG in the manifest that's under a path
 * where the render pipeline wraps images in <picture> must have a
 * .webp sibling in the manifest too.
 *
 * Shared logic lives in build/check_webp_companions.js so CI can run
 * the same check as a standalone step. See that file for details.
 */

module.exports = require('../../build/check_webp_companions');
