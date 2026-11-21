# Versioning and release tagging

## Scheme

Versions are `vMAJOR.MINOR.PATCH` (SemVer-ish, pre-1.0):

- `PATCH` — a fix that changes no scene and no behaviour contract
  (e.g. a corrected slice, a manifest fix, a text fix).
- `MINOR` — a new scene, a new feature, or a behaviour change
  (e.g. the particle-steam system, a new mood preset).
- `MAJOR` — reserved for a breaking change to the saved-state
  contract (`ramen-diorama.lang`, scene ids) or a full rebuild.

## What "stable" means

A commit is **stable** only when the live production build at
`https://ramen-diorama.vercel.app/` passes the full live E2E
checklist with **zero FAIL items**:

- every scene renders (art, layers, depth) with no error toast;
- every control works (scene switcher, sliders, language, presets);
- Steam slider 0 shows **no steam at all** in any scene (no
  particle steam and no painted steam in the art);
- Steam slider back to 0.5 restores animated particle steam;
- regression: ramen, hakodate (snow) and the other scenes unchanged.

A local test pass is not stability. A Vercel deploy is not
stability. Only the live E2E verdict counts — this is the rule the
project has followed since E2E #1, and it is written down here so
a tag can never be applied to a build that was never verified live.

## How a tag is created

The GitHub App used for pushes (`push-files`) can only create
commits — it cannot create tags. A tag is therefore created through
the GitHub web UI (Releases → Draft a new release → create the tag
on the deployed head), in the signed-in browser session. The tag
must point at the exact head the E2E verified, and the release
notes must name the E2E number and its verdict.

## v0.1.0 — first stable release

Target: the first build that passes the full E2E checklist after
the painted-steam rework. Scope:

- 9 scenes (ramen, osaka-cafe, kyoto-matcha, kamakura-enoden,
  tokyo-shotengai, kyoto-yasaka, hakodate-goryokaku, himeji-cafe,
  gero-onsen);
- three.js particle steam (himeji 3 cups, gero 3 bath columns,
  ramen bowl + pot), wind/swirl/tap, Steam slider 0 = no steam;
- trilingual HUD (zh/en/ja), lofi playlist, mood presets;
- seam fix (idle return-to-centre + amplitude clamp ±0.12).

Known issue NOT blocking v0.1.0, tracked separately: the frame-edge
smear on viewports wider than 16:9 (cover fix, vertical-crop
trade-off — see `analysis/edge-smear/README.md`). It is fixed in
v0.1.1 once the crop choice (symmetric vs keep-top) is decided.

## History

- v0.1.0 — 2026-11-21, head `2bad08d`, E2E #12 SHIPPABLE
  (build 2026-11-21 13:12). First stable release; see scope above.
  Release: https://github.com/fimtestxyz/ramen-diorama/releases/tag/v0.1.0
