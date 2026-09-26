# Paper tag system

Design doc for replacing the current three-area "Key Areas" block with a
richer tag system that carries through the whole site — home page cards,
paper cards, paper detail pages, and per-tag listing pages.

Status: design; not implemented. Migration will run against `dev` as a
staging site (CF Pages preview at `dev.agentic-learning-ai-lab-github-io.pages.dev`),
so we can review the full rollout without touching production until the
tag vocabulary is settled.

## Goal

- Retire the "Key Areas" abstraction (3 broad research themes) in favor
  of a curated tag system.
- Tags are the primary way readers navigate the lab's work — visible on
  the home page, on paper cards, on paper detail pages, and as
  auto-generated listing pages at `/tags/<slug>/`.
- The home page tag block reads with more visual weight than a pill row
  and more granularity than the current three Key Areas cards — think
  Research Ecosystems-tier cards, one per featured tag, roughly 8–10
  cards.

## Non-goals

- Not touching the paper metadata (`papers.yaml` schema) beyond adding
  a `tags: [...]` field per paper.
- Not auto-extracting tags from paper text with an LLM. Manual curation
  first, so we own the vocabulary. Auto-suggest can come later.
- Not building filter chips on `/research/` in the first phase. That's
  Phase 2.

## Tag naming philosophy

Tags sit **between** the current abstract Key Areas
(`Learning from Embodied Visual Experience`) and pure keywords
(`saycam`, `arxiv`). They should be:

- **Compositional / thematic** — a tag names a *cross-cutting concern*
  the lab returns to, not a single method or dataset. Good: `World
  Models`, `Test-time Learning`, `Egocentric Video`. Weak:
  `jepa` (too specific), `machine learning` (too broad).
- **Discoverable** — a curious reader clicking a tag should get 3+
  papers back. Rare tags (1 paper) probably belong under a broader
  parent.
- **Concrete enough to picture** — each tag should evoke a
  distinguishable visual/theme. This constrains us away from
  generic labels ("Methods", "Applications" — those are cluster
  names, not tags).

Tags are curator-controlled: adding a new tag is a `data/tags.yaml`
edit, not a free-form `papers.yaml` addition.

## Data schema

### `data/papers.yaml` — per-paper `tags:` field

```yaml
- title: 'AdaJEPA: An Adaptive Latent World Model'
  ...
  tags:
    - world-models
    - test-time-learning
    - closed-loop-planning
```

Retire the `research_areas` field on papers during the migration.

### `data/tags.yaml` — controlled vocabulary

```yaml
- slug: world-models
  label: World Models
  description: Latent predictive models the lab builds and uses for planning and control.
  featured: true
  # cluster / color / icon deferred — see "Visual" below.

- slug: egocentric-video
  label: Egocentric Video
  description: Learning from continuous first-person visual streams (SAYCam and beyond).
  featured: true
```

Fields:
- `slug` — kebab-case; drives `/tags/<slug>/` URL and machine ID.
- `label` — human-facing display name.
- `description` — one-line copy shown on the home card and the tag page.
- `featured` — surfaces on the home page block. Non-featured tags still
  get a listing page + chip appearance on paper cards.

## Visual (deferred)

Home-page cards need per-tag visual anchors — some graphic/icon that
gives each tag a distinct character. Three options on the table, to be
picked once the tag vocab is settled:

- **Monogram** — colored circle with 1–2 letters. Cheapest, scales
  automatically as new tags land.
- **Bootstrap icon per tag** — pick one bi-* per tag. Expressive but
  can look clip-arty without careful curation.
- **Custom SVG per tag** — bespoke glyph in the same drawing tradition
  as the Research Ecosystems icons. Highest polish; ~20 min per tag.

Decision waits until the tag list is locked (drawing glyphs before
locking vocabulary invites rework). In the meantime, Phase 1 can ship
with monograms as a placeholder that's easy to upgrade later.

## Where tags surface

### Home page — replaces the "Key Areas" block

- Section title: TBD (working name: "Themes" or "Research Threads" —
  needs a real name, not "Tags").
- Grid: 8–10 featured-tag cards. 3-col desktop / 2 tablet / 1 mobile.
  Same card DNA as Research Ecosystems and paper cards
  (`--card-bg`, `p-5`, `--radius-md`, hover reveals `--border`).
- Card contents:
  - Icon / graphic (see "Visual" above).
  - Tag label (text-xl medium).
  - One-line description (from `data/tags.yaml`; text-sm muted).
  - Footer link: `N papers →` (linking to `/tags/<slug>/`).

