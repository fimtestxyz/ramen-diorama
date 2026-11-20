# Ramen Diorama — 深夜拉麵 2.5D Living Diorama

One static anime illustration → a living 60 fps interactive diorama.
No AI video, no looping MP4s, no external audio files, no cloud cost.

Faithful to the Shinya Ramen showcase spec, built in one pass. See
[`spec.md`](spec.md) for the full spec, decisions, and acceptance criteria.

## Status

Built 2026-11-20, pending live verification (no live-browser E2E yet —
see the checklist below). Source art `assets/source-art.png`, 1920×1080,
original illustration. All 13 features implemented in `index.html`
(88 KB, single file, no build step). Headless tests: 23 JS tests
(`node --test test/*.test.mjs`) + Python slice tests — all passing.

## Pipeline

1. **Source art** — one 16:9 anime illustration (`assets/source-art.png`).
2. **Depth** — Depth Anything V2 Small, in-browser via
   `@huggingface/transformers` (`depth-estimation` pipeline,
   `onnx-community/depth-anything-v2-small`), Web Worker, Cache API.
   ~27 MB int8, cached after first load. Apache 2.0.
3. **Slicing** — offline one-off `scripts/slice.py` (Python + OpenCV):
   source art + depth map → five parallax plates + seven semantic masks,
   inpainted backdrop behind cutouts. Outputs committed to
   `assets/layers/` + `assets/masks/`.
4. **Rendering** — Three.js via CDN, WebGL2, single `index.html`,
   no build step. Five depth plates, eleven shader passes, tactile
   physics, procedural Web Audio.
5. **Hosting** — Vercel + GitHub Pages backup,
   custom domain `ramen.gobblemon.com` (planned).

## Run it

Static site — serve the folder (`python3 -m http.server`) and open
`index.html`, or open the deployed URL. The image and the depth model
never leave the device.

## Files

- `spec.md` — the spec (decisions, features, acceptance criteria)
- `index.html` — the whole app (88 KB: pure-logic `RamenLogic` block +
  Three.js app module; importmap pins `three@0.187.0` on jsDelivr)
- `assets/source-art.png` — the source illustration (1920×1080)
- `assets/depth.png` — Depth Anything V2 Small depth map (1920×1080,
  268 KB; generated offline, identical weights to the in-browser model)
- `assets/layers/` — 5 plates (4.3 MB total) + `layer2-static.png`
  (noren panels punched out, for the 6 cloth strips)
- `assets/masks/` — 7 stencils (92 KB total)
- `assets/manifest.json` — layers, masks, anchors, coverages
- `scripts/depth.py` — offline depth generation (Python onnxruntime;
  see note in spec.md — the Node route failed, same weights)
- `scripts/slice.py` — offline slicing + inpainting (Python + OpenCV)
- `test/` — `logic.test.mjs` (14), `smoke.mjs` (9, jittered cadence),
  `slices.test.py` (Python, layers/masks/manifest/depth/composite)
- `CLAUDE.md` — agent notes for this repo

## Measured numbers (build, 2026-11-20)

- Depth (offline, Python onnxruntime, same V2 Small weights):
  inference 0.8–0.9 s at 518×294 model input; depth range 0.065–6.610,
  mean 2.620 (browser run on the same image: 0.066–6.672, mean 2.785 —
  close, different runtimes). Region means (0–255): alley street 29.5,
  alley buildings 42.6, noren 131.0, interior shelves 75.6,
  woman head/torso 127.5 (std 44.9 — blends), counter + bowl 157.6,
  door frame right 244.8, front lantern 106.3, rear lantern 81.3.
- Slicing: layer coverages backdrop 0.448, rear lantern 0.014,
  noren 0.256, front lantern 0.032, woman + counter 0.249 (sum 1.0).
  Rest composite vs source: mean abs diff 0.305, p99 7.88.
  Backdrop inpaint: Laplace fill (1,000 Jacobi iterations) + wood-grain
  texture at 0.28 opacity — Telea/Navier-Stokes both left an X streak.
  Layers optimised 17 MB → 4.3 MB (zero RGB where alpha < 3/255).
- Sim: 3600 fixed steps (60 sim-seconds) run in ~1.2–1.8 s wall on this
  throttled 1.5-CPU VM (~33× faster than real time). Rain produces
  100+ splashes per 60 s of drizzle (was 0 before the stepRain fix).
- Tests: 23/23 JS + all Python slice tests pass (see `test/`).

## Live E2E still to do (do NOT call the app done before this)

- WebGL rendering on the deployed URL: all 5 plates align at rest
  (composite == source art), parallax moves plates by depth, no gaps
  at full pointer deflection.
- Depth model: downloads once (~27 MB), caches, Start works offline
  after; the "Estimate depth live" button produces a depth view.
- 60 fps on a real machine (the headless sim is fast; GPU passes are
  unverified), all interactions (brush curtains, spark neon, splash
  puddles, swirl steam, compare curtain drag, mood presets, sliders,
  inspector 6 modes + 7 layer toggles, keyboard shortcuts).
- Audio: rain/simmer/buzz/drips/thunder/taxi/radio all synthesise;
  no audio file in the repo.
- No console errors on load or during a 60 s interaction session.
