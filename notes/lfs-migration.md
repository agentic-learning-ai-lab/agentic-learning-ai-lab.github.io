# LFS migration: stop burning bandwidth, lean on R2/CF

## What happened

GitHub email today: **10 GB monthly LFS bandwidth quota used**. Each
push to `dev` triggers a Cloudflare Pages preview build; CF Pages
clones the repo with `lfs: true` by default, pulling the ~1212 LFS
files (~678 MB working-tree size). A few rebuilds per day and the
quota is gone for the rest of the cycle. Once exhausted, CF Pages
can't pull LFS → build fails (every commit since `1a909e0`).

GH Actions still works because the workflow caches `.git/lfs` across
runs (LFS pulls are no-ops after the cache is warm). CF Pages has
no such cache configured.

## Current state (as of 2026-05-19)

- **Local working tree**: 1212 LFS files, 677.9 MB
- **`.git/lfs` cache**: 1.2 GB
- **R2 manifest** (`assets-manifest.json`): **1237 entries** — already
  more entries than LFS has files. Every committed binary asset has a
  CDN counterpart at `cdn.agenticlearning.ai/<hash>/<filename>`.
- **Templates**: `project.hbs`, `paper.hbs`, etc. already resolve image
  / video / PDF URLs through the `{{cdnUrl}}` helper at build time, so
  rendered HTML in `out/` already points to CDN URLs for every asset
  the manifest knows about.
- **`out/` total**: 770 MB (mostly `out/assets/` 403 MB and
  `out/research/` 365 MB — LFS-tracked binaries that the build copies
  even though the HTML references the CDN).

**The CDN is already a full mirror.** The build is doing redundant work
copying binaries into `out/` that no served HTML actually points at.

## Constraints (user-stated)

- Local filesystem is the source of truth. Don't lose binaries — if
  we can't pull LFS this month, we still need to be able to develop.
- Want to migrate fully to CF (R2 for storage, Pages for serving).
- GH Pages production deploy can stay as a fallback or be retired.

## Options

### A. Pause CF Pages auto-build, no code change (1 minute, no risk)
- User toggles **Preview deployments: paused** in the CF Pages
  dashboard for this project.
- Bleeding stops immediately. Existing CDN-served pages keep working
  for visitors hitting the deployed URL (last successful CF build's
  output).
- Doesn't fix the underlying duplication; doesn't help the next
  ramp-up when CF is re-enabled.

### B. Skip LFS on CF + slim `out/` to HTML-only (recommended) (~2 hours)
- Configure CF Pages to clone with LFS disabled. Either via the
  build command (`GIT_LFS_SKIP_SMUDGE=1`) or by setting it as an env
  var in the CF Pages project settings.
- Modify `build/assemble_output.js`: drop `out/assets/` and the
  binary subtrees under `out/research/<slug>/` from the copy list.
  Only HTML / JS / CSS / `_redirects` / `site.webmanifest` /
  `favicon.ico` (~1 MB total) go into `out/`. Binary refs in the
  rendered HTML already point at `cdn.agenticlearning.ai/...`, so
  browsers fetch them from R2 directly.
- Add a verification step (lint) that every `src=` / `href=` in
  `out/` either is on the same origin (HTML/JS/CSS) or matches
  `https://cdn.agenticlearning.ai/...`. Fails the build if anything
  still points at a local `/assets/...` path that won't resolve on
  CF Pages.
- LFS pointers stay in the working tree (CF doesn't smudge them; we
  never read them on CF). Local dev still gets real binaries via
  `git lfs pull` (cheap once cached).
- **Risk**: build steps that read binary files (Sharp for webp, PDF
  compile) would break on CF if we ran them. Solution: skip those
  build steps on CF (env-flag-gated) and only run `build:pages` +
  `build:assemble`. The CDN already has the processed variants
  (.webp companions, .gs-compressed.pdf). We don't need to
  regenerate them on every CF build.

