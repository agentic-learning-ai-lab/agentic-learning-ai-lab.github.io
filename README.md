# Agentic Learning AI Lab Website

Source for [agenticlearning.ai](https://agenticlearning.ai).

## Branches

- **`main`** — production branch. Merging a PR to main auto-deploys to Cloudflare Pages.
- Work on a feature branch and open a PR to `main`; every branch gets a Cloudflare preview URL.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- The GitHub CLI, logged in (`gh auth login`): uploads and paper builds run as GitHub Actions
- Python 3, for adding a full paper (`paper:add` sets up its comment stripper on first use)

No LaTeX, Docker or R2 credentials are needed. Paper PDFs and full-paper
HTML are built in CI by [latexml-lab](https://github.com/agentic-learning-ai-lab/latexml-lab).
Binary assets (paper PDFs, hero images, figures) live on Cloudflare R2, not in git.

## Setup

```bash
git clone git@github.com:agentic-learning-ai-lab/agentic-learning-ai-lab.github.io.git
cd agentic-learning-ai-lab.github.io
npm install
npm run pull:r2        # optional, for full local builds: hydrate binaries from R2 (~700 MB)
```

## For contributors

If you're a student or collaborator adding a paper, project page, or person,
start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) — it walks through the
end-to-end workflow with copy-pasteable examples for figures, carousels,
videos, and the `npm run upload` step that publishes binary assets.

For agent-oriented detail (pipeline internals, code review checklist,
public-repo secrets policy, paper-onboarding flow), see [`CLAUDE.md`](./CLAUDE.md).
Internal planning docs live under `notes/`.

## Development

Start Tailwind in watch mode:

```bash
npm run start:tailwind
```

Tailwind classes are prefixed with `tw-` to differentiate from other classes.

## Build

Full build pipeline:

```bash
npm run build
```

This runs the following steps in order:

1. **build:tailwind** — compile and minify TailwindCSS
2. **generate_thumbnails** — create 256x256 paper/people thumbnails (sharp)
3. **build:webp** — WebP copies of every PNG/JPG
4. **generate_search_index** — build searchable JSON index
5. **build:compress** — resize oversized images to max 1400px width
6. **sync:r2** — upload new binaries to R2 and update `assets-manifest.json` (needs R2 credentials)
7. **build:pages** — render HTML pages from Handlebars templates

Paper PDFs and full-paper HTML are built in CI from each paper's LaTeX
source (`npm run paper:add`; see CONTRIBUTING.md), not by `npm run build`.

## Adding a new paper

Add the entry to `data/papers.yaml`, then on a branch:

```bash
npm run paper:add -- <slug>                 # on arXiv, or a card only
npm run paper:add -- <slug> <source.zip>    # full paper from any other LaTeX source
```

It uploads the hero image and, with `enable_full_paper: true`, has CI
compile the PDF and build the full-paper page from the source.
[`CONTRIBUTING.md`](./CONTRIBUTING.md#adding-a-new-paper) has the details,
including lab technical reports (report numbers and DOIs).

## Deployment

Cloudflare Pages auto-deploys `main` to production (`agenticlearning.ai`) and every other branch to a preview at `<branch>.agentic-learning-ai-lab-github-io.pages.dev`. Build command: `npm run build:cf`; CF Pages reads the build settings from its dashboard. PR checks run in `.github/workflows/pr-checks.yml`.

For local preview:

```bash
npm run preview        # runs the full local build + serves out/ on :8000
```

## Project structure

```
build/                     # Build scripts
  paper_add.js             #   One command to add a paper (image, PDF, HTML)
  paper_build.js           #   PDF + HTML from LaTeX source via latexml-lab
  tr_reserve.js            #   Technical report: number + Zenodo DOI (PI only)
  tr_publish.js            #   Technical report: publish the DOI (PI only)
  build_pages.js           #   Handlebars template renderer
  compress_assets.js       #   Image compression (sharp)
  generate_thumbnails.js   #   Thumbnail generation
  generate_search_index.js #   Search index builder
  sync_to_r2.js            #   Upload new binary assets to R2
  pull_from_r2.js          #   Hydrate local binaries from R2 (fresh clone)
data/                      # YAML data files (papers, people, topic tags)
  projects/                # Per-paper project page markdown
research/                  # Per-paper directories (paper HTML + extracted content)
assets/                    # Site-wide images, CSS, favicons (binaries gitignored)
assets-manifest.json       # Logical-path → cdn.agenticlearning.ai URL map
css/                       # Tailwind source and build output
templates/                 # Handlebars partials
includes/                  # HTML fragments other lab sites include
.github/workflows/
  pr-checks.yml            # Per-PR slim build and checks (manifest, PDFs, Zenodo, bibliography)
```
