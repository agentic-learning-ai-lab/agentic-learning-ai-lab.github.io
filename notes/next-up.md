# Next up — deferred work queue

Living list of work that's been planned but not done. Pick the next item
when starting a session. Each entry: one-paragraph spec + the file(s) to
touch + a rough effort estimate.

Big-picture history lives in git log and the per-design docs
(`cf-migration.md`, `latex-tarball-storage.md`, `project-pages-migration.md`).

## Queue

### 1. WebP for arxiv inline figures

`research/<slug>/assets/*.png` (the matplotlib plots, methods diagrams,
results figures embedded in the Full Paper HTML view) currently ship as
PNG. Spot-checked compression on a few: 180 KB → 32 KB at q98 (17% of
PNG), with anti-aliased text staying crisp. ~80% bandwidth savings on
the Full Paper HTML view.

**Use lossless WebP**, not lossy. Academic figures contain text labels
and line-art, where lossy artifacts (mosquito noise around glyphs) are
visible even at q98. Lossless WebP still beats PNG by ~20-30% on these
files and removes the quality-risk axis entirely.

Implementation paths considered:
- A. Extend `generate_webp.js` to include `research/**/assets/`. Extend
  `rewrite_paper_content.js` to substitute `.png` → `.webp` URL when
  manifest has the .webp sibling. Browsers without WebP support get
  broken figures (~2%; we accept this trade-off for backgrounds today).
- B. Wrap each `<img>` with `<picture>` inside the arxiv HTML during
  rewrite. Preserves PNG fallback. More HTML parsing, slightly larger
  paper-content.json. Safer for older browsers.

Volume: ~1000+ figure PNGs across 19 papers. Sharp lossless encode is
fast (~10 sec for the full set). Touches `generate_webp.js`,
`rewrite_paper_content.js`, possibly `sync_to_r2.js` if needed.

### 2. Reap orphan R2 blobs

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

### 3. LFS-free migration for new content

Today, new assets matching `.gitattributes` patterns get LFS-tracked
*and* synced to R2 (duplicate storage). LFS quota currently ~265 MB / 1
GB free tier; ~3 years runway at the current paper-add cadence.

When ready to migrate fully: untrack the LFS rules for those paths and
add the same paths to `.gitignore` so `git add` doesn't auto-stage
binaries. Author workflow becomes: drop locally → `sync:r2` → commit
only the manifest entry. Note already documented in `cf-migration.md`.

### 4. Project pages

`notes/project-pages-migration.md` is the spec. Self-contained design
doc; read it before touching project pages.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Project pages** (4) — high author-facing value, several papers
   already want this.
2. **WebP for arxiv figures** (1) — biggest remaining bandwidth win on
   the Full Paper HTML view; one focused PR.
3. **Orphan R2 reaper** (2) — write when free tier matters; not soon.
4. **LFS-free** (3) — defer until quota pinches.