### C. Stop committing new binaries to LFS (gradual hygiene)
- Going forward, when authors add a new paper or project page:
  - Drop assets at `assets/projects/<slug>/...` locally
  - Run `npm run sync:r2` (uploads to R2, writes manifest entry)
  - Commit ONLY `assets-manifest.json` (and YAML/MD frontmatter),
    NOT the binary files
  - Optional: add a `.gitignore` rule for new asset paths after they
    land on R2
- Existing 1212 LFS files stay put — they're already on R2 too, so
  the duplication is sunk cost.
- Won't help until next billing cycle (CF can't pull historical LFS
  this month anyway).
- **Risk**: existing CLAUDE.md and onboarding docs say "drop image
  and commit" — would need rewriting.

### D. Full LFS purge from history (nuclear) (~half day)
- Use `git filter-repo` or BFG to rewrite history removing all LFS
  pointers. Replace with references that fetch from R2.
- All clones of the repo invalidated; everyone re-clones.
- Drops repo size from 1.4 GB → ~50 MB.
- **Risk**: history rewrite is destructive. Coordinate with team.
  Tags / open PRs from old commits broken.

## Recommendation: B now, C as the new author workflow, D someday

1. **Today, by hand**: pause CF Preview auto-builds while we
   implement B (otherwise the bleed continues even though new builds
   fail — they still try, still pull LFS, still log bandwidth).
2. **Implement B**:
   - `build/assemble_output.js` drops binary subtrees from the copy
     list. New `out/` is HTML+CSS+JS only.
   - `package.json` adds `build:cf` (skips Sharp / PDF compile;
     runs only `build:pages` + `build:assemble`).
   - CF Pages "Build command" set to `npm run build:cf`. CF env var
     `GIT_LFS_SKIP_SMUDGE=1` so the clone leaves pointers in place.
   - New lint step: scan `out/**/*.html` for `src=/assets/...` or
     `href=/research/...pdf` — anything that doesn't match the
     `cdnUrl` resolution is a build error (would 404 on CF).
3. **Re-enable CF Preview** and verify a few preview URLs render.
4. **Migrate author workflow to C** in a follow-up PR (update
   CLAUDE.md, deprecate "commit the LFS binary" steps).
5. **Defer D**. Only worth doing if we hit GitHub's repo-size cap
   or the team complains about clone times.

## Open questions for the user

- ~~Confirm B is the right tradeoff~~ → confirmed.
- ~~`out/` self-contained vs slim~~ → user picked retire GH Pages,
  serve production from CF too (single deploy target).
- Pre-1a909e0 LFS files (the historical ~265 MB) — leave as-is for
  now (option D deferred).

## Recovery path (if we ever need to revert)

The migration landed as 3 sequential commits on `dev`:

1. **`8b0bdf6`** — `git rm --cached` on 1315 binary file paths +
   deletion of `.github/workflows/mirror-lfs-to-r2.yml`.
2. **`2197dc0`** — `.gitattributes` cleared of LFS rules,
   `.gitignore` extended to cover the binary paths, added
   `fix_r2_content_types.js` + `npm run fix:r2:mime`.
3. **`fe14028`** — CLAUDE.md text refresh for the post-LFS world.

To FULLY revert (re-introduce Git LFS):

```bash
git revert fe14028 2197dc0 8b0bdf6
```

Order matters — `git revert` applies them in newest-first order
which matches how the original commits were authored. Reverting
`8b0bdf6` alone re-adds the file entries to the index, but
`.gitattributes` would still be the no-LFS version from
`2197dc0`, so the files would be tracked as plain blobs, not LFS
pointers. All three need reverting together for a clean rollback.

The LFS *objects* on GitHub's LFS server were never deleted by
this migration — they're still recoverable as long as GitHub
hasn't garbage-collected them (LFS retention is repo-lifetime by
default).

---

# Implementation walkthrough

## Target architecture

