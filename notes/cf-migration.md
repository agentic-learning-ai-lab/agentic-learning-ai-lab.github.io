# Cloudflare migration — design and roadmap

Plan for moving the lab site from "pure GitHub Pages + LFS" to "Cloudflare-fronted GH Pages + R2 for binaries." Written 2026-05-16 while pausing the LaTeX bootstrap (we don't want to commit ~120 MB of binaries to LFS if those assets will move to R2 shortly anyway).

**Design only — no code yet.**

## Today's state (recap)

- Source repo: public, on GitHub. Builds via `npm run build` (CI: `.github/workflows/deploy.yml`).
- Deploy: GitHub Pages, via the modern `actions/upload-pages-artifact` + `actions/deploy-pages` flow. No `gh-pages` branch.
- Asset storage: Git LFS for paper PDFs, hero images, arxiv-fetched figures, and (planned) LaTeX figure binaries. ~265 MB committed now; bootstrap would add ~120 MB → ~38% of the 1 GB free quota.
- CDN: GitHub Pages' built-in (Fastly-backed) edge. Fine globally for cached static content, mediocre in mainland China.
- LFS bandwidth: previously a concern; the in-tree `actions/cache` for `.git/lfs/` (landed in PR #1) makes steady-state CI cost ~0 bandwidth.

## Goals

In priority order:

1. **Worldwide loading speed** — be fast everywhere we reasonably can be (not solving China specifically).
2. **No long-term dependence on LFS quota** — make binary growth (more papers, more figures, eventual video) a non-issue.
3. **Stay simple** — same Handlebars+Tailwind+Node build, same `papers.yaml` source of truth, same author workflow. Just better infrastructure underneath.

## What we're doing: A + B

**Lever A: Cloudflare in front of GitHub Pages.** DNS-only. Hits goal 1 immediately, no architectural change.

**Lever B: Move binaries to Cloudflare R2.** Build sync + template URL helper. Hits goal 2 by making LFS optional.

These compose: A makes static-HTML serving faster; B makes binaries served via the same Cloudflare edge (R2 + zero-egress).

**What we're not doing now:** full Cloudflare Pages migration (lever C, deferred to roadmap) or a HK/SG mirror (lever D, dropped).

---

## Lever A — Cloudflare in front of GitHub Pages

### What it is

Move `agenticlearning.ai` DNS to Cloudflare's nameservers. Orange-cloud (proxy) the records that point to GitHub Pages. Cloudflare becomes the public-facing edge; GitHub Pages becomes the origin behind it.

### What changes

- DNS hosting: registrar → Cloudflare nameservers.
- The same `agenticlearning.ai` IP records exist, now proxied through Cloudflare's network.
- SSL: terminate at Cloudflare (Universal SSL), with "Full" or "Full (strict)" mode to GH Pages (also TLS).

### What doesn't change

- The repo, the build, the deploy workflow. All unchanged.
- The site itself — same HTML, same URLs.
- Author workflow.

### Expected wins

- ~250 global edge POPs vs GH Pages' Fastly footprint. Faster in most regions, especially Asia/Pacific outside mainland China.
- Free Brotli compression, HTTP/3, and aggressive default caching.
- Free DDoS protection and a baseline analytics dashboard.
- A staging ground for future Cloudflare features (Workers, R2, Pages).

### Setup (≈10 min)

1. Create a Cloudflare account (free tier).
2. Add the `agenticlearning.ai` zone.
3. Cloudflare lists existing DNS records it found via lookup; verify they match current state. Specifically:
   - `agenticlearning.ai` → GH Pages A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`).
   - `www.agenticlearning.ai` → CNAME `agenticlearning-ai-lab.github.io`.
4. **Orange-cloud (proxy through Cloudflare)** the apex `agenticlearning.ai` record and the `www` CNAME.
5. SSL/TLS: set encryption mode to **Full (strict)**. GH Pages issues its own Let's Encrypt cert at the origin, so strict works.
6. Change nameservers at the domain registrar to Cloudflare's two assigned nameservers. Propagation ≤24h, usually <1h.
7. Verify: `dig agenticlearning.ai` returns Cloudflare IPs (`104.x.x.x` / `172.x.x.x`); curl returns 200 with `cf-cache-status` header.

### Caching configuration

Defaults are reasonable. The one thing worth tuning:

- **Page Rules / Cache Rules** (free tier allows 3 page rules; new "cache rules" feature is even better):
  - `*.agenticlearning.ai/assets/*` → cache everything, edge TTL = 1 month.
  - `*.agenticlearning.ai/research/*/paper.pdf` → cache everything, edge TTL = 1 month.
  - `*.agenticlearning.ai/*.html` → respect origin headers (GH Pages sends short Cache-Control on HTML, which we want — lets us update without manual purge).

### Risks and mitigations

- **Cloudflare outage.** Rare (sub-99.99% historically) but real. Mitigation: keep nameservers easily revertable; document the rollback DNS records.
- **Cache invalidation surprises.** Deploys to `main` won't be visible until edge cache expires. Mitigation: short TTLs on HTML (above); manual "Purge Everything" available in Cloudflare dashboard.
- **Domain ownership.** Nameserver change requires registrar access. Coordinate with whoever owns the domain (probably the lab admin or a `renmengye` account).

---

## Lever B — Move binaries to Cloudflare R2

### Goal

Eliminate LFS as the home for paper PDFs, hero images, and figure binaries. Keep LaTeX source text in git (it's small and benefits from diffing); push the binaries to R2 with content-hash addressing, referenced from templates via a CDN URL.

### Architecture

```
                Cloudflare
                  ↓
   agenticlearning.ai  (Pages HTML/CSS/JS, lever A)
   cdn.agenticlearning.ai  ──→ R2 bucket  agenticlearning-assets
                                    │
                                    └── <hash>/paper.pdf
                                        <hash>/teaser.png
                                        <hash>/...
```

R2 storage is content-addressable: the path on R2 is the SHA-256 hash of the file. Uploading the same content twice is a no-op. Old versions stick around (cheap storage, free egress) and can be GC'd later if we care.

### What moves to R2

| Asset class | Move to R2? | Why |
|---|---|---|
| `research/<slug>/paper.pdf` | **Yes** | Largest single asset class; user-facing |
| `assets/images/papers/*.{png,jpg}` | **Yes** | Loaded on every research listing |
| `research/<slug>/assets/*` (arxiv HTML figures) | **Yes** | Loaded on full-paper view |
| `research/<slug>/latex/figures/*` | **Yes** | The ~58 MB of binaries from the bootstrap; build needs them but only on the runner |
| `assets/images/people/*.jpg` | **Yes** | Headshots; user-facing |
| `assets/images/background/*.png` | **Yes** | Hero backgrounds |
| `research/<slug>/latex/*.{tex,bib,bst,sty,cls}` | No | Small text; benefits from git diff |
| `research/<slug>/paper-content.json` | No | Small text |
| All other build inputs (Tailwind sources, .hbs, .yaml) | No | Text; small |

### Build pipeline

Add a `build/sync_to_r2.js` step that runs after `npm run build` but before the Pages artifact upload:

1. Walk migrated paths (configurable, e.g. `[research/**/paper.pdf, assets/images/papers/**, ...]`).
2. For each file: compute `sha256(content).slice(0, 12)` as the short hash.
3. Check whether R2 already has `<hash>/<basename>` (HEAD request).
4. If not, upload (PUT via S3-compatible API — R2 speaks S3).
5. Write `out/assets-manifest.json`: a map from logical path (e.g. `/research/college/paper.pdf`) → CDN URL (e.g. `https://cdn.agenticlearning.ai/abc123.../paper.pdf`).
6. Build pipeline reads `assets-manifest.json` via a Handlebars helper.

Template helper:
```handlebars
<img src="{{cdnUrl '/assets/images/papers/college.png'}}" />
<a href="{{cdnUrl '/research/college/paper.pdf'}}">PDF</a>
```

The helper falls back to the local path if the manifest doesn't have an entry (graceful degradation during migration; also useful for local dev when R2 isn't reachable).

### Credentials

- Cloudflare R2 API token: read+write to `agenticlearning-assets` bucket only.
- Stored as GitHub Actions secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.
- Local dev: same secrets in a `.env.local` (gitignored). Optional — local dev can skip the sync step and use the fallback helper.

### CORS

R2 bucket needs CORS rules so the browser can fetch from `cdn.agenticlearning.ai` when the user is on `agenticlearning.ai`. Permissive read-only:

```
[
  { "AllowedOrigins": ["https://agenticlearning.ai", "https://*.pages.dev", "http://localhost:8000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400 }
]
```

### Removing LFS

After migration, LFS becomes optional. Two paths:

- **Easy: stop adding new LFS files.** Remove `.gitattributes` rules for the migrated path globs. New paper PDFs aren't added to git at all (they go to R2 directly). Existing LFS objects sit in history; we don't reclaim that space, but it's frozen at ~265 MB.
- **Thorough: rewrite history with `git lfs migrate export`.** Pulls all LFS objects out into the working tree, then rewrites history to not use LFS. Drops LFS storage to zero but rewrites every commit SHA — needs a force-push to `main` and coordination with anyone with checkouts. Save this for later.

### Migration phases

1. **Stand up infra (no code).** Cloudflare zone + nameservers (lever A), R2 bucket, `cdn.agenticlearning.ai` DNS+R2 binding, API token, CORS. Test by manually `wrangler r2 object put`ing one image, hitting it via curl from `cdn.agenticlearning.ai`.
2. **Build the sync tool.** `build/sync_to_r2.js`. Run locally; verify manifest output.
3. **Add the template helper.** `{{cdnUrl}}` in `build/templater.js`. Defaults to local path if manifest missing.
4. **Migrate one asset class at a time, in order:** paper.pdf → paper hero images → arxiv-html figures → latex figures → other site images. Each is one PR. Verify in CI that the rendered HTML references CDN URLs.
5. **Drop LFS rules from `.gitattributes`** for migrated paths.
6. **Bootstrap LaTeX text.** Now we can commit `research/<slug>/latex/*.{tex,bib,bst,sty,cls}` (small, git-friendly) without dumping figures into LFS. The figures came along to R2 in step 4.

### Open questions

- **R2 cost at our scale.** ~$0.015/GB-month storage. At 400 MB total binaries: ~$0.07/month. Reads are billed but tiny ($0.36/M Class B ops). Egress is free. Realistically <$2/month even at 10× growth.
- **Versioning / immutability.** Content-hash addressing means old paper.pdf hashes survive. If someone bookmarked an old URL, it still works. Storage costs accumulate but slowly.
- **Local dev experience.** With fallback in the helper, local dev works without R2 access. Authors can run the build pipeline against local files. R2 sync only runs in CI (or on explicit `npm run sync:r2` command).

---

## Roadmap: lever C — Cloudflare Pages (deferred)

A full migration from GitHub Pages to Cloudflare Pages would replace the deploy step. CF Pages would build (or accept a pre-built artifact) and serve. We'd get:

- Per-PR preview deployments natively (no need for the future `dev`-staging discussion).
- Independent of GitHub Pages quotas and downtime.
- Headers, redirects, and Workers integration in `_headers` / `_redirects` files.

We're not doing this now because:

- GH Pages works. Replacing it is non-trivial engineering.
- CF Pages' build environment doesn't have TeXLive. The workaround is to keep GH Actions building and use `wrangler pages deploy` to upload the built artifact. That's a real change to the deploy step.
- Lever A already gives most of the user-facing CF benefits.

Revisit when one of these happens:

- Per-PR previews become valuable enough to justify the migration.
- GitHub Pages limits, pricing, or behavior change in a way that motivates a move.
- We want server-side features (Workers) that GH Pages can't provide.

---

## Stopping point summary

- **A**: orange-cloud DNS through Cloudflare. ~10 min config, 0 code, $0/mo. Speed and headroom win.
- **B**: implement R2 sync + template helper + per-class migration PRs. ~1–2 sessions of focused work. <$2/mo. Eliminates the LFS-quota concern indefinitely.
- **C**: deferred until concrete motivation appears.
- **D**: dropped.

After A and B, the LaTeX bootstrap can re-run cleanly: text into git, figures into R2. Best of both.

## Order of operations recommended for the team

1. ✅ **Done 2026-05-16:** lever A live. Cloudflare zone for `agenticlearning.ai`, all four GH Pages A records orange-cloud proxied, Universal SSL in "Full (strict)" mode, two Cache Rules (`URI Path starts_with /assets/`, `URI ends_with /paper.pdf`), nameservers updated at GoDaddy. Verified with `curl --resolve` against the Cloudflare-resolved IP: edge-cached `cf-cache-status: HIT` on second hit; browser TTL override to 1 day (`max-age=86400`) on both rule-matched paths.
2. **Now:** the 122 MB of local `latex/` trees stay uncommitted, useful as fixtures for B's sync logic.
3. **Next session(s):** lever B in phases — stand up R2 + `cdn.agenticlearning.ai`, build sync tool, migrate one asset class at a time, then drop the corresponding `.gitattributes` LFS rules.
4. **After B lands:** redo the LaTeX bootstrap — text-only commit into git, figures into R2.
