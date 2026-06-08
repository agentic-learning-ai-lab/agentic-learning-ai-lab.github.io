# Next up — deferred work queue

Living list of work that's been planned but not done. Pick the next item
when starting a session. Each entry: one-paragraph spec + the file(s) to
touch + a rough effort estimate.

Big-picture history lives in git log and the per-design docs
(`cf-migration.md`, `latex-tarball-storage.md`, `project-pages-migration.md`).

## Staging preview

Cloudflare Pages is connected to this repo (set up 2026-05-17). Every
push to `dev` (or any non-`main` branch) auto-builds and deploys a
preview within ~3-4 min:

- Branch alias (always latest): `dev.agentic-learning-ai-lab-github-io.pages.dev`
- Per-commit immutable: `<short-sha>.agentic-learning-ai-lab-github-io.pages.dev`

Use the branch alias for sharing iterative review links. Build logs
live in Cloudflare dashboard → Workers & Pages → the project → Deployments.

Production `agenticlearning.ai/` flows through Cloudflare Pages
(DNS cut over 2026-05-19; GH Pages retired in the same window).
The `.pages.dev` URL still works as a debug fallback. Historical:
Lever C in `cf-migration.md` is the design doc for this cutover.

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

### 3. Granular paper tagging system

Replace (or augment) the current `research_areas:` single-bucket
categorization with multi-label tags. Today each paper picks one of
three macro areas (`adaptive-agents-and-foundation-models` /
`learning-from-visual-experience` / `concept-learning-and-abstraction`).
That's coarse — a paper like Beta-Bernoulli Calibrator straddles
forecasting + calibration + LLM evaluation; a paper like Conceptual
Creativity touches generative modeling + meta-learning + concept
learning. One bucket per paper loses information.

Sketch:
- New `tags:` list field in `data/papers.yaml` (parallel to existing
  `research_areas:`). Examples: `forecasting`, `calibration`,
  `meta-learning`, `diffusion`, `world-models`, `continual-learning`,
  `egocentric-video`.
- Render tag chips on each paper card + paper detail page.
- Tag-filtered listing: `/tags/<tag>/` index page (parallel to
  `/areas/<area>/`).
- Migration: leave `research_areas:` alone for now; tags are additive.
  Eventually rethink whether areas + tags both make sense (see #6).

Effort: ~half a day (template + listing + auto-emit tag pages).

### 4. In-house LaTeX → HTML renderer

Today the embedded paper view depends on arXiv's HTML extraction
(`paper-content.json` fetched from `ar5iv.labs.arxiv.org`). Two
problems:
- Quality. arXiv's HTML extraction has rough edges — bibliography
  rendering looks bad for the conceptual-creativity paper (noticed
  2026-06-07). We can't fix it; we just inherit whatever ar5iv does.
- Coverage. Non-arXiv papers (PhilPapers, position papers with custom
  LaTeX) have no HTML at all — only the compiled PDF. The Self
  Requires Learning paper falls into this bucket.

Sketch: build an in-house LaTeX → HTML pipeline.
- Candidate engines: LaTeXML (the same thing arXiv uses, but we can
  pin a version + post-process its output), or pandoc, or a hybrid.
- Run as part of `latex:pack` / `latex:update` (or a new step like
  `latex:html`), emit `paper-content.json` for any paper with LaTeX
  source on R2, not just arXiv ones.
- Style consistently with `arxiv-paper.css` (already themed via CSS
  vars, so dark mode + our typography come for free).
- Bibliography rendering is the hardest part — author lists, venues,
  in-text cite hover tooltips, "References" section formatting.

Effort: a multi-week project. Probably worth a notes/latex-html.md
design doc before starting. Until then, non-arXiv papers (`the-self-
requires-learning`) render PDF-only.

### 5. Home page + research-area redesign

The home page currently has: hero + "Key Areas" (3 research areas) +
"Recent Works" carousel + footer. As the lab grows, this layout starts
to feel constraining:
- "Key Areas" maps to the `data/research_areas.yaml` 3-bucket model,
  which item #3 wants to replace/augment with tags.
- Recent works is just the latest N papers filtered by `is_recent`;
  no story-telling, no grouping by theme.
- Some lab content has no place to live: a "highlights" reel
  (selected publications), team news (paper acceptances, awards),
  blog-style notes, recruitment messaging.

Sketch (open questions, not a plan yet):
- What's the home page job? Lab identity, recruitment, what we
  publish, or all of those?
- Should "Key Areas" stay as the primary nav-via-content, or
  promote tags to that role?
- Does a `news/` feed make sense (paper acceptance, talks given)?
- Is there a "selected publications" curation distinct from
  `is_recent`?

Pre-work: write `notes/home-redesign.md` with options + mockups
before any code lands.

## Known issues (not bugs we own, but worth tracking)

- **arXiv HTML rendering** for the Conceptual Creativity paper has
  rough References section formatting. Out of our hands until #4
  (in-house LaTeX → HTML) is built.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Granular tags** (3) — small, high-leverage; sets up #5.
2. **In-house LaTeX → HTML** (4) — bigger project; unblocks any custom-
   LaTeX paper that wants the embedded view (currently PDF-only).
3. **Home redesign** (5) — write the design doc first; coupled with #3.
4. **Orphan R2 reaper** (1) — write when free tier matters; not soon.
5. **LFS-free** (2) — defer until quota pinches.