```
┌─────────────────┐         ┌──────────────┐     ┌──────────────┐
│ Local working   │ sync:r2 │      R2      │     │ Cloudflare   │
│ tree (binaries) │ ───────▶│  (mirror,    │◀───▶│ Pages        │
│ — source of     │         │ cdn.agentic  │     │ (HTML/CSS/JS │
│   truth         │         │ learning.ai) │     │  bundle only)│
└─────────────────┘         └──────────────┘     └──────────────┘
        │ commit only                                   ▲
        │ manifest+text                                 │
        ▼                                               │ clone w/o LFS,
┌─────────────────┐                                     │ render w/ CDN URLs
│      git        │─────────────────────────────────────┘
│ (HTML, code,    │
│  YAML, MD,      │
│  manifest)      │
└─────────────────┘
```

**Invariants**:
- Every binary in working tree must be on R2 before the manifest
  it references is committed (otherwise rendered HTML 404s).
- `out/` contains only HTML, CSS, JS, `_redirects`, `favicon.ico`,
  `site.webmanifest`. Every binary `src` in those files is a
  `https://cdn.agenticlearning.ai/...` URL.
- Git size grows linearly with text, not assets. Cloning is fast.
- Local disk is the master copy. R2 is the public mirror.

## File-by-file changes

### `build/sync_to_r2.js` — no change (already idempotent)
Already scans `assets/projects/**` and `research/**`, hashes each
file, uploads if hash isn't in manifest, writes `assets-manifest.json`.
Becomes the **one** mechanism for getting binaries onto R2.

### `build/assemble_output.js` — slim `out/` to text-only
Remove from the `DIRS` list:
```diff
 const DIRS = [
   'people',
-  'research',
+  // 'research' subtrees moved off-disk: research/<slug>/index.html
+  // is regenerated from paper-content.json + cdnUrl, no binary copy
+  // needed. We still need the rendered HTML — copy only that.
   'contact',
-  'assets',
+  // 'assets' served from cdn.agenticlearning.ai/...
   'css',
   'areas',
   'includes',
 ];
```
Add a step that walks `research/` and copies *only* `index.html` per
slug (not the LFS-tracked `assets/`, `paper.pdf`, `paper-content.json`
which are CDN-served). End-state `out/` is ~5 MB instead of 770 MB.

### `package.json` — new scripts
```diff
   "build:assemble": "node ./build/assemble_output.js",
-  "build": "npm run build:tailwind && node ./build/generate_thumbnails.js && npm run build:webp && node ./build/generate_search_index.js && npm run build:arxiv:pdf && npm run build:rewrite-paper-content && npm run build:compress && npm run build:pages && npm run build:assemble",
+  "build": "npm run build:tailwind && npm run build:thumbnails && npm run build:webp && npm run build:search-index && npm run build:arxiv:pdf && npm run build:rewrite-paper-content && npm run build:compress && npm run sync:r2 && npm run build:pages && npm run build:assemble",
+  "build:cf": "npm run build:tailwind && npm run build:search-index && npm run build:pages && npm run build:assemble",
```
- `build` (local) now ends with `sync:r2` BEFORE `build:pages`, so
  templates render with up-to-date CDN URLs. Authors run `npm run
  build` and it does everything in order. If R2 creds are missing,
  sync:r2 fails noisily and the build stops.
- `build:cf` (cloud) skips Sharp / PDF compile / sync. Reads the
  manifest already-committed to git, renders HTML with those CDN
  URLs, assembles the thin bundle.

### `build/generate_webp.js`, `generate_thumbnails.js`, `compress_assets.js` — no code change
These already only run when `npm run build` (local) invokes them.
`build:cf` doesn't call them, so they don't need to be skip-aware.

### `build/build_arxiv_papers.js` — no code change
Same reasoning: only invoked by local `build`, not `build:cf`.

