# Tag system — Phase 1 implementation brief

**Parent doc:** [`paper-tag-system.md`](paper-tag-system.md) (design + vocabulary + phase overview).

This file is the concrete implementation plan for Phase 1 only. Read
the parent doc first for the "why".

## What Phase 1 delivers

By the end of Phase 1, on `dev`:

- Every tag in `data/tags.yaml` gets an auto-generated
  `/tags/<slug>/` page listing the papers that carry it.
- `/tags/` root index page lists all tags grouped by cluster.
- The home page grows a card grid for the 9 featured tags (with
  monogram placeholders — bespoke visuals are Phase 2).
- Each paper card grows a chip row (top ~3 tags, curator-ordered).
- Each paper detail page grows a full tag row.
- **Home page "Key Areas" block** (formerly rendered via
  `research_area_tabs`) is retired — Research Topics grid supersedes it.
  `/areas/<slug>/` pages themselves stay live for external inbound
  links; Phase 4 retires the route entirely and lands the redirects.
- Search index includes tags; sitemap includes tag URLs;
  `llms.txt` grows a `## Tags` section.
- `research_areas` field is **retained** through Phase 1 (retirement
  is its own sweep in a follow-up commit — no reason to bundle).
- A lint check (`build/lint_tags.js` + `scripts/checks/10_tag_slugs.js`)
  fails the build on typo'd tag slugs.

Explicitly out of scope for Phase 1 (Phase 2 or later):

- Bespoke SVG visuals for tag cards (Phase 2 — monogram scaffold ships).
- Multi-select filter chip bar on `/research/` (Phase 3).
- Deleting `data/research_areas.yaml` (Phase 4 sweep).
- Deleting `/areas/` route entirely (Phase 4).

## Pre-work already done on branch

Four independent commits addressing infra audit findings:

- `2d78749` fix broken OG title + URL on `/areas/` pages
- `623a1a0` rename misleading `ensureArrayExists` → `ensureExists`
- `07c7902` stop loading reCAPTCHA/emailjs on every page
- `2c9d449` escape + quote external-URL href attributes

These are stand-alone; they'd be worth doing even without Phase 1.

## Implementation checklist

Each item below maps to at most 1–2 files. Grouped by subsystem so
reviewers can read them independently.

### 1. Data plumbing

- [ ] `build/templater.js:parseDocuments()` — load `data/tags.yaml`,
      expose as `documents.tags`. Also build a `tagsBySlug` map and
      an `enabledFeaturedTags` view (filtered by `featured: true`).
      Return both from `parseDocuments()` so downstream callers
      don't re-parse.
- [ ] `build/templater.js:getPeopleMap()` (line 424) — while touching
      this file, fix the redundant `parseDocuments()` call by
      threading the already-parsed documents through. Applies equally
      to any future `getTagMap()`.
- [ ] **DEFERRED** to a follow-up: consolidate `assets-manifest.json`
      loading. On implementation-time inspection, Phase 1's new
      templates reuse the existing `{{cdnUrl}}` helper — no new
      manifest reader gets introduced. Also, `r2_lib.js`'s
      `loadManifest` is async + pulls in AWS SDK, so blanket migration
      would drag deps into CF Pages build. Right consolidation is a
      slim `manifest_lib.js` for the 6 sync callers, done as its
      own cleanup PR. Orthogonal to Phase 1.

### 2. New templates

- [ ] `tag.hbs` (root) — analogous to `research_area.hbs`. Renders
      one tag's page: hero (label + description + monogram badge),
      then paper listing filtered by tag, then a "related tags"
      row. Output path: `tags/{{permalink}}/index.html`.
- [ ] `tags.hbs` (root) — the `/tags/` root index. Lists all tags
      grouped by cluster (Learning Paradigms / Content & Applications
      / Special). Each row shows monogram, label, description,
      paper count.
- [ ] `templates/tag_chip.hbs` (partial) — a single chip. Takes
      slug, resolves label from `tagsBySlug`, links to
      `/tags/<slug>/`. Reused on paper cards + paper detail + home
      cards + tag pages.
- [ ] `templates/tag_card.hbs` (partial) — the featured-tag home
      grid card. Monogram badge + label + description + paper count.

### 3. Existing templates to extend

- [ ] `index.hbs` — insert a home block above/below existing sections.
      Section heading: "Research Topics" (chosen during preview review;
      resolves the parent doc open question). Grid of 9 featured
      tag cards.
- [ ] `paper.hbs` — add tag row near the top of the paper detail
      page (probably alongside the venue / date line, or just
      below it).
- [ ] `templates/research_tab.hbs` — the paper card partial used
      in listings. Add a chip row (first ~3 tags).

