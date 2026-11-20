# CLAUDE.md — ramen-diorama

Agent notes for this repo. Read `spec.md` first — it is the source of
truth for scope, decisions, and acceptance criteria.

## What this is

A single-image 2.5D living diorama: one anime illustration of a
late-night ramen shop, turned into a 60 fps interactive scene with
parallax depth plates, shaders, tactile physics, and procedural audio.
Faithful to the Shinya Ramen showcase spec, built in one pass.

## Hard rules

- **The image never leaves the device.** Depth estimation runs in the
  browser (transformers.js). No upload, no cloud depth API, no cloud
  video API. Ever.
- **No build step.** Single `index.html` + `assets/`, Three.js via CDN.
  Static only, same as stickerify / speaklog / donkey-kong-jr.
- **Rest alignment is pixel-perfect.** With no input, the composed
  plates must register exactly with `assets/source-art.png`.
- **Deterministic sim.** Fixed-step 1/60 s, seed `20261120`. A scene is
  a pure function of `t` — any frame can be frozen, screenshotted, and
  compared. A screenshot is evidence, not a lucky capture.
- **No audio files in the repo.** All sound is synthesised live with
  the Web Audio API.

## Key facts

- Source art: `assets/source-art.png`, 1920×1080 (16:9), original
  illustration generated 2026-11-20. NOT the showcase's artwork.
- Depth: Depth Anything V2 **Small** (`onnx-community/depth-anything-v2-small`),
  Apache 2.0. Base/Large/Giant are CC-BY-NC — do not use them.
  In-browser, Web Worker, Cache API. ~27 MB int8 (WASM) / ~99 MB fp16
  (WebGPU). The original used Large on Apple Silicon MPS; that route
  does not exist here — Small is the deliberate adaptation.
  Verified 2026-11-20 on the actual source art: model downloads in
  <1 min, inference ~11.6 s at 1920×1080 on the WASM fallback path
  (cloud browser has no WebGPU). Depth ordering correct at large scale,
  weak fine separation — manual mask cleanup needed around the woman
  and noren curtains.
- Slicing: `scripts/slice.py` (Python + OpenCV), offline one-off.
  Outputs (`assets/layers/*.png`, `assets/masks/*.png`) are committed.
  The app never re-slices at runtime.
- Depth plates (z): −0.36 backdrop, −0.05 rear lantern, +0.15 noren,
  +0.20 front lantern, +0.34 woman + counter. Camera distance 5.0,
  parallax overscan 1.18, shift ±0.26 / ±0.14. World plane recomputed
  from the actual 16:9 aspect (height 2.000 → width 3.5556).
- Reference (verification discipline only, not the pipeline):
  `sloemo01/diorama` (MIT) — deterministic frames, per-entity frame QA.

## Verification (same discipline as donkey-kong-jr)

- Headless checks (`node --check`, layer/mask tests) PLUS a live
  browser E2E on the deployed URL. A headless pass alone never closes
  a fix; a live pass alone never closes it either.
- Perf/smoke checks must mirror live conditions: real frame cadence
  with jitter, real browser, seeded sim. A test that does not match
  reality is not verification. (Jr. round 1: a perfect-16.7 ms smoke
  passed 29/29 and claimed zero deaths; live play died 7 times on
  Jump Board. Do not repeat this.)
- Test the real call shape. (Stickerify headphone lesson: a fix that
  sorts the wrong object shape is a no-op.)

## Build lessons (2026-11-20, found by the headless tests)

- UV mapping direction: the visible central 1/OVERSCAN of a plate must
  map to texture [0,1], i.e. texture-uv = (geometry-uv − u0)/(u1 − u0).
  The inverse (remapping INTO the inset window) crops ~14% per side at
  rest and looks like a zoomed-in scene. The head-pivot/eye local coords
  use the inverse mapping (geometry-uv = u0 + (u1−u0)·frame-fraction)
  and were correct — do not "fix" them the same way.
- A splash condition must be reachable: `stepRain`'s exit test and
  splash test were mutually exclusive, so rain produced zero splashes
  for the whole build until a test counted them. Count the effects, not
  just the code path.
- `validateManifest` must match the manifest's real shape (layers is an
  object keyed by id, not an array). The wrong check would have thrown
  on every page load. The real manifest is the test fixture.
- One water heightfield, one owner: the sim owns `sim.water`; the render
  loop only uploads it. A second copy drifts. Tap splashes go through a
  queue consumed by the next frame's water step, never written directly
  into a uniform the next frame overwrites.
