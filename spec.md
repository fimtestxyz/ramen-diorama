# Ramen Diorama — spec.md

> Faithful to the Shinya Ramen (深夜ラーメン) 2.5D diorama showcase spec,
> built in one pass. Single static anime illustration → living 60 fps
> interactive diorama. No AI video, no looping MP4s, no external audio files,
> no cloud cost.

## Decisions locked

- **Faithful original, full scope.** All five depth plates, seven semantic
  stencils, eleven shader passes, tactile physics, procedural audio, HUD +
  mood presets + inspector, Before/After compare curtain, deterministic
  fixed-step sim. No cut-down v1.
- **Source art is original.** One 16:9 anime illustration of a late-night
  ramen shop, generated for this project (`assets/source-art.png`,
  1920×1080, generated 2026-11-20). NOT the showcase's artwork.
  The original used 1376×768 (1.7917:1); ours is 16:9 (1.7778:1) —
  the builder recomputes the world plane from the actual aspect at
  build time (height 2.000 → width 3.5556 at camera distance 5.0).
- **Depth: in-browser, not Apple Silicon.** Depth Anything V2 **Small**
  via `@huggingface/transformers` `depth-estimation` pipeline
  (`onnx-community/depth-anything-v2-small`), Web Worker, Cache API.
  ~27 MB int8 (WASM) / ~99 MB fp16 (WebGPU), cached after first load.
  Small is Apache 2.0; Base/Large/Giant are CC-BY-NC, so Small is the
  only choice. The original used Large on Apple Silicon MPS — that route
  does not exist in this setup; quality differences are accepted and
  recorded, not hidden.
- **Slicing: offline one-off script, committed outputs.** `scripts/slice.py`
  (Python + OpenCV) turns the source art + depth map into the five plates
  and seven masks, inpaints the hidden wall/brick behind cutouts, and
  writes `assets/layers/*.png` + `assets/masks/*.png` into the repo.
  The app itself is static and never re-slices at runtime.
  Verified 2026-11-20: Depth Anything V2 Small runs in-browser on the
  actual source art (model <1 min to download, inference ~11.6 s at
  1920×1080 on the WASM fallback path — WebGPU was not available in the
  cloud browser). Depth ordering is correct at large scale (alley far,
  counter near, door frame nearest) but fine separation is weak: the
  woman blends into the background and the noren reads almost as near as
  the counter. Slicing therefore needs manual layer-mask cleanup around
  the woman and curtains; the raw depth map alone is not enough.
- **Rendering: Three.js via CDN, WebGL2, static only.** Single `index.html`
  + `assets/`, no build step, same pattern as stickerify / speaklog /
  donkey-kong-jr. No framework, no bundler.
- **Repo: `fimtestxyz/ramen-diorama` (public, assumption).** Vercel +
  GitHub Pages backup, custom domain `ramen.gobblemon.com` (assumption —
  same pattern as the other apps; correct if wrong).
- **Free, on-device.** The image and the depth model never leave the
  device. No accounts, no backend, no paywall in v1.

## Verified original facts (from the showcase page, 2026-11-19)

- One static 1376×768 anime JPEG (705 KB). No 3D meshes, no video clips,
  no cloud video APIs anywhere.
- Depth-Anything-V2-Large locally on Apple Silicon; Python cuts out the
  woman, curtains, lanterns and paints the hidden wall & brick behind them.
- Seven automated region masks tell the GPU where rain belongs, where
  puddles ripple, which neon signs glow, and where the indoor counter
  stays completely dry.
- Eleven custom WebGL2 shaders animate breathing, blinking, hair sway,
  steam, GPU water waves; brush the curtains, spark neon signs, splash
  puddles, drag a Before/After compare curtain. Locked 60 fps.
- Deterministic fixed-step simulation, 1/60 s. (Original seed 19890417;
  ours: 20261120.)

## Scene & depth scale (from the original, adapted to our 16:9 art)

