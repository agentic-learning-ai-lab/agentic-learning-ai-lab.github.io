# Agentic Learning AI Lab Website

Source for [agenticlearning.ai](https://agenticlearning.ai).

## Branches

- **`dev`** — development branch. Make changes here.
- **`main`** — production branch. Push/merge to main triggers CI deployment to GitHub Pages.

## Prerequisites

- Node.js 20+
- [Git LFS](https://git-lfs.com/) (PDFs and paper images are stored via LFS)
- macOS (build scripts use `sips` for image processing)
- [Ghostscript](https://www.ghostscript.com/) (`brew install ghostscript`) for PDF compression

## Setup

```bash
git lfs install
git clone git@github.com:agentic-learning-ai-lab/agentic-learning-ai-lab.github.io.git
cd agentic-learning-ai-lab.github.io
npm install
```

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
npm run build:arxiv:pdf        # compile PDFs + compress via Ghostscript
```

### Force rebuild

```bash
npm run build:arxiv:force      # re-download all arXiv HTML and images
npm run build:compress:force   # re-compress all images
```

## Adding a new paper

1. Add the paper entry to `data/papers.yaml` with `arxiv`, `permalink`, and optionally `enable_full_paper: true`
2. Add a paper image to `assets/images/papers/`
3. Run `npm run build` — this downloads the HTML, images, generates thumbnails, and builds pages
4. Optionally run `npm run build:arxiv:pdf` to compile a local PDF
5. Commit and push to `dev`, then merge to `main` to deploy

Large files (PDFs, paper images) are automatically tracked by Git LFS via `.gitattributes`.

## Deployment

Deployment is automated via GitHub Actions. Pushing to `main` triggers the workflow:

1. Checks out the repo with LFS
2. Runs `npm run build`
3. Deploys to GitHub Pages via `actions/deploy-pages`

For manual deployment or local staging:

```bash
./deploy.sh staging    # build to staging/site/ for local testing
cd staging/site && python3 -m http.server 8000
```

## Project structure

```
build/                     # Build scripts
  build_arxiv_papers.js    #   Download arXiv HTML, compile PDFs, compress
  build_pages.js           #   Handlebars template renderer
  compress_assets.js       #   Image compression (sips)
  generate_thumbnails.js   #   Thumbnail generation
  generate_search_index.js #   Search index builder
data/                      # YAML data files (papers, people, research areas)
research/                  # Per-paper directories (HTML, assets, PDFs)
assets/                    # Site-wide images, CSS, favicons
css/                       # Tailwind source and build output
includes/                  # Handlebars templates
.github/workflows/         # CI/CD (GitHub Actions)
```
