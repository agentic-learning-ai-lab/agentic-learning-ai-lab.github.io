# CLAUDE.md — guide for agents working in this repo

This is the source for [agenticlearning.ai](https://agenticlearning.ai), the
Agentic Learning AI Lab website. **The repo is public.** Cloudflare Pages
serves production directly from `main` (auto-deploy on push); preview from
`dev`. Treat everything you commit as world-readable, indexable, and
permanent.

If you change anything in this file, also update `README.md` if the
user-facing setup steps changed.

## TL;DR for an agent picking this up

- Branches: edit `dev`, deploy via merge to `main`. Never push to `main`
  directly; Cloudflare Pages auto-deploys both branches.
- Data lives in `data/*.yaml`. Templates in `*.hbs` (root) and
  `templates/*.hbs` (partials). Build scripts in `build/`.
- Adding a paper = one entry in `data/papers.yaml` + one hero image
  dropped at `assets/images/papers/<slug>.png` (locally; gitignored) +
  `npm run build` (which calls `sync:r2` to mirror the image to R2 and
  bake CDN URLs into the rendered HTML).
- `npm run build` runs the full local pipeline (Sharp / PDF compile /
  sync:r2). `npm run build:cf` is the slim cloud-build path Cloudflare
  Pages uses (no binary processing — reads CDN URLs from manifest).
- LaTeX source for each paper lives as a `tar.gz` on R2 (not in git).
  Authored via `npm run latex:fetch` / `latex:pack` / `latex:update`.
  See [LaTeX source and PDFs](#latex-source-and-pdfs) below.
- **Binaries are NOT in git.** Source-of-truth is local disk + R2.
  Fresh clone: run `npm run pull:r2` to hydrate. See the "Where
  binaries live" section below + `notes/lfs-migration.md`.
- All planning docs and internal notes live in `notes/`. Don't put them at
  the repo root.

## Repo layout

```
data/                       # YAML sources (papers, people, areas, alumni)
  papers.yaml               #   one list entry per paper
  people.yaml               #   current + alumni; `current: true` flag
  research_areas.yaml
  alumni.yaml

research/<slug>/            # Per-paper directory
  index.html                #   built from paper.hbs — generated, but committed
  paper.pdf                 #   compiled PDF — local + R2, gitignored
  paper-content.json        #   arXiv HTML extraction (cached, committed)
  assets/                   #   figures for the HTML view — local + R2, gitignored
  # latex/ is transient (gitignored). Real source is a tar.gz on R2.

areas/<slug>/index.html     # Generated from research_area.hbs (committed)
people/<slug>/index.html    # Generated from person.hbs (committed)

assets/
  images/papers/            # Paper hero/card — local + R2, gitignored
  images/people/            # Headshots — local + R2, gitignored
  images/home/              # Landing-page imagery — local + R2, gitignored
  images/thumbnails/        # 256x256 crops — local + R2, gitignored
  images/background/        # Hero bg — local + R2, gitignored
  images/favicons/          # Same-origin (committed; tiny)
  images/logos/             # Same-origin (committed; logo.svg etc.)
  search-index.json         # Built by generate_search_index.js (committed)

build/                      # All build scripts (Node, no bundler)
  build_pages.js            #   Top-level driver — runs templater.js per template
  templater.js              #   Handlebars renderer; iterates papers/people/areas
  build_arxiv_papers.js     #   arXiv HTML download + LaTeX→PDF compile (R2 source)
  r2_lib.js                 #   Shared S3 client + manifest helpers for R2 scripts
  sync_to_r2.js             #   Bulk site asset sync (images, paper.pdf)
  pull_from_r2.js           #   Disaster recovery — hydrate from R2 to local
  fix_r2_content_types.js   #   One-shot Content-Type repair on R2 (rare)
  latex_pack.js             #   Publish local research/<slug>/latex/ → R2 tarball
  latex_fetch.js            #   Download R2 tarball → research/<slug>/latex/
  latex_update.js           #   Re-fetch from arXiv → clean → R2 tarball
  clean_latex.js            #   CLI wrapper for arxiv_latex_cleaner
  compress_assets.js        #   Resize arXiv-downloaded images to ≤1400px width
  generate_thumbnails.js    #   Sharp-based 256x256 thumbnails
  generate_search_index.js  #   Builds assets/search-index.json from YAML
  generate_favicons.js      #   Favicon set (rarely run)
  lint_bibtex.js            #   Warn on papers.yaml `journal:` vs MD bibtex drift

templates/                  # Handlebars partials (head, header, footer, cards)
includes/                   # HTML fragments included by other repos (lab-header.html, lab-attribution.html)

css/
  tailwind.css              # Tailwind source — DO edit this
  tailwind-build.css        # Production build — do NOT edit; regenerated
  tailwind-runtime.css      # Dev watch output — do NOT edit
  lab-theme.css             # Shared CSS variables (used by external sites — see note below)
  arxiv-paper.css           # Styling for the embedded arXiv HTML view
  index.css                 # Legacy page styles

notes/                      # Planning docs, migrations, internal write-ups
.github/workflows/
  pr-checks.yml             # Per-PR slim build + bibtex lint (the gate on main)

out/                        # Build output — gitignored, regenerated by CI
staging/                    # Local-only staging mirror — gitignored

assets-manifest.json        # Logical-path → CDN URL map for every R2-mirrored
                            # asset. Committed; the cdnUrl helper reads it at
                            # build time so rendered HTML embeds
                            # cdn.agenticlearning.ai/... URLs.
```

### Where binaries live (post-LFS migration, 2026-05-19)

The repo no longer uses Git LFS. The migration was forced by the org's
10 GB monthly LFS bandwidth being exhausted, which broke CF Pages
clones. Binary assets now live in two places:

- **Local working tree** — every binary on your laptop after a sync
  from R2 or after authoring. Source-of-truth. Gitignored (see
  `.gitignore` for the exact paths).
- **Cloudflare R2** (mirror at `cdn.agenticlearning.ai`) — every
  binary that's been committed. The build-time `cdnUrl` helper reads
  `assets-manifest.json` and bakes CDN URLs into rendered HTML, so
  browsers fetch images / PDFs / videos directly from R2.

Git tracks only text: HTML, JS, CSS, Markdown, YAML, JSON, favicons,
logo SVG, manifest. Fresh clone size: ~50 MB instead of 1.4 GB.

**Fresh clone? Hydrate binaries from R2:**
```bash
git clone <repo>
cd <repo>
npm ci
npm run pull:r2       # walks assets-manifest.json, downloads each
                      # entry to its logical path. ~700 MB, public CDN,
                      # no creds needed.
```

`pull:r2` is idempotent; safe to re-run. Skips files already present
locally. Accepts an optional prefix arg
(`npm run pull:r2 -- assets/projects/`) to limit scope.

See `notes/lfs-migration.md` for the full migration story + the
phase 2 plan (pre-commit hook + pre-signed-URL upload via GH Action,
so students don't need R2 creds to add binaries).

### Things that look like junk but aren't

- `css/lab-theme.css` and `includes/lab-attribution.html` — these are
  consumed externally by per-project repos. Do **not** delete or rename
  without checking referrers.
- `areas/<old-slug>/` directories occasionally surface from old research
  areas. They're build output; the canonical list is
  `data/research_areas.yaml`.
- Generated HTML files (`research/*/index.html`, `people/*/index.html`,
  `areas/*/index.html`, root `index.html`, `contact/index.html`) are
  **gitignored**. CF Pages rebuilds them via `npm run build:cf` on
  every push. Fresh clones don't have them on disk; `npm run build` (or
  `npm run build:cf`) regenerates everything from sources.
  `css/tailwind-build.css` and `css/tailwind-runtime.css` are
  gitignored too (Tailwind output).

## Build pipeline

There are two flows: the **full build** (local + the GH Action that
mirrors binaries to R2) and the **slim build** (Cloudflare Pages
production / preview). They share most steps but differ on which
ones can run without binary assets being present.

### `npm run build` — full (local)

Used for local development. Requires R2 credentials in `.env`
(see `scripts/setup_r2_secrets.sh`) and the binary assets present
on disk (run `npm run pull:r2` on a fresh clone).

1. `build:tailwind` — compile + minify `css/tailwind.css` → `tailwind-build.css`.
2. `generate_thumbnails.js` — 256×256 crops of paper/people images.
3. `build:webp` — Sharp-driven WebP companions for every PNG/JPG.
4. `generate_search_index.js` — emit `assets/search-index.json`.
5. `build:arxiv:pdf` — for each paper: download arXiv HTML if
   `enable_full_paper: true`, ensure `research/<slug>/latex/` exists,
   compile `paper.pdf` (reproducibly — `SOURCE_DATE_EPOCH` is pinned to
   the R2 tarball's Last-Modified so re-compiles produce byte-identical
   PDFs), then qpdf-compress + finalize with `--deterministic-id`.
   See [LaTeX source and PDFs](#latex-source-and-pdfs).
6. `build:compress` — resize arXiv-downloaded images to ≤1400px wide.
7. **`sync:r2`** — upload any new files (PNGs, WebPs, PDFs, CSVs,
   per-project CSS, videos, etc.) to R2 and update `assets-manifest.json`.
   Must precede the next two steps so they see the fresh manifest.
   Manifest entries for files NOT on local disk are PRESERVED (a missing
   file usually means partial-hydrate from R2, not deletion) — the
   summary reports them as orphans. To deliberately drop orphans:
   `node build/sync_to_r2.js --prune` (after `npm run pull:r2` to make
   sure you're not pruning something you forgot to hydrate).
8. `build:rewrite-paper-content` — rewrite `./assets/X` in each
   `paper-content.json` to absolute CDN URLs via the manifest.
9. `build:pages` — render every `*.hbs` via Handlebars. The `cdnUrl`
   helper reads `assets-manifest.json` and bakes
   `https://cdn.agenticlearning.ai/...` URLs into the HTML.
10. `build:assemble` — copy the slim set of serving artifacts into
    `out/` (HTML, JS, CSS, favicons, logos, `search-index.json`,
    `_redirects`; no binary subtrees).

### `npm run build:cf` — slim (Cloudflare Pages)

Used by CF Pages cloud builds. Skips every step that needs binary
assets or R2 credentials. The manifest committed to git is the
source of truth for CDN URLs.

1. `build:tailwind`
2. `generate_search_index.js`
3. `build:rewrite-paper-content` — no-op if manifest already current;
   safe to run again.
4. `build:pages`
5. `build:assemble`

CF clones a text-only repo (LFS removed 2026-05-19; binary asset
paths are gitignored). The build reads `assets-manifest.json` from
git, bakes CDN URLs into rendered HTML via the `cdnUrl` helper, and
produces a ~2 MB `out/` bundle: HTML, JS, CSS, favicons, logos,
search index, and per-research-paper `index.html` (no `assets/`,
no `paper.pdf`).

### Deployable bundle layout (`out/`)

```
out/
  index.html, index.js, search.js, person.js, ...   # ~50 KB total
  _redirects, site.webmanifest, favicon.ico
  css/tailwind-build.css                            # ~150 KB
  people/index.html, people/<slug>/index.html × N   # ~10 KB each
  research/index.html, research/<slug>/index.html × N
  areas/index.html, areas/<slug>/index.html × N
  contact/index.html, includes/lab-header.html, ...
  assets/images/favicons/* + logos/* + search-index.json
  <project-slug>/index.html × N                     # project pages
```

Every other URL the rendered HTML references lives on
`cdn.agenticlearning.ai/<hash>/<file>` (R2-served). The mapping
is `assets-manifest.json` (~1245 entries, committed to git).

### CI workflows

- **Cloudflare Pages** (configured in CF dashboard, no workflow
  file). Auto-deploys on push to `dev` (preview at
  `dev.agentic-learning-ai-lab-github-io.pages.dev`) and `main`
  (production at `agenticlearning.ai`). Build command:
  `npm run build:cf`. Output: `out`. No LFS pull.
- `.github/workflows/pr-checks.yml` — runs on PRs to `dev`/`main`.
  Executes `build:cf` + `lint:bibtex` (~1 min, no secrets, no
  LFS). This is the required check on `main`'s branch protection.

## LaTeX source and PDFs

LaTeX source lives as one `tar.gz` per paper on Cloudflare R2. Nothing
under `research/<slug>/latex/` is ever committed — that path is a
transient extract used only during local editing or during a fresh
compile. The compiled `paper.pdf` lives **only** on local disk and R2
(gitignored, mirror via `npm run sync:r2`). See
`notes/latex-tarball-storage.md` for the LaTeX side and
`notes/lfs-migration.md` for the binary hosting model.

**Layout:**

```
git:
  research/<slug>/paper-content.json (arXiv HTML extract, text)
  assets-manifest.json               (logical → CDN URL for both
                                      /research/<slug>/paper.pdf
                                      and /research/<slug>/latex.tar.gz)

R2 (cdn.agenticlearning.ai):
  <hash>/<slug>.pdf                  (compiled artifact)
  <hash>/<slug>.tar.gz               (cleaned LaTeX source)

local (gitignored):
  research/<slug>/paper.pdf          (compiled artifact, on disk)
  research/<slug>/paper.pdf.qpdf-compressed  (qpdf finalize marker)

local (gitignored):
  research/<slug>/latex/             (transient extract, present only during editing)
  .cache/latex-tarballs/             (download cache for tarballs)
  .cache/latex-build/<slug>/         (compile workdir)
```

The entire `.cache/` tree is safe to `rm -rf` anytime — it's all
regenerable from R2. Wipe it if a download looks corrupt or if disk
pressure is real (~100 MB at current paper count).

**Pipeline behavior** (see `build/build_arxiv_papers.js`):

PDF compile uses a two-layer skip:

1. **Outer skip — compiled PDF.** If `research/<slug>/paper.pdf` exists,
   the build does nothing for that paper unless `--force` is passed. CI
   hits this in 99% of runs.
2. **Inner resolve — paper.pdf missing.** `resolveLatexSourceForCompile()`
   picks source in this order:
   - If `research/<slug>/latex/` exists locally with a `.tex` containing
     `\documentclass` → use in place (author is mid-edit).
   - Else if `assets-manifest.json` has `/research/<slug>/latex.tar.gz` →
     download tarball from R2 (cached in `.cache/latex-tarballs/`),
     extract to `.cache/latex-build/<slug>/`, compile there.
   - Else → print a hint telling the author to run
     `npm run latex:update <slug>` (arXiv bootstrap) or
     `npm run latex:pack <slug>` (position paper). The build never
     auto-fetches from arXiv or auto-writes to R2.

**Author scripts:**

```
npm run latex:fetch  <slug>   # R2 → research/<slug>/latex/ (for editing)
npm run latex:pack   <slug>   # local tree → clean → tar → R2 → manifest → delete local
npm run latex:update <slug>   # arXiv → clean → tar → R2 → manifest → invalidate paper.pdf
npm run latex:clean  <slug>   # run arxiv_latex_cleaner only (rarely needed directly)
npm run build:arxiv:pdf       # compile any missing paper.pdf (cache-first)
```

`latex:pack --all` packs every `research/<slug>/latex/` tree it finds —
useful when a batch of papers are seeded locally and need bulk upload.

**To regenerate a PDF after editing source:**

```bash
npm run latex:fetch <slug>    # if you don't already have the tree
# ...edit...
npm run latex:pack <slug>     # publishes new tarball to R2
rm research/<slug>/paper.pdf  # invalidate compiled cache
npm run build:arxiv:pdf       # recompile from new R2 tarball
npm run sync:r2               # uploads the new paper.pdf to R2 + manifest
git add assets-manifest.json && git commit -m "..."
                              # paper.pdf itself is gitignored — only the
                              # manifest entry gets committed
```

**When an arXiv version bumps**, skip the manual fetch/edit:

```bash
npm run latex:update <slug>   # refetches from arXiv, cleans, publishes, invalidates paper.pdf
npm run build:arxiv:pdf
```

**Local LaTeX install.** The compile prefers `latexmk` and falls back to a
direct compile + `bibtex` cycle using the detected engine. `latexmk`
ships with the full TeX Live distribution and `mactex` but **not** with
`basictex` on macOS — if you get fallback warnings,
`tlmgr install latexmk`. CI installs `latexmk` via
`texlive-latex-extra`, plus `texlive-xetex` and `texlive-luatex` for
papers that need a different engine.

**Engine detection.** The build picks `pdflatex` / `xelatex` / `lualatex`
per paper by scanning the main `.tex`:

- A magic comment `%!TEX program = xelatex` (or `lualatex`, or
  `pdflatex`) at the top of the file is an explicit override. This is
  the TeXShop / Overleaf / VSCode convention.
- Otherwise, if the source uses `fontspec`, `xeCJK`, `polyglossia`, or
  `mathspec`, the build picks `xelatex` (these packages don't compile
  under pdflatex).
- Otherwise, `pdflatex`.

Only the main `.tex` is inspected — `.sty` files in the same
directory are not scanned. If a paper's main `.tex` does
`\usepackage{my-custom-style}` and `my-custom-style.sty` is what pulls
in fontspec, detection will fall back to `pdflatex` and the compile
will fail. Two ways to handle this:

- Put the engine name in the style file name. The detector treats any
  `\usepackage{...xelatex...}` or `...lualatex...` package as a
  signal for that engine (which is how
  `\usepackage{agenticlearning-xelatex}` is picked up).
- Add the `%!TEX program = xelatex` magic comment at the top of
  `main.tex`. This is the canonical escape hatch and overrides
  package-based detection.

Locally, you'll need the relevant engine installed (`tlmgr install xetex` /
`tlmgr install luatex`).

### Author comments in LaTeX source — stripped before upload

This repo is public, and so is the R2 bucket. Author comments routinely
contain TODOs, reviewer responses ("R2 said..."), commented-out figures
from alternate experiments, internal scratch, and funding details that
aren't meant for public view. The cleaning step is now baked into the
publish path — there is no committed `.tex` to scan, so the only place
this can leak is the tarball uploaded to R2.

`latex:pack` and `latex:update` run
[`arxiv_latex_cleaner`](https://github.com/google-research/arxiv-latex-cleaner)
on the local `research/<slug>/latex/` tree **immediately before tarring**.
The cleaner strips comment lines and commented-out blocks while
preserving `%!TEX` magic comments and other functional patterns. Author
sees a one-line summary (`🧹 cleaned ...: stripped N comment lines`) in
the script log.

`arxiv_latex_cleaner` is installed via `npm run setup:python` (creates
`.venv/` locally). The pinned dep is in `build/requirements.txt`. CI does
not need it — `.tex` never enters git.

## Code review and audit checklist (before pushing to dev → main)

Run through this list before opening a PR or merging `dev` → `main`:

1. **Build succeeds locally.** `npm run build` exits 0 with no warnings
   you didn't intend.
2. **No secrets.** The repo is public.
   - No API keys, tokens, `.env` files, internal Slack URLs, private
     email lists, draft paper PDFs that aren't ready to be public, etc.
   - Grep the diff for `KEY`, `SECRET`, `TOKEN`, `PASSWORD`,
     `@internal`.
3. **Image sanity.** New binary assets go to R2 via `npm run sync:r2`
   (NOT into git — they're gitignored). Confirm the new
   `assets-manifest.json` entry exists for each. PNGs > 5 MB should
   be resized in place before sync (they hit CF Pages' per-asset
   serve cap and bloat R2). For arXiv-imported figures, the
   `build:compress` step caps them at 1400px wide automatically.
4. **YAML well-formed.** `data/papers.yaml` and `data/people.yaml` parse
   (the build will fail if not, but a 10-second `js-yaml` check first
   saves time).
5. **Permalinks.** New `permalink:` values are unique, kebab-case, and
   match the URL referenced anywhere else (arXiv abstract, Twitter,
   slides). Permalinks are **forever** — changing one breaks inbound
   links.
6. **External links.** `arxiv:`, `pdf:`, `webpage:` resolve. Open one to
   sanity-check.
7. **Authors are linked.** Every author name in `papers.yaml` that
   should hyperlink to a person page must match a `name:` in
   `people.yaml` exactly (case + punctuation). `formatAuthorsWithLinks`
   silently leaves unmatched names as plain text.
8. **Date format.** `date: YYYY-MM-DDTHH:MM:SS.sssZ` (ISO). Bad dates
   render as `Invalid date`.
9. **No generated HTML in the diff.** Build output (`research/*/index.html`,
   `people/*/index.html`, etc., `css/tailwind-build.css`) is gitignored.
   If any sneaks into your diff, something added it via `git add -f` —
   undo with `git rm --cached <path>`.
10. **Output spot-check.** Open one new/changed page in `out/` (via
    `npm run preview`) and look at it in a browser. CI catches build
    errors; it doesn't catch a broken layout.
11. **R2 sync done.** `npm run sync:r2` ran successfully and the
    new `assets-manifest.json` entries are committed. `npm run build`
    will warn `⚠️ cdnUrl lookup fell back to local` on missed paths —
    those'd 404 on CF Pages, so don't merge with the warning.
12. **bibtex lint.** `npm run lint:bibtex` exits 0 (catches stale
    BibTeX venue when papers.yaml's `journal:` updates).

If you skipped any, say so in the PR description rather than glossing
over it.

## Pre-commit hooks

Husky (devDependency) sets `.husky/` as the git hooks dir on first
`npm install`. `.husky/pre-commit` invokes `scripts/precommit.js`,
which runs every check in `scripts/checks/*.js` in a single Node
process (~100 ms per check, fast feedback before commit lands).

Active pre-commit checks (run as a single Node process from
`.husky/pre-commit` → `scripts/precommit.js` → loads
`scripts/checks/*.js`):

| # | Check | What it blocks | Bypass |
|---|---|---|---|
| 01 | asset-manifest | New / changed binary asset files not yet on R2 (not in `assets-manifest.json`). Tells you to run `npm run upload`. | `--no-verify` |
| 03 | yaml-valid | `data/*.yaml` files that don't parse cleanly. | `--no-verify` |
| 04 | permalink-unique | Duplicate `permalink:` within papers.yaml / people.yaml / research_areas.yaml. | `--no-verify` |
| 05 | no-secrets | Staged diff lines matching credential patterns (R2 keys, GH PATs, OpenAI/Anthropic keys, AWS access keys). Repo is public — must rotate any leaked token immediately. | `--no-verify` |
| 06 | large-files | **Warns** (not blocks) when adding > 1 MB files to git. Binaries belong on R2. | n/a |
| 07 | bibtex-lint | papers.yaml `journal:` field's venue acronym not present in MD bibtex (`build/lint_bibtex.js`). | `--no-verify` |
| 08 | required-fields | papers.yaml / people.yaml / research_areas.yaml entries missing required fields. | `--no-verify` |

Adding a new pre-commit check: drop a file in
`scripts/checks/<NN>_<name>.js` that exports `{ name, run }`.
`run()` returns truthy on pass, falsy on fail. Print errors to
`stderr`. The orchestrator auto-loads everything in `scripts/checks/`.

## commit-msg hook

Separate from pre-commit because git's pre-commit hook fires
BEFORE the commit message is resolved — for `git commit -m "..."`
the message text isn't available at pre-commit time. The
commit-msg hook runs AFTER, with the message file path as `$1`.

`.husky/commit-msg` → `scripts/check_commit_msg.js`:

- Blocks commit messages containing `[skip ci]` / `[ci skip]` /
  `[no ci]` / `[skip actions]` / `[actions skip]` / `***NO_CI***`.
  These get parsed by GitHub Actions + CF Pages + most CI
  providers as "suppress workflow runs for this commit". Even in
  prose — squash-merge concatenates constituent commit bodies and
  propagates them. We hit this on PR #11; the production deploy
  silently didn't fire.
- Bypass: `git commit --no-verify`.
- To document the literal token without tripping the check, write
  `skip-CI` (hyphen) or `[skip-ci]` (hyphen).

## CI checks

PRs to `main` (or `dev`) run `.github/workflows/pr-checks.yml`:

1. `npm run build:cf` (slim render — same path CF Pages uses)
2. `npm run lint:bibtex` (also runs as pre-commit hook 07)
3. `node build/check_manifest_consistency.js` (HEADs every
   `cdn.agenticlearning.ai/...` URL baked into rendered HTML; fails
   if any 404 — catches sync:r2 misses + stale manifest entries)

These are the only required checks on `main`'s branch protection.

## Things to never do

- **Don't push to `main` directly.** Open a PR from `dev`.
- **Don't bypass hooks** (`--no-verify`, `--no-gpg-sign`, etc.) unless
  the user explicitly asks.
- **Don't delete `download_arxiv_source.js`** — it's a useful standalone
  utility; its core is folded into `build_arxiv_papers.js`, but the CLI
  still works.
- **Don't add a per-project page at `/research/<slug>/`** — that path is
  the data-driven detail page. Marketing-style project pages will live
  at `/<slug>/` (see `notes/project-pages-migration.md`).
- **Don't put internal notes at the repo root.** Use `notes/`. The repo
  is public; the index is `README.md` + this file.
- **Don't try to re-add binaries to git** (whether via `git add` or by
  re-introducing LFS rules). They're gitignored on purpose — R2 is
  the mirror. New binary additions go through `npm run sync:r2`
  + commit only the `assets-manifest.json` update.
- **Don't `git lfs pull`** as part of any new workflow. Existing LFS
  pointers in git history still smudge correctly for `git revert`,
  but every fresh pull burns bandwidth from the org's 10 GB cap.
  If something needs a binary that isn't on local disk yet, use
  `npm run pull:r2 [prefix]` instead.

## When the user asks you to add a new paper

There are two parallel paths depending on whether the contributor
has R2 credentials in their local `.env`:

**With R2 creds** (you / admin):
- Run `npm run build` — the full pipeline auto-syncs new binaries via
  `sync:r2` and writes the manifest entry. Commit text + manifest.

**Without R2 creds** (students):
- `npm run upload` after dropping local binaries. It dispatches a GH
  Action that mints pre-signed PUT URLs, the local CLI curls files up
  to R2, then dispatches a register Action that commits the manifest
  back to the contributor's branch.

Either way, the YAML/MD steps are the same:

1. Add the entry to `data/papers.yaml`. Use an existing entry as a
   template. Required (enforced by pre-commit check 08): `title`,
   `authors`, `permalink`, `date`, `journal`, `research_areas`,
   `abstract`, `short_abstract`. Optional: `arxiv`, `pdf`, `webpage`,
   `enable_full_paper`, `project_page`, `is_recent`, `image`.
2. Drop the hero image at `assets/images/papers/<snake_case>.png`
   (gitignored; lives on local disk + R2).
3. Get the LaTeX source onto R2:
   - On arXiv: `npm run latex:update <slug>` fetches from
     `https://arxiv.org/e-print/<id>`, cleans, tars, uploads to R2,
     writes a manifest entry, and invalidates any stale paper.pdf.
   - Not on arXiv: drop the source at `research/<slug>/latex/` (the
     directory is gitignored), then run `npm run latex:pack <slug>`.
     Same effect — clean, tar, upload, manifest, then auto-delete the
     local tree.
4. `npm run build:arxiv:pdf` compiles `paper.pdf` by downloading the
   tarball from R2 (cached in `.cache/`).
5. `npm run build` runs the full local pipeline end-to-end, which
   includes `sync:r2` (uploads the new hero image, paper.pdf, and
   any per-project assets to R2 + updates `assets-manifest.json`).
   Templates render with the new manifest entries baked in as
   `https://cdn.agenticlearning.ai/...` URLs. If `sync:r2` is
   skipped or fails, `build:pages` prints a
   `⚠️ cdnUrl lookup fell back to local` warning naming the missed
   paths — those'll 404 on CF Pages since the slim `out/` doesn't
   include binary subtrees. See `notes/lfs-migration.md`.
6. Check `out/<slug>/index.html` (or `out/research/<slug>/index.html`
   for the embedded paper view) opens correctly via `npm run preview`.
7. Walk the audit checklist above. Then commit ONLY the text
   changes: `data/papers.yaml`, any new `data/projects/<slug>.md`,
   and the updated `assets-manifest.json`. The new binaries are
   gitignored — they live on local disk + R2 only.

## When the user asks you to update something

- Match the existing pattern. This codebase is small and consistent;
  resist the urge to refactor a partial during an unrelated change.
- If you find a real cleanup opportunity, file it in `notes/` as a
  separate doc instead of bundling.
- Project pages: content lives in `data/projects/<slug>.md` (YAML
  frontmatter + markdown body). Read `data/projects/anticipatory-recovery.md`
  for the live shape and `build/project_page_loader.js` for the renderer
  before touching the pipeline. `notes/project-pages-migration.md` is a
  historical design doc — the YAML-block schema it sketches is no longer
  used (see banner at top of that doc).