- World artwork plane 3.5556 × 2.000, camera distance 5.0, 1.18 parallax
  overscan, ±0.26 horizontal / ±0.14 vertical shift. (The original's
  3.5833 width and 1.036 overscan were for its 1376×768 art; ours is
  1920×1080 16:9, so the plane is 2.000 × 16/9 = 3.5556 and the overscan
  is 1.18 — consistent with the 1.0×–1.18× zoom clamp below.)
- Five perspective-locked depth plates, scaled by exact (d − z) / d so the
  hero rest registers pixel-for-pixel with the original artwork:
  - z = −0.36 inpainted wet neon alley backdrop
  - z = −0.05 rear red lantern
  - z = +0.15 six-panel 深夜ラーメン noren curtains
  - z = +0.20 front red lantern
  - z = +0.34 seated woman + counter + ramen bowl + stool

## Features (full scope)

1. **Depth plates + parallax.** Mouse / touch drag parallax (Cinematic
   Drift by default, toggleable), wheel/pinch zoom clamped 1.0×–1.18×.
2. **Live2D-style character rig.** 128×72 vertex grid on the woman plate:
   chin-palm pivot head tilt/nod, full-silhouette shoulder/hood breathing,
   back hair & bangs breeze sway, cursor eye-gaze drift, 3-stage natural
   blink, 8×-supersampled eyelid patch, 5-tap CAS sharpening on displaced
   pixels.
3. **GPU shallow-water puddles.** 256×256 RGBA HalfFloat ping-pong PDE
   with reflective Neumann wall/curb boundaries, fed by awning drip
   landings, rain impacts, cursor click/drag splashes; neon reflections
   strictly inside the street mask.
4. **Rain & drips.** Depth-occluded slanted alley rain (7°–15°), sparse
   organic awning drips with gravity acceleration, locked to puddle
   splashes. Zero rain inside the stall (dry indoor mask).
5. **Noren curtains.** Six independent cloth panels, pinned at top rod
   tabs, travelling wind ripples, organic billow, per-panel spring
   deflection when brushed by the cursor. No tearing.
6. **Lanterns.** Rear + front red lanterns swinging on measured ceiling
   hook pivots, coupled pendulum sway, cursor brush impulses, warm glow
   modulation.
7. **Neon signs.** Independent stochastic ballast flicker across the
   signs (深夜ラーメン, OPEN, 居酒屋, ラーメン, vending machine),
   click-to-spark with transient blackout surges, emissive bloom synced
   to Z-relief.
8. **Steam, flame, mist, fan.** Curl-noise bowl/pot steam (cursor-swirlable),
   blue stove gas flame, deep alley mist, powerline sway, AC fan blades
   occluded behind grille bars.
9. **Narrative events.** Passing taxi headlights sweeping wet-asphalt glare;
   sky-feathered sheet lightning with neon brownout + synced thunder.
10. **Optics & post.** SRGBColorSpace + NoToneMapping (color-true anime
    pipeline), single-pass post with stove thermal heat-haze, draggable
    Before/After split-compare curtain (original JPEG vs live 3D).
11. **Mood presets.** Drizzle, Typhoon, 3AM, Steam — one click each.
12. **Procedural spatial Web Audio.** Zero audio files. Rain/downpour,
    pitched awning drips, broth pot simmer, 120 Hz neon buzz + spark
    crackle, thunder, wet-tire whoosh, distant JR train rumble, toggleable
    Kitchen Lo-Fi Radio. Stereo panning tied to camera parallax.
13. **HUD & inspector.** Smoked-glass desktop HUD + mobile bottom sheet
    (375×812, unclipped); 5 sliders (Rain Intensity, Wind, Neon Flicker,
    Steam, Parallax Depth); Lightning trigger, Reset Defaults; 6-mode Layer
    & Mask Inspector (Final, No-Post, Depth, Masks, Emissive, Original +
    7 per-layer toggles); keyboard shortcuts C Compare, H Hide HUD,
    Space Pause, M Audio, D Inspector.