- The post pass must encode to sRGB: built-in materials skip the sRGB
  encode when rendering to a render target, so the final shader does it.
- `waterImpulse` iterates only the impulse disc's bounding box (same
  result as the full-grid scan, ~40× less work). The PDE height is
  clamped to ±2 in both the CPU step and the GPU shader (saturating
  puddle) so rain bursts cannot spike the reflection distortion.
- Lantern pivots come from `manifest.anchors.lantern_front_pivot` /
  `lantern_rear_pivot` (hardcoded fallback = same numbers). The manifest
  also carries `noren_rod`, `awning_drips`, `steam_top`, `bowl_rx_ry`,
  `counter_top_y` — the logic block hardcodes its own copies (drips
  x 0.05–0.33 ≈ awning 100–600 px) because it is pure and manifest-free.
- Depth (offline): Node inference failed (onnxruntime-node postinstall +
  NuGet ECONNRESET); Python onnxruntime 1.32.0 with the identical V2
  Small weights works. The ONNX output is [batch, H, W] (no channel
  dim) — indexing it as [batch, 1, H, W] produces a garbage map.
- three.js CDN: `browser.open` of the jsDelivr URL failed; the pin was
  verified via the npm registry instead. Do not re-attempt that fetch.

## Fix round 1 lessons (2026-11-20, live E2E failures)

- Strip y convention: frame pixel (fx, fy) maps to plane-local
  ((fx/1920−0.5)·PLANE_W·s, (0.5−fy/1080)·PLANE_H·s). Texture-v is the
  opposite sense (v = 1 − fy/1080, from the bottom) — using `(0.5 − v)`
  for the y position mirrors the strip. The head-pivot/eye coords use
  the inverse mapping and are correct; do not "fix" them the same way.
- Overlays must be registered for parallax: anything that is not in
  `plates` never moves. The emissive and street overlays were invisible
  to `syncScene` and ghosted against their plates. The emissive overlay
  shifts with the backdrop depth (−0.36), not its own z (0.5).
- Lantern groups shift, not their meshes: the mesh inside a lantern
  group carries the pivot offset in its position; the plates loop must
  skip lantern meshes (`userData.lantern`) and `syncScene` shifts the
  group from `userData.baseX/baseY/z`.
- `coversFrame` must use the viewport aspect: the visible half-width is
  (PLANE_H/2) × aspect, not PLANE_W/2. Overscan 1.18 covers full
  deflection at 16:9 (margin 0.041) but not at aspect 1.923 (needs
  1.239); `parallaxScaleFor(aspect)` scales the shift instead of the
  geometry, so rest alignment is untouched.
- The water grid is bottom-origin: the street shader and both water
  textures read row 0 at the frame bottom; every splash y (rain, drips,
  taps) must be flipped (`1 − (land − 0.65) / 0.35`). `classifyTap`
  is the single source of truth for tap regions.
- transformers.js v3 is ESM-only: `dist/transformers.min.js` ends with a
  bare `export{...}` and exposes no `Transformers` global — never
  `importScripts` it, never read a global. The depth worker is a module
  worker importing `{ pipeline, env, RawImage }` from the package root.
  Surface the real worker error in the status line; a generic "載入失敗"
  is undiagnosable.
- H must toggle one body class (`hud-hidden`), never per-element
  `hidden` — per-element toggling inverts each panel's own state.
- Adaptive quality: `qualityTierFor(fps, scale)` (1 / 0.75 / 0.5,
  down < 22 fps, up > 50 fps), `applyRenderScale` resizes renderer +
  postRT + `uRes`. The sim is cheap; GPU fill at full resolution is
  the cost on weak GPUs.
- CI must name `test/smoke.mjs` explicitly: the shell glob
  `test/*.test.mjs` never matched it, so the smoke suite (incl. the
  index.html structural checks) was never run by CI.

## Push rules (repo-wide, learned 2026-11-18)

- The Muse GitHub App pushes ordinary files fine (installation is
  All repositories). It has NO workflows write permission — any batch
  containing `.github/workflows/` fails atomically with 403. Push
  workflow files via the signed-in browser web UI instead.
- The App cannot create repos (403). New repos are created via the
  signed-in browser.
- Vercel GitHub App is "Only select repositories" — a new repo must be
  added to its selection before the first Vercel import. Vercel email
  verification codes go to fimtestxyz@gmail.com, which Muse cannot
  read — the user supplies the code in chat.
