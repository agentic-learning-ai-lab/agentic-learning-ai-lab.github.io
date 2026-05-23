# Dark mode + logo redesign

Two coupled but separable problems. Solve the logo first, then the site
toggle. Doing logo last would require redoing the cutover.

## Current logo (what's actually in `logo.svg`)

Canvas 1104×514 with a `translate(-165, -343)` transform on the root
group. Composed of:

1. **White background rect** filling the full canvas.
2. Black `<path>` shapes drawing "AGENTIC LEARNING AI LAB" wordmark.
3. Three blue (`#3C81F7`) dots over the "I"s.
4. **Stylized "AL" graphic** on the left, built additively (no cut-outs):
   - Black stroke C-shape (curved bar)
   - Black stroke circle (the "A" outline)
   - **White filled circle** inside it — fakes a "ring" by covering the
     center of the black circle
   - **White filled leaf/teardrop blob** — fakes a negative space inside
     the C-curve
   - **White filled narrow oval** — fakes another cut
   - Blue filled circle (the "A" dot)

So the apparent ring and negative-space cuts are all just white shapes
painted on top of a white background. The moment you change the page
background, every "cut" becomes a visible white blob.

This is a vector drawing pretending to be a stencil. Fixing it properly
means doing actual stencil cuts.

## Logo options (pick one)

### A. Two-file approach — `logo.svg` + `logo-dark.svg`

Author a second file by hand:
- Drop the white background rect
- Delete the white "mask" shapes
- Replace them with `<path>` using `fill-rule="evenodd"` subpaths so the
  cuts are real holes in the dark shapes
- Recolor text/strokes/dark elements to white (`#FFFFFF` or `#EFEFEF`)
- Keep the blue accents as-is (they read on both backgrounds)

Swap via `<picture>` with `prefers-color-scheme` media query, OR via
CSS `[data-theme="dark"] .logo-light { display: none }` toggle.

- **Pros**: Simple to reason about. Each file is hand-tuned. Easy to
  preview either independently.
- **Cons**: Two files to maintain. Any future tweak (kerning, dot color)
  has to be made in both.

### B. Single SVG using `currentColor` + proper cuts (recommended)

Rewrite `logo.svg` to:
- Remove the white background rect entirely (transparent)
- Replace text/stroke `fill="#000000"` with `fill="currentColor"`
- Replace the white mask shapes with `fill-rule="evenodd"` cuts inside
  the black shapes — actually subtract the inner circle from the outer
  circle, etc.
- Keep the blue dots as `#3C81F7` (or a custom property like
  `var(--logo-accent, #3C81F7)`)

Then CSS controls color: `.logo { color: black }` for light theme,
`.logo { color: white }` for dark. One file. Theme-agnostic by design.

- **Pros**: One file. Theme system stays simple — flip a CSS variable
  and the logo follows. Future-proof for any background color.
- **Cons**: More upfront work to compute the path subtraction.
  `currentColor` doesn't help for the blue accents (they need to stay
  blue on both themes — that's actually fine, blue reads on both).

### C. Hybrid — one SVG with embedded `<style>` + media query

Single file. Embed:
```svg
<style>
  .text { fill: #000; }
  @media (prefers-color-scheme: dark) { .text { fill: #fff; } }
</style>
```

Apply classes to the relevant paths. Still need proper cuts (no white
mask shapes) since the background is transparent.

- **Pros**: One file. Adapts automatically to OS theme.
- **Cons**: Doesn't follow a site-level toggle (the user's chosen theme
  via toggle ≠ OS preference). If we ship a toggle, B is cleaner.
  Embedded `<style>` also requires the SVG to be inlined or referenced
  as `<img>` with full CSS scope, which works but is finicky.

**Recommendation: B.** It plays nicely with whatever theme-toggle
mechanism we pick for the site, requires one file, and has no
duplication. The path-subtraction work is one-time.

## Site dark-mode mechanism (pick one)

### M1. CSS custom properties + `data-theme="dark"` on `<html>`

Define semantic tokens in `:root`:
```css
:root {
  --bg: #ffffff;
  --fg: #2c2c2c;
  --muted: #6b7280;
  --card-bg: #f3f3f3b4;
  --border: rgb(75 85 99);
  --accent: #6dbb00;
  --link: #0d0d0d;
}
[data-theme="dark"] {
  --bg: #0d0d10;
  --fg: #e8e8ea;
  --muted: #9ca3af;
  --card-bg: #1c1c20;
  --border: rgb(156 163 175);
  --accent: #8fd13c;
  --link: #e8e8ea;
}
```

Then replace hard-coded colors site-wide with `var(--*)`. JS toggle
sets `<html data-theme="dark">` and persists in `localStorage`. On page
load, an inline `<script>` in `<head>` reads localStorage + falls back
to `prefers-color-scheme` and sets the attribute before paint (avoids
flash of light theme on dark-mode users).