## Build order (one build, in this order)

1. Assets: source art → depth map → `scripts/slice.py` → plates + masks.
2. Static parallax scene (plates, overscan, rest alignment pixel-perfect).
3. Character rig (breathing, blink, hair, gaze).
4. Weather & water (rain, puddles PDE, drips, mist).
5. Neon / lanterns / flame / fan + tactile interactions.
6. Events (taxi, lightning) + post pass (heat-haze, compare curtain).
7. Audio engine + HUD / presets / inspector.
8. CI + CLAUDE.md + deploy + live E2E.

## Acceptance criteria

- [ ] Rest state (no input) registers pixel-for-pixel with the source art.
- [ ] Parallax moves all five plates with correct relative depth; no
      disocclusion holes visible at full ±0.26 / ±0.14 shift.
- [ ] 60 fps on desktop Chrome; mobile usable with no WebGL → CSS
      parallax fallback, no crash.
- [ ] All 11 shader passes present and visible; rain never falls inside
      the stall; puddle reflections never leak outside the street mask.
- [ ] All tactile interactions respond: brush curtains, spark neon,
      splash puddles, swirl steam, drag compare curtain.
- [ ] All four mood presets change the scene; all five sliders work;
      inspector shows all six modes and all seven layer toggles.
- [ ] Audio: every named sound synthesises live; no audio file in the repo.
- [ ] Depth model downloads once (~27 MB), caches, works offline after.
- [ ] No console errors on load or during a 60 s interaction session.
- [ ] Image + depth never leave the device (no upload, no cloud call).

## Verification (same discipline as donkey-kong-jr)

- Headless checks (`node --check`, layer/mask regression tests) PLUS a
  live browser E2E on the deployed URL. A headless pass alone never
  closes a fix; a live pass alone never closes it either.
- Smoke/perf checks must mirror live conditions: real frame cadence with
  jitter, real browser, seeded sim. A test that does not match reality
  is not verification.
- Reference: `sloemo01/diorama` (MIT) — Three.js diorama playbook with
  SKILL.md + QA harness, deterministic frames. Consult during build;
  do not copy its art or scenes.

## Out of scope

- AI video generation, cloud video APIs, cloud depth APIs.
- Multiplayer, accounts, leaderboards, comments.
- Any scene other than the ramen shop in v1.
- Paywall / monetisation in v1 (decide after v1 is live).

## Risks (honest)

- **Slicing + inpainting is the hardest step.** Browser depth (Small)
  is coarser than the original's Large; edges will be rougher. Mitigation:
  edge-bleed dilation + feathering, small parallax amplitude, and the
  inpainted backdrop behind every cutout.
- **Performance on mobile.** The water PDE + 11 passes are heavy.
  Mitigation: quality tiers (reduce PDE to 128×128 on small screens),
  CSS fallback.
- **Scope.** This is a large single build. If live E2E exposes a
  systematic failure (as Jr. round 1 did), diagnose frame-by-frame and
  fix in rounds — do not defend a passing headless test.

## Build record (2026-11-20, one full pass)

- Depth: the Node route failed — `npm install @huggingface/transformers`
  broke twice (onnxruntime-node postinstall "Invalid package config",
  then ECONNRESET to api.nuget.org). Offline depth was generated with
  Python onnxruntime 1.32.0 using the IDENTICAL model weights
  (`onnx-community/depth-anything-v2-small`, `onnx/model_quantized.onnx`,
  27,258,801 bytes). The in-browser app still uses
  `@huggingface/transformers` as specified; only the offline generation
  runtime differs. `scripts/depth.py` documents this.
- three.js CDN: `browser.open` of the jsDelivr URL failed with "Page not
  found" (do not re-attempt that fetch); verified instead via the npm
  registry (`npm view three version` → 0.187.0 is latest and exists).
  The app pins `three@0.187.0` in the importmap with a load-failure
  toast fallback.
