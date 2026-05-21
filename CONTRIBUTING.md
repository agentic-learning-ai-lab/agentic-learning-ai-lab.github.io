# Contributing to the lab website

You're reading this because you have a paper to add, a project page to
publish, or a typo to fix. This guide walks through each case.

Questions: ping Mengye on Slack.

## One-time setup

```bash
git clone git@github.com:agentic-learning-ai-lab/agentic-learning-ai-lab.github.io.git
cd agentic-learning-ai-lab.github.io
npm install              # also installs the git hooks (husky)
gh auth login            # one-time GitHub auth for the upload flow
npm run pull:r2          # downloads ~700 MB of binaries from R2 (paper figures,
                         # hero images, headshots). Idempotent; safe to re-run.
```

You're set up if `npm run preview` builds and serves on `http://localhost:8000`.

### Why binaries aren't in git

The repo only tracks **text** (HTML, YAML, MD, JS, CSS). Every binary asset
(paper PDFs, hero images, project figures, hero videos, headshots) lives on
Cloudflare R2 — `cdn.agenticlearning.ai`. `assets-manifest.json` maps logical
paths to their CDN URLs.

Fresh clones don't have binaries on disk. `npm run pull:r2` hydrates them.

## Branch workflow

Work on a feature branch off `main`.

```bash
git checkout main
git pull
git checkout -b add-<your-paper-slug>     # name it after what you're doing
git push -u origin add-<your-paper-slug>  # push before npm run upload —
                                          # the register Action checks out
                                          # from origin to commit manifest back
```

Open a PR to `main` when done. Mengye reviews and merges.

## Preview your changes

Two ways to see the rendered site before merging:

**Local** — fastest iteration loop:

```bash
npm run preview        # runs the full local build + serves out/ on
                       # http://localhost:8000
```

This is the same `out/` bundle Cloudflare Pages serves in production,
just rendered with local binaries instead of CDN URLs. Re-run after
each round of edits.

**Cloudflare Pages preview** — what reviewers actually see:

Every push to a feature branch triggers a Cloudflare Pages preview
build. The `cloudflare-workers-and-pages[bot]` drops a sticky comment
on your PR with the build status and the Branch Preview URL — just
click it. The preview goes live within ~30–60s of each push and the
bot updates its own comment in place.

If you ever need to construct the URL by hand, it follows the branch
name:

```
https://<your-branch-name>.agentic-learning-ai-lab-github-io.pages.dev/
```

GitHub emails the PR author when the CF Pages status check transitions
to green, so you don't have to refresh the PR.

## Adding a new paper

A paper appears on the site in three possible forms — pick whichever the
contribution needs:

| Form | Where it shows up | What you need to provide |
|---|---|---|
| **Paper card** (default) | The `/research/` listing page | `data/papers.yaml` entry (hero image optional — can be added later, see below) |
| **+ embedded paper view** | A `/research/<slug>/` page rendering the arXiv HTML inline | Above + `enable_full_paper: true` + `arxiv:` set, then `npm run latex:update <slug>` (auto-fetches arXiv source, cleans, uploads, compiles PDF — see below) |
| **+ marketing project page** | A custom `/<slug>/` page with images, videos, custom CSS | Above + `project_page: true` + `data/projects/<slug>.md` |

The `image:` field is optional. Omit it to publish without a card
image and add it later — drop the file at
`assets/images/papers/<slug>.png`, add the `image:` line in
papers.yaml, `npm run upload`, commit.

