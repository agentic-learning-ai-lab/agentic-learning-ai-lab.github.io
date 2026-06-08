# Agentic Learning AI Lab Website

Source for [agenticlearning.ai](https://agenticlearning.ai).

## Branches

- **`dev`** — development branch. Make changes here.
- **`main`** — production branch. Push/merge to main auto-deploys to Cloudflare Pages.

## Prerequisites

- Node.js 20+
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
4. **build:arxiv** — download arXiv HTML papers and images (skips existing)
5. **build:compress** — resize oversized images to max 1400px width
6. **build:pages** — render HTML pages from Handlebars templates

### Build PDFs from LaTeX source

```bash
npm run build:arxiv:pdf        # compile PDFs (reproducible) + compress via qpdf
```

### Force rebuild

```bash
npm run build:arxiv:force      # re-download all arXiv HTML and images
npm run build:compress:force   # re-compress all images
```

## Adding a new paper

1. Add the paper entry to `data/papers.yaml` with `arxiv`, `permalink`, and optionally `enable_full_paper: true`
2. Drop a paper image at `assets/images/papers/<slug>.png` (locally; gitignored)
3. Run `npm run build` — this generates thumbnails, syncs new assets to R2, and renders pages
4. Optionally run `npm run build:arxiv:pdf` to compile a local PDF
5. Commit and push to `dev`, then merge to `main` to deploy

Binary assets are not committed to git — they live on R2 (mirror via `npm run sync:r2`, recorded in `assets-manifest.json`). Only the manifest entry is committed.

## Deployment

Cloudflare Pages auto-deploys both `dev` (preview at `dev.agentic-learning-ai-lab-github-io.pages.dev`) and `main` (production at `agenticlearning.ai`). Build command: `npm run build:cf`. No CI workflow files in this repo; CF Pages reads the build settings from its dashboard.

For local preview:

```bash
npm run preview        # runs the full local build + serves out/ on :8000
```

## Project structure

```
build/                     # Build scripts
  build_arxiv_papers.js    #   Download arXiv HTML, compile PDFs, compress
  build_pages.js           #   Handlebars template renderer
  compress_assets.js       #   Image compression (sharp)
  generate_thumbnails.js   #   Thumbnail generation
  generate_search_index.js #   Search index builder
  sync_to_r2.js            #   Upload new binary assets to R2
  pull_from_r2.js          #   Hydrate local binaries from R2 (fresh clone)
data/                      # YAML data files (papers, people, research areas)
  projects/                # Per-paper project page markdown
research/                  # Per-paper directories (paper HTML + extracted content)
assets/                    # Site-wide images, CSS, favicons (binaries gitignored)
assets-manifest.json       # Logical-path → cdn.agenticlearning.ai URL map
css/                       # Tailwind source and build output
includes/                  # Handlebars partials
.github/workflows/
  pr-checks.yml            # Per-PR slim build + bibtex lint
```
