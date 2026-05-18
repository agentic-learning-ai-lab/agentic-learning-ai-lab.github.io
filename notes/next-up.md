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

### 3. Bulk port remaining project pages

Template + pilot landed in PR #9 (anticipatory-recovery). The other 11
project pages live as per-paper repos with a `website` branch — they
all follow the same Bulma "academic project page" template, so porting
each is mostly:
1. `gh repo clone agentic-learning-ai-lab/<slug>` (or grab `website`
   branch via git archive).
2. Add a `project_page:` block under that paper's entry in
   `data/papers.yaml` — affiliations, links, sections (title + body
   HTML + figures), bibtex.
3. Copy figure assets to `assets/projects/<slug>/`.
4. `npm run build:webp && npm run sync:r2 && npm run build` and spot-check
   the rendered `/<slug>/` against the existing live page.
5. PR per project (small, parallelizable).

Schema, helpers, and CSS are stable. New papers can also add a
`project_page:` block from day one.

Outstanding migration work covered in `notes/project-pages-migration.md`
(see "Migration plan" Steps 3-6): bulk port, custom-widget outliers,
cutover, and archiving the per-project repos after a quiet period.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Bulk port project pages** (3) — biggest user-facing impact remaining.
   Mostly mechanical YAML editing now that the template is stable.
2. **Orphan R2 reaper** (1) — write when free tier matters; not soon.
3. **LFS-free** (2) — defer until quota pinches.
