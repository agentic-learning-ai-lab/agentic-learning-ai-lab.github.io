# Next up — deferred work queue

Living list of work that's been planned but not done. Pick the next item
when starting a session. Each entry: one-paragraph spec + the file(s) to
touch + a rough effort estimate.

Big-picture history lives in git log and the per-design docs
(`cf-migration.md`, `latex-tarball-storage.md`, `project-pages-migration.md`).

## Queue

### 1. Reap orphan R2 blobs

Every re-encode (paper.pdf recompile, image quality bump, latex re-pack)
uploads new content-addressed objects to R2 and leaves the old hash
keys orphaned (nothing in `assets-manifest.json` references them). At
our scale this is harmless — Cloudflare R2's free tier is 10 GB and
we're under 500 MB total. After a session of heavy churn the orphans
grow by ~5–10 MB.

When/if free tier pinches: write a small `build/reap_r2_orphans.js`
that:
1. Loads `assets-manifest.json`; extracts the set of referenced R2 keys.
2. Lists every object in the bucket via `ListObjectsV2`.
3. Diffs; for each key not in the manifest, `--dry-run` prints it, or
   `--apply` issues `DeleteObject`.
4. Safety: refuse to delete an object less than N days old (the manifest
   write and the upload race; a brand-new orphan might be a manifest
   we're about to commit).

~50 LoC. Defer until storage actually matters (probably years).

### 2. LFS-free migration for new content

Today, new assets matching `.gitattributes` patterns get LFS-tracked
*and* synced to R2 (duplicate storage). LFS quota currently ~265 MB / 1
GB free tier; ~3 years runway at the current paper-add cadence.

When ready to migrate fully: untrack the LFS rules for those paths and
add the same paths to `.gitignore` so `git add` doesn't auto-stage
binaries. Author workflow becomes: drop locally → `sync:r2` → commit
only the manifest entry. Note already documented in `cf-migration.md`.

### 3. Project pages

`notes/project-pages-migration.md` is the spec. Self-contained design
doc; read it before touching project pages.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Project pages** (3) — high author-facing value, several papers
   already want this.
2. **Orphan R2 reaper** (1) — write when free tier matters; not soon.
3. **LFS-free** (2) — defer until quota pinches.
