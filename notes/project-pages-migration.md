# Project pages — design and migration plan

Plan for consolidating the per-project marketing landing pages (the
`agenticlearning.ai/<slug>/` URLs, currently one GitHub repo each) into
this monorepo. **Design only — no code yet.** Original draft 2026-05-14;
refined 2026-05-16 with concrete schema, template sketch, and build
patch.

## Today's state

- Each project has its own GitHub repo under `agentic-learning-ai-lab`
  with a `website` branch (12 repos as of 2026-05-14: `lifelong-memory`,
  `anticipatory-recovery`, `procreate-diffusion`, `daily-oracle`,
  `memory-storyboard`, `college`, `icc`, `context-tuning`,
  `midway-network`, `arq`, `llm-verification`, `temporal-straightening`).
- Each `website` branch is a self-contained static page: hand-edited
  `index.html` built from the Eberhart/Bulma "academic project page"
  template, with its own copies of `static/css/bulma.min.css`,
  `static/js/*.min.js`, `static/images/*`, etc.
- Each is served at `agenticlearning.ai/<slug>/` — these URLs are
  already in arXiv abstracts, Twitter posts, CVs, and slide decks, so
  **preserving them is a hard constraint**.
- This repo serves the lab landing page, person pages, research-area
  pages, and per-paper detail pages at `agenticlearning.ai/research/<slug>/`.
  Built from `papers.yaml` via Handlebars + Tailwind + Node.
- So today there are TWO sources of per-paper content: the
  marketing-style Bulma project page at `/<slug>/` (per-project repo)
  and the data-driven paper detail page at `/research/<slug>/` (this
  repo). Authors maintain both, with frequent drift.

## Pain points

1. **Duplicate content.** Same authors / abstract / image live in two
   places. The Bulma page diverges from `papers.yaml` over time.
2. **Styling drift.** 12 frozen template copies; a lab-wide style
   change requires editing 12 repos.
3. **Cold-start cost for new projects.** Copy-paste of a several-thousand-
   line `index.html` + several MB of vendored CSS/JS per repo.
4. **No central index.** Discovery requires walking the org's repo list.
5. **Inconsistent author bios / affiliations.** When someone changes
   their personal site, 12 pages need to be edited.
6. **Branch-name inconsistency** across the org (`main` vs `master`),
   inherited from age-of-repo. Minor but symptomatic.

## What we are NOT trying to fix

- The `paper.hbs` detail page at `/research/<slug>/`. That stays as the
  data-driven permalink/detail view.
- The arXiv-HTML inline rendering pipeline (`build_arxiv_papers.js`,
  `notes/arxiv-pipeline.md`). Orthogonal feature; works fine.
- `papers.yaml` as the canonical paper-metadata source. Keep it; extend
  it.

## Two-page model (after migration)

Each paper has up to two URLs:

| URL | Purpose | Template | Generated when |
|---|---|---|---|
| `/<slug>/` | Marketing landing — big hero, results, BibTeX, code | `project.hbs` | `paper.project_page.enabled: true` |
| `/research/<slug>/` | Data-driven detail / permalink / arXiv-HTML view | `paper.hbs` | always (current behavior) |

The two **cross-link**:

- Project page top-right: "View paper details →" → `/research/<slug>/`
- Paper detail page already has "Project Website" link → `/<slug>/`

If a paper has no `project_page`, only `/research/<slug>/` is generated
(unchanged from today).

## `papers.yaml` schema

Add an optional `project_page:` block. Existing fields unchanged.

