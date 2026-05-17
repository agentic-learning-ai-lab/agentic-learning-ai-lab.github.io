# Next up — deferred work queue

Living list of work that's been planned but not done. Pick the next item
when starting a session. Each entry: one-paragraph spec + the file(s) to
touch + a rough effort estimate.

Big-picture history lives in git log and the per-design docs
(`cf-migration.md`, `latex-tarball-storage.md`, `project-pages-migration.md`).

## Queue

### 1. Phase 4e — arxiv HTML inline figures via CDN

The "Full Paper (HTML)" view (when `enable_full_paper: true`) loads
`paper-content.json` and injects its embedded HTML through
`paper-view.js`. That HTML has `<img src="./assets/x1.png">` references
that resolve to `agenticlearning.ai/research/<slug>/assets/x1.png` (local
LFS), not the CDN.

Fix: runtime rewrite the `./assets/<x>` paths to their CDN URLs by
looking up `assets-manifest.json` in the browser. Sketch:

```js
const manifest = await fetch('/assets-manifest.json').then(r => r.json());
function rewriteCdn(html, permalink) {
  return html.replace(
    /src="\.\/assets\/([^"]+)"/g,
    (m, rel) => {
      const url = manifest[`/research/${permalink}/assets/${rel}`];
      return url ? `src="${url}"` : m;
    }
  );
}
```

Touches: `paper-view.js`. ~1 hr including a manual cross-browser check.
Low urgency — feature works fine via LFS today.

### 2. WebP serving for hero / background images

PNG sources stay archival; build emits a `.webp` sibling via sharp;
templates use `<picture>` with PNG fallback. Templates that currently
call `{{cdnUrl image}}` switch to a new helper that emits the
`<picture>` block.

Touches: `build/generate_webp.js` (new), `build/sync_to_r2.js`
(SYNC_PATHS), `build/templater.js` (helper), the `*.hbs` partials that
currently render hero/background images, `package.json` (`build:webp`
script).

Test plan: pick one paper, build end-to-end, verify `<picture>` renders
WebP in modern browsers and falls back to PNG when WebP is disabled in
devtools. Storage cost on R2 is ~80 MB extra at current paper count.

~1–2 hr.

### 3. CI-side `npm run sync:r2`

Now that sync is ~1.2s steady-state, putting it in
`.github/workflows/deploy.yml` is viable. Catches the "author forgot to
run sync" mistake at PR time.

```yaml
- name: Sync new assets to R2
  if: github.event_name != 'pull_request'
  env:
    R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
    R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
    R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
    R2_BUCKET: agenticlearning-assets
    R2_CDN_BASE_URL: https://cdn.agenticlearning.ai
  run: npm run sync:r2
```

Defer until: multiple contributors start adding papers and "forgot to
run sync" becomes a regular review issue.

### 4. LFS-free migration for new content

Today, new assets matching `.gitattributes` patterns get LFS-tracked
*and* synced to R2 (duplicate storage). LFS quota currently ~265 MB / 1
GB free tier; ~3 years runway at the current paper-add cadence.

When ready to migrate fully: untrack the LFS rules for those paths and
add the same paths to `.gitignore` so `git add` doesn't auto-stage
binaries. Author workflow becomes: drop locally → `sync:r2` → commit
only the manifest entry. Note already documented in `cf-migration.md`.

### 5. Project pages

`notes/project-pages-migration.md` is the spec. Self-contained design
doc; read it before touching project pages.

## How to pick the next item

Pick by impact / urgency. Today's ordering (most useful first):

1. **Project pages** (5) — high author-facing value, several papers
   already want this.
2. **WebP** (2) — modest perceived speed win on every page load.
3. **Phase 4e** (1) — narrow scope but only affects HTML-view papers.
4. **CI-side sync** (3) — defer until pain shows up.
5. **LFS-free** (4) — defer until quota pinches.