- **Pros**: Standard pattern. Surgical — every page picks it up. No
  Tailwind config changes.
- **Cons**: Have to audit and rewrite hard-coded colors. There are a
  lot: `tw-bg-[#fff]`, `tw-bg-black`, `tw-text-white`, `#f3f3f3b4`,
  `#2c2c2c`, gradients, etc. scattered across templates and `index.css`.

### M2. Tailwind `dark:` variant with `darkMode: 'class'`

Add `darkMode: 'class'` to `tailwind.config.js` and write
`dark:tw-bg-black` everywhere alongside the light variant.

- **Pros**: Idiomatic for Tailwind. No CSS custom property migration.
- **Cons**: Every template needs `tw-bg-white dark:tw-bg-black`
  side-by-side, doubling the class load. Also doesn't help for the raw
  CSS in `index.css` (still need variables or another mechanism for the
  ~30 hard-coded `#xxx` values there). Mixed-mechanism is messier than
  M1.

### M3. CSS custom properties + Tailwind `dark:` (hybrid)

Use `--bg` etc. for raw CSS rules; use `dark:` variants in templates.
Both controlled by the same `<html class="dark">` toggle (Tailwind's
class strategy) — `dark:` flips the Tailwind utilities, the same class
flips a `.dark { --bg: ...; }` selector.

- **Pros**: Best of both. Tailwind handles utility classes; vars
  handle raw CSS.
- **Cons**: Two systems to keep aligned.

**Recommendation: M1** if we want minimal infrastructure change and
fewer concepts. **M3** if you'd rather lean into Tailwind's dark:
variant for the bulk of the templates. M1 is what I'd pick — cleaner
mental model and the templates aren't *that* class-heavy.

## Scope question — what to dark-mode

A real dark mode is not just "swap bg and text." It touches:

1. **Page chrome** (header, footer, navigation) — straightforward.
2. **Cards** (people, papers, projects) — `#f3f3f3b4` background,
   hover border colors. Need a dark equivalent that reads.
3. **Hero images** on listing cards — currently rely on dark text over
   light images. May need an overlay tweak or to leave as-is.
4. **Markdown content** in project pages — block quotes, code blocks,
   tables, image captions.
5. **arXiv embedded paper view** at `/research/<slug>/` — uses
   `arxiv-paper.css`. This file is sizable and tuned for light theme.
6. **Math rendering** (KaTeX/MathJax if any) — usually OK because they
   inherit color, but worth a check.
7. **Code blocks** — syntax highlighting palette (used in project pages
   like daily-oracle). Probably needs a dark theme variant.
8. **PDF embeds / images** — these don't theme. A border or background
   tile around them helps reduce contrast harshness.
9. **`includes/lab-header.html` and `lab-attribution.html`** — these
   are consumed by **external** repos. Anything we change there ships
   to other sites too. Either keep them light-only or have them adopt
   the host page's `data-theme` cleanly. **Important to discuss.**

## Toggle UX

Three normal patterns:

- **Sun/moon icon in header.** Most common. Compact. Two states.
- **Three-state toggle (light / dark / system).** Respects OS pref by
  default; lets users override. Slightly more code, much more polite.
- **Auto-only.** No toggle; just respect `prefers-color-scheme`. Least
  work, least control.

**Recommendation: three-state (light/dark/system) with default = system**.
First-time visitors get whatever their OS prefers; the toggle is there
for the off-case.

## Implementation order I'd propose

1. Rewrite `logo.svg` to option B (transparent bg, `currentColor`,
   real cuts — implemented via SVG `<mask>` element, not
   `fill-rule="evenodd"` path subtraction, which would be painful for
   the curved leaf/oval). No site-wide changes yet. The root `<svg>`
   carries no `color` attribute — relying on inherited color when
   inlined, and on the UA default text color (black) when loaded as
   `<img>`. This means existing `<img src=logo.svg>` references
   (including the external-consumer `includes/lab-header.html`) keep
   rendering as before, without any HTML changes.
2. Introduce CSS custom properties (M1) for the chrome only —
   header, footer, body background, primary text. Page-by-page audit.
3. Add the toggle UI (three-state) + the inline-`<script>` no-flash
   bootstrap.
4. Audit content surfaces — cards, project pages, arXiv view.
5. Decide what to do with `includes/lab-*.html` (shared with external
   repos) and document.

Each is its own PR. Don't ship as one big change.

## Things I'd want to confirm before writing code

- Confirm option B for the logo (or A if you prefer to keep two files).
- Confirm M1 for the toggle mechanism (or M3 if you want
  Tailwind `dark:` everywhere).
- Confirm three-state toggle (or pick a simpler 2-state).
- Confirm whether `includes/lab-*.html` should theme along with the
  rest of the site — risk: changing what external sites embed.
- Confirm scope of this first PR: just logo? Or logo + chrome (header
  + footer + body bg)? I'd recommend logo-only as PR 1.
