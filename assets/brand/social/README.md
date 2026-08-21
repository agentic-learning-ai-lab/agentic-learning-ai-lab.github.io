# Social profile avatars

Padded PNGs of the agent-mark for use as social profile pictures where
the platform crops uploads into a circle (Twitter/X, LinkedIn,
Instagram, GitHub org avatar, etc.).

## Sizes and padding

Filename pattern: `agent-mark-<size>-<padding>[-white].png`

- `<size>` — canvas edge in pixels (`400`, `800`, `1024`)
- `<padding>` — how much of the canvas the agent occupies
  - `tight` — 75% (light padding, corners may clip in tight circle crops)
  - `medium` — 65% (recommended for most platforms)
  - `loose` — 55% (extra safe, for platforms with aggressive crops)
- `-white` suffix — solid white background instead of transparent

## Which to pick

- **Twitter/X, LinkedIn, GitHub** → `agent-mark-400-medium.png` (transparent) or `-white` if the platform uses light chrome behind it.
- **Instagram, Slack** → `agent-mark-1024-medium.png`; the platform will downsize but the extra resolution helps at high-DPI.
- **Aggressive crops (some CN platforms)** → `agent-mark-*-loose.png`.

## CDN URLs

Each file is content-addressed on `cdn.agenticlearning.ai/<hash>/<file>.png`.
The current URLs are in the repo's `assets-manifest.json`; look up
`/assets/brand/social/<file>.png`. They're immutable — safe to bookmark.
