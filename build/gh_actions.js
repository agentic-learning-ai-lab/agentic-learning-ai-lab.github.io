#!/usr/bin/env node

/**
 * Shared helpers for driving GitHub Actions from local CLIs.
 *
 * Both `npm run upload` (build/upload.js) and `npm run paper:html`
 * (build/paper_html.js) dispatch a workflow_dispatch run, wait for it,
 * and download its artifact. Every workflow embeds a caller-generated
 * correlation id in its `run-name`, which is how a CLI finds its own
 * run among concurrent dispatches.
 *
 * `repo` is optional: without it, `gh` targets the current checkout's
 * repo (the upload path). paper:html passes its own repo.
 */

const { spawnSync, execFileSync } = require('child_process');

function checkGhAuth() {
    const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    if (r.status !== 0) {
        console.error('✗ `gh` is not authenticated. Run `gh auth login` first.');
        console.error('  (This command uses `gh` to dispatch a GH Action.)');
        process.exit(1);
    }
}

/**
 * `gh workflow run <workflow> [-R repo] [-r ref] -f k=v ...`
 *
 * `ref` pins the workflow to a branch; without it gh uses the repo's
 * default branch.
 */
function ghDispatch(workflow, fields, { repo, ref } = {}) {
    const args = ['workflow', 'run', workflow];
    if (repo) args.push('--repo', repo);
    if (ref) args.push('--ref', ref);
    for (const [k, v] of Object.entries(fields)) {
        args.push('-f', `${k}=${v}`);
    }
    const r = spawnSync('gh', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) {
        throw new Error(`gh workflow run ${workflow} failed`);
    }
}

/**
 * Find the run whose display title contains `correlationId`.
 */
function pollRunByCorrelation(workflow, correlationId, { repo, attempts = 30, delaySec = 2 } = {}) {
    const args = ['run', 'list', `--workflow=${workflow}`, '--limit=10', '--json', 'databaseId,displayTitle,status'];
    if (repo) args.push(`--repo=${repo}`);
    for (let attempt = 0; attempt < attempts; attempt++) {
        const out = execFileSync('gh', args, { encoding: 'utf8' });
        const runs = JSON.parse(out);
        const hit = runs.find(r => r.displayTitle && r.displayTitle.includes(correlationId));
        if (hit) return hit.databaseId;
        spawnSync('sleep', [String(delaySec)]);
    }
    throw new Error(`Could not find run for ${workflow} with correlation=${correlationId}`);
}

function waitForRun(runId, label, { repo } = {}) {
    process.stderr.write(`  waiting for ${label} (run #${runId}) ...`);
    const args = ['run', 'watch', String(runId), '--exit-status'];
    if (repo) args.push('--repo', repo);
    const r = spawnSync('gh', args, {
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (r.status !== 0) throw new Error(`${label} run failed`);
    process.stderr.write(' ✓\n');
}

function downloadArtifact(runId, artifactName, destDir, { repo } = {}) {
    require('fs').mkdirSync(destDir, { recursive: true });
    const args = ['run', 'download', String(runId), '--name', artifactName, '-D', destDir];
    if (repo) args.push('--repo', repo);
    const r = spawnSync('gh', args, {
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (r.status !== 0) throw new Error(`download artifact ${artifactName} failed`);
}

module.exports = {
    checkGhAuth,
    ghDispatch,
    pollRunByCorrelation,
    waitForRun,
    downloadArtifact,
};