### 4. Build plumbing extensions

- [ ] `build/build_pages.js` — register two new entries:
      `{ template: 'tag.hbs', output: 'tags/{{permalink}}/index.html' }`
      and `{ template: 'tags.hbs', output: 'tags/index.html' }`.
- [ ] `build/templater.js` — add a `tag.hbs` branch to the
      per-template dispatch (mirroring the `research_area.hbs`
      branch). Filter papers where `p.tags.includes(tag.slug)`.
      Attach related-tag records so template can render sibling row
      without another lookup.
- [ ] `build/generate_search_index.js:76` — extend `keywords`
      array literal with `...(paper.tags || [])`. Also add each
      tag as its own index entry (`type: 'tag'`) so a search for
      "world models" surfaces `/tags/world-models/` as a hit.
- [ ] `build/generate_sitemap.js` — after the `areas` loop, add
      one URL entry per tag + one for `/tags/` root.
- [ ] `build/generate_llms_txt.js` — add a `## Tags` section
      listing each tag with description as bullet suffix.

### 5. New pre-commit / lint

- [ ] `build/lint_tags.js` — ~20 lines. Parse `data/tags.yaml`,
      build a Set of valid slugs. Parse `data/papers.yaml`, assert
      every `paper.tags[i]` is in the set. Exit 1 on failure. Run
      it as a script in `package.json` (`lint:tags`).
- [ ] `scripts/checks/10_tag_slugs.js` — pre-commit hook wrapper
      that calls the same logic. Same pattern as `07_bibtex_lint.js`.
- [ ] `scripts/checks/04_permalink_unique.js` — extend to also
      check `data/tags.yaml`'s `slug:` field. Currently only checks
      `permalink:` fields.
- [ ] `.github/workflows/pr-checks.yml` — add `npm run lint:tags`
      to the CI step list.

### 6. Redirects → deferred to Phase 4

- [x] **DEFERRED** to Phase 4 (the /areas/ retirement sweep). Adding
      the redirects now would intercept internal Key Areas home
      links — but Key Areas came off the home page in Phase 1 anyway,
      leaving /areas/*/ pages reachable ONLY by direct URL (external
      inbound from Google Scholar, DBLP, etc.). Redirects belong
      with the retirement, not the machinery.

### 7. Handlebars helpers (may already suffice)

Check whether existing helpers handle: array iteration with
`{{#each}}`, resolving a slug to its tag record via `tagsBySlug`
lookup, and truncating the chip row to the first N tags. If any of
these needs a custom helper, define it in `templater.js` alongside
`formatDate`, `formatAuthors`, etc.

## Testing plan

Local:

1. `npm run build:cf` — succeeds with no warnings, no
   `⚠️ cdnUrl lookup fell back to local`.
2. `npm run preview` — open `/tags/world-models/`, `/tags/`, home
   page. Verify chips, cards, related-tag row, paper count.
3. Follow every chip on a paper detail page — should land on its
   tag page.
4. Follow every chip on a tag page — should land on the paper.
5. Test `/areas/learning-from-visual-experience/` — should 301 to
   `/tags/egocentric-video/`.
6. Trigger `lint_tags.js` intentionally: edit `papers.yaml` to add
   `- wrold-models` (typo), confirm pre-commit blocks the commit.

Preview site (`dev` branch on CF Pages):

7. Same 6 checks but against `dev.agentic-learning-ai-lab-github-io.pages.dev`.
8. Search a tag name in the search box — verify it appears.
9. Fetch `https://dev.../llms.txt` — verify Tags section is present.
10. Fetch `https://dev.../sitemap.xml` — verify tag URLs present.

## Commit strategy

Roughly one commit per subsystem section above, in order:

1. Data plumbing (parseDocuments extension + manifest consolidation
   + getPeopleMap fix)
2. Lint infrastructure (lint_tags.js + pre-commit + CI + permalink
   check extension)
3. Home + paper card + paper detail chips (extend existing templates)
4. `/tags/<slug>/` template + build_pages registration
5. `/tags/` root index template
6. Search index + sitemap + llms.txt extensions
7. Redirects

Each commit builds cleanly on the previous. Final PR is
`tag-system-migration` → `dev` first for staging, then eventually
`dev` → `main` per parent doc's staging plan.

## Non-goals

Explicitly not touching this branch:

- `data/research_areas.yaml` retirement (Phase 4)
- Bespoke tag visuals (Phase 2)
- Interactive filter chip bar (Phase 3)
- `person_paper.hbs` — no tag surface planned there yet
- CLAUDE.md updates (Phase 4 once retirement lands)
