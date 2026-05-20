/**
 * Repo is public. A leaked R2 / GitHub / API token is a real incident.
 *
 * Checks the diff that's about to be committed (`git diff --cached`)
 * for patterns that look like committed secrets. False-positive-prone,
 * so we keep the list short and high-signal:
 *
 *   R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...
 *   CF_API_TOKEN=...
 *   GITHUB_TOKEN=...
 *   AKIA...                (AWS access key id format)
 *   ghp_...                (GitHub PAT)
 *   sk-...                 (OpenAI / Anthropic key, 40+ chars)
 *
 * Doesn't scan rest of repo — only the diff. .env is gitignored, but
 * an accidental `git add -f .env` or paste-into-script would slip past.
 */

const { execSync } = require('child_process');

const PATTERNS = [
    { name: 'R2 access key id',      re: /R2_ACCESS_KEY_ID\s*[:=]\s*['"]?[A-Za-z0-9_/+=]{16,}/g },
    { name: 'R2 secret access key',  re: /R2_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9_/+=]{16,}/g },
    { name: 'CF API token',          re: /CF_API_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/g },
    { name: 'GitHub token',          re: /GITHUB_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/g },
    { name: 'AWS access key',        re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'GitHub PAT',            re: /\bghp_[A-Za-z0-9]{30,}\b/g },
    { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g },
    { name: 'OpenAI/Anthropic key',  re: /\bsk-[A-Za-z0-9_\-]{30,}\b/g },
];

module.exports = {
    name: 'no-secrets',
    run() {
        let diff;
        try {
            diff = execSync('git diff --cached -U0', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        } catch {
            return true; // no staged diff
        }
        // Only inspect added lines (start with `+` but not `+++`).
        const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
        if (!added) return true;
        const hits = [];
        for (const { name, re } of PATTERNS) {
            const m = added.match(re);
            if (m) hits.push({ name, count: m.length });
        }
        if (hits.length === 0) return true;
        console.error('⛔ no-secrets: staged diff contains suspected credential(s):');
        for (const h of hits) console.error(`   ${h.name} (×${h.count})`);
        console.error('   Repo is public — leaked tokens must be rotated immediately.');
        console.error('   If false positive, `git commit --no-verify` to bypass.');
        return false;
    },
};
