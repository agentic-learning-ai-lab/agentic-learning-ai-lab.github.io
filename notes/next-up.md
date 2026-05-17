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

### 2. Atomic write in `rewrite_paper_content.js`

For consistency with `generate_webp.js`. Today `fs.writeJson` is not
atomic — a SIGKILL mid-write leaves a truncated paper-content.json that
the next build's regex-based detection won't catch (no marker, no size
check). Write to `.tmp` + `fs.move` mirrors the pattern from
`generate_webp.js`. ~5 min.

### 3. CI-side `npm run sync:r2`

Now that sync is ~1.2s steady-state, putting it in
`.github/workflows/deploy.yml` is viable. Catches the "author forgot to
run sync" mistake at PR time.

```yaml
- name: Sync new assets to R2
  if: github.event_name != 'pull_request'
  env:
    R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
    R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
    R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
    R2_BUCKET: agenticlearning-assets
    R2_CDN_BASE_URL: https://cdn.agenticlearning.ai
  run: npm run sync:r2
```

Defer until: multiple contributors start adding papers and "forgot to
run sync" becomes a regular review issue.

### 4. LFS-free migration for new content

Today, new assets matching `.gitattributes` patterns get LFS-tracked
*and* synced to R2 (duplicate storage). LFS quota currently ~265 MB / 1
GB free tier; ~3 years runway at the current paper-add cadence.

When ready to migrate fully: untrack the LFS rules for those paths and
add the same paths to `.gitignore` so `git add` doesn't auto-stage
binaries. Author workflow becomes: drop locally → `sync:r2` → commit
only the manifest entry. Note already documented in `cf-migration.md`.

### 5. Project pages

`notes/project-pages-migration.md` is the spec. Self-contained design
doc; read it before touching project pages.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Project pages** (5) — high author-facing value, several papers
   already want this.
2. **WebP for arxiv figures** (1) — biggest remaining bandwidth win on
   the Full Paper HTML view; one focused PR.
3. **Atomic write fix** (2) — small consistency cleanup; bundle with
   any rewrite_paper_content.js change.
4. **CI-side sync** (3) — defer until pain shows up.
5. **LFS-free** (4) — defer until quota pinches.
