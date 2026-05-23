# Video + figure caption — cleanup PR plan

## Problem

The markdown image renderer in `build/project_page_loader.js` only
recognizes `<img>`. When an author wants a video with a caption on a
project page, they fall back to raw HTML:

```html
<figure class="tw-text-center tw-my-10">
  <video autoplay muted loop playsinline ...>
    <source src="/assets/projects/<slug>/foo.mp4" type="video/mp4">
  </video>
  <figcaption class="tw-text-base tw-text-[var(--fg-muted)] tw-mt-4 tw-italic ...">
    Caption text here.
  </figcaption>
</figure>
```

This is repeated across `data/projects/midway-network.md`,
`poodle.md`, `temporal-straightening.md` (the carousel slides are a
separate pattern; this is about non-carousel video figures).

Three downsides:
- **Verbose** — 6 lines of HTML for one captioned video.
- **Easy to drift** — every site-wide token change (figcaption color
  during the dark-mode PR was the example) requires hand-editing each
  raw block. Two MD files were missed in the first sweep and the
  fix only landed after the user flagged it.
- **Inconsistent** — image figures use markdown-native syntax with
  the renderer wrapping them in `<figure><picture><img><figcaption>`.
  Video figures sit outside that path, so any future change to the
  figure wrapper (rounded corners, captions, white-canvas bg, sizing,
  responsive rules) has to be applied twice.

## Proposed solution

Extend the custom image renderer in `project_page_loader.js` to
recognize video URLs by file extension and emit a `<video>`-based
figure instead of an `<img>`-based one.

Markdown syntax — reuse the existing image syntax. The renderer
detects the extension:

```md
![Caption text](foo.mp4)            ← becomes a <video> + <figcaption>
![Caption text](foo.png)            ← unchanged, <img> + <figcaption>
![](foo.mp4)                        ← bare video (no caption)
```

`title` attribute could carry optional player flags
(`![caption](foo.mp4 "autoplay,controls")` → `<video autoplay controls>`).
Default behavior — `autoplay muted loop playsinline` — matches the
existing raw-HTML pattern on the live pages.

## Implementation sketch

In `project_page_loader.js`'s custom image renderer (around line
115-148, just after the `[alt](url){width=N}` parsing):

```js
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
if (VIDEO_EXT.test(src)) {
    let html = `<figure class="tw-text-center tw-my-10">`;
    const inner = `<div class="tw-mx-auto"${widthAttr}>`;
    // Optional flags from title attr; default to autoplay+loop.
    const flags = parseVideoFlags(token.attrGet('title'))
        || 'autoplay muted loop playsinline preload="metadata"';
    html += `${inner}<video ${flags} style="..."><source src="${cdnUrl(src)}" type="${mimeFor(src)}"></video>`;
    if (altEsc) html += `<figcaption class="tw-text-base tw-text-[var(--fg-muted)] tw-mt-4 tw-italic ...">${altEsc}</figcaption>`;
    html += `</div></figure>`;
    return html;
}
```

The `cdnUrl(src)` lookup, the figure-wrapper class list, and the
figcaption class list all match the existing `<img>` codepath so the
output is visually identical to the current raw HTML.

## What this also unlocks

- A single follow-up pass that updates the figcaption class string
  in `project_page_loader.js` automatically themes every project
  page's captions — no more hand-editing per-file raw HTML.
- The white-canvas bg rule
  (`.project-page-main figure img { background-color: #ffffff }`)
  could extend to videos uniformly if needed: `figure video` selector
  in the same place.
- The cap-aspect-ratio + responsive width handling can be applied in
  one rule for both images and videos.

## Scope guardrails

- **Carousel slides stay raw HTML.** The `<div class="item">` markup
  is per-project and structured (caption + video + extras); shoehorning
  it into MD image syntax would lose flexibility. Leave as-is.
- **Hero videos** (none currently exist, but project_page.hero is
  defined as an image field) are out of scope.
- **No new MD directives or remark plugins.** Stay within markdown-it's
  default image-token shape; ext-detection in the renderer is sufficient.

## Migration

After the renderer ships:
- `data/projects/midway-network.md` line 51-56: replace raw video
  HTML with `![Caption](bdd-semseg.mp4)` (one line).
- `data/projects/poodle.md` lines 52-59: replace the
  `semseg-comparison.mp4` raw HTML with `![Comparison...](semseg-comparison.mp4)`.
- `data/projects/temporal-straightening.md`: check for raw video
  figures outside the carousel section.

Migration is purely additive — old raw HTML keeps rendering as written.
Authors can convert one file at a time.

## When to do this

Independent of the dark-mode toggle PR. Could land before or after.
Either way it's a contained, ~1-day change.
