# LaTeX storage redesign — tar.gz on R2

Decision: LaTeX source lives as one tar.gz per paper on Cloudflare R2.
No `.tex` / `.bib` / figures in git. `paper.pdf` stays committed via LFS as
the build artifact (so CI continues to be cache-only and fast).

## Why

- Authoring happens in Overleaf / local LaTeX editors. The repo isn't the
  edit surface, so PR-diff and `git blame` on `.tex` are mostly
  theoretical wins.
- Figure binaries are the bulk of `latex/` weight (~120 MB for 20 papers).
  Keeping them out of LFS preserves LFS quota for site assets.
- "Compile once, cache aggressively" matches the existing outer-skip
  semantics — moving the source to R2 doesn't change CI behavior at all
  in the common case (paper.pdf present → skip).

## Storage layout

```
git:
  research/<slug>/paper.pdf          # LFS, the compiled artifact
  assets-manifest.json               # records /research/<slug>/latex.tar.gz → CDN URL

R2 (cdn.agenticlearning.ai):
  <hash>/<slug>.tar.gz               # cleaned source, content-addressed
  <hash>/<slug>.pdf                  # paper PDF (existing)
  <hash>/<various>.{png,jpg,...}     # site assets (existing)

local (gitignored):
  research/<slug>/latex/             # transient extract, present only during editing
  .cache/latex-tarballs/<hash>.tar.gz  # build-side download cache
  .cache/latex-build/<slug>/         # compile workdir
```

## Build pipeline (compile path)

`npm run build:arxiv:pdf` per paper:

1. **Outer skip — paper.pdf exists.** Same as today. CI hits this 99% of
   the time. No network, no compile.
2. **Inner resolve — paper.pdf missing.** Resolve source in this order:
   - If `research/<slug>/latex/` already extracted locally → use it (author
     is mid-edit; skip download).
   - Else if `assets-manifest.json` has `/research/<slug>/latex.tar.gz` →
     download from R2 (cache in `.cache/latex-tarballs/`), extract to
     `.cache/latex-build/<slug>/`.
   - Else if `paper.arxiv` is set → tell the author to run
     `npm run latex:update <slug>` (bootstrap from arxiv into R2). Don't
     auto-bootstrap during a build — bootstrapping needs R2 write creds,
     and silent uploads from a `build` invocation are surprising.
   - Else → self-hosted draft with no source yet. Author drops a tree and
     runs `npm run latex:pack <slug>`.
3. **Compile.** latexmk (under `SOURCE_DATE_EPOCH` from the tarball's
   R2 `Last-Modified`) → bibtex → qpdf `--deterministic-id` finalize.
   Output: `research/<slug>/paper.pdf` — byte-identical across re-compiles
   for the same tarball.

## Author workflows

### A. New paper from arXiv

```bash
# papers.yaml entry with paper.arxiv: <id>
npm run latex:update <slug>   # fetch from arxiv → clean → tar → upload to R2 → manifest entry
npm run build:arxiv:pdf       # downloads tar.gz from R2, extracts, compiles paper.pdf
# commit: paper.pdf + assets-manifest.json
```

### B. New paper, not on arXiv (position paper / draft)

```bash
# Author drops research/<slug>/latex/ tree by hand
npm run latex:pack <slug>     # clean → tar → upload → manifest entry → optionally clear local tree
npm run build:arxiv:pdf       # compiles
# commit: paper.pdf + assets-manifest.json
```

### C. ArXiv updated (re-fetch)

```bash
npm run latex:update <slug>   # refetch from arxiv, replaces R2 tarball + manifest
rm research/<slug>/paper.pdf  # invalidate compiled cache
npm run build:arxiv:pdf       # recompile
# commit: paper.pdf + assets-manifest.json
```

### D. Local edit (typo fix etc.)

```bash
npm run latex:fetch <slug>    # download tar.gz from R2, extract to research/<slug>/latex/
# author edits
npm run latex:pack <slug>     # re-clean, re-tar, re-upload, replace manifest entry
rm research/<slug>/paper.pdf  # invalidate
npm run build:arxiv:pdf       # recompile
# commit: paper.pdf + assets-manifest.json
```

## Scripts (package.json)

```
latex:fetch  <slug>   # R2 → local extract (for editing)
latex:pack   <slug>   # local tree → clean → tar → upload → manifest
latex:update <slug>   # arxiv → clean → tar → upload → manifest (subsumes today's "bootstrap")
latex:clean  <slug>   # already exists — runs arxiv_latex_cleaner only
build:arxiv:pdf       # already exists — gains R2 download branch in step 2
```

Drop `latex:bootstrap` — its job splits between `latex:update` (when
fetching from arxiv) and `latex:pack` (when working from a local tree).

## CI behavior

Unchanged in the common case. `paper.pdf` exists in git → no R2 read, no
compile. If a future CI run ever needs to recompile (paper.pdf removed, or
`--force` invoked), it downloads tar.gz from the public CDN URL — no R2
write creds needed for that path. Only `latex:pack` / `latex:update` need
write creds, and those run locally.

## Defense-in-depth: comment leakage

Today CI greps committed `.tex` for uncleaned author comments. New model:
no `.tex` in git, so that grep moves to two places:

1. **`latex:pack`** runs `arxiv_latex_cleaner` immediately before tar.
   That's the actual privacy boundary.
2. **CI verification** (optional): on push, sample N tarballs from R2,
   extract, grep. Probably overkill — the local cleaner is the
   guarantee. Skip unless we see a regression.

## Migration (this PR)

The 20 already-cleaned `research/<slug>/latex/` trees on disk become the
seed data:

1. Build `latex:pack` + `latex:update` + `latex:fetch` scripts.
2. Run `latex:pack` for each of the 20 papers → uploads 20 tarballs to R2
   + 20 manifest entries.
3. `paper.pdf` already exists for each, so no recompile needed.
4. Add `research/**/latex/` and `.cache/` to `.gitignore`.
5. Remove the `research/**/latex/**` rules from `.gitattributes` (no
   longer relevant since latex/ never enters git).
6. Update `build/build_arxiv_papers.js` to add the R2 download branch in
   the resolve step.
7. Update CLAUDE.md: rewrite the "LaTeX source and PDFs" section to
   reflect tarball-on-R2.
8. Delete the local `research/<slug>/latex/` trees after pack succeeds
   (they're gitignored at this point anyway; keep them around only if the
   author is mid-edit).

## Open questions

- **Tarball naming on CDN.** `<hash>/<slug>.tar.gz` (content-addressed,
  consistent with how paper.pdf is rewritten to `<slug>.pdf`). Same flow
  as `cdnBasename()` in `sync_to_r2.js`. ✓
- **Tarball cleanup before tar.** Exclude build aux (`.aux`, `.log`,
  `.out`, `.bbl`, `.blg`, `.fls`, `.fdb_latexmk`, `.synctex.gz`,
  `paper.pdf` inside the tree, `__MACOSX/`). Pack only the canonical
  sources + figure binaries. (Mirror the `.gitattributes` ignore set.)
- **Manifest entry for the tarball.** Logical path
  `/research/<slug>/latex.tar.gz`. No template ever references it
  directly — it's a build-side lookup only. That's fine; the manifest
  was already a build artifact.