### `.gitignore` — exclude new binary additions
```diff
+# Binary assets live on R2 (synced via npm run sync:r2). Local
+# files in these dirs are NOT committed to git — they're either
+# already on R2 (manifest tracks the mapping) or being staged for
+# the next sync. Exception: pre-2026-05 files already committed
+# via LFS stay tracked until we explicitly purge them.
+assets/projects/**/*.png
+assets/projects/**/*.jpg
+assets/projects/**/*.jpeg
+assets/projects/**/*.webp
+assets/projects/**/*.mp4
+assets/projects/**/*.pdf
+assets/projects/**/*.csv
+assets/projects/**/*.svg
+# Same for /research extracted figures (already on R2):
+research/**/assets/
+research/**/paper.pdf
+research/**/paper-content.json
```
**Caveat**: this ignores files going forward, but anything already
tracked (the 1212 LFS-pointered files) stays tracked. To stop git
from seeing them as deleted on a fresh clone, the next step is
`git rm --cached` on each — but that breaks all in-flight branches.
**Defer**: leave the existing LFS pointers in git for now. New
assets just don't get added. Existing assets get cleaned in a
follow-up PR (option D scope).

### `.gitattributes` — leave alone
Existing LFS rules stay so existing pointers resolve correctly.
New asset paths fall through to gitignore.

### `.github/workflows/deploy.yml` — retire (option b)
Either:
- Delete the file entirely (CF becomes the only deploy path).
- Keep a stripped version that just runs `npm run lint:bibtex` and
  any other PR check, never deploys. (Safer for now — provides a
  GH-side CI signal even after CF takes over deploy.)

### `out/` final shape
```
out/
  index.html             # 25 KB
  index.js / search.js / etc.   # ~10 KB each
  site.webmanifest, favicon.ico
  _redirects
  css/                   # ~150 KB (tailwind-build.css minified)
  contact/index.html
  people/index.html
  people/<slug>/index.html × N   # ~10 KB each
  areas/index.html
  areas/<slug>/index.html × N
  research/index.html
  research/<slug>/index.html × N # the embedded paper HTML view —
                                 # references CDN-served figures via
                                 # rewrite_paper_content.js
  <slug>/index.html × N          # project pages
```
No `out/assets/`. No `out/research/<slug>/assets/`. No `paper.pdf`
under `out/`. Total ~5 MB.

## Author workflow (the new normal)

```bash
# Add a new paper image
cp ~/paper-figs/teaser.png assets/projects/poodle/teaser.png

# Build (uploads to R2 + writes manifest entry + renders HTML)
npm run build

# Commit only the manifest update + any MD/YAML changes
git add assets-manifest.json data/projects/poodle.md
git commit -m "PooDLe: add teaser figure"
git push
```

CF Pages picks up the commit, clones with `GIT_LFS_SKIP_SMUDGE=1`,
runs `npm run build:cf`, deploys the thin `out/`. The binary asset
gets served from R2 via the manifest entry committed in the same
commit. No LFS bandwidth used.

Note the file `assets/projects/poodle/teaser.png` exists on local
disk but is gitignored. It's only on (a) local and (b) R2.

## Disaster recovery

- **Local laptop dies**: R2 has every committed-as-of-last-build
  asset. Reconstruct by checking out the repo and running
  `npm run pull:r2` (new script, ~30 LOC: walk
  `assets-manifest.json`, download each entry to its logical path).
- **R2 bucket dies**: nightly snapshot to another R2 region or
  S3, or local rsync to a backup drive.
- **GitHub LFS quota exhausted (today)**: doesn't matter for
  serving — CF doesn't pull LFS. Local devs can't `git lfs pull`
  for the rest of the cycle either, but they don't need to (binaries
  not in LFS for new files; existing LFS files already cached
  locally).

## Order of operations to implement

1. **You**: pause CF Preview auto-deploys in the CF Pages dashboard
   right now (stops the bleed even while we work).
2. **Me**:
   1. Implement `build:cf` script + slim `build/assemble_output.js`.
   2. Wire `sync:r2` into `npm run build` (the local one).
   3. Add `.gitignore` rules for new asset paths.
   4. Write `build/pull_from_r2.js` for disaster recovery.
   5. Update CLAUDE.md + README.md author workflow sections.
   6. Open a PR off `dev`.
