# Design — Hub Animal Joinville

The world: a gouache painting on a cobalt ground, with aged-paper exhibition tags hung on jute twine. It reads like a hand-made notice board at an adoption fair, not a SaaS directory.

## Colors (blue predominates; no pink, purple or flowers)

| Token | Hex | Use |
|---|---|---|
| cobalt | `#0b2c9b` | page ground (under `ground.webp` texture) |
| deep | `#061d6b` | footer, deep panels |
| wash | `#86bcf7` | soft light glaze behind the search and fairs |
| navy | `#080944` | ink on paper and on the wash |
| paper | `#f7e2c4` | tags, inputs, light text on cobalt |
| ochre | `#e78e27` / button `#e08524` | the one action colour (brush-edged buttons) |
| rust | `#a1250a` | date stamps and cost labels on paper |
| mist | `#dbe7ff` | secondary text on cobalt |

## Typography

Source Serif 4 (self-hosted, 400 / 400 italic / 600 / 700). Headlines 700 with tight leading (.86–.94) and slight negative tracking; metadata in italic. No second family.

## Layout

- Fluid comp units: `--cu: min(100cqi / 1024, 1px)` on `body { container-type: inline-size }`. Every size is `calc(N * var(--cu))` with a `max()` floor, so the 1024 comp scales down to phones and caps at 1024 on desktop.
- `@container (width < 600px)` stacks the nav and drops the hero overlap.
- Lists are paper tags: `.tag-entry` uses nine-slice `border-image` from `public/plates/fair-tag-1.webp` and `public/plates/fair-tag-2.webp` (eyelet kept whole in the top slice, middle band mirror-tiled), alternating the two plates.

## Components

- Rust rubber-stamp dates (`.stamp`): rotated, stretched, speckled with an SVG turbulence mask.
- Ochre brush button with turbulence streaks.
- Jute twine plates threading the search tag and the first two fair tags.

## Assets

Sources in `assets/plates/*.png` (generated and approved during the redesign); web copies come from `python scripts/plates.py`. Served from `/plates/*` and `/fonts/*` through the Pages `ASSETS` binding. Strict CSP, no JavaScript.

## Rules

- No flowers, hearts-with-sparkles, pink or purple.
- Ochre only for actions; rust only for stamps and labels.
- Real data only in tags: the stamp shows the event's real date, never a placeholder.
