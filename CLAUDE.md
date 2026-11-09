# CLAUDE.md — guide for agents working in this repo

This is the source for [agenticlearning.ai](https://agenticlearning.ai), the
Agentic Learning AI Lab website. **The repo is public.** Cloudflare Pages
serves production directly from `main` (auto-deploy on push) and a
preview for every other branch. Treat everything you commit as world-readable, indexable, and
permanent.

If you change anything in this file, also update `README.md` if the
user-facing setup steps changed.

## TL;DR for an agent picking this up

- Branches: work on a feature branch, open a PR to `main`, merge to
  deploy. Never push to `main` directly. Cloudflare Pages auto-deploys
  `main` to production and every other branch to a preview URL.
- Data lives in `data/*.yaml`. Templates in `*.hbs` (root) and
  `templates/*.hbs` (partials). Build scripts in `build/`.
- Adding a paper = one entry in `data/papers.yaml` + an optional hero
  image at `assets/images/papers/<slug>.png` (gitignored) +
  `npm run paper:add -- <slug> [<source.zip>]`.
- Full-paper HTML and `paper.pdf` both come from the paper's LaTeX
  tarball on R2, built in one
  [latexml-lab](https://github.com/agentic-learning-ai-lab/latexml-lab)
  run: `npm run paper:add -- <slug> [<source.zip>]` does the whole thing.
  Pre-commit check 11 and CI fail when the tarball changed but the HTML
  or PDF was not rebuilt.
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
data/                       # YAML sources (papers, people, tags, alumni)
  papers.yaml               #   one list entry per paper
  people.yaml               #   current + alumni; `current: true` flag
  tags.yaml                 #   topic-tag vocabulary (slug, label, cluster, featured)
  alumni.yaml

research/<slug>/            # Per-paper directory
  index.html                #   built from paper.hbs — generated, gitignored
  paper.pdf                 #   compiled PDF — local + R2, gitignored
  paper-content.json        #   full-paper HTML (latexml-lab, or arXiv's), committed
  assets/                   #   figures for the HTML view — local + R2, gitignored
  # latex/ is transient (gitignored). Real source is a tar.gz on R2.

tags/<slug>/index.html      # Generated from tag.hbs (gitignored)
people/<slug>/index.html    # Generated from person.hbs (gitignored)

assets/
  images/papers/            # Paper hero/card — local + R2, gitignored
  images/people/            # Headshots — local + R2, gitignored
  images/home/              # Landing-page imagery — local + R2, gitignored
  images/thumbnails/        # 256x256 crops — local + R2, gitignored
  images/background/        # Hero bg — local + R2, gitignored
  images/favicons/          # Same-origin (committed; tiny)
  images/logos/             # Same-origin (committed; logo.svg etc.)
  search-index.json         # Built by generate_search_index.js (gitignored)

build/                      # All build scripts (Node, no bundler)
  build_pages.js            #   Top-level driver — runs templater.js per template
  templater.js              #   Handlebars renderer; iterates papers/people/tags
  paper_add.js              #   One command per paper: image, source, PDF + HTML
  paper_build.js            #   PDF + HTML from the R2 tarball via latexml-lab
  arxiv_source.js           #   Download + clean an arXiv e-print
  tr_reserve.js, tr_publish.js  # Technical reports on Zenodo (PI only)
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
- `css/lab-tokens.css`, `css/lab-components.css`, `css/lab-wash.js` — the
  lab's shared design tokens, component rules, and hero-wash painter.
  Linked live by forecast.agenticlearning.ai (`LAB_THEME_BASE` there
  defaults to `https://agenticlearning.ai/css`); proposed for
  outerloop.science and for this site's own pages. Same rule: never
  delete or rename without checking referrers, and keep token names
  stable — downstream sites style against them.
- `css/lab-mkdocs.css` — the MkDocs Material look shared by the lab's docs
  sites (lab wiki, jepa-agent, egolearn, chronology, forecasting-agent),
  which link it after `lab-tokens.css`. A change here restyles all of
  them at once; check one of them in its preview before merging.
- `/areas/<slug>/` is retired (replaced by `/tags/<slug>/`); `_redirects`
  301s the old URLs. A local `areas/` directory is stale build output
  from before the retirement and is gitignored.
- Generated HTML files (`research/*/index.html`, `people/*/index.html`,
  `tags/*/index.html`, root `index.html`, `contact/index.html`) are
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
5. `build:compress` — resize arXiv-downloaded images to ≤1400px wide.
6. **`sync:r2`** — upload any new files (PNGs, WebPs, PDFs, CSVs,
   per-project CSS, videos, etc.) to R2 and update `assets-manifest.json`.
   Must precede the next two steps so they see the fresh manifest.
   Manifest entries for files NOT on local disk are PRESERVED (a missing
   file usually means partial-hydrate from R2, not deletion) — the
   summary reports them as orphans. To deliberately drop orphans:
   `node build/sync_to_r2.js --prune` (after `npm run pull:r2` to make
   sure you're not pruning something you forgot to hydrate).
7. `build:rewrite-paper-content` — rewrite `./assets/X` in each
   `paper-content.json` to absolute CDN URLs via the manifest.
8. `build:pages` — render every `*.hbs` via Handlebars. The `cdnUrl`
   helper reads `assets-manifest.json` and bakes
   `https://cdn.agenticlearning.ai/...` URLs into the HTML.
9. `build:assemble` — copy the slim set of serving artifacts into
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
  tags/index.html, tags/<slug>/index.html × N
  contact/index.html, includes/lab-header.html, ...
  assets/images/favicons/* + logos/* + search-index.json
  <project-slug>/index.html × N                     # project pages
```

Every other URL the rendered HTML references lives on
`cdn.agenticlearning.ai/<hash>/<file>` (R2-served). The mapping
is `assets-manifest.json` (~1245 entries, committed to git).

### CI workflows

- **Cloudflare Pages** (configured in CF dashboard, no workflow
  file). Auto-deploys `main` to production (`agenticlearning.ai`)
  and every other branch to a preview
  (`<branch>.agentic-learning-ai-lab-github-io.pages.dev`). Build command:
  `npm run build:cf`. Output: `out`. No LFS pull.
- `.github/workflows/pr-checks.yml` — runs on PRs to `main`.
  Slim build + lints (~1 min, no secrets); see [CI checks](#ci-checks).
  Its `build-and-lint` job is the required check in `main`'s ruleset.
- `.github/workflows/review.yml` — Outerloop advisory review (codex,
  `gpt-5.6-terra`) on PR open/reopen; comments only, never blocks.
  Re-run with the `outerloop:review` label. Needs the
  `OPENAI_REVIEWER_KEY` repo secret.

## LaTeX source and PDFs

Each full paper has one cleaned LaTeX `tar.gz` on R2. Its HTML
(`paper-content.json`, in git) and its `paper.pdf` (R2 only) are both
built from that tarball in one
[latexml-lab](https://github.com/agentic-learning-ai-lab/latexml-lab)
GitHub Action run, dispatched by `npm run paper:build -- <slug>`
(`paper:add` calls it). Nothing compiles LaTeX locally.

```
git:    research/<slug>/paper-content.json  (records latex_tarball + pdf_sha256)
        assets-manifest.json                (/research/<slug>/paper.pdf, /latex.tar.gz)
R2:     <hash>/<slug>-<year>.pdf            (compiled in CI)
        <hash>/<slug>.tar.gz                (cleaned source)
local:  research/<slug>/paper.pdf, latex.tar.gz, latex/   (gitignored, transient)
        .cache/                             (safe to rm -rf)
```

- **Compile:** `pdf.sh` in latexml-lab runs `latexmk` on a pinned TeX
  Live (`texlive/texlive:TL2025-historic` by digest) with no network, no
  `latexmkrc` and TeX's restricted shell escape, then qpdf. The same
  tarball gives the same bytes. Engine: the lab template
  (`agenticlearning-xelatex` → XeLaTeX, `-lualatex` → LuaLaTeX,
  `-pdflatex` refused), then arXiv's `00README.json`, a
  `%!TEX program = …` comment, fontspec-style packages, else pdfLaTeX.
  A failed compile fails the run and prints the log tail.
- **Provenance:** check 11 fails when the manifest's tarball is not the
  one `paper-content.json` was built from, or the manifest PDF's hash is
  not the recorded `pdf_sha256`. Exceptions: `pdf_override:` in
  papers.yaml, and a published Zenodo report, whose PDF is frozen
  (`build/pdf_lock.js`) and checked against Zenodo by
  `check_zenodo_pdfs.js`.
- **Author scripts:** `latex:fetch <slug>` (R2 → `research/<slug>/latex/`
  for editing), `latex:pack <slug> <zip|dir>` and `latex:update <slug>`
  (arXiv) publish a new tarball with R2 creds; follow either with
  `paper:build`. `paper:add` does all of it without R2 creds.

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

## Code review and audit checklist (before merging to main)

Run through this list before opening or merging a PR to `main`:

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
| 02 | webp-companions | A PNG/JPG in the manifest (under a `<picture>`-wrapped path) without a `.webp` sibling. | `--no-verify` |
| 03 | yaml-valid | `data/*.yaml` files that don't parse cleanly. | `--no-verify` |
| 04 | permalink-unique | Duplicate `permalink:` within papers.yaml / people.yaml. | `--no-verify` |
| 05 | no-secrets | Staged diff lines matching credential patterns (R2 keys, GH PATs, OpenAI/Anthropic keys, AWS access keys). Repo is public — must rotate any leaked token immediately. | `--no-verify` |
| 06 | large-files | **Warns** (not blocks) when adding > 1 MB files to git. Binaries belong on R2. | n/a |
| 07 | bibtex-lint | papers.yaml `journal:` field's venue acronym not present in MD bibtex (`build/lint_bibtex.js`). | `--no-verify` |
| 08 | required-fields | papers.yaml / people.yaml entries missing required fields. | `--no-verify` |
| 09 | bibliography | `enable_full_paper` papers whose paper-content.json has an empty bibliography, over-long bibitem tags, or missing-citation spans. | `--no-verify` |
| 10 | tag-slugs | A paper `tags:` slug not in `data/tags.yaml` (`build/lint_tags.js`). | `--no-verify` |
| 11 | paper-build | An `enable_full_paper` paper with a LaTeX tarball on R2 whose paper-content.json is arXiv's, or was converted from a different tarball (`build/check_paper_build.js`). | `--no-verify` |

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

PRs to `main` run `.github/workflows/pr-checks.yml`:

1. `npm run build:cf` (slim render — same path CF Pages uses)
2. `npm run lint:bibtex` (also pre-commit check 07)
3. `npm run lint:tags` (also pre-commit check 10)
4. `node build/check_manifest_consistency.js` (HEADs every
   `cdn.agenticlearning.ai/...` URL baked into rendered HTML; fails
   if any 404 — catches sync:r2 misses + stale manifest entries)
5. `node build/check_webp_companions.js` (also pre-commit check 02)
6. `node build/check_bibliography.js` (also pre-commit check 09)
7. `node build/check_paper_build.js` (also pre-commit check 11)

All run in the one `build-and-lint` job, the required check in
`main`'s ruleset (which also requires one approving review).
`review.yml` (Outerloop advisory review) is not a required check.

## Things to never do

- **Don't push to `main` directly.** Open a PR from a feature branch.
- **Don't bypass hooks** (`--no-verify`, `--no-gpg-sign`, etc.) unless
  the user explicitly asks.
- **Don't delete `download_arxiv_source.js`** — it's a useful standalone
  utility; its core also lives in `arxiv_source.js`, but the CLI
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

One command does everything after the YAML entry, with or without R2
credentials (CONTRIBUTING.md, "Adding a new paper"):

1. Add the entry to `data/papers.yaml`. Use an existing entry as a
   template. Required (enforced by pre-commit check 08): `title`,
   `authors`, `permalink`, `date`, `journal`, `tags` (slugs from
   `data/tags.yaml`), `abstract`, `short_abstract`. Optional: `arxiv`, `pdf`, `webpage`,
   `enable_full_paper`, `project_page`, `is_recent`, `image`, and for a lab
   technical report `report_number` + `doi` (see
   [Lab technical reports](#lab-technical-reports)).
2. Optionally drop the hero image at the `image:` path, normally
   `assets/images/papers/<slug>.png` (gitignored; local disk + R2).
3. On a feature branch, run `npm run paper:add -- <slug>`, adding
   `<source.zip|dir>` for a full paper that is not on arXiv. It needs
   `gh auth login` (and Python 3 for a full paper). It:
   - makes the hero image's thumbnail and WebP copies and uploads them
     (`npm run upload`: pre-signed URLs from a GitHub Action, manifest
     commit back to the branch);
   - with `enable_full_paper: true`, cleans and uploads the source (from
     the zip, or the `arxiv:` e-print), then `paper:build` has latexml-lab
     compile `paper.pdf` and convert the HTML from that one tarball, and
     uploads the PDF and figures. Every PDF is compiled in CI; there is
     no PDF argument;
   - stages `data/papers.yaml` (+ `research/<slug>/paper-content.json`).

   The site uses the paper's lab-template version, also after
   acceptance; a venue style is only for the venue's camera-ready. When
   the arXiv source is in a venue style, ask for the lab-template zip
   instead of building from arXiv.

   The full paper is built on the first run and again only with a new
   zip or `arxiv` (a new arXiv version), so a rerun just to add the hero
   image later is cheap. Check 11 fails while the HTML or PDF is stale. The pieces are also scripts: `latex:pack`, `latex:update`,
   `paper:build`, `upload`.

   **PDF override (rare, PI approval only).** A paper that cannot compile
   on the pinned TeX Live gets `pdf_override: '<reason>'` in papers.yaml;
   put its PDF at `research/<slug>/paper.pdf` and `npm run upload`.
   `paper:build` then leaves the PDF alone and check 11 skips it.
4. Commit and push; check the PR's Cloudflare preview. `npm run build`
   and `npm run preview` give the same page locally.
5. Walk the audit checklist above. Commit only text: `data/papers.yaml`,
   any `data/projects/<slug>.md`, `research/<slug>/paper-content.json`,
   and the manifest commits `upload` made.

## Lab technical reports

A paper with no arXiv ID and no venue can get a lab report number
(`AGL-TR-<year>-<nn>`, numbered in order within a year) and a Zenodo DOI,
so it can be cited and Google Scholar indexes it. A paper already on arXiv
or at a venue does not get one: a second DOI splits its citations. The PI
issues numbers and publishes the Zenodo record; the token is the PI's own,
never a repo secret.

Two PI-only scripts do the Zenodo side. They read `ZENODO_TOKEN` from
`.env` (gitignored); the DOIs are minted under the token owner's account.

1. The author opens a **Technical report request** issue
   (`.github/ISSUE_TEMPLATE/technical-report.yml`).
2. `npm run tr:reserve -- <issue>` takes the next number (from
   papers.yaml and the account's Zenodo uploads, drafts included, so two
   reservations cannot collide), creates a Zenodo draft with a reserved
   DOI, and comments on the issue with the page-1 footnote and the
   `journal` / `report_number` / `doi` lines.
3. The author pastes them, runs `paper:add` with the source and opens the
   PR. CI compiles the PDF.
4. `gh pr checkout <pr> && npm run tr:publish -- <slug>` copies title,
   authors, abstract and date from papers.yaml to the draft, uploads the
   CI-built PDF from the manifest, shows the record and publishes only
   when the PI types `publish` (a DOI is permanent). It then adds the
   record to the lab community (the deposit API ignores
   `metadata.communities`, so it requests inclusion and accepts it) and
   re-runs the PR checks.
5. Merge once `check_zenodo_pdfs.js` passes: the site PDF and Zenodo's
   file are the same bytes.
6. If the paper later appears on arXiv, add the arXiv ID to the Zenodo
   record as a related identifier (`isIdenticalTo`) and `arxiv:` to
   papers.yaml. Keep the report number and DOI.

A published report's PDF is frozen (`build/pdf_lock.js`): `paper:build`
keeps it, check 11 skips it, and the Zenodo check guards it. To correct
it, publish a new version: `npm run tr:revise -- <slug>` drafts the new
Zenodo version and writes its reserved DOI to `doi:` (the report number
stays), which unfreezes the PDF; then update the footnote, `paper:add`
with the new source, and `tr:publish` as above. Version 1 stays on Zenodo,
and the record's concept DOI resolves to the latest version.

The paper page renders `citation_technical_report_number`,
`citation_technical_report_institution` and `citation_doi` from these
fields.

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