3. **You** (after PR review):
   1. In CF Pages dashboard:
      - Set Build command: `npm run build:cf`
      - Set Build output: `out`
      - Set env var: `GIT_LFS_SKIP_SMUDGE=1`
      - Re-enable auto-deploys
      - Set up `agenticlearning.ai` as the production custom domain
        on this CF Pages project (with appropriate DNS at the
        registrar — A/AAAA or CNAME to the CF Pages target).
   2. Verify a couple preview URLs.
   3. Once happy, retire the GH Pages workflow
      (`git rm .github/workflows/deploy.yml` and disable Pages in
      repo settings).
   4. Update `dev.agentic-learning-ai-lab-github-io.pages.dev` →
      preview env stays as-is.

## Does the repo still need to be public?

Once CF Pages serves the production site and R2 serves the assets,
the github.com repo doesn't need to be reachable by visitors at all.
You could flip it to private and the site keeps working.

**Reasons to keep it public**:
- Lab transparency / discoverability — easy to point a student or
  collaborator at the source ("see how PooDLe's project page is
  built"), nice signal in lab profile.
- Easy for outside fixes (typo PRs from someone who notices an arXiv
  link is broken).
- `includes/lab-header.html` and `css/lab-theme.css` are consumed
  externally by other repos; they currently work because the raw
  URLs are public. (Could also publish those to the CDN.)
- No real downside as long as we don't commit secrets — and the new
  workflow doesn't add any.

**Reasons to flip private**:
- LFS bandwidth on private repos is the same quota (10 GB/month),
  but the public/private distinction sometimes affects mirror
  behavior. Marginal.
- One less attack surface (no chance of accidental sensitive leak
  going public).
- If we ever commit early drafts of unreleased papers (which we
  shouldn't, but...), private would prevent leaks.

**Recommendation**: keep public for now. The migration doesn't
require flipping, and going private loses external contribution
signal. Re-evaluate later if there's a concrete reason.

## Student commit flow without R2 API keys

This is the trickiest part of the migration. Authors / students
adding a new paper today drop binaries into `assets/projects/<slug>/`
and `git push`; LFS handles the binary upload. Under the new
architecture they'd need R2 creds to run `sync:r2` — which we don't
want to hand out to every contributor.

Three options:

### Option 1: Continue allowing student LFS pushes, GH Action mirrors to R2
- Students push as usual: binaries go via Git LFS to GitHub.
- A GH Action (with R2 secrets) triggers on push to `dev`/`main`,
  walks new LFS-tracked files, uploads them to R2, writes manifest
  update, commits manifest back to the branch.
- CF Pages then picks up the commit (which now has the manifest
  entries) and renders with CDN URLs. CF itself never pulls LFS.
- **Pros**: zero workflow change for students; familiar `git
  push`; no shared secrets.
- **Cons**: LFS bandwidth still used for student pushes + GH Action
  LFS pulls (mitigated by the Actions LFS cache, which we already
  configured). Bandwidth pressure reduced but not eliminated.

### Option 2: Students push binaries to a staging branch, admin syncs
- Students open a PR with binaries committed (via LFS) to a
  short-lived `staging/<feature>` branch.
- Admin (Mengye) reviews, runs `sync:r2` locally, rebases the
  manifest update onto `dev`, deletes the staging branch (and its
  LFS objects via GitHub's "delete branch" → eventually purges
  LFS storage).
- **Pros**: no per-student R2 secrets, no GH Action complexity.
- **Cons**: admin in the loop on every contribution. Awkward.

### Option 3: Students drop binaries via a shared bucket (Google Drive, R2 staging bucket with limited creds)
- Students upload binaries to a shared location (not git).
- A script with R2 creds (run by admin or by GH Action) pulls from
  that location, uploads to the real R2 bucket, commits manifest.
- **Pros**: binaries never touch git.
- **Cons**: requires students to use a non-git interface for asset
  uploads. Cognitive friction.

### Revised Phase 2 plan (per user feedback 2026-05-19)

Students know CLI + git. So instead of mediating or building a
Worker, lean on a pre-commit hook + pre-signed R2 upload URLs:

**Pre-commit hook** (`.husky/pre-commit` or `.git/hooks/pre-commit`):
- Scans staged + untracked files in `assets/projects/**` and any
  other tracked binary paths.
- For each file present locally, cross-checks `assets-manifest.json`
  for a matching logical path.
- If any local binary isn't in the manifest yet, exit non-zero with:
  ```
  ⛔ The following assets aren't on R2 yet:
       assets/projects/poodle/teaser.png
       assets/projects/poodle/method.mp4
     Run `npm run upload` before committing.
  ```

**`npm run upload`** (new script `build/upload.js`):
1. Detect local binary files in asset paths not in manifest.
2. For each: `gh workflow run mint-upload-url.yml -f path=<path>`.
3. Poll the run, parse pre-signed PUT URLs from outputs.
4. `curl -X PUT --upload-file <local-file> <presigned-url>`.
5. `gh workflow run register-assets.yml -f paths=<comma-separated>`.
   The Action reads R2 (file now exists), computes hash, writes
   manifest entry, commits manifest back to the branch.
6. `git pull` to get the manifest update locally.
7. Print "✓ uploaded N assets, manifest committed by Action".

Two new workflows:
- `.github/workflows/mint-upload-url.yml` — workflow_dispatch,
  input `path:`, output: pre-signed PUT URL valid for ~10 min.
- `.github/workflows/register-assets.yml` — workflow_dispatch,
  input `paths:`, reads R2 for each, writes manifest, commits back.

**Net effect**: students never see R2 secrets, never push binaries
through Git LFS. `git commit` is blocked until manifest is current.
The CLI roundtrip is two `gh workflow run` calls + a curl, ~20 sec.

### Phase 1 recommendation (immediate, while Phase 2 cooks)

Option 1: continue allowing LFS pushes, GH Action mirrors LFS → R2.
Smallest change to fix CF Pages. Students keep their current
workflow; we revisit student workflow in Phase 2.

```bash
# Student adds new paper assets
cp ~/figures/*.png assets/projects/newpaper/
git add assets/projects/newpaper/ data/projects/newpaper.md
git commit -m "Add NewPaper project page"
git push
```

**Behind the scenes** (GH Action on push):
1. Checkout with LFS pulled (uses LFS bandwidth — but only for the
   new files since last sync, due to caching).
2. Run `npm run sync:r2` — uploads any new files not in manifest.
3. If manifest changed, commit it back to the same branch with
   `[skip ci]` flag so it doesn't loop.

**CF Pages** (separate trigger, on push):
1. Clone with `GIT_LFS_SKIP_SMUDGE=1` — no LFS bandwidth.
2. Run `npm run build:cf` — renders HTML with CDN URLs from the
   now-current manifest.
3. Deploy thin `out/` to CF.

This shifts the LFS bandwidth from "every CF build = full LFS pull"
to "only when students push new binaries = incremental LFS pull
during GH Action". Should easily fit under quota.

The migration could be done in two phases:

1. **Phase 1 (now)**: implement build:cf + assemble slim + Action
   that mirrors LFS → R2 on push. Existing LFS files keep working,
   no student workflow change.
2. **Phase 2 (later)**: write the `pull:r2` script for fresh clones
   so new contributors can hydrate without needing LFS access. Stop
   adding new binaries to LFS (gitignore + PR review enforcement).

---

## What I'd like you to confirm before I start

- The thin `out/` shape (only HTML + small files) is what you want?
- `npm run build` wiring `sync:r2` automatically means anyone running
  build needs R2 creds in `.env` — OK?
- `.gitignore`-ing new asset paths means new assets don't show in
  `git status` after dropping them locally. Still OK? (Alternative:
  let them show, and have the build error out if any new files
  aren't in the manifest yet — louder feedback.)
- Are the existing 1212 LFS pointers fine staying in git until a
  later cleanup PR? They'll resolve via CDN at render time (manifest
  entries exist), so visitors won't notice — only `git clone` size
  is affected.