- Depth map note: the ONNX output has no channel dim ([batch, H, W]) —
  the first run indexed it as [batch, 1, H, W] and produced a garbage
  1-D row stretched into a fake map. Fixed, re-ran, verified real.
- Bugs found by the headless tests during the build (all fixed, all
  covered by tests in `test/`):
  1. UV mapping was inverted: the geometry UVs were remapped INTO the
     inset window, which crops the image ~14% per side at rest. Correct
     mapping is texture-uv = (geometry-uv − u0)/(u1 − u0), so the
     visible central 1/OVERSCAN of each plate shows exactly the full
     artwork. Fixed in `plateGeometry`, the woman plate, the noren
     strips, and the street shader. (The head-pivot/eye local coords
     were already right — they use the inverse mapping.)
  2. `stepRain` never splashed: the exit test (`d.y > 1.02`) and the
     splash test (`d.y < 1.02`) were mutually exclusive, so rain
     produced zero splashes. Drops now carry a `land` y inside the
     street band and splash when they reach it.
  3. `validateManifest` expected `layers` to be an array; the manifest
     has an object keyed by id. The app would have thrown "manifest
     invalid" on every load. Fixed to check 5 object entries + strictly
     increasing z.
  4. Water height could spike to ~5 under heavy rain (reflection
     distortion). The PDE is now saturating: height clamped to ±2 in
     both the CPU `waterStep` and the GPU update shader.
  5. The CPU water path had a second heightfield that drifted from the
     sim's; the render loop now uploads the sim's own `sim.water`
     (32×32) as the CPU texture. Tap splashes go through a
     `pendingImpulses` queue (the old code wrote directly into the GPU
     uniform slot, which the next frame overwrote before use).
  6. The post pass rendered linear values to the screen without an
     sRGB encode (the image would have looked dark). `POST_FRAG` now
     encodes to sRGB on the way out.
- Performance: `waterImpulse` now iterates only the impulse disc's
  bounding box instead of the whole grid (same result, ~40× less work).
- CI (`.github/workflows/ci.yml`) runs `node --check` on scripts/tests,
  `node --test test/*.test.mjs test/smoke.mjs`, the Python slice tests,
  and the source-art existence check. Note: `node --check` on the inline
  `index.html` script blocks is covered by `test/smoke.mjs`, which
  extracts and checks them. (Round 1 fix: the CI glob used to be only
  `test/*.test.mjs`, which never matched `test/smoke.mjs` — the smoke
  suite was never run by CI until this fix.)

## Fix round 1 (2026-11-20, local only — not yet pushed or live-verified)

Live E2E 2026-11-20 13:53–14:10 (cloud browser, 1919×998, software
WebGL) returned NOT SHIPPABLE. Every failure below was diagnosed from
the code first (verified, not guessed), then fixed, then covered by a
regression test. Nothing in this round was verified in a live browser.

1. **Rest alignment — noren strips vertically flipped.** `buildNorenStrips`
   placed strips at y = `(0.5 - v) * PLANE_H * s` with `v = 1 - fy/1080`
   (texture-v, from the bottom) — that equals `-(0.5 - fy/1080)`, the
   negative of the correct frame-fraction-from-top value. Measured: rod
   (fy=55) landed at y = −0.898 (below centre), hem (fy=730) at +0.352
   (above centre) — the cloth rendered upside-down and displaced, while
   the real noren area showed the punched-out static plate (inpainted
   wood with seams). The layer PNGs were NOT the problem: viewed
   directly, `layer2-noren.png` reads "深夜ラーメン" correctly, and the
   static-plate punch was verified numerically (alpha 0 inside the
   panels). The `plateGeometry` UV remap itself is correct
   (uvInset u0=0.0763, u1=0.9237; geometry u=0 → tex 0, u=1 → tex 1).
   Fix: strip y is now `(0.5 - fy / 1080) * PLANE_H * s` (rod +0.898,
   hem −0.352). The head-pivot/eye coords use the inverse mapping and
   were already right.
