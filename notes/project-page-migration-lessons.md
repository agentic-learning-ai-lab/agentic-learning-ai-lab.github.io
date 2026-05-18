# Project page migration — lessons learned

Captured 2026-05-17/18 after migrating two pilots
(`anticipatory-recovery`, `llm-verification`). The plumbing is in
place; the remaining ~10 projects are mostly content work. This doc
is the cheat-sheet for someone (or a future Claude) picking the
next one off the queue.

For canonical workflow see `CLAUDE.md` → "Adding a new paper" + the
shape of `data/projects/anticipatory-recovery.md` and
`data/projects/llm-verification.md`.

## How a migration goes, in order

1. **Clone the legacy `website` branch** of the per-project repo into
   `/tmp/<slug>-website` to inventory what's there:

   ```bash
   gh repo clone agentic-learning-ai-lab/<slug> /tmp/<slug>-website -- --branch website --depth 1
   ```

   Skim the `index.html`. Note: section titles (h2s), inline math,
   special widgets (carousels, videos, model-family colored spans,
   takeaway callout boxes), figure paths, author URLs, and whether
   any authors are starred for equal contribution.

2. **Copy figures** into `assets/projects/<slug>/`. The `.gitattributes`
   LFS rule already covers `assets/projects/**/*.{png,jpg,jpeg,gif,mp4,pdf}`.

3. **Author the MD** at `data/projects/<slug>.md`:
   - Frontmatter: `affiliations`, `links`, `bibtex`, `mathjax: true`
     iff there's math.
   - Body: H2-delimited sections with markdown. Images use
     `![Caption text or empty](filename.png){width=NNN}` — width emits
     `style="max-width: NNNpx;"`, empty alt → no `<figcaption>`.

4. **Flip the YAML flag**: add `project_page: true` to the paper's
   entry in `data/papers.yaml`. Nothing else there.

5. **(Optional) Per-project CSS** at `assets/projects/<slug>/style.css`
   for badges/widgets that don't belong in `css/index.css`. Auto-linked
   when present (see "Per-project CSS by convention" below).

6. **`npm run build:webp`** to generate WebP siblings, then
   **`npm run build:pages && npm run build:assemble`** to render.

7. **`npm run preview`** and walk the page. Watch for the gotchas below.

8. **`npm run sync:r2`** (when ready) to upload the new figures + write
   manifest entries. Until then the page works fine — `<source>` tags
   fall back to the local sibling path served from origin.

## Gotchas, with the fix already in the codebase

### markdown-it eats LaTeX inside `$$…$$`

`_{` and `}_` in `\underbrace{...}_{\substack{...}}` trip markdown-it's
emphasis rule, mangling the LaTeX before MathJax ever sees it. We stash
all `$...$` and `$$...$$` blocks as HTML-comment sentinels in
`build/project_page_loader.js`, render, then restore. If you write math
and it renders as plain text or with mangled subscripts, this is why —
make sure the stash regex still matches your delimiter style.

Also: MathJax 3's default delimiters are `\( \)` / `\[ \]`, but
markdown-it eats `\(` as a backslash-escape for `(`. We configure
MathJax in `project.hbs` to also recognize `$ $` / `$$ $$`, and
that's what authors should use in MD.

### Tailwind preflight beats inherited fonts

`p { font-family: Space Mono, ... }` is in the Tailwind preflight at
element specificity, so it wins over `.project-prose`'s inherited
serif. markdown-it emits `<p>` with no class, so body paragraphs
silently render in mono unless you force `font-family: inherit`. The
rule `.project-prose p { font-family: inherit }` in `css/index.css`
handles this; same trick is applied defensively to blockquote
descendants. If you add a new MD-emitted element type (e.g. `<dl>`,
`<table>`) and it renders mono, this is the cause.

### Libertinus vs Iowan x-height

The HTML reader at `/research/<slug>/` uses Iowan Old Style; the
project page uses Libertinus Serif (to match the lab's LaTeX papers).
At identical em sizes Libertinus reads visually smaller because of a
lower x-height. We bumped the project page body to `1.1875rem` with
`line-height: 1.566` so the absolute line gap matches the reader:
`1.0625 × 1.75 = 1.1875 × 1.566 ≈ 1.86rem`. Don't tweak these
independently — keep the product constant if you adjust either.

### Mono inline badges read oversized

`<span class="model-qwen3">` and friends use `ui-monospace`, and mono
em-squares render visually larger than the surrounding serif body
even at the same nominal em. The per-project style.css pulls them down
to `0.92em`. If you add another monospace-family inline span, use the
same compensation.

### Authors: spell out, peopleMap wins

Always write each `affiliations:` entry as a full object:

```yaml
affiliations:
  - { name: 'Jack Lu',     aff: 'New York University' }
  - { name: 'External X',  aff: 'Some University', url: 'https://...' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
```

Don't use `null` sentinels — they're opaque and can't express joint
appointments like `aff: ['NYU', 'Google']`.

The helper routes the link in this order:

1. **peopleMap lookup on the display name first** — if the author is
   in `data/people.yaml`, the link goes to `/people/<slug>/` even if
   you also wrote a personal `url:`. Keeps lab traffic on lab pages.
2. `aff.url` — for external collaborators not in `people.yaml`.
3. Plain text — fallback.

So you can leave `url:` set on a personal homepage for someone who's
in `people.yaml`; it'll just be ignored. No harm.

### Equal contribution

Add `equal: true` to each co-first-author's affiliations entry. The
helper renders an asterisk superscript after the name and emits a
`* Equal contribution` footnote line under the affiliations row.

### Single-affiliation byline

When every author shares the same institution, the byline drops the
`¹` superscripts entirely and the affiliations line shows just the
institution name. No action needed — `buildProjectAffMap` detects
`orderedAffs.length === 1` and short-circuits. Multi-aff papers
(joint appointments, multiple institutions) get the numbered
superscripts back automatically.

### "Takeaway" callout boxes

Markdown blockquotes (`> …`) — the CSS in `.project-prose blockquote`
dresses them as gray-bg + lab-blue (`#3b82f6`) left accent. Use them
for the key finding of each section. **Don't** roll your own
`<div class="takeaway">` inline HTML — the blockquote rule already
covers it.

### Project-specific styling — per-project CSS by convention

If a project needs styles that don't generalize (color-coded inline
spans, custom widget chrome), drop a `style.css` at
`assets/projects/<slug>/style.css`. `templater.js` detects it by
filesystem presence and emits a `<link rel="stylesheet">` in the
project page head. No flag needed in the MD frontmatter.

