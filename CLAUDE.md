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
  parallax overscan 1.036, shift ±0.26 / ±0.14. World plane recomputed
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
