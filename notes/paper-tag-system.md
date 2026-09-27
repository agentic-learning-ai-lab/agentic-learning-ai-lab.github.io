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
  the lab returns to, not a paper-specific method. Good: `World
  Models`, `Test-time Learning`, `Egocentric Video`, `JEPA` (a family
  of methods the lab returns to, not just one paper). Weak:
  paper-specific method names that recur in only one paper
  (e.g., a single algorithm's acronym), and umbrella terms so broad
  that they'd match half the corpus (`machine learning`, `deep
  learning`).
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

- **Monogram** — colored circle with 1–2 letters (e.g., **WM** for
  World Models). Cheapest, scales automatically as new tags land.
- **Bootstrap icon per tag** — pick one bi-* per tag. Expressive but
  can look clip-arty without careful curation.
- **Custom SVG per tag** — bespoke glyph in the same drawing tradition
  as the Research Ecosystems icons. Highest polish; ~20 min per tag.

**Decision: monogram badges ship only on `dev`. The `main` cutover is
gated on Phase 2 visuals.** Reason: monograms as v1 read "in progress"
on a lab site's front door. Better to ship a coherent visual system
once, than ship a placeholder to prod and negotiate its removal later.
Custom SVG per featured tag is the most likely Phase 2 outcome
(9 featured tags × ~20 min = ~3 hrs of drawing).

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

### Also in Phase 1

- **Root index at `/tags/`** — mirrors the old `/areas/` root; lists
  every tag (label + paper count) grouped by cluster.
- **`sitemap.xml`** — add `/tags/<slug>/` entries and `/tags/` itself
  so Google discovers them at Phase 1, not later.
- **Search index integration** — fold tags into
  `assets/search-index.json`. If tags are the primary navigation,
  site search *must* return tag hits from Phase 1, not Phase 3.
- **Related tags on `/tags/<slug>/` pages** — hand-curated list of
  2–3 related-tag slugs in `data/tags.yaml` per entry. Co-occurrence
  ranking over a 25-paper corpus is too noisy (ties + tiny counts);
  curate now, revisit when the corpus is larger.
- **A11y acceptance criteria for Phase 1:**
  - Chip rows on paper cards + detail pages: keyboard-focusable, real
    focus rings, `aria-label` per chip.
  - Home grid: arrow-key nav across cards (not just tab-per-link).
  - `/tags/<slug>/` pages announce the tag label in `<title>` and
    `<h1>`, not just the slug.

### Not in Phase 1

- Multi-select filter chip bar on `/research/` (Phase 2 — visual
  upgrade lands in the same phase since both are UX work atop the
  Phase 1 machinery).
- `llms.txt` per-paper tags (Phase 3 — polish).
- `build/lint_tags.js` hygiene script (Phase 3, or when the vocab
  grows past what a human can eyeball).

## Migration

1. Backfill `tags: [...]` on all 25 papers. Two-person pass: I draft
   from title/abstract, you review and edit.
2. Retire the `research_areas` field on papers. Delete
   `data/research_areas.yaml`.
3. Remove the `/areas/` route entirely from templates and build
   scripts. Delete `out/areas/` at cutover so old paths 404 back to
   the CF `_redirects` rules below.
4. Update `person.hbs` / `person_paper.hbs`: if they render
   `research_areas` labels on paper listings, retire that too. Same
   for `research_tab.hbs`, `paper.hbs`, and the search-index
   generator — audit for `research_areas` references in Phase 1.
5. Add 301 redirects via `out/_redirects` (Cloudflare Pages picks the
   file up at deploy time — same file that already handles legacy
   `/<slug>/` renames):

   | From | To |
   | --- | --- |
   | `/areas/learning-from-visual-experience/` | `/tags/egocentric-video/` |
   | `/areas/adaptive-agents-and-foundation-models/` | `/tags/in-context-learning/` |
   | `/areas/concept-learning-and-abstraction/` | `/tags/concept-learning/` |

   These are lossy — each area fans out to 4–6 tags. The redirect
   picks the single closest primary tag rather than dropping viewers
   at `/research/`, on the theory that "the one page you probably
   wanted" beats "the whole catalog" for inbound-link recovery.
6. Update the Handlebars `research_area_tabs` partial or delete it.

Inbound-link check: search external references (Google Scholar, DBLP,
CV mentions) for `agenticlearning.ai/areas/` before final cutover.
Redirects handle most.

### URL slug vs UI copy

The URL space is `/tags/<slug>/`, the yaml field is `tags:`, the
build is `build/lint_tags.js`. These are the machine terms and are
permanent (permalinks are forever).

The **UI copy** on the home page — the section title above the card
grid — is free to be whatever reads best in context ("Themes",
"Research Threads", "Focus"). Precedent: GitHub URL is `/topics` but
their nav copy says "Topics" too; we're deliberately letting the two
diverge because the UI term is discoverable-through-reading and the
URL is deliberately the technical one.

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
   launch. **The Phase 1 `dev`→`main` cutover is gated on Phase 2
   visuals landing on `dev` first.** Monogram placeholders never
   ship to production; they exist only as a `dev`-side scaffold.
6. **Rebase `dev` on `main` weekly** while the migration is
   in-flight. Ordinary content PRs (new papers, people entries) keep
   landing on `main` on their own cadence; `dev` needs to pull those
   in so the eventual cutover is a clean fast-forward, not a fight.

This is a deliberate revival of the `dev` branch, which recent PRs
have bypassed (see `project_pr_workflow_drift` in memory). For this
change specifically, staging is worth the extra step.

## Finalized vocabulary (2026-09-26)

Locked in this doc. **20 tags total, 9 featured, 11 non-featured.**
`hierarchical-abstraction` and `local-learning` were added during
the 25-paper backfill (see amendment note at end of section).

### Featured (9) — surface on the home card grid

| Slug | Label | Monogram | Cluster | Notes |
|---|---|---|---|---|
| `world-models` | World Models | WM | Models & Representations | Absorbs JEPA (AdaJEPA, Discrete JEPA, Temporal Straightening, Midway Network) |
| `egocentric-video` | Egocentric Video | EV | Data & Applications | SAYCam-adjacent + video streams |
| `continual-learning` | Continual Learning | CL | Learning Paradigms | Absorbs Streaming Learning |
| `test-time-learning` | Test-time Learning | TT | Learning Paradigms | |
| `in-context-learning` | In-Context Learning | IC | Learning Paradigms | |
| `llm-reasoning` | LLM Reasoning | LR | Data & Applications | |
| `creative-exploration` | Creative Exploration | CE | Learning Paradigms | Broader than "creativity + generation" — open-ended planning, novelty search |
| `human-like-learning` | Human-like Learning | HL | Perspectives | SAYCam, BabyCL, Self Requires Learning, Memory Storyboard |
| `forecasting` | Forecasting | FC | Data & Applications | |

### Non-featured (11) — listed at `/tags/`, appear on paper chips, no home card

| Slug | Label | Monogram | Cluster |
|---|---|---|---|
| `meta-learning` | Meta-Learning | ML | Learning Paradigms |
| `multimodal-learning` | Multimodal Learning | MM | Data & Applications |
| `embodied-ai` | Embodied AI | EA | Data & Applications |
| `self-supervised-learning` | Self-Supervised Learning | SS | Learning Paradigms |
| `hierarchical-abstraction` | Hierarchical Abstraction | HA | Models & Representations |
| `local-learning` | Local Learning | LL | Learning Paradigms |
| `reinforcement-learning` | Reinforcement Learning | RL | Learning Paradigms |
| `concept-learning` | Concept Learning | CN | Models & Representations |
| `multi-agent` | Multi-Agent | MA | Learning Paradigms |
| `ai-safety` | AI Safety | AS | Perspectives |
| `philosophy-of-ai` | Philosophy of AI | PA | Perspectives |

**Amendment (2026-09-26, during backfill):** two tags added on
review of the paper corpus:

- `hierarchical-abstraction` — multiple papers work at more than
  one temporal or representational scale (Midway Network's dense
  + pooled hierarchy, Memory Storyboard's short/long-term memory,
  Discrete JEPA's token-over-pixel abstraction, Temporal
  Straightening's temporal hierarchy, CoLLEGe's concept-over-examples).
  Without this tag, "hierarchy" would leak into `world-models`
  and `concept-learning`, blurring both.
- `local-learning` — carves out the backprop-free / biologically-
  plausible learning family (ARQ). Currently 1 paper but a
  standing lab direction; kept in vocabulary to avoid needing a
  vocabulary PR when the next one lands.
- `embodied-ai` (added 2026-09-27) — agents that plan or act (MA-EgoQA,
  AdaJEPA, Temporal Straightening, ARQ). Egocentric-video papers where
  models only watch stay under `egocentric-video`.

### Clusters (group /tags/ and the tag-page side list)

Revised 2026-09-27 during preview review: the original "Content &
Applications" / "Special" groups mixed data sources, applications,
and perspectives.

- **Learning Paradigms** — how the learning happens (incl. open-ended
  creative exploration).
- **Models & Representations** — what gets learned.
- **Data & Applications** — where the data comes from and what it's
  used for.
- **Perspectives** — cross-cutting lenses on learning agents.

## Author workflow

When adding a new paper:
1. Author picks tags from the approved vocabulary in `data/tags.yaml`.
2. If the paper genuinely needs a new tag, author opens a
   `data/tags.yaml` PR alongside the paper PR (or as a separate
   pre-req PR). New tags land through review, not free-form.
3. `build/lint_tags.js` (Phase 3) will fail the build on unknown
   tags. Before that lands, PR review is the enforcement mechanism.
4. Order of tags in `papers.yaml` matters — the first 3 are what
   surface on the paper card. Curator-controlled per paper.

## Rollout phases

**Phase 0 — Alignment**
- ✅ Land this doc with the finalized vocabulary above.

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
  "tags." URL space (`/tags/`) is locked regardless.
- **What happens when a paper has 0 featured tags?** It still appears
  under all its non-featured tag pages, just not featured on the home.
  Fine as long as the paper listing on `/research/` shows tags.
