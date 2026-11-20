# Ramen Diorama — 深夜拉麵 2.5D Living Diorama

One static anime illustration → a living 60 fps interactive diorama.
No AI video, no looping MP4s, no cloud cost. Ambience is synthesised
live; the lo-fi playlist is 6 real CC BY 4.0 tracks (user's choice —
see `assets/music/README.md`).

Faithful to the Shinya Ramen showcase spec, built in one pass. See
[`spec.md`](spec.md) for the full spec, decisions, and acceptance criteria.

## Status

Built 2026-11-20, deployed to Vercel
(https://ramen-diorama.vercel.app). **Live E2E 2026-11-20 13:53–14:10
returned NOT SHIPPABLE** — rest alignment broken (noren mirrored),
parallax gaps at full deflection, live depth model failed to load,
puddle/steam interactions not observable, 4 fps in the cloud browser,
H did not hide the inspector. **Fix round 1 was pushed (`80573bc`)
and live re-tested 15:09–15:31: every functional item PASSED** —
rest alignment, compare, parallax with no gaps, depth model download
+ inference (~70 s), all four interactions, presets/sliders/modes/
toggles, all shortcuts incl. the fixed H, no console errors.
**The only failure left: fps stuck at 4–5** (software WebGL, no GPU),
manual Low produced no improvement, Auto never visibly stepped down.
**Fix round 2 + lo-fi playlist were pushed (`73bbae6` + `78bc84b`)
and live re-tested 16:01–16:14: round-2 features shippable** —
fps meter truthful, Auto steps down visibly, playlist fully
working, sliders fixed by pointer drag; cloud browser still 2–7 fps
(software WebGL, no GPU — real-GPU fps unmeasured). **5 new scenes:
Phase 1 (art + depth + slice, 42 MB) done and verified; Phase 2
(scene switcher in the HUD, per-scene anchors, layer3 check) done
locally, not yet pushed, not yet live-verified** — see "Phase 2" in
`spec.md`. Headless tests: 48 JS tests (`node --test
test/*.test.mjs test/smoke.mjs`) + Python slice/scene tests — all
passing. Source art `assets/source-art.png`, 1920×1080, original
illustration. All features implemented in `index.html` (~136 KB,
single file, no build step).

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
- `index.html` — the whole app (~136 KB: pure-logic `RamenLogic` block +
  Three.js app module; importmap pins `three@0.187.0` on jsDelivr)
- `assets/source-art.png` — the source illustration (1920×1080)
- `assets/depth.png` — Depth Anything V2 Small depth map (1920×1080,
  268 KB; generated offline, identical weights to the in-browser model)
- `assets/layers/` — 5 plates (4.3 MB total) + `layer2-static.png`
  (noren panels punched out, for the 6 cloth strips)
- `assets/masks/` — 7 stencils (92 KB total)
- `assets/music/` — 6 lo-fi MP3s (24 MB total, 16:49, all CC BY 4.0)
  + `README.md` (license record + attribution text). Binary — push
  via the browser web upload, never the GitHub App.
- `assets/manifest.json` — layers, masks, anchors, coverages
- `scripts/depth.py` — offline depth generation (Python onnxruntime;
  see note in spec.md — the Node route failed, same weights)
- `scripts/slice.py` — offline slicing + inpainting (Python + OpenCV)
- `test/` — `logic.test.mjs` (28), `smoke.mjs` (20, jittered cadence),
  `slices.test.py` (Python, layers/masks/manifest/depth/composite/
  fragment model/layer3 pin), `scenes.test.py` (Python, the 5 new
  scenes + per-scene fragment model)
- `assets/scenes/` — 5 new scenes (osaka-cafe, kyoto-matcha,
  kamakura-enoden, tokyo-shotengai, kyoto-yasaka), each with
  source-art.png + depth.png + 5 layers + 7 masks + manifest.json
  (42 MB total); `scripts/scenes.json` + `scripts/slice_scene.py`
  drive them
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
- Tests: 48/48 JS + all Python slice + scene tests pass (see `test/`).
- Performance (fix round 2, 2026-11-20 — fragment model at 1919×998,
  from measured layer alpha coverages; NOT a measured fps gain):
  before 56.1M texture fetches/frame → 21.7M at high/mid tier (39%),
  14.0M at the low tier (25%). Biggest terms removed: post pass 4×
  MSAA (38.3M → 9.6M, `antialias: false`), woman 5-tap CAS on a
  75%-transparent quad (~5.7M saved by an early discard). CPU side is
  innocent: `waterStep` ≈ 0.001 ms/step on the 32×32 grid, zero
  per-frame texture uploads (all 9 textures static; water is a 4 KB
  DataTexture upload). The old fps meter floored at 4 fps (it fed on
  the sim's clamped dtWall); it now reads the raw frame interval and
  shows `fps · frameMs`. Desktop 60 fps is NOT claimed — live E2E
  must measure real fps.
- Playlist: 6 tracks, 24,221,540 bytes, 16:49 — Kyoto / Shanghai /
  Shatter (1000 Handz) + Silent Wood / Long Day / Through the Trees
  (Purrple Cat), all CC BY 4.0 with in-app attribution. `preload =
  'none'`; tracks load on demand only.

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
  playlist plays the 6 real tracks with in-app CC BY 4.0 attribution
  (the only audio files in the repo — see the playlist exception in
  spec.md feature 12); no 24 MB preload on page load.
- Performance (round 2): fps on a real GPU; Auto visibly steps the
  tier down at low fps (select label + toast); Low actually improves
  fps. Slider pointer-drag on a real mouse. layer3 toggle hides the
  front lantern visibly. Playlist playback + auto-advance + volume +
  attribution visibility.
- No console errors on load or during a 60 s interaction session.