### Paper card (Recent Works + `/research/` listing)

Chip row between venue·date line and abstract. Show the top 3 tags for
that paper; overflow becomes `+N` (linking to paper detail).

### Paper detail page

Full tag row above the abstract. Each chip links to `/tags/<slug>/`.

### `/tags/<slug>/` pages

Auto-generated (like `/areas/<slug>/` used to be). Contents:
- Tag label + description.
- Grid of matching papers (reuse `research_tab.hbs` render).
- Related tags — top N tags that co-occur with this one across the
  corpus, ranked by co-occurrence count.

### Not in Phase 1

- Multi-select filter chip bar on `/research/` (Phase 2).
- Search index integration (Phase 3 — tags fed into
  `assets/search-index.json`).
- `llms.txt` per-paper tags (Phase 3).
- `build/lint_tags.js` hygiene script (Phase 3, or when the vocab
  grows past what a human can eyeball).

## Migration

1. Backfill `tags: [...]` on all 25 papers. Two-person pass: I draft
   from title/abstract, you review and edit.
2. Retire the `research_areas` field on papers. Delete
   `data/research_areas.yaml`.
3. Remove the `/areas/` route entirely from templates and build
   scripts.
4. Add 301 redirects from each `/areas/<slug>/` to the closest
   `/tags/<slug>/` (or `/research/` if there's no good single target).
5. Update the Handlebars `research_area_tabs` partial or delete it.

Inbound-link check: search external references (Google Scholar, DBLP,
CV mentions) for `agenticlearning.ai/areas/` before final cutover.
Redirects handle most.

## Staging via `dev`

Per CLAUDE.md, the `dev` branch is auto-deployed by Cloudflare Pages
to `dev.agentic-learning-ai-lab-github-io.pages.dev`. The migration is
a big enough change that we want a real preview site up before
touching production. Workflow:

1. Create a `tag-system-migration` branch off `main`.
2. Work through Phase 1 commits on that branch.
3. Merge (or push) `tag-system-migration` → `dev`. CF Pages rebuilds
   the preview URL.
4. Iterate on `dev` until the whole system reads right — tag vocab,
   home cards, per-tag pages, redirects.
5. When settled, single squash-merge `dev` → `main` = production
   launch.

This is a deliberate revival of the `dev` branch, which recent PRs
have bypassed (see `project_pr_workflow_drift` in memory). For this
change specifically, staging is worth the extra step.

## Rollout phases

**Phase 0 — Alignment (this doc + tag vocabulary)**
- Land this doc.
- Draft `data/tags.yaml` — ~15–20 slugs with labels + descriptions,
  8–10 marked `featured: true`.
- Curator conversation to lock names + featured set.

**Phase 1 — Ship the machinery on `dev`**
- Add `tags: [...]` to all 25 papers.
- Home block: card grid rendering from featured tags.
- Paper cards: chip row.
- Paper detail: full tag row.
- `/tags/<slug>/` auto-page.
- Retire `research_areas` + `/areas/`.
- Redirects.
- Visual: monogram badges as placeholders.

**Phase 2 — Iterate on visuals**
- Once vocab is stable on `dev`, revisit visual anchors (monogram vs
  icon vs bespoke SVG).
- Ship visual upgrade as its own PR.

**Phase 3 — Interactive filter + search integration**
- Multi-select filter chip bar on `/research/`.
- Tags in `search-index.json`.
- `llms.txt` per-paper tags.
- Optional `build/lint_tags.js`.

**Phase 4 — Settled**
- Delete this doc's "TBD" markers.
- Update CLAUDE.md to describe tags as the canonical categorization
  axis, retire references to research areas.

## Open questions

- **Section title on the home page.** "Themes"? "Research Threads"?
  "Focus"? Something else? Needs a name that reads as more than
  "tags."
- **Cluster grouping?** Do we group featured tags visually (Methods /
  Systems / Applications style)? Recommendation: no in Phase 1 — flat
  grid reads cleaner. Revisit if the grid feels unstructured.
- **How many featured tags?** 8 is tight, 12 is generous. Depends on
  whether the vocab naturally splits into ~10 canonical themes.
- **What happens when a paper has 0 featured tags?** It still appears
  under all its non-featured tag pages, just not featured on the home.
  Fine as long as the paper listing on `/research/` shows tags.
- **The word "Tags."** Do we ever call them tags in-app, or is it
  purely the developer word? For UI copy, I'd avoid the word "tags"
  (it reads too technical) and use the section title instead
  ("Themes" / "Threads" / whatever we pick).