For collaborative image selection: open the PR with `image:` left out,
and Mengye (or whoever you'd like input from) can push their preferred
hero image directly to your feature branch. GitHub allows repo
collaborators to push to a same-repo PR's branch by default, so no
extra setup needed — you keep iterating on the branch, the image
commit just lands alongside your text changes.

### Step 1 — Add the YAML entry

Open `data/papers.yaml` and add an entry. The pre-commit hook enforces a
required-field set; missing fields will block your commit. Use an existing
entry as a template.

```yaml
- title: 'Your Paper Title Here'
  authors:
    - First Author
    - Mengye Ren
  short_abstract: One-sentence pitch shown on the card.
  abstract: 'Full abstract paragraph, single-line for YAML cleanliness.'
  arxiv: 'https://arxiv.org/abs/XXXX.XXXXX'
  pdf: 'https://arxiv.org/pdf/XXXX.XXXXX'
  permalink: your-slug                 # forever; URL becomes /research/your-slug/
  image: /assets/images/papers/your_slug.png
  date: 2026-05-19T00:00:00.000Z       # ISO 8601
  journal: 'The Nth International Conference on Foo (FOO 2026)'
  research_areas:
    - adaptive-agents-and-foundation-models    # must match data/research_areas.yaml
  is_recent: true                       # show in "Recent" section
  enable_full_paper: true               # optional: enables /research/<slug>/ HTML view
  project_page: true                    # optional: enables /<slug>/ project page
```

**Permalink rules**: kebab-case, unique across all papers, permanent.
Changing it breaks every inbound link (arXiv abstracts, tweets, slide decks).

### Step 2 — Drop the hero image

Put it at `assets/images/papers/<slug>.png` (the path you set in `image:`).
PNG or JPG; ideally < 2 MB.

The file is gitignored — it lives on local disk + R2, not in git.

### Step 3 — Commit (the hook will block you)

```bash
git add data/papers.yaml
git commit -m "Add Your Paper Title"
```

The pre-commit hook stops you:

```
⛔ asset-manifest: binary assets not on R2:
   + assets/images/papers/your_slug.png   (new, not in manifest)
   → run `npm run upload` to mirror to R2 + update manifest
```

R2 is the source of truth for binaries; the hook catches "forgot to
upload before committing".

### Step 4 — Upload the binary to R2

```bash
npm run upload
```

Behind the scenes:

1. Scans your working tree for binaries not in `assets-manifest.json`.
2. Triggers a GitHub Action (you don't need R2 credentials locally — the
   Action has them) to mint a 10-minute pre-signed PUT URL.
3. `curl`s your file up to R2.
4. Triggers a second Action to write the `assets-manifest.json` entry and
   commit it back to your branch.

Takes 1-2 minutes end-to-end (most of it is GitHub Actions startup).

### Step 5 — Pull, commit, push

```bash
git pull                                       # gets the manifest update
git add data/papers.yaml
git commit -m "Add Your Paper Title"           # now passes
git push
```

Open a PR to `main`. Done.

### (Optional) Step 6 — Enable the embedded paper view

If you set `enable_full_paper: true` in `papers.yaml`, the paper gets
a `/research/<slug>/` page that renders the arXiv HTML version inline
(figures, equations, references — everything in the published HTML).
The build also compiles `paper.pdf` from the LaTeX source.

To bootstrap:

```bash
npm run latex:update <slug>
```

What this does, in order:

1. Downloads the LaTeX source tarball from `https://arxiv.org/e-print/<arxiv-id>`
   (using the `arxiv:` field from your papers.yaml entry).
2. Runs [`arxiv_latex_cleaner`](https://github.com/google-research/arxiv-latex-cleaner)
   to strip author comments / TODOs / commented-out figures. The cleaned
   tarball goes to a public R2 bucket.
3. Tars + uploads to R2 (content-addressed, so re-runs are no-ops if
   source unchanged).
4. Writes the manifest entry `/research/<slug>/latex.tar.gz` → CDN URL.
5. Invalidates any stale `research/<slug>/paper.pdf` so it rebuilds.

Then:

```bash
npm run build:arxiv:pdf       # compiles paper.pdf from the R2 tarball
                              # (cached in .cache/, so subsequent runs reuse)
```

When the paper is updated on arXiv (v2, v3, etc.), re-run
`npm run latex:update <slug>` to pick up the new source. Manifest gets
updated; PDF gets recompiled.

**Not on arXiv?** Drop the LaTeX source at `research/<slug>/latex/`
locally (gitignored), then run `npm run latex:pack <slug>` — same
effect (clean, tar, upload, manifest), except the local `latex/` tree
gets auto-deleted after upload (it lives transiently on disk and
canonically on R2).

You'll need a local LaTeX install (`tlmgr install latexmk` if you got a
warning about missing latexmk on macOS). CI installs TeXLive
automatically for the build:arxiv:pdf step.

## Adding a project page

Use this when a paper deserves a marketing-style page with figures, math,
videos, etc. — beyond just a card on the research list.

### Step 1 — Set `project_page: true` in `papers.yaml`

Already covered above — add the flag to your paper's entry.

### Step 2 — Write `data/projects/<slug>.md`

Use any existing `data/projects/<slug>.md` as a starter
(e.g., poodle.md for a clean baseline, daily-oracle.md for one with
interactive widgets). The frontmatter:

```yaml
---
mathjax: true                      # optional: enables LaTeX rendering ($...$, $$...$$)
carousel: true                     # optional: enables the .project-carousel widget
affiliations:
  - { name: 'Author One',  aff: 'New York University' }
  - { name: 'Author Two',  aff: 'Other University', url: 'https://author.example/' }
  - { name: 'Author Three', aff: 'New York University', equal: true }
  - { name: 'Mengye Ren',  aff: 'New York University', equal: true }
equal_label: 'Equal advising'      # optional: footnote label when authors have equal:true
links:
  code: https://github.com/agentic-learning-ai-lab/your-repo
  poster: /assets/projects/<slug>/<venue><year>-poster-<slug>.pdf  # optional, see Embedded PDFs
bibtex: |
  @inproceedings{...
    ...
  }
---

## Section Heading {data-toc="Short TOC label"}

Markdown body. Images go through the renderer that fetches them from R2:

![Caption text becomes the figcaption.](my_figure.png){width=800}

Inline math: $f(x) = \int g(x) dx$. Display math:

$$
\mathcal{L} = \sum_i \log p(y_i | x_i)
$$

Bullet lists, **bold**, *italic*, [links](https://...), inline `<video>` and
`<iframe>` tags — all work.
```

The author names you list under `affiliations:` get auto-linked to their
`/people/<slug>/` page if they match a `data/people.yaml` entry exactly
(case + punctuation). External authors with a `url:` get that URL instead.

### Step 3 — Drop project assets

Put images / videos / per-page CSS at `assets/projects/<slug>/`:

```
assets/projects/<slug>/
  figure1.png        # gitignored; uploaded to R2 via npm run upload
  hero_video.mp4     # must be H.264 + faststart for iOS compatibility
  style.css          # per-page CSS, auto-linked if present (tracked in git)
```

Reference them in MD as just the filename (no path):

```markdown
![Method overview.](method.png){width=900}
```

The renderer rewrites `method.png` → `https://cdn.agenticlearning.ai/<hash>/method.png`.

### Step 4 — Same upload + commit dance

```bash
npm run upload
git pull
git add data/papers.yaml data/projects/<slug>.md
git commit -m "Add project page for Your Paper"
git push
```

`npm run preview` locally shows you the rendered page at `http://localhost:8000/<slug>/`.

## Working with media on a project page

### Figures (single image)

Markdown image syntax with an optional width attribute. The **alt text
becomes the caption** (academic convention — the alt IS the caption).

```markdown
![Overview of the method. Encoder maps frames to latents; predictor
forecasts the next latent.](method.png){width=900}
```

What happens at build time:
- `method.png` is read from your local `assets/projects/<slug>/`.
- The renderer emits `<figure><picture><source srcset="…webp"><img src="…png"></picture><figcaption>…</figcaption></figure>` with CDN URLs.
- A lossless WebP companion gets auto-generated by `build:webp`.
- The caption sits inside the same wrapper, so its width tracks the
  image (long captions wrap left-aligned at the image's edge; short
  ones center).

**Width**: omit `{width=…}` to fill the column (capped at ~832px).
Set a smaller value (e.g. `{width=400}`) only when you want the figure
narrower than the column.

**File size**: aim for < 500 KB per figure. Your own contributions
aren't auto-compressed — downsample large PNGs before dropping them in.
(arXiv-imported figures get capped at ≤ 1400px by `build:compress`.)

### Side-by-side / grid layouts

Markdown doesn't natively do grids. Use HTML + per-page CSS:

In the MD body:
```html
<div class="my-paired-row">
  <figure><img src="/assets/projects/<slug>/left.png" alt="Left">
    <figcaption>Left caption.</figcaption></figure>
  <figure><img src="/assets/projects/<slug>/right.png" alt="Right">
    <figcaption>Right caption.</figcaption></figure>
</div>
```

In `assets/projects/<slug>/style.css` (gitignored auto-uploaded to R2;
linked automatically if the file is present):
```css
.my-paired-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin: 1.5rem 0;
}
@media (max-width: 640px) {
    .my-paired-row { grid-template-columns: 1fr; }
}
.my-paired-row figure { margin: 0; text-align: center; }
.my-paired-row img { max-width: 100%; height: auto; border-radius: 4px; }
```

Look at `assets/projects/temporal-straightening/style.css` for a worked
example (`.ts-heatmap-grid`, `.ts-quad-grid`) — 4-column grids that
collapse to 2-col on tablets and 1-col on phones.

### Carousel (image slideshow)

Set `carousel: true` in your MD frontmatter to load the shared widget,
then write:

```html
<div class="project-carousel">
  <div class="item">
    <img src="/assets/projects/<slug>/slide1.png" alt="Slide 1">
    <p class="caption">First slide caption.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/<slug>/slide2.png" alt="Slide 2">
    <p class="caption">Second slide caption.</p>
  </div>
  <!-- as many as you want -->
</div>
```

You can add a second class for project-scoped styling
(e.g. `<div class="project-carousel ts-pca-carousel">` lets you target
`.ts-pca-carousel img { width: 700px; }` in your per-page CSS).

The widget is vanilla JS — no framework. Nav arrows + dots auto-generated.

### Videos

Inline `<video>` in the MD body. Encoding matters — iOS Safari only
plays H.264 + faststart-encoded MP4 inline. The canonical recipe (full
detail in `notes/project-page-migration-lessons.md`):

```bash
# Check the source codec first
ffprobe -v error -select_streams v -show_entries stream=codec_name \
        -of csv=p=0 source.mp4

# If output is anything other than h264, re-encode:
ffmpeg -i source.mp4 \
       -c:v libx264 -preset medium -crf 23 \
       -profile:v high -level 4.0 -pix_fmt yuv420p \
       -movflags +faststart \
       -c:a aac -b:a 128k -ac 2 \
       output.mp4
```

(`-profile:v high -level 4.0 -pix_fmt yuv420p` keeps it iOS-safe;
`+faststart` moves metadata to the front so playback can start before
the whole file downloads.)

Filename convention:

- **Inline animated figure** (short clip illustrating a result): name
  after the content — `egg.mp4`, `bdd-semseg.mp4`, `wall.mp4`. Pattern
  visible across `lifelong-memory/`, `temporal-straightening/`,
  `midway-network/`.
- **Presentation / talk video** (one per project): just `<slug>.mp4`
  — e.g. `procreate.mp4` at `assets/projects/procreate/procreate.mp4`.
  If a project ever ends up with more than one talk, fall back to
  `<slug>-<venue><year>.mp4` to disambiguate.

Drop the file in `assets/projects/<slug>/` and reference. For an
animated figure:

```html
<figure>
  <video autoplay muted loop playsinline preload="metadata"
         style="max-width: 800px; width: 100%; height: auto; margin: 0 auto;">
    <source src="/assets/projects/<slug>/<content-name>.mp4" type="video/mp4">
  </video>
  <figcaption>Caption goes here.</figcaption>
</figure>
```

`autoplay muted loop playsinline` is the "video as animated figure"
pattern. For a presentation video, swap to `controls preload="metadata"`
and drop the loop/autoplay (the viewer presses play once):

```html
<video controls preload="metadata"
       style="max-width: 720px; width: 100%; height: auto; display: block; margin: 1.5rem auto;">
  <source src="/assets/projects/<slug>/<slug>.mp4" type="video/mp4">
</video>
```

One Safari gotcha worth flagging: don't wrap a video in a parent with
`transform:` set and CSS `aspect-ratio:` on the video — Safari renders
0×0. Use fixed `style="max-width: …; height: auto"` on the video
itself. Other lessons in `notes/project-page-migration-lessons.md`.

### Self-hosting vs YouTube embed

Default to self-hosting on R2: no ads, no tracking, no "up next"
thumbnails, no risk of YouTube taking the video down or changing the
embed terms. Re-encode via the H.264 recipe above and drop in
`assets/projects/<slug>/`.

YouTube iframes still work as a fallback — useful when the only
available copy lives on a coauthor's channel and there's no clean way
to re-upload, or when the video is much longer than a project overview
(full conference talks, for example):

```html
<div style="position: relative; padding-bottom: 56.25%; max-width: 720px; height: 0; margin: 1.5rem auto;">
  <iframe src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```

`procreate.md` uses this pattern.

### Embedded PDFs (posters etc.)

Host posters on R2, not Drive / Dropbox. External links break when
files move.

Filename convention: **`<venue><year>-poster-<slug>.pdf`** —
e.g. `iclr2026-poster-arq.pdf`, `neurips2024-poster-anticipatory-recovery.pdf`.
The slug at the end keeps the filename self-describing if it's
downloaded out of context; the venue + year disambiguates if a project
ever has more than one poster (workshop + main, rebrand, etc.).

```bash
# 1. Drop the PDF locally — use the convention above
cp ~/source.pdf assets/projects/<slug>/<venue><year>-poster-<slug>.pdf

# 2. Add to your project MD frontmatter:
#    links:
#      poster: /assets/projects/<slug>/<venue><year>-poster-<slug>.pdf

# 3. npm run upload (same flow as any other binary)
```

The project template renders this as a Poster button in the link bar;
the `cdnUrl` helper rewrites the path to the R2 URL at render time.

External URLs work too — use them when the only available copy of the
poster lives on a coauthor's personal site and there's no clean way to
re-upload.

## Adding a new person

For lab members + alumni. Goes on the `/people/` page and gets linked from
papers they coauthored.

### Step 1 — Add to `data/people.yaml`

```yaml
- name: 'Your Name'
  permalink: your-name              # kebab-case; URL becomes /people/your-name/
  position: 'PhD Student, NYU'
  description: 'One-paragraph bio shown on /people/your-name/.'
  image: /assets/images/people/your_name.jpg
  current: true                     # false for alumni
  webpage: https://your.personal.site/   # optional
  google_scholar: ABCDEFGH                # optional, the user= param from Scholar URL
  github: yourusername                    # optional
```

Required fields are enforced by the pre-commit hook (`name`, `permalink`,
`position`, `description`).

### Step 2 — Drop a headshot

`assets/images/people/<slug>.jpg`. Square crop preferred, ~400×400 minimum.

### Step 3 — Upload + commit

Same as before:

```bash
npm run upload
git pull
git add data/people.yaml
git commit -m "Add Your Name to people"
git push
```

The `build:webp` step auto-generates a WebP companion of your headshot for
faster page loads.

## Smaller contributions (typos, copy fixes)

If you're just editing text:

```bash
git checkout -b fix-<short-description>
# edit the file
git add <files>
git commit -m "Fix typo in ..."
git push -u origin fix-<short-description>
gh pr create --base main
```

No upload step needed. Pre-commit hooks still run (YAML / bibtex validity,
etc.) but won't block text-only edits.

## Pre-commit hooks reference

When you `git commit`, these checks run automatically. If any fails, the
commit aborts with a specific error message and how to fix it.

| Check | What it does |
|---|---|
| asset-manifest | Blocks if a binary in your working tree isn't on R2 yet. Run `npm run upload`. |
| yaml-valid | Blocks if `data/*.yaml` doesn't parse. Read the parser error; usually it's an indent mistake or unclosed quote. |
| permalink-unique | Blocks if two YAML entries share a `permalink:`. |
| no-secrets | Blocks if your staged diff has anything that looks like an API key. Repo is public — leaked tokens must be rotated. |
| large-files | **Warns** on > 1 MB additions. If it's a binary, it should be on R2 not in git. |
| bibtex-lint | Blocks if `data/papers.yaml`'s `journal:` field's venue acronym is missing from the MD bibtex. Catches "got accepted, papers.yaml updated, MD bibtex still says preprint". |
| required-fields | Blocks if a papers.yaml / people.yaml entry is missing a required field. |
| commit-msg | Blocks commit messages containing `[skip ci]` / `[ci skip]` (any spelling). These silently kill production deploys when squash-merged. Use `skip-CI` (hyphen) if you need to reference the concept in prose. |

**Bypass:**
```bash
git commit --no-verify -m "..."
```
CI re-runs the equivalent checks on PR, so a bypass that papers over a
real problem will fail there anyway.

## Troubleshooting

**"Branch is not on origin yet"** when running `npm run upload`
→ You forgot `git push -u origin <branch>` before running upload. Do that first.

**`gh auth status` fails**
→ Run `gh auth login` and follow the prompts. The upload flow uses `gh` to
dispatch GitHub Actions.

**Pre-commit hook didn't run at all**
→ `husky` may not be installed. Run `npm install` again (the `prepare` script
sets up the hooks). Verify with `cat .husky/pre-commit`.

**`npm run upload` fails partway through**
→ Read the error. If the GitHub Action failed, the message says
"mint-upload-urls run failed" or similar. Open the Actions tab on GitHub,
find the run, read the log — usually a missing dep or a typo in a recent
commit.

**Build works locally but Cloudflare Pages preview is broken**
→ Cloudflare Pages runs `npm run build:cf` (a slim build, no LFS or Sharp).
If your change requires a step that's only in the full `npm run build`
(thumbnail generation, PDF compile), it won't run in the cloud build.
Check `notes/cf-migration.md` for the deploy model.

**I accidentally committed a binary to git**
→ `git rm --cached <path>` to unstage it from history, then `npm run upload`
to put it on R2. Don't `git rm` (that'd delete your local file).

## For agent-style detailed reference

If you want the full architectural picture (build pipeline, R2 design, LaTeX
tarball storage, manifest internals), read `CLAUDE.md`. It's written for
agents working autonomously in this repo — more detail than most contributors
need, but useful when something breaks in a surprising way.