```yaml
- title: "Reawakening Knowledge: Anticipatory Recovery..."
  # ... existing fields: image, authors, abstract, arxiv, pdf, webpage, ...
  permalink: anticipatory-recovery

  project_page:
    enabled: true               # required; gate flag

    # External-author affiliations (lab members come from people.yaml).
    # Order matches the existing `authors:` list above. Skip an entry
    # (or omit the block entirely) for lab members.
    affiliations:
      - { name: "Yanwei Wang", aff: "MIT", url: "https://..." }
      - null                    # Mengye Ren — comes from people.yaml

    # Action buttons under the title. Each is optional.
    links:
      arxiv: "https://arxiv.org/abs/2403.09613"   # falls back to top-level `arxiv` if omitted
      pdf: "/research/anticipatory-recovery/paper.pdf"  # falls back to top-level `pdf`
      code: "https://github.com/agentic-learning-ai-lab/anticipatory-recovery"
      video: "https://www.youtube.com/watch?v=..."   # adds an embedded player below the hero
      huggingface: "https://huggingface.co/datasets/..."
      slides: "/assets/projects/anticipatory-recovery/slides.pdf"

    # Hero figure under the title. Falls back to top-level `image:` if omitted.
    hero:
      src: "/assets/projects/anticipatory-recovery/teaser.png"
      caption: "..."            # optional

    # Result figures, rendered as a stacked vertical sequence (default)
    # or as a Swiper carousel if `carousel: true`.
    figures:
      - src: "/assets/projects/anticipatory-recovery/method.png"
        caption: "Our method..."
      - src: "/assets/projects/anticipatory-recovery/results.png"
        caption: "Quantitative comparison on..."

    # BibTeX shown in a code block at the bottom. Hand-paste from the
    # paper's .bib; we don't auto-extract (too fragile).
    bibtex: |
      @article{wang2026anticipatory,
        title   = {Reawakening Knowledge: Anticipatory Recovery from Catastrophic Interference via Structured Training},
        author  = {Wang, Yanwei and others},
        journal = {CoRR},
        year    = {2026},
      }

    # Optional: custom HTML override for one-off widgets (interactive
    # demos, fancy carousels). Loaded as a Handlebars partial relative
    # to assets/projects/<slug>/.
    custom_html: "custom.html"
```

All `project_page:` fields are optional except `enabled: true`. The
template falls back to top-level `papers.yaml` fields where possible
(arxiv URL, hero image, abstract).

## Template sketch — `project.hbs`

A marketing-focused single-paper page. Built with Tailwind (`tw-` prefix
already configured). Header/footer come from the existing partials.

