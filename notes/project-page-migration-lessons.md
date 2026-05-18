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
spans, custom slide content for a carousel, one-off layouts), drop a
`style.css` at `assets/projects/<slug>/style.css`. `templater.js`
detects it by filesystem presence (see the `projectCssPath` check in
the `project.hbs` branch) and emits a `<link rel="stylesheet">` in
the project page head. No flag needed in the MD frontmatter.

**Class-name convention**: scope project-specific rules under a
short slug-derived prefix on the carousel/section root, e.g.
`.lm-carousel` for lifelong-memory or `.model-llama3` for
llm-verification. Keeps multi-project CSS conflict-free if the same
project page is ever inlined elsewhere.

**What lives where**:
- `css/index.css` — anything used by ≥2 project pages or that's
  part of the general project-page chrome (carousel widget,
  blockquote callouts, h3 sub-section styling, font inheritance).
- `assets/projects/<slug>/style.css` — slide-content styling,
  one-off color palettes, project-specific layout adjustments.

**Promotion rule**: when a second project adopts a pattern from
some per-project `style.css`, promote it to `css/index.css` so the
two projects don't drift. The carousel chrome was promoted this
way after `lifelong-memory` shipped (originally lived in
`assets/projects/lifelong-memory/style.css`).

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

## Lessons from the `lifelong-memory` migration (added 2026-05-18)

That page was the first one with significant *interactive* content
(8-clip video gallery + 11 videos total). Confronting it surfaced
several patterns worth writing down.

### Carousel libraries silently failed; vanilla JS works

Tried Swiper (traditional API), Swiper element (web component), and
bulma-carousel in succession. All three loaded their bundle scripts
and ran their init code, but rendered an empty or broken carousel
in our setup. The likely culprit is Tailwind's preflight reset
(`* { box-sizing: border-box }`, `video { max-width: 100% }`, and
the `* { margin: 0 }` family) fighting each library's slide-width
calculations. We didn't isolate the exact rule.

The fix that worked: a ~50-line vanilla JS carousel that doesn't
calculate slide widths at all — it just toggles `.is-active` on the
target `<div class="item">` and hides the others with
`display: none`. Lives inline in `project.hbs`, gated on
`carousel: true` in the MD frontmatter. The init injects prev/next
buttons and pagination dots after the items.

If a future migration needs a polished carousel with swipe gestures
+ transition animations, debug the library conflict properly rather
than chaining yet another framework on top. The vanilla version is
the floor; everything else builds up.

### Video gallery: pause/play behavior

Pattern that ended up working for `lifelong-memory`'s gallery:

- `<video autoplay muted loop playsinline width="600">` — no
  `controls` attribute (full-screen, volume, timeline UI is too
  heavy for a thumb-scroll demo).
- `IntersectionObserver` with `threshold: 0.25` — only the active
  slide's video plays, and only while the carousel is ≥25% visible.
  Pauses when the user scrolls away.
- `cursor: pointer` + click handler on each `<video>` toggles
  play/pause. Lightest possible "do-something" affordance.
- Track manual pause via `data-user-paused` attribute on the video.
  When IntersectionObserver fires `playActive()`, it skips videos
  with the flag. Cleared on slide navigation (prev/next/dot click)
  so a new slide gets a fresh autoplay chance.

### markdown-it terminates HTML blocks on blank lines

Spent a build cycle on this: a `<swiper-container>` with blank
lines between `<swiper-slide>` children rendered as empty slides
(content stripped). CommonMark's type-6 / type-7 HTML block ends
at the first blank line — markdown-it follows that. Keep
multi-block HTML embeds (carousels, tables, custom containers) as
one contiguous run of non-blank lines.

### Optical centering of carousel chevron buttons

A button positioned at `top: 50%; transform: translateY(-50%)`
centers against the *container*. But:

- The carousel container has `padding-bottom` reserved for the
  pagination dots (~3rem).
- Each slide has a video plus a caption `<p>` below it.

Both pull the container's geometric midpoint south of where the
*video* element sits. To center the button against the video,
compensate via the `top` calc:

```css
.project-carousel-prev,
.project-carousel-next {
    top: calc(50% - 3.4rem);
    transform: translateY(-50%);
}
```

The 3.4rem ≈ half of (caption_height + caption_margin +
pagination_padding). A static offset is a compromise — slides with
notably longer/shorter captions will drift. For pixel-perfect
centering on every slide, measure with JS after each slide change.

### SVG icons beat icon-fonts for centering

Bootstrap Icons (icon-font) sit on a font baseline that's
unpredictable to optically center inside a circular button. Inline
SVG with explicit `viewBox` has a predictable bounding box — pin
it inside the button with flex centering, and add a `translateY(1px)`
hack if the path's geometric center reads slightly high to the eye
(chevrons typically do).

### Carousel responsive math

When the carousel has chevron buttons inside horizontal padding,
the math to avoid squeezing the video:

```
container_max_width >= video_max_width + 2 * (padding_horizontal)
```

For a 600px video with 6rem (96px) padding each side, the carousel
needs `max-width >= 792px`. Otherwise the video shrinks below its
intended max-width on wide viewports. On narrow viewports
(`@media (max-width: 640px)`) shrink the padding to 3rem + button
size to 36px so the video has room to breathe.

### Per-project CSS scope

`assets/projects/<slug>/style.css` is the right home for visual
rules that won't generalize (Llama3/Qwen color spans on
`llm-verification`, the `lm-carousel` slide content styles on
`lifelong-memory`). The shared `.project-carousel*` chrome
currently lives in the per-project CSS too — promote to
`css/index.css` once a second project adopts the carousel pattern.

The carousel *script* itself is general infrastructure (one
implementation for any project that opts in via `carousel: true`),
so it lives in `project.hbs`, not per-project.

