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
- **No audio files in the repo — except the lo-fi playlist.**
  All ambience is synthesised live with the Web Audio API. The
  explicit exception (user chose real tracks 2026-11-20): 6 CC BY 4.0
  MP3s in `assets/music/` (Free Music Archive, 24 MB total), with
  in-app attribution for the playing track — no attribution = license
  violation. See `assets/music/README.md` for the license record.
  Never add another audio file without recording the same exception.

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

## Fix round 2 lessons (2026-11-20, performance + playlist)

- **Measure the meter before trusting it.** The fps meter fed on the
  sim's clamped `dtWall` (max 0.25 s), so it floored at 4 fps and
  could not show slow frames truthfully. The sim clamp and the meter
  must use different dt values: clamped for the sim advance, raw for
  the meter. A meter that cannot read the failure mode is not a meter.
- **A tier that does not reduce the dominant cost is not a tier.**
  `applyRenderScale` shrank the buffer, but the post pass was 4×
  MSAA'd and the woman plate paid 5-tap CAS over a full-frame quad
  that is 75% transparent. Diagnose per-stage first (fragment-fetch
  model from measured layer alpha coverages, in
  `test/slices.test.py`), then fix the biggest term: MSAA off (post
  38.3M → 9.6M fetches), woman early-discard before CAS (~5.7M
  saved), cheap post at the lowest tier. The model is not a measured
  fps gain — live E2E must measure real fps.
- **Alpha test saves blend, not fetches.** In three.js the alpha test
  runs AFTER the texture fetch (`diffuseColor = texture2D(...)`,
  then `if (a < alphaTest) discard`). A mostly-transparent plate
  with an alpha test still pays the fetch for every fragment; it
  skips only the blend/overdraw. Only a discard placed BEFORE the
  neighbour fetches (woman CAS) saves fetches. Do not claim fetch
  savings for an alpha test.
- **An auto step-down that the UI cannot show did not happen.**
  Round 1's Auto evaluator worked, but the select only ever showed
  the mode ("畫質：自動"), so the re-test reported "Auto never
  stepped down". The active tier must be visible in the control
  itself (option label + toast on step-down).
- **A slider non-response can be a harness artifact.** Native
  `<input type=range>` + `input`, panel above the canvas at z-index
  10, no `pointer-events` block, keyboard works — the synthetic
  pointer non-response is not an app bug. Add `change` (pointer
  commit) + `label for` as belt-and-braces, and confirm pointer-drag
  on a real mouse in live E2E.
- **Playlist rules.** Tracks load on demand only (`preload = 'none'`,
  `src` set in exactly one place, `playTrack`). Playback goes
  through `AudioEngine.nodes.music` (MediaElementSource → music gain
  → master) so the audio switch and volume slider apply. Playlist
  and radio are mutually exclusive. Pressing play turns the master
  audio on; auto-advance does NOT re-enable audio if the user muted.
  Attribution for the playing track is a license requirement
  (CC BY 4.0) — `RamenLogic.PLAYLIST` is the single source of truth
  and the tests assert every track's attribution text.
- **The music MP3s are binary (24 MB).** The GitHub App push route
  rejects non-UTF-8 content — they go via the signed-in browser web
  upload (like the layer PNGs), never the App. Same for any future
  binary asset.

## Phase 2 lessons (2026-11-20, multi-scene)

- **A hardcoded count in a loop is a latent crash for the next
  scene.** `createSim` built `signs` as a fixed 5 and `lanterns` as
  a fixed 2, and `stepSim`'s flicker loop ran `for (i < 5)` and its
  lantern loop `for (i < 2)`. The ramen scene masked all of it.
  The moment a scene has 1 sign (matcha) the loops throw every
  frame. Per-scene arrays must be built from the registry, and
  every loop over them must use `.length` — never a literal.
- **Do not swing a layer by its id — swing a lantern by its def.**
  Layer1/layer3 are lantern plates on ramen, but a station building
  and a train on enoden, a pagoda and a figure on yasaka. The swing
  system is driven by an explicit per-scene `lanterns` array; the
  layer toggle hides a swing group only when one exists for that
  layer, otherwise the plate. Same for the rig: enoden HAS eyes in
  its manifest but is deliberately NOT rigged (the passenger is
  20 px wide) — the registry's `rig: null` decides, not the
  manifest's anchors.