```handlebars
<!doctype html>
<html lang="en">
<head>
  <meta property="og:title" content="{{{title}}} | Agentic Learning AI Lab" />
  <meta property="og:description" content="{{{short_abstract}}}" />
  <meta property="og:url" content="https://agenticlearning.ai/{{{permalink}}}/" />
  <meta property="og:image" content="https://agenticlearning.ai{{{project_page.hero.src}}}" />
  {{> head}}
</head>
<body class="tw-flex tw-min-h-[100vh] tw-flex-col tw-bg-[#fff] tw-font-mono">
  {{> header}}

  <main class="tw-w-full tw-px-[5%] max-md:tw-px-4 tw-mt-[150px]">

    <!-- Title + author block -->
    <section class="tw-max-w-4xl tw-mx-auto tw-text-center tw-mb-12">
      <h1 class="tw-text-4xl tw-font-medium max-md:tw-text-2xl">{{{title}}}</h1>
      <div class="section-underline tw-my-4 tw-mx-auto"></div>
      <p class="tw-text-lg">{{{formatAuthorsForProjectPage authors project_page.affiliations}}}</p>
      <p class="tw-text-gray-600 tw-mt-2">{{journal}} · {{formatDate date "YYYY"}}</p>

      <!-- Action buttons -->
      <div class="tw-flex tw-flex-wrap tw-justify-center tw-gap-4 tw-mt-8">
        {{#with project_page.links}}
          {{#if arxiv}}<a class="project-link" href="{{arxiv}}"><i class="bi bi-file-earmark-text"></i> arXiv</a>{{/if}}
          {{#if pdf}}<a class="project-link" href="{{pdf}}"><i class="bi bi-file-pdf"></i> PDF</a>{{/if}}
          {{#if code}}<a class="project-link" href="{{code}}"><i class="bi bi-github"></i> Code</a>{{/if}}
          {{#if video}}<a class="project-link" href="{{video}}"><i class="bi bi-play-btn"></i> Video</a>{{/if}}
          {{#if huggingface}}<a class="project-link" href="{{huggingface}}">🤗 Dataset</a>{{/if}}
          {{#if slides}}<a class="project-link" href="{{slides}}"><i class="bi bi-easel"></i> Slides</a>{{/if}}
        {{/with}}
      </div>
      <p class="tw-text-sm tw-text-gray-500 tw-mt-4">
        <a href="/research/{{{permalink}}}/">View paper details →</a>
      </p>
    </section>

    <!-- Hero image -->
    {{#with project_page.hero}}
    <section class="tw-max-w-5xl tw-mx-auto tw-mb-12">
      <img src="{{src}}" alt="{{../title}}" class="tw-w-full tw-rounded-lg" />
      {{#if caption}}<p class="tw-text-sm tw-text-gray-600 tw-text-center tw-mt-2">{{caption}}</p>{{/if}}
    </section>
    {{/with}}

    <!-- Abstract -->
    <section class="tw-max-w-3xl tw-mx-auto tw-mb-12">
      <h2 class="tw-text-2xl tw-font-medium tw-mb-4">Abstract</h2>
      <p class="tw-text-gray-700">{{{abstract}}}</p>
    </section>

    <!-- Results figures (stacked, or carousel if project_page.carousel) -->
    {{#if project_page.figures}}
    <section class="tw-max-w-5xl tw-mx-auto tw-mb-12">
      {{#each project_page.figures}}
        <figure class="tw-mb-8">
          <img src="{{src}}" alt="" class="tw-w-full tw-rounded" />
          {{#if caption}}<figcaption class="tw-text-sm tw-text-gray-600 tw-text-center tw-mt-2">{{caption}}</figcaption>{{/if}}
        </figure>
      {{/each}}
    </section>
    {{/if}}

    <!-- Optional per-paper custom HTML escape hatch -->
    {{#if project_page.custom_html_inline}}
    <section class="tw-max-w-5xl tw-mx-auto tw-mb-12">
      {{{project_page.custom_html_inline}}}
    </section>
    {{/if}}

    <!-- BibTeX -->
    {{#if project_page.bibtex}}
    <section class="tw-max-w-3xl tw-mx-auto tw-mb-12">
      <h2 class="tw-text-2xl tw-font-medium tw-mb-4">BibTeX</h2>
      <pre class="tw-bg-gray-100 tw-p-4 tw-rounded tw-overflow-x-auto tw-text-sm"><code>{{project_page.bibtex}}</code></pre>
    </section>
    {{/if}}

  </main>

  {{> footer}}
</body>
</html>
```

A new Handlebars helper `formatAuthorsForProjectPage(authors, affiliations)`
joins the existing people.yaml lookup (lab members → personal page links)
with the optional per-author `affiliations:` override. Lives in
`build/templater.js`.

## Build wiring

### `build/build_pages.js`

Add one route to the `pages` array (current lines 3–11):

```js
const pages = [
    // ...existing routes...
    { template: 'paper.hbs', output: 'research/{{permalink}}/index.html' },
    { template: 'person.hbs', output: 'people/{{permalink}}/index.html' },
    { template: 'research_area.hbs', output: 'areas/{{permalink}}/index.html' },
    { template: 'project.hbs', output: '{{permalink}}/index.html' },   // NEW
];
```

### `build/templater.js`

Extend the per-template branch (currently lines 20–69) with a new
`project.hbs` case that filters and pre-processes:

