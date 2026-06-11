#!/usr/bin/env node

/**
 * `npm run upload` — mirror local binary assets to R2 without needing
 * R2 credentials on the contributor's machine.
 *
 * Usage:
 *   npm run upload                # scan + upload all unregistered binaries
 *   npm run upload <path>...      # upload specific paths only
 *   npm run upload --dry-run      # show what would happen, do nothing
 *
 * Flow (no R2 creds needed locally; just `gh auth login` + curl):
 *   1. Scan the working tree for binary asset paths.
 *   2. Cross-check assets-manifest.json — skip files whose content
 *      hash already matches the manifest's recorded URL hash.
 *   3. For each unregistered/stale file, build a `spec` entry:
 *      { logical, sha, filename }.
 *   4. Dispatch `.github/workflows/mint-upload-urls.yml` with the spec.
 *      Wait for the run to complete; download the `presigned-urls`
 *      artifact.
 *   5. For each entry, `curl -X PUT --upload-file` to its presigned URL.
 *   6. Dispatch `.github/workflows/register-assets.yml` with the same
 *      spec + the current branch name. Wait for completion. The Action
 *      writes assets-manifest.json entries and commits to the branch.
 *   7. `git pull` to bring the manifest commit into the local tree.
 *
 * Prerequisites:
 *   - `gh auth login` (one-time per contributor)
 *   - The contributor's branch must be pushed to origin before running
 *     `npm run upload` (the register Action checks out from origin to
 *     commit the manifest back).
 *   - GitHub Actions are enabled on the repo.
 *
 * Caveats:
 *   - File size limited by R2 single-PUT max (5 GB; not a practical
 *     concern at our scale).
 *   - The two workflows must already be on the contributor's branch.
 *     Branches forked off `main` after Phase 2 lands will have them.
 *   - GitHub workflow_dispatch latency is ~10–30 sec; total roundtrip
 *     for a typical 1–5 file batch is ~1–2 minutes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

const ASSET_PATTERNS = [
    'research/*/paper.pdf',
    'research/*/assets/**/*.{png,jpg,jpeg,gif,svg,webp}',
    'assets/images/papers/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/people/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/background/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/home/*.{png,jpg,jpeg,gif,webp}',
    'assets/images/thumbnails/*.{png,jpg,jpeg,gif,webp}',
    'assets/projects/**/*.{png,jpg,jpeg,gif,webp,mp4,pdf,csv}',
];

function globToRegex(glob) {
    let g = glob;
    g = g.replace(/\{([^}]+)\}/g, (_, csv) => '\x00BO' + csv.split(',').join('\x00BX') + '\x00BC');
    g = g.replace(/\*\*/g, '\x00DS');
    g = g.replace(/\*/g, '\x00ST');
    g = g.replace(/[.+^$()|[\]\\]/g, '\\$&');
    g = g.replace(/\x00DS/g, '.*');
    g = g.replace(/\x00ST/g, '[^/]*');
    g = g.replace(/\x00BO/g, '(');
    g = g.replace(/\x00BX/g, '|');
    g = g.replace(/\x00BC/g, ')');
    return new RegExp('^' + g + '$');
}

const PATTERN_REGEXES = ASSET_PATTERNS.map(globToRegex);

function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (e.isFile()) out.push(path.relative(ROOT, full));
    }
}

function sha256File(filepath) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(filepath));
    return h.digest('hex');
}

function hashFromCdnUrl(cdnUrl) {
    const m = cdnUrl.match(/\/([a-f0-9]{16,64})\//);
    return m ? m[1] : null;
}

function findUnregistered(filterPaths) {
    const manifest = fs.existsSync(MANIFEST_PATH)
        ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        : {};
    const candidates = [];
    if (filterPaths.length > 0) {
        for (const p of filterPaths) {
            const abs = path.resolve(ROOT, p);
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
                candidates.push(path.relative(ROOT, abs));
            } else if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
                walk(abs, candidates);
            }
        }
    } else {
        for (const root of ['research', 'assets']) {
            if (fs.existsSync(path.join(ROOT, root))) walk(path.join(ROOT, root), candidates);
        }
    }
    const specs = [];
    for (const rel of candidates) {
        if (!PATTERN_REGEXES.some(r => r.test(rel))) continue;
        const logical = '/' + rel;
        const sha = sha256File(path.join(ROOT, rel));
        const existing = manifest[logical];
        if (existing) {
            const existingHash = hashFromCdnUrl(existing);
            if (existingHash && existingHash === sha.slice(0, existingHash.length)) {
                continue; // already on R2 with matching hash
            }
        }
        specs.push({ logical, sha, filename: path.basename(rel) });
    }
    return specs;
}

function shellQuoteJsonForGh(json) {
    // We pass JSON via `gh workflow run -f spec=<json>`. gh expects a
    // single string after the `=`. Most shells need it quoted; we use
    // spawn with an array so no shell parsing is involved.
    return json;
}

function ghDispatch(workflow, fields, ref) {
    // Run the workflow against the contributor's current branch so
    // their branch's package-lock.json / workflow code / build scripts
    // are what executes — not main's. Without `--ref`, gh defaults to
    // the repo's default branch.
    const args = ['workflow', 'run', workflow, '--ref', ref];
    for (const [k, v] of Object.entries(fields)) {
        args.push('-f', `${k}=${v}`);
    }
    const r = spawnSync('gh', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) {
        throw new Error(`gh workflow run ${workflow} failed`);
    }
}