- **A texture-v is not a frame fraction.** The bowl-steam bug:
  `bowlV = 1 - y/1080` (from the bottom) was passed where a
  fraction from the top was expected, mirroring the steam to the
  top of the frame. It shipped in the build and survived two live
  E2E rounds because nobody looked at where the steam actually
  sat. Any helper that takes a vertical position must say which
  origin it uses in its name or its comment — and the fix
  (`steamPlaneRect`) is a pure, tested function, not an inline
  arithmetic change.
- **A live observation and the shipped files can both be right
  about different things.** The E2E layer3 report was not a wiring
  bug: the PNGs put the lantern on layer3 and the mist on no layer
  at all. The most likely cause is the animated mist + the
  additive emissive glow persisting after the lantern hid. Pin it
  with file + code evidence (tests), harden the wiring anyway
  (group branch only when a group exists), and still demand a live
  re-check before closing it — do not declare the E2E wrong from
  the desk.
- **A scene switch must dispose, not just rebuild.** Geometries,
  materials, textures, water render targets, and the post scene
  all accumulate per switch if nothing frees them. `postRT` is the
  one exception — it is reused across switches, so it must never
  be disposed by the traversal (its texture is referenced by
  `postMat.uTex`). The zero-clear quad in `buildWater` is local
  and recreated per build — dispose it there, not in the switch.
- **vm-realm arrays fail `deepStrictEqual`.** The logic block runs
  in a `vm` sandbox, so its arrays have a different Array
  prototype. Assert with `.join(',')` or field-by-field, never
  `deepEqual` on a vm-produced array (the smoke test failed on
  identical contents for exactly this reason).
- **A missing default is a 404 for the scenes that don't have the
  thing.** The scene-switch 404 (2026-11-20 live E2E): a missing
  `manifest.cloth_layer` defaulted to `'layer2'`, so the four
  cloth-less scenes fetched a non-existent `layer2-static.png`
  and the whole switch failed. A default must only apply when
  the feature exists — the registry (`def.cloth`) decides, the
  manifest only overrides the layer id (`clothLayerFor`). Same
  rule as the rig: `rig: null` decides, not the manifest.
- **Never stringify a raw error event into a toast.** THREE's
  TextureLoader rejects with the raw load event, which has no
  `.message`, so the toast showed "[object Event]" — a second
  defect hiding the first. Wrap loader rejections in a real
  `Error` naming the URL.
