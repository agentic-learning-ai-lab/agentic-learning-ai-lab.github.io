# Agentic Learning AI Lab Website

Source for [agenticlearning.ai](https://agenticlearning.ai).

## Branches

- **`main`** — production branch. Merging a PR to main auto-deploys to Cloudflare Pages.
- Work on a feature branch and open a PR to `main`; every branch gets a Cloudflare preview URL.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- [qpdf](https://qpdf.sourceforge.io/) for PDF compression + deterministic finalization (optional locally; `brew install qpdf` on macOS)

Image processing uses [sharp](https://sharp.pixelplumbing.com/) (cross-platform, installed via npm). Binary assets (paper PDFs, hero images, figures) live on Cloudflare R2 — not in git.

## Setup

```bash
git clone git@github.com:agentic-learning-ai-lab/agentic-learning-ai-lab.github.io.git
cd agentic-learning-ai-lab.github.io
npm install
npm run setup:python   # one-time: creates .venv/ with arxiv_latex_cleaner
npm run pull:r2        # hydrate binary assets from R2 (no creds needed)
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
2. **generate_thumbnails** — create 256x256 paper/people thumbnails via `sips`
3. **generate_search_index** — build searchable JSON index
4. **build:compress** — resize oversized images to max 1400px width
5. **sync:r2** — upload new binaries to R2 and update `assets-manifest.json`
6. **build:pages** — render HTML pages from Handlebars templates

Paper PDFs and full-paper HTML are built in CI from each paper's LaTeX
source (`npm run paper:add`; see CONTRIBUTING.md), not by `npm run build`.

## Adding a new paper

[`CONTRIBUTING.md`](./CONTRIBUTING.md#adding-a-new-paper) walks through it,
including the full paper view, built from the arXiv source or from LaTeX
source alone. Binaries live on R2, not in git: commit `data/papers.yaml`,
`research/<slug>/paper-content.json` and the `assets-manifest.json` entries.

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
includes/                  # Handlebars partials
.github/workflows/
  pr-checks.yml            # Per-PR slim build + bibtex lint
```