function pollRunByCorrelation(workflow, correlationId) {
    // gh workflow run doesn't print the run ID. Each workflow uses a
    // dynamic `run-name` that embeds the correlation_id we passed in,
    // so we can disambiguate our run from any other contributor's
    // concurrent dispatch by filtering on displayTitle.
    for (let attempt = 0; attempt < 30; attempt++) {
        const out = execSync(
            `gh run list --workflow=${workflow} --limit=10 --json databaseId,displayTitle,status`,
            { encoding: 'utf8' }
        );
        const runs = JSON.parse(out);
        const hit = runs.find(r => r.displayTitle && r.displayTitle.includes(correlationId));
        if (hit) return hit.databaseId;
        execSync('sleep 2');
    }
    throw new Error(`Could not find run for ${workflow} with correlation=${correlationId}`);
}

function waitForRun(runId, label) {
    process.stderr.write(`  waiting for ${label} (run #${runId}) ...`);
    const r = spawnSync('gh', ['run', 'watch', String(runId), '--exit-status'], {
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (r.status !== 0) throw new Error(`${label} run failed`);
    process.stderr.write(' ✓\n');
}

function downloadArtifact(runId, artifactName, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const r = spawnSync('gh', ['run', 'download', String(runId), '--name', artifactName, '-D', destDir], {
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (r.status !== 0) throw new Error(`download artifact ${artifactName} failed`);
}

function currentBranch() {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
}

function isBranchPushed(branch) {
    try {
        execSync(`git rev-parse --verify origin/${branch}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function curlPut(url, filepath, contentType) {
    // The pre-signed URL signs `Content-Type` into the canonical
    // request. curl MUST send a matching header or R2 returns 403.
    const args = [
        '-sS', '-X', 'PUT',
        '--upload-file', filepath,
        '-H', `Content-Type: ${contentType || 'application/octet-stream'}`,
        url,
        '-w', '%{http_code}',
        '-o', '/dev/null',
    ];
    const r = spawnSync('curl', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`curl PUT failed: ${r.stderr}`);
    if (!r.stdout.startsWith('2')) throw new Error(`PUT got HTTP ${r.stdout}`);
}

function checkGhAuth() {
    const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    if (r.status !== 0) {
        console.error('✗ `gh` is not authenticated. Run `gh auth login` first.');
        console.error('  (npm run upload uses `gh` to dispatch GH Actions for the R2 upload.)');
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const paths = args.filter(a => !a.startsWith('--'));

    if (!dryRun) checkGhAuth();

    // Compress any over-threshold arXiv figures BEFORE hashing for upload —
    // otherwise an uncompressed file lands on R2 with its raw hash, then the
    // next full build re-compresses it and drift cycles begin. See
    // notes/binary-asset-drift.md.
    //
    // Skipped on --dry-run: compress overwrites source files in place, so
    // a dry-run that mutates the working tree would be a surprising side
    // effect for contributors trying to see "what would happen".
    if (!dryRun) {
        const { compressAllAssets } = require('./compress_assets');
        await compressAllAssets(false);
    }

    const specs = findUnregistered(paths);
    if (specs.length === 0) {
        console.log('✓ Everything already on R2. Nothing to upload.');
        return;
    }

    console.log(`Found ${specs.length} unregistered/stale asset(s):`);
    for (const s of specs) console.log(`  ${s.logical}  (${s.sha.slice(0, 12)}…)`);
    console.log('');

    if (dryRun) {
        console.log('(dry-run; no uploads performed)');
        return;
    }

    const branch = currentBranch();
    if (!isBranchPushed(branch)) {
        console.error(`✗ Branch "${branch}" is not on origin yet. Run \`git push -u origin ${branch}\` first.`);
        console.error(`  (The register-assets Action checks out from origin to commit the manifest back.)`);
        process.exit(1);
    }

    const specJson = JSON.stringify(specs);
    // Unique per-invocation tag, embedded in the workflows' run-name
    // so concurrent contributors can disambiguate their runs from each
    // other (otherwise pollRunByCorrelation would race).
    const correlationId = crypto.randomUUID();

    // 1. Mint URLs
    console.log(`1/3 Minting presigned upload URLs (corr=${correlationId.slice(0,8)})...`);
    ghDispatch('mint-upload-urls.yml', { spec: specJson, correlation_id: correlationId }, branch);
    const mintRunId = pollRunByCorrelation('mint-upload-urls.yml', correlationId);
    waitForRun(mintRunId, 'mint-upload-urls');

    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'upload-'));
    downloadArtifact(mintRunId, 'presigned-urls', tmpDir);
    const urls = JSON.parse(fs.readFileSync(path.join(tmpDir, 'urls.json'), 'utf8'));

    // 2. Upload via curl
    console.log(`2/3 Uploading ${urls.length} file(s) to R2 ...`);
    for (const { logical, url, contentType } of urls) {
        const filepath = path.join(ROOT, logical.replace(/^\//, ''));
        process.stderr.write(`  ${logical} ...`);
        curlPut(url, filepath, contentType);
        process.stderr.write(' ✓\n');
    }

    // 3. Register on the contributor's branch
    console.log('3/3 Triggering manifest register on origin/' + branch + ' ...');
    ghDispatch('register-assets.yml', { spec: specJson, branch, correlation_id: correlationId }, branch);
    const regRunId = pollRunByCorrelation('register-assets.yml', correlationId);
    waitForRun(regRunId, 'register-assets');

    console.log('');
    console.log('✓ Uploaded + registered. Run `git pull` to fetch the manifest update.');
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => { console.error('upload failed:', err.message); process.exit(1); });