- **A 2 px feather is not enough edge bleed for a mipmapped plate.**
  The layer seams (2026-11-20 live E2E): the renderer minifies the
  plates 1.18–2.4x, the mip blur eats the alpha edge, and the
  inpainted backdrop leaks at every boundary — measured 0.5–0.9%
  of pixels off by >12 in a minification simulation. The fix is a
  12 px alpha dilation (the Shinya showcase's number) plus
  dilating the backdrop inpaint holes to 15 px, so no foreground
  ghost sits inside the band. A colour bleed into transparent
  pixels was measured and REJECTED: it changed the minified error
  by <0.01 and would have undone the PNG compression from zeroing
  RGB where alpha is ~0. Pin it with the minified-composite test
  (resample 1/1.18, compare against the resampled source), not
  with the unfiltered composite — the unfiltered composite was
  already ~0.3 and hid the whole problem.

## Multi-language UI lessons (2026-11-20, zh / en / ja)

- **One table, three languages, zero hardcoded UI strings.** All
  user-facing text lives in `I18N = { zh, en, ja }` in the logic
  block (94 keys). `t(lang, key, vars)` falls back to zh, then to
  the key itself — a missing key never renders blank. The app
  script never hardcodes a UI string: a smoke test strips comments
  from the app script and asserts zero CJK remains. If you add a
  string, add the key to ALL THREE tables (a parity test fails
  otherwise) and wire it with `data-i18n` / `data-i18n-title` /
  `data-i18n-alt` or `tr()` (a coverage test fails if a key is
  never used).
- **Dynamic strings are state, not text.** A toast is transient, but
  the depth status and the loading line persist on screen — so they
  keep `{key, vars}` (`depthStatusState`, `progressState`) and
  re-render through `tr()`. All `setProgress` call sites pass keys
  (`load.reading`, `load.layers`, `load.building`, `load.done`);
  all depth-status assignments go through `setDepthStatus`. Never
  assign a literal string to `depth-status` or `loadmsg` again.
- **Scene names live in the registry** (`names: { zh, en, ja }` +
  `emoji` per `SCENES` entry); the picker renders
  `emoji + ' ' + sceneName(id, lang)`. The scene header title
  (`sceneDef.title`) is the artwork's title and is deliberately NOT
  translated — do not "fix" it into `sceneName`.
- **Not translated, ever:** track titles / artist names (proper
  names), the "CC BY 4.0" name and its license URL, technical
  identifiers (layer ids, mode values, `z=` labels).
- **A `{var}` placeholder is substituted verbatim.** Punctuation
  around a var belongs to the caller, not the table: the
  `depth.error` separator is `': '` in English and `'：'`
  elsewhere, chosen at the call site.
- **Persistence:** `ramen-diorama.lang` in localStorage;
  `savedLang(storage)` never throws (unknown / missing / throwing
  storage → zh). `applyI18n()` also sets
  `document.documentElement.lang` (`zh-Hant` / `en` / `ja`).

## Osaka drip-bug lessons (2026-11-20, found by live E2E #6)

- **A render loop must never assume every scene has every feature.**
  Osaka is the only scene with `drips: null`, so `createSim` gives it
  `drips: []` — but `syncRainLines()` looped 16 drip segments
  unconditionally and threw on `sim.drips[0].wait` before the first
  frame was ever drawn, freezing the scene forever (and showing the
  frozen pre-switch ramen frame, which looked like a wrong-scene bug).
  The sim side already had a test (`drips.length === 0` for osaka);
  the render side had none. Rule: whenever a scene feature is
  nullable in the registry, the render loop that consumes it needs a
  guard AND a smoke test pinning the guard — the sim test alone does
  not cover the render path.
- **A first-load failure must stay visible.** `loadScene`'s catch hid
  `#loading` before rethrowing, so `init`'s catch wrote the failure
  message into a hidden element and the failure looked like a black
  screen. `init`'s catch now un-hides `#loading`. Never hide a loading
  overlay in a catch without making sure the error it hides is shown
  somewhere visible.
- **A "scene loads" check must verify pixels, not chrome.** E2E #5
  marked osaka PASS on the progress bar + toast + picker value while
  no osaka frame was ever drawn. A scene switch only counts when the
  rendered picture is the new scene.
- **"Seams" can be the source art.** The matcha / shotengai / yasaka
  strips measured identical between the layer composite and the
  source art (mean diff ≤0.09), sit mid-layer with no layer boundary
  on them, and are visible in crops of the source art itself (pillars,
  sign edges, dark gaps, rails). Re-slicing, feathering, and renderer
  changes cannot remove them — only source-art work (accept, inpaint +
  re-slice, or regenerate) can. Before blaming the slicer, composite
  the layers and diff against the source at the exact reported
  coordinates.
- **The user's rule: a shipped coordinate mistake gets a lint.**
  The registry (`index.html`) and the slicer config
  (`scripts/scenes.json` anchors) are two copies of the same geometry
  — they drifted twice (v1 matcha steam src 94px above the bowl; v2
  registry still pointing at v1 art). `test/logic.test.mjs` now has a
  lint test pinning the registry to the anchors (steam src/top,
  lantern pivot, rig-from-eyes, cloth panels = punch polys). It guards
  drift, not measurement: the anchors themselves are verified by
  viewing the art, per the regen checklist in spec.md.
- **Tap mapping must match the strip build.** `classifyTap` divided
  the noren rod uniformly, but `buildNorenStrips` builds strips per
  panel — with unequal panels a tap brushed a strip ~1 away from the
  finger. Both now map per panel; a test case pins the discriminating
  tap (300,400) → strip 5.

## Hakodate Phase 2 lessons (2026-11-20, first steam-less / lantern-less / rig-less scene)

- **Nullable registry features: null in the registry decides, every
  consumer guards.** Hakodate is the first scene with `steam: null`,
  `lanterns: []`, `rig: null` and `drips: null` all at once. The
  pattern that works: the registry states the absence explicitly
  (`steam: null`, never a missing key), `createSim` derives empty
  state from it (`snow: def.snow ? makeSnow(...) : []`, `drips: []`,
  `lanterns: [].map(...)`), and each render consumer guards at its
  own level — `buildSteamMist` returns early, `buildPost`
  defaults the brightening centre, `classifyTap` skips the steam
  rect, `syncScene` already tolerated empty lantern lists and a null
  mist mesh. `handleDrag`'s steam swirl needs no guard of its own:
  it only runs when classifyTap returns kind 'steam', which cannot
  happen on a steam-less scene. A missing feature must never throw
  on ANY path — sim, render, tap, post — and the smoke test pins
  each guard by string, because the sim test alone does not cover
  the render path (the osaka drip-bug lesson, again).
- **A new weather system copies the rain system's shape.** Snow is
  sim state (`makeSnow`/`stepSnow` in the logic block) + a render
  sync (`buildSnowLines`/`syncSnowLines`, one THREE.Points), exactly
  like rain lines + drips. Inactive flakes are parked off-screen
  (y=-10), the same trick the rain lines use. New weather is a
  registry flag (`snow: true` on the scene) + a preset param
  (`snow: 1` in MOODS), NOT a slider — and `readSliders` must
  preserve preset params across slider moves (the same rule as
  `lightning`; a slider move that silently turns the snow off is the
  same bug class as the one that used to clear lightning).
- **Snow must read against both the dark sky and the bright ground.**
  Pure-white hard dots vanish on snow. The flake shader draws a
  white core (0.85) with a faint dark rim (0.22) — the core reads on
  the sky, the rim + motion read on the ground. No mask: snow falls
  over the whole frame, including the sky the rain mask would clip.
- **Cold-start chrome must come from the saved state, not the
  hardcoded default.** The `<h1>` said 深夜拉麵 until
  updateSceneChrome ran after the scene loaded — a 5–10 s wrong
  title on any remembered non-ramen scene. `init` now reads the
  saved scene once and sets the title from it before the first
  load. The same rule applies to any other chrome that names the
  scene (the default mood is now scene-driven too: a snow scene
  opens in its snow-night preset, not drizzle, because rain over
  snow would contradict the scene).
- **Measure sign rects from the mask, not the eye.** Hakodate's four
  lit-building sign rects were measured from the emissive-mask blobs
  (flood-filled bounding boxes), padded ~15 px — the anchors sit at
  the blob centres by construction, and the lint test now asserts
  every lit-building anchor sits inside a sign rect. Eyeballing the
  art at display scale would have been ±50 px off.

## Targeted source-art strip-edit lessons (2026-11-20, E2E #7 strips)

- **Never blur source art to fix a strip.** A horizontal Gaussian
  blur across matcha's shoji-frame cliff destroyed the wood grain
  and lattice texture and left a soft blurry column — a new
  artifact in exactly the class being fixed. Reverted from backup.
  The fix that works is a texture-preserving luminance ramp: reshape
  the row's luminance profile across the cliff (smoothstep
  interpolation between the profile values at the two ends) and
  scale each pixel by the profile ratio, so the pixel's own texture
  survives. The dark-pixel-only lift (toward a per-row neighbour
  reference, capped so no region can pass its neighbours) is the
  other safe tool — bright text, lantern glow and lit windows are
  untouched by construction.
- **The dip metric is not the verdict for every strip.** Matcha's
  post must stay darker than the bright shoji next to it, so its
  dip barely moves (+31 → +29) even when the strip is fixed — the
  honest metric there is the cliff step (79 → ~21). Report the
  metric that matches the cause, and let the viewed crop decide.
- **View-the-crop is the check that catches edit artifacts.** The
  blur mistake was invisible in the numbers (the dip improved) and
  only visible in the crop. Never skip viewing the edited crop, and
  never push an art edit whose crop was not viewed at full size.
- **A service restart wipes /tmp — including the depth model.**
  Re-download the V2 Small ONNX (~27 MB, sha256 `fcf51f1b…`) and
  re-run any depth/slice step that was in flight; verify by file
  mtime + a load test, never by assuming the earlier run finished.

## Push rules (repo-wide, learned 2026-11-18)

- **Update the build stamp on every index.html push.** The title
  block carries `<span id="build-stamp">build YYYY-MM-DD HH:MM</span>`
  (+08, the time the push is made). It exists so a stale cached
  copy on a phone is distinguishable from the current build — a
  stamp older than the push is a stale page, not a new bug. The
  smoke test pins its presence + format, never its value.
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
