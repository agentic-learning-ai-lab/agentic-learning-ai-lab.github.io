/**
 * Warn (not block) on files > 1 MB being added to git. Binary assets
 * should live on R2, not in git. This catches `git add` of a stray
 * binary that asset-manifest.js's pattern list didn't cover (e.g., a
 * .zip, .docx, or .iso somebody dropped in by mistake).
 *
 * Returns true always — this is a warning channel. Promote to blocker
 * if it ever fires for a real mistake.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WARN_BYTES = 1024 * 1024; // 1 MB

module.exports = {
    name: 'large-files',
    run() {
        let staged;
        try {
            staged = execSync('git diff --cached --name-only --diff-filter=A', {
                encoding: 'utf8',
            }).split('\n').filter(Boolean);
        } catch {
            return true;
        }
        const bigs = [];
        for (const f of staged) {
            const full = path.join(ROOT, f);
            try {
                const size = fs.statSync(full).size;
                if (size > WARN_BYTES) bigs.push({ f, size });
            } catch { /* file gone, skip */ }
        }
        if (bigs.length === 0) return true;
        console.error('⚠️  large-files: adding files > 1 MB to git:');
        for (const { f, size } of bigs) {
            console.error(`   ${(size/1024/1024).toFixed(1)} MB  ${f}`);
        }
        console.error('   Binary assets belong on R2 (see notes/lfs-migration.md).');
        console.error('   If genuinely text, ignore this warning. (Not blocking.)');
        return true; // warn only
    },
};