```js
else if (input === "project.hbs") {
    for (const paper of documents.papers) {
        if (!paper.project_page || !paper.project_page.enabled) continue;

        const output_new = output.replace("{{permalink}}", paper.permalink);

        // Guard against permalink collisions with reserved top-level paths.
        const RESERVED = new Set(['research', 'people', 'areas', 'contact', 'assets', 'css', 'includes']);
        if (RESERVED.has(paper.permalink)) {
            throw new Error(`permalink '${paper.permalink}' collides with reserved path; pick a different slug`);
        }

        fs.mkdirSync(path.dirname(output_new), { recursive: true });

        // Inline a per-project custom HTML file if requested.
        if (paper.project_page.custom_html) {
            const customPath = path.join(__dirname, '..', 'assets/projects', paper.permalink, paper.project_page.custom_html);
            if (fs.existsSync(customPath)) {
                paper.project_page.custom_html_inline = fs.readFileSync(customPath, 'utf8');
            }
        }

        // Fall back to top-level fields where project_page doesn't override.
        paper.project_page.links = paper.project_page.links || {};
        paper.project_page.links.arxiv = paper.project_page.links.arxiv || paper.arxiv;
        paper.project_page.links.pdf   = paper.project_page.links.pdf   || paper.pdf;
        paper.project_page.hero = paper.project_page.hero || { src: paper.image };

        fs.writeFileSync(output_new, template(paper));
    }
}
```

The reserved-path guard prevents accidentally squatting on
`/research/index.html` etc. by setting a paper's permalink to `research`.

## Asset layout

```
assets/
  projects/
    anticipatory-recovery/
      teaser.png          (Git LFS — hero / large hero alternative)
      method.png          (Git LFS)
      results.png         (Git LFS)
      slides.pdf          (Git LFS)
      custom.html         (text, if used)
    midway-network/
      ...
```

LFS rules to add in `.gitattributes`:

```
assets/projects/**/*.png filter=lfs diff=lfs merge=lfs -text
assets/projects/**/*.jpg filter=lfs diff=lfs merge=lfs -text
assets/projects/**/*.jpeg filter=lfs diff=lfs merge=lfs -text
assets/projects/**/*.gif filter=lfs diff=lfs merge=lfs -text
assets/projects/**/*.mp4 filter=lfs diff=lfs merge=lfs -text
assets/projects/**/*.pdf filter=lfs diff=lfs merge=lfs -text
```

Per-project image budget: aim for ≤5 MB total per project across hero +
figures, post-compression. `build/compress_assets.js` already runs an
≤1400px-width pass; that should cover most of it.

## Author rendering

The new `formatAuthorsForProjectPage` helper does, per author position
`i`:

1. If `project_page.affiliations[i]` is non-null, render `name (aff)`
   with `aff.url` if present. This handles external co-authors.
2. Else look up `authors[i]` in `people.yaml` by exact name match.
   If found, link to `/people/<permalink>/`.
3. Else render plain text (unknown author).

This matches the existing `formatAuthorsWithLinks` helper's behavior
for lab members while adding the affiliation-override capability.

## Relationship to `research/<slug>/latex/`

We persist LaTeX source at `research/<slug>/latex/` (see
`CLAUDE.md` → "LaTeX source and PDFs"). The project page does **not**
auto-extract anything from there — BibTeX in `project_page.bibtex` is
hand-pasted from the paper's `.bib` for one practical reason: arXiv
auto-generated BibTeX (the kind one usually wants on a project page) is
*not* what's in the paper's source `.bib`. Authors curate the
display-bibtex separately.

That said, the existing `latex/` directory makes it easy to:

- Re-render figures from source if a project-page hero needs updating
  (just rebuild the figure, copy into `assets/projects/<slug>/`).
- Verify the paper compiles cleanly when refactoring shared sty files.

## Migration plan

Same five steps as the original, lightly updated. **Not now.**

1. **Inventory pass.** For each of the 12 `website` branches:
   - Pull locally; record variations (custom JS? custom CSS? video
     carousel? unusual layout?).
   - Output: `notes/project-pages-inventory.md` table — "vanilla
     template + content" vs "has real custom widget."
   - Expected ratio: ~10:2 in favor of vanilla.

