# Deployment redesign — discussion

Written 2026-05-16. **Not a plan, just options.** Compares current state
against `~/code/renmengye.github.io`'s pattern (private VPS + rsync) and
lays out paths forward. Pick one or mix.

## What we have today

- Source: this repo (public, `agentic-learning-ai-lab.github.io`).
- Branches: `dev` (development) → `main` (deploy trigger).
- CI: `.github/workflows/deploy.yml` runs on push to `main`. Checks out
  with LFS, installs Node + TeXLive + Ghostscript, runs `npm run build`,
  uploads `out/` as a GitHub Pages artifact, deploys via
  `actions/deploy-pages@v4`. No long-lived `gh-pages` branch — modern
  Pages artifact flow.
- Asset storage: Git LFS for paper PDFs, paper hero images, arXiv HTML
  download images, and (newly) LaTeX figure binaries.
- Local: `./deploy.sh staging` for offline preview only. **Nothing local
  is in the production deploy path.**

## What the user flagged

1. *"Local compile and deploy script and push"* — the README's
   "production deploy is GitHub Actions" line is current. There is no
   local-deploy step. Possibly remembered from an earlier version.
2. *"Scales poorly with bigger repos — re-downloads the entire git
   including history"* — `actions/checkout@v4` already uses
   `fetch-depth: 1` by default (shallow). The real cost is LFS bandwidth:
   every CI run pulls all LFS objects matched by paths CI touches. Quota
   on free public-org GitHub LFS is 1 GB storage + 1 GB/month bandwidth.
3. *"Main is served, want main = latest-dev view, separate deploy
   branch"* — wants a manual publish gate between "merged to main" and
   "live on the web."

## What `~/code/renmengye.github.io` does differently

- Custom Python + Pandoc build (no Node, no Tailwind).
- Single branch, `master`. No dev/main split — fine for a personal site.
- Deploy is `rsync` over SSH from GitHub Actions to a private VPS at
  `/var/www/mengyeren.com/html`. `actions/secrets.DEPLOY_KEY`,
  `DEPLOY_HOST`, `DEPLOY_USER` carry the credentials. Per-directory
  `rsync --delete` ensures the served tree mirrors the build output
  exactly.
- Ghostscript-compresses PDFs in CI before rsync, same as us.
- Health-check workflow: a daily cron that curls `/health.json` and
  checks cert expiry, disk, nginx. Catches drift.
- Content separation: publications live in a sibling `cv` repo
  consumed via shallow clone in CI (not submodule).

Don't borrow: Python string-`%` templating (brittle); single-branch
direct-to-master (no review); ad-hoc `deploy.sh` invoked manually on the
server.

## Recommendation: three changes, no infrastructure migration

If you want one paragraph: **stay on GitHub Pages for now. Add an LFS
cache to CI. Add a manual-publish branch model. Defer the
move-to-private-VPS until LFS quota becomes a real problem.** Details
below.

### Change 1 — Add a publish gate (dev / main / release)

Current: push to `main` deploys.
Proposed:

- `dev` — active development. PRs target this.
- `main` — "approved for public, but not yet live." Merge from `dev`.
  CI builds and uploads a *preview* artifact, but does **not** deploy.
- `release` — production. Fast-forward from `main` to promote. The Pages
  workflow only deploys when `release` advances.

Implementation:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [release]   # was: [main]
  workflow_dispatch:
```

Plus a **preview-build** workflow that runs on push to `main` (and PRs
into `main`), uploads the artifact, but doesn't call `deploy-pages`.
That lets you click "Run workflow → release" when you want to publish.

Alternative: keep `main` as the deploy branch but require manual
`workflow_dispatch` instead of push-triggered deploys. Simpler; same
effect.

Trade-off: one more merge step per publication. Worth it when there are
multiple contributors who occasionally land changes you want to
*queue* before pushing live.

### Change 2 — Cache LFS objects between CI runs

The LFS cost is the dominant CI bottleneck once the repo grows.
`actions/cache` keyed on a recent set of LFS-tracked file SHAs survives
across runs and reuses the previous LFS object store.

```yaml
- name: Checkout (no LFS pull)
  uses: actions/checkout@v4
  with:
    lfs: false                # we'll pull selectively below

- name: Cache LFS objects
  uses: actions/cache@v4
  with:
    path: .git/lfs
    key: lfs-${{ hashFiles('.gitattributes', 'research/**/paper.pdf') }}
    restore-keys: lfs-

- name: Pull LFS objects
  run: git lfs pull
```

Effect: on a cache hit (no LFS-tracked file changed), the second-step
`git lfs pull` is a no-op — all blobs already on disk. CI cuts to
network-free LFS resolution.

Bonus: also cache `research/**/paper-content.json` and the
`assets/search-index.json` if they're slow to regenerate.

### Change 3 — Drop the broken TeX cache; pin a TeX image (later)

The previous `actions/cache` step for `/usr/share/texlive` was a no-op
because apt-install ran unconditionally on top of it. We removed it.

When CI install time becomes painful (probably soon, given we just
added `texlive-fonts-extra` + xetex + luatex), switch to a Docker base
image with TeXLive preinstalled — e.g. `texlive/texlive:latest` —
running the build inside it. Cuts ~3 minutes from each CI run. The
existing checkout+Node setup can run on the host, and TeX-only steps
run in the container.

## When to revisit (move to private VPS pattern)

Switch to the `mengyeren.com`-style rsync-to-private-server pattern
**when one of these becomes true**:

- LFS bandwidth quota exceeded or approaching: the org pays for data
  packs, or it's worth migrating heavy assets to S3/Cloudflare R2.
- Source needs to be private (drafts of papers, internal review
  comments) but the deployed site stays public.
- A deploy target other than GitHub Pages is needed — custom redirects,
  server-side features, multi-domain hosting.

Until then, GitHub Pages + LFS caching is the lower-overhead choice.

## Asset-storage escape hatch (worth considering separately)

The single largest scaling risk is LFS bandwidth, not git history. One
clean way out, independent of CI/branch model:

- Host `paper.pdf` and large hero images on Cloudflare R2 or S3
  (essentially free at this size).
- Reference them via fully-qualified URLs in `papers.yaml` and
  `assets/`.
- LFS in the repo only for items that *must* be served from the same
  origin (e.g. nothing — we don't need that).

This decouples deploy bandwidth from binary growth entirely. Worth
doing later if the LFS cost ever bites.

## Open questions for the team

1. Do you want preview builds visible to reviewers (artifact link in PR
   comments)? Easy with a separate workflow on PR.
2. Should `release` be a branch or a Git tag? Branch is simpler;
   tag-driven is more conventional for "this is what's live."
3. If we cache LFS, do we accept a `restore-keys` fallback that lands
   slightly stale blobs and corrects with `git lfs pull`? Yes —
   correctness is unaffected because git LFS pull is idempotent.
4. CI is currently public-repo (free runner minutes). If we go private,
   that changes; budget separately.
