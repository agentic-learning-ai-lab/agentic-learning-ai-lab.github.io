# Binary asset drift on full builds

## Symptom

Every full `npm run build` regenerates between dozens and hundreds of
binary asset files (mostly under `research/<slug>/assets/`) with new
content hashes — even when the source files were never edited. The
sync:r2 step then uploads new R2 objects and `assets-manifest.json`
churns by several hundred lines. The PR for a small unrelated change
ends up looking enormous.

Concrete observation 2026-06-10: a build that added one new headshot
produced 358 new manifest entries. 148 of those would have been bundled
into a "small focused PR" had we not stripped them out manually.

## Root cause

`build/compress_assets.js` resizes any `research/<slug>/assets/**/*.{png,jpg}`
wider than `MAX_WIDTH = 1400` px to exactly 1400 px and re-encodes
(`.jpeg({ quality: 80 })`). It tracks "already compressed" via a
mirror-tree of empty marker files in `<slug>/.compressed/`.

**The marker directory is gitignored** (it lives under
`research/<slug>/.compressed/` which is covered by the broader
`research/*/assets` gitignore pattern and isn't preserved separately).
So on every fresh checkout — or every fresh full build on a CI runner —
the markers are missing, and any file still >1400 px gets re-compressed.

A small population of asset files landed on R2 *before* compression ran
(e.g., direct upload, or build:compress was skipped for the session
that uploaded them). These are typically only slightly over threshold
— 1408×1408 was the example we caught — so they fit fine and "look
compressed" but actually weren't. Subsequent full builds re-encode
them.

Sharp itself is deterministic across runs on a fixed
sharp/libvips/mozjpeg version (verified: same input + options → byte-
identical output). So this is not a libvips quirk; it's the compress
step running where it shouldn't.

Cascade into WebP: `build/generate_webp.js` skips when `.webp` is newer
than its source. compress_assets's in-place overwrite bumps the source
mtime, which invalidates the WebP cache → WebPs also get regenerated →
also drift.

So one 8-pixel-overage triggers two new R2 objects (the .jpg and its
.webp) and two new manifest entries per file, per build.

## Why we keep paying for it

Every developer's full build re-uploads these handful of objects.
content-addressed key → same byte content always → object on R2 is the
same one each time after the first re-compression, so the *cost* is
small (we don't pile up junk objects). But each build wants to commit
a manifest update reflecting the new hash, and unless the manifest
update lands in main, the next developer's build does the same
re-encode + re-upload again.

Net effect: PRs unrelated to image work pick up a long manifest tail.
Authors either:
- bundle it into the PR (PR diff balloons, reviewers confused), or
- strip it manually (annoying, repeats every PR), or
- defer the full build and never trigger compress (works until someone else does).

## Fix options

### A. Skip compression when local hash matches manifest

Most general. In compress_assets, before resizing:

```js
const localHash = sha256File(imagePath).slice(0, 16); // 16 hex = 64 bits
const manifestUrl = manifest[`/${path.relative(ROOT, imagePath)}`];
const manifestHash = manifestUrl?.match(/\/([a-f0-9]{16})\//)?.[1];
if (manifestHash && manifestHash === localHash) {
    return { skipped: true, reason: 'matches manifest (already on R2)' };
}
```

The manifest is the source-of-truth for "what's on R2"; if the local
file already matches, re-encoding it produces a divergent local copy
that doesn't match R2, then sync uploads it, generating drift. Skipping
preserves the manifest entry.

`--force` still bypasses this check (already the escape hatch).

**Pros**: zero false positives — only skips files that are byte-
identical to what's already canonically stored. Self-healing: a file
that legitimately changed (different hash) still gets compressed.
**Cons**: O(n) sha256 hashing on every full build (~150 ms for 200
files). Negligible.

### B. Widen the compression threshold (e.g., 1500 px)

Cheap. Files in the 1400–1500 band sit just over the line and trigger
unnecessary re-encodes. A 100-px buffer would catch the 1408 case and
similar.

**Pros**: tiny change, no logic.
**Cons**: doesn't fix the underlying issue. A new paper drops with a
1505-px figure, we drift again. Tactical, not strategic.

### C. Commit the `.compressed/` marker dirs

Today they're inside the gitignored `research/<slug>/assets/` tree.
Move them somewhere git-tracked (e.g., `.compress-markers/<slug>/...`)
and commit. Empty marker files are tiny (one inode each).

**Pros**: makes the existing cache mechanism actually work across
machines.
**Cons**: thousands of empty files in git. Awkward. Doesn't help if
the markers get out of sync with the actual file state (e.g., new
paper added, markers missing for it).

### D. Compress at upload time

Run `build:compress` inside `build/upload.js` (and `build/sync_to_r2.js`)
unconditionally before uploading. Guarantees nothing gets to R2 without
having gone through compress first. Removes the "pre-compression file
landed on R2" pathway.

**Pros**: prevents the bug from being re-introduced. Belt + braces with
option A.
**Cons**: slows down `npm run upload` for users who haven't run a full
build. Doesn't retroactively fix existing R2 objects that bypassed
compression — those still need a one-time cleanup.

### E. Do nothing, keep stripping manifests by hand

Current state. Cost: ~5 minutes of manifest-stripping work per PR that
triggers a full build. Probably 1–2 PRs per month.

## Recommendation

**A + D** together:

- A makes the steady state stable: even if a file lands on R2 without
  prior compression, subsequent builds won't re-encode it as long as
  the bytes match the manifest. Self-healing for what's already there.
- D prevents future regressions at the boundary.

A is ~10 lines in compress_assets.js + a single dependency on the
manifest loader. D is wiring `build:compress` into the upload entry
points (3-line change in each).

Treat as separate PR — orthogonal to current feature work.