2. **Parallax gaps — three compounding causes.**
   (a) `coversFrame` ignored viewport aspect: it compared against
   `PLANE_W/2` (1.7778), but the camera fov is set from the height, so
   the visible half-width is `(PLANE_H/2) × aspect`. At the E2E viewport
   (aspect 1.923) the visible half-width is 1.923 and the max apparent
   plate shift is 0.279, so the required overscan is 1.239 — but
   OVERSCAN is 1.18, leaving a real ~0.104-world-unit gap at the frame
   edge at full deflection. (At 16:9, 1.18 suffices, margin 0.041.)
   The build's overscan change 1.036 → 1.18 "consistent with the zoom
   clamp" was a conflation: zoom clamp ≠ parallax coverage.
   (b) The emissive overlay (z=0.5) and street overlay (z=−0.359) were
   never registered in `plates`, so `syncScene` never shifted them —
   they stayed fixed while the plates moved, so the OPEN glow
   misaligned with the OPEN sign (ghost/duplicate) and the street
   reflection misaligned with the street. Both are now registered;
   the emissive overlay shifts with the backdrop depth (z=−0.36, where
   most signs live) rather than its own z=0.5, which would over-shift it.
   (c) The lantern plates' pivot offset was clobbered by `syncScene`'s
   plates loop: `buildLanterns` re-parents layer1/layer3 meshes into
   groups with `mesh.position.set(-local.x, -local.y, 0)`, but the loop
   read `mesh.position.z` (now 0, so shift = 0) and overwrote
   `mesh.position.x/y` every frame — the lantern plates were displaced
   by a full pivot offset (front lantern local ≈ (−0.915, +0.96)) and
   rendered off-frame; only their glow (from the fixed emissive
   overlay) remained visible. Fix: lantern groups carry
   `userData.baseX/baseY/z`, meshes are marked `userData.lantern` and
   skipped in the plates loop, and `syncScene` shifts the groups.
   Fix for (a): new `parallaxScaleFor(aspect)` — 1 at 16:9 and narrower,
   ~0.627 at aspect 1.923, 0 where even rest coverage fails. The shift
   is scaled, never the geometry, so rest alignment is untouched. The
   invariant is tested: at the clamped scale every layer covers at
   every aspect where rest coverage is possible (0.5, 1.0, 16:9, 1.923).
   Steam planes and mist now shift with their plates too (bowl steam
   with layer4 z=0.34, mist with z=−0.2); rain lines stay unshifted
   (full-frame weather).
3. **Live depth model — `dist/transformers.min.js` in
   @huggingface/transformers@3.7.2 is an ESM bundle, not a classic
   script.** Verified against the published tarball (10,377,577 bytes):
   the file ends with a bare `export{...}` and the string "Transformers"
   appears 0 times in it — it exposes NO global. The worker's
   `importScripts(...)` therefore threw a SyntaxError at worker
   evaluation (uncaught → `depthWorker.onerror` → "深度模型載入失敗"),
   failing in <2 s with no model download — exactly the E2E symptom.
   Even if importScripts had worked, `Transformers.pipeline` would have
   thrown ReferenceError. Fix: the worker is now a module worker
   (`new Worker(blobUrl, { type: 'module' })`) importing
   `{ pipeline, env, RawImage }` from the package root — the documented
   v3 browser pattern, the same one the paulkinlan demo that worked
   uses. `onerror` and the 'error' message now surface the real error
   text in the status line instead of the generic message.