## Mobile / iOS video gotchas (added 2026-05-19)

After shipping the `lifelong-memory` carousel, the user reported on
real iOS Safari: controls visible, black frame, duration stuck at
0:00, tapping play did nothing. Spent ~12 commits chasing the wrong
hypotheses before `ffprobe` revealed the smoking gun. Three real
issues, in roughly the order they bite:

### 1. Codec: VP9 is not supported by iOS Safari `<video>`

The single biggest lesson. The 8 gallery clips in `lifelong-memory`
were VP9-encoded MP4 files. iOS Safari `<video>` decodes H.264 (AVC),
H.265 (HEVC, iOS 11+), and AV1 (iOS 17+ on supported hardware) —
**not VP9**, which is Google/WebM's codec. The video element accepts
the file and renders the controls bar, but the decoder bails silently
and the playback never starts. The symptom is exactly what we saw:
0:00 duration, no first frame, no tap-play response.

The other inline videos on the page (`stageone.mp4`, `stagethree.mp4`,
`lifelongmemory_full.mp4`) were H.264, which is why they played fine
and made the asymmetry confusing.

**Always run before uploading any video:**

```bash
ffprobe -v error -select_streams v -show_entries stream=codec_name \
        -of csv=p=0 path/to/video.mp4
```

If the output is `vp9`, `av01`, or anything other than `h264`,
re-encode to H.264 with:

```bash
ffmpeg -i in.mp4 \
       -c:v libx264 -preset medium -crf 23 \
       -profile:v high -level 4.0 -pix_fmt yuv420p \
       -movflags +faststart \
       -c:a aac -b:a 128k -ac 2 \
       out.mp4
```

`-profile:v high -level 4.0 -pix_fmt yuv420p` is the safe iOS combo.
CRF 23 is roughly visually lossless at the bitrates these clips use.

### 2. Faststart: `moov` atom must be at the front

MP4 container has a metadata index ("moov atom") that ffmpeg by
default writes at the **end** of the file. Mobile browsers then have
to download the entire file before they know duration / codec /
keyframes — and over cellular they often give up first, leaving the
player at 0:00 indefinitely.

`ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` is a fast
lossless re-mux that moves the moov atom to the front. The
re-encode command above already includes `+faststart`. Verify with:

```bash
xxd file.mp4 | head -5 | grep -E 'moov|mdat'
```

`moov` should appear before `mdat` in the output.

### 3. CSS `aspect-ratio` on `<video>` inside `transform`-composited parent

Reviewer-agent-found, iOS-specific. When a `<video>` has its layout
box reserved by CSS `aspect-ratio` (instead of by intrinsic
dimensions from the video file), and its ancestor uses `transform:
translateX(...)` (which the carousel track does for slide animation),
iOS Safari composites the video onto a separate GPU layer but never
attaches the video texture to it. Native controls remain interactive
above the empty layer; the frame stays black.

Don't combine `aspect-ratio` + `<video>` + a `transform`-ed ancestor.
Either:
- let the video size itself from intrinsic dimensions (drop
  `aspect-ratio`, accept a small layout shift on metadata-load), or
- use `margin-left: -N%` instead of `transform: translateX(-N%)` for
  the carousel's slide animation (less smooth on mobile but no GPU
  layer).

The first option is what `lifelong-memory`'s style.css does — see
the comment block in `.lm-carousel video`.

### Pre-flight checklist for any project page with video

Before `npm run sync:r2` on a new migration's MP4s:

```bash
# Confirm codec is H.264 on every video
for f in assets/projects/<slug>/*.mp4; do
  printf '%-30s %s\n' "$f" "$(ffprobe -v error \
    -select_streams v -show_entries stream=codec_name \
    -of default=noprint_wrappers=1:nokey=1 "$f")"
done

# Confirm faststart on every video
for f in assets/projects/<slug>/*.mp4; do
  xxd "$f" | head -5 | grep -q moov && echo "$f: OK" || echo "$f: MISSING faststart"
done
```

Both should print `h264` and `OK` for every file. If not, re-encode
before continuing.

## Vanilla carousel widget

The `lifelong-memory` page introduced a small generic carousel for
any project that needs to show multiple videos / images in a
swipe-through format. Behavior:

- Author opts in with `carousel: true` in MD frontmatter.
- Inline HTML in the MD body: `<div class="project-carousel">` with
  child `<div class="item">` slides (no further wrapping required).
  Per-project CSS adds a class like `.lm-carousel` for slide-content
  styling.
- The init JS in `project.hbs` (gated on `project_page.carousel`)
  injects a track wrapper around the items, prev/next chevron
  buttons (Bootstrap inline SVG), pagination dots, touch-swipe
  handler, IntersectionObserver-driven autoplay of the active
  video (with `data-user-paused` flag preserving manual pauses
  across scroll-in/out), and a positionButtons routine that pins
  the chevrons to the active video's vertical center.
- On viewports below 768px the chevron buttons hide and touch-swipe
  takes over. Pagination dots remain as a progress indicator.

If a second project adopts the carousel, the shared chrome rules
(currently in the per-project style.css) should be promoted to
`css/index.css` and the project-specific styles (slide content,
e.g. `.lm-carousel video` sizing) stay per-project.

## Remaining queue

As of 2026-05-19, the migrated projects are `anticipatory-recovery`,
`llm-verification`, `midway-network`, and `lifelong-memory`. Still to
do (from the per-project repo list):

- `procreate-diffusion`
- `daily-oracle`
- `memory-storyboard`
- `college`
- `icc`
- `context-tuning`
- `arq`
- `temporal-straightening`

Order them by complexity if you want — anything with custom widgets
(carousel, video, interactive demo) is harder than a straight Bulma
template page.