Reserve `css/index.css` for rules that benefit every project page
(sub-section H3 styling, blockquote callout, font inheritance, etc.).

### Dividers between sections — three selectors

`.project-section + .project-section` covers between two MD sections.
`.project-prose + .project-section` covers the BibTeX section (it's a
sibling of the prose wrapper, not inside it). `.project-prose >
.project-section:first-child` covers the divider between the abstract
and the first MD section. All three share one rule. If you reshape the
DOM, remember to handle all three positions.

### MD images: `<p><figure></p>` unwrap

markdown-it wraps standalone image lines in `<p>...</p>`, which
produces invalid `<p><figure>...</figure></p>` (figure is block-level).
We post-process with a regex unwrap in `loadOne`. If you start
generating other block-level elements (tables, divs) from custom
renderers, you may need to extend the unwrap.

### WebP fallback when sync:r2 hasn't run

`build/project_page_loader.js` checks the manifest for both PNG and
WebP CDN URLs. If the manifest is empty (typical for fresh pages
before `npm run sync:r2`), it falls back to:

- PNG → relative path (browser serves from origin)
- WebP → relative path **only if the `.webp` file exists on disk**

So `npm run build:webp` is the gate. CF Pages staging serves both PNG
and WebP from origin until you run `sync:r2`. The cdnUrl helper prints
a `⚠️ cdnUrl lookup fell back to local` warning naming the missed
paths — useful for the sync:r2 punch list.

### Title / OG tags

`templates/head.hbs` now reads:

```hbs
<title>{{#if title}}{{{title}}} | Agentic Learning AI Lab{{else}}Agentic Learning AI Lab{{/if}}</title>
<meta name="description" content="{{#if short_abstract}}{{{short_abstract}}}{{/if}}" />
```

So the `<title>` tag and `<meta name="description">` are paper-specific
on project pages (from the papers.yaml `title` + `short_abstract`).
Open Graph tags are set separately in `project.hbs` for the social
preview cards (og:title appends `| Agentic Learning AI Lab` already).

### arXiv icon, not paper icon

Use `<i class="ai ai-arxiv"></i>` (Academicons font, loaded in
`project.hbs`'s head). Don't fall back to `bi-file-earmark-text` from
Bootstrap Icons — it reads as a generic "document" and confuses the
button with the PDF one.

### PDF button prefers self-hosted

`templater.js` (project.hbs branch) resolves the PDF link to
`research/<slug>/paper.pdf` via CDN when the local file exists. Falls
back to the top-level `pdf:` field in `papers.yaml` (usually the
arXiv URL) only when there's no local copy. Don't override in the MD
unless you have a specific reason.

### Read-tool null-byte trap

If `npm run build:pages` produces silently broken output and `Edit`
mysteriously can't match a string in a build script, suspect null
bytes. The harness's Read tool renders `\x00` as a regular space, so
the file *looks* correct but isn't. Confirm with Python:

```python
with open('path/to/file') as f:
    src = f.read()
print('\x00' in src)
```

Then fix via Python `.replace('\x00…', '…')` rather than the Edit tool.

## What's pending after a migration

1. **`npm run sync:r2`** — populate manifest with CDN URLs for the
   new figures (currently served from origin). Run when you've
   batched up several migrations to avoid one tarball per project.
2. **Spot-check the page in staging** at
   `dev.agentic-learning-ai-lab-github-io.pages.dev/<slug>/`.
3. **PR `dev` → `main`** when a batch is ready. Don't merge one
   project at a time; bundle.

## Remaining queue

As of 2026-05-18, the migrated projects are
`anticipatory-recovery` and `llm-verification`. Still to do (from
the per-project repo list):

- `lifelong-memory`
- `procreate-diffusion`
- `daily-oracle`
- `memory-storyboard`
- `college`
- `icc`
- `context-tuning`
- `midway-network`
- `arq`
- `temporal-straightening`

Order them by complexity if you want — anything with custom widgets
(carousel, video, interactive demo) is harder than a straight Bulma
template page.