2. **Build `project.hbs` + pilot.**
   - Implement the template + helper + build-wiring as above.
   - Pick one well-behaved project (e.g. `anticipatory-recovery`):
     - Add `project_page:` block to its `papers.yaml` entry.
     - Move its images into `assets/projects/anticipatory-recovery/`.
     - Build locally; diff the rendered page against the live one. Get
       author signoff that "good enough" matches the bar.

3. **Bulk port.** Each remaining project is one PR:
   - Add `project_page:` block to its `papers.yaml` entry.
   - Move images to `assets/projects/<slug>/`.
   - Verify the build emits `out/<slug>/index.html` correctly.
   - PRs parallelizable; one reviewer per area.

4. **Custom-widget projects.** Handle the 2-3 outliers with per-project
   `custom_html:` overrides. If a widget pattern recurs (e.g. a video
   carousel), graduate it into the template.

5. **Cutover.**
   - Verify every `<slug>/index.html` builds and renders.
   - Diff every old URL against the new one tab-by-tab. **Don't skip**
     — the URLs are in arXiv abstracts and CVs.
   - Merge to `main` so CI deploys.
   - Have a one-revert rollback ready.

6. **Archive per-project repos.** Wait ~1 month after cutover with no
   regressions. Add `ARCHIVED.md` to each repo's `website` branch
   pointing at the monorepo. Mark archived in GitHub (do not delete —
   may contain non-website branches).

## Risks and mitigations

- **URL breakage.** Highest-risk failure mode. arXiv abstracts cannot
  be edited; a broken `agenticlearning.ai/<slug>/` is a permanent dead
  link. *Mitigation*: route-preserving design (root-level
  `<slug>/index.html`), reserved-path guard (above), tab-by-tab
  pre-cutover review, fast revert.
- **Git LFS budget.** Project pages tend to ship MB-scale images.
  12 projects × ~5 MB ≈ 60 MB added to the repo. *Mitigation*: aggressive
  compression (`build/compress_assets.js`); host any short videos
  externally (YouTube embed) rather than committing.
- **Author-page divergence.** Some project pages have inline author
  affiliation strings ("Mengye Ren, NYU") that drift from `people.yaml`.
  *Mitigation*: drive lab-member rendering from `people.yaml` by exact
  name match; per-author `affiliations:` override for externals.
- **Custom widget loss.** A few project pages have paper-specific
  carousels or demos that the generic template can't host.
  *Mitigation*: per-project `custom_html:` override carved into the
  template at a fixed slot.
- **Reviewer fatigue.** 12 PRs is a lot. *Mitigation*: PRs are small;
  encourage same-day review by the original project author; don't
  bottleneck.
- **Stale per-project repos lingering.** After cutover, the per-project
  repos still exist. *Mitigation*: README rewrite + archive after 1
  month.

## What to do in the meantime

For new project pages (e.g. the conceptual-creativity page shipped
2026-05-14), use the legacy per-repo `website` branch pattern. Don't
half-build the new path. Structure the page so the future port is easy:

- Keep the paper-metadata block (title, authors, abstract, links,
  BibTeX) clearly delimited at the top of `index.html` so the
  migration can grep-extract it into `papers.yaml`.
- Keep custom JS minimal.
- Use relative asset paths so the move into
  `assets/projects/<slug>/` is mechanical.

## Open questions

- Should the legacy `webpage:` field in `papers.yaml` (currently points
  at `agenticlearning.ai/<slug>/`) be auto-derived from `permalink`
  once `project_page.enabled` is on? **Probably yes** — removes a
  hand-maintained string.
- Should `papers.yaml` grow further or split into per-project YAML
  files under `data/papers/<slug>.yaml`? 100 entries in one file is
  fine; 500 may not be. **Defer** until file size becomes painful.
- Should we keep a carousel option (`project_page.figures.carousel:
  true`) given that the lab already has Swiper.js as a devDependency,
  or stack-only for simplicity? **Stack-only for v1**; add carousel
  later if multiple projects ask for it.

## When to do this

Not now. Pick this up in a writing-quiet window — estimated 1–2 weeks
of focused work, parallelizable on the bulk-port step.
