#!/usr/bin/env node

/**
 * Pre-commit orchestrator. Runs every check in scripts/checks/*.js in
 * one Node process (single startup ≈100 ms, fast feedback). Each check
 * prints its own diagnostics and returns `true` (passed) / `false`
 * (failed). The orchestrator exits non-zero if ANY check failed —
 * git then aborts the commit.
 *
 * Bypass: `git commit --no-verify` (the standard hook bypass).
 *
 * Adding a new check: drop a file in scripts/checks/<name>.js that
 * exports `{ name, run }`. `run()` returns truthy on pass, falsy on
 * fail. Print errors to stderr.
 */

const fs = require('fs');
const path = require('path');

const CHECKS_DIR = path.join(__dirname, 'checks');

function loadChecks() {
    return fs.readdirSync(CHECKS_DIR)
        .filter(f => f.endsWith('.js'))
        .map(f => {
            const m = require(path.join(CHECKS_DIR, f));
            if (!m || typeof m.run !== 'function') {
                throw new Error(`check "${f}" must export { name, run }`);
            }
            return m;
        });
}

async function main() {
    const checks = loadChecks();
    let failed = 0;
    for (const check of checks) {
        let ok;
        try {
            ok = await check.run();
        } catch (err) {
            console.error(`✗ ${check.name}: ${err.message}`);
            failed++;
            continue;
        }
        if (!ok) failed++;
    }
    if (failed > 0) {
        console.error(`\n⛔ ${failed} pre-commit check(s) failed — commit aborted.`);
        console.error(`   Bypass with \`git commit --no-verify\` if you know what you're doing.`);
        process.exit(1);
    }
}

main();