4. **Water flip — the heightfield is bottom-origin in the shader but
   top-origin in the sim.** The street shader samples the water at
   `huv.y = tuv.y/0.352` where tuv.y is the frame fraction from the
   bottom; both the GPU render target and the CPU DataTexture read row 0
   at the frame bottom. But `stepRain` splashes, drip splashes, and
   street taps all used top-origin y — every splash rendered at the
   mirror-y position inside the street band. Fix: all splash y values
   flipped to bottom-origin (`1 - (land - 0.65) / 0.35` etc.); the tap
   mapping now lives in pure `RamenLogic.classifyTap` (tested: neon
   boxes, noren panels 0–5, lantern circles, steam rect, street fx/fy
   with the flip, none). This alone does not explain "no ripple
   observed" — the wiring is intact by inspection, and the E2E's street
   clicks may have missed the street region (one receipted click was at
   (1670,825), the counter) plus 4 fps makes a ~1 s transient easy to
   miss in stills — so feedback was made persistent (see 5).
5. **Interactions — splash/steam feedback was too weak/transient, and
   drag-brushing did not exist.** Steam `uSwirl` was a binary 0/1 offset
   of the noise domain set from `state.brush.active` for ANY pointer-down
   anywhere — a one-time pattern shift, not a visible swirl. Noren drag:
   `pointermove` only called `updatePointer`; only the initial tap
   applied a brush impulse — dragging across the curtains never brushed
   them. Fixes: `createSim` gains `rings: []`, `swirl: 0`,
   `swirlAng: 0`; `addRing` (cap 4, expire >3 s, drawn as expanding
   bright rings in the street shader via `uRings[4]`) and `addSwirl`
   (accumulates the drag angle, decays); a street tap now also drops a
   ring + toast "水花！" + audio blip; a drag over the noren brushes it
   (throttled by panel change / ~90 ms); a circular drag over the bowl
   steam rotates the steam noise domain by the accumulated angle
   (`uSwirlAng` uniform). `handleTap` is now a thin switch over
   `classifyTap`; neon spark behaviour is unchanged.
6. **H hides the inspector — per-element toggle bug.** H toggled
   `hidden` on every `.hud` element independently, so a panel that was
   already hidden (e.g. the closed inspector) got UNHIDDEN by H. Fix:
   one `toggleHud()` used by both H and the Hide button, toggling
   `document.body.classList.toggle('hud-hidden')`, plus CSS
   `body.hud-hidden .hud:not(#toast){display:none!important}` — the
   toast stays visible because it is transient feedback, not HUD chrome;
   individual panel states are untouched, so pressing H again restores
   exactly the previous visibility.
7. **Performance — 4 fps in the cloud browser (software WebGL, no GPU).**
   The sim is cheap (measured ~33× real time); the cost is GPU fill at
   full resolution (full-res scene render into postRT + full-screen post
   pass with 5-tap CAS, at 1920×998, `setPixelRatio(min(dpr,2))`).
   Fix: adaptive render quality — pure `qualityTierFor(fps, scale)`
   (tiers 1 / 0.75 / 0.5, step down if fps < 22, up only if fps > 50),
   evaluated every 2 s in auto mode; `applyRenderScale` resizes the
   renderer + postRT + `uRes`; a manual quality `<select>` in the HUD
   (Auto/高/中/低) overrides auto until Auto is picked again. Fill cost
   at 0.5× scale is 25% of full. Measured fps before = 4 (E2E, software
   WebGL); after = unknown until live E2E — desktop 60 fps is NOT
   claimed.

Tests added in this round (all in `test/logic.test.mjs` +
`test/smoke.mjs`): `coversFrame` aspect + `parallaxScaleFor` invariant,
`classifyTap` regions, water bottom-origin row, ring persistence/expiry,
swirl accumulate/decay, `qualityTierFor`, noren strip formula, lantern
group shift, overlay/steam registration, depth-worker module shape,
H body-class + rings + swirl wiring. Full suite after the round:
**34/34 JS tests + all Python slice tests pass.** The rain splash-y
assertion was updated to the flipped convention (it failed first, as
expected — the flip changed the contract).

