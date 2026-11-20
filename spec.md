# Ramen Diorama — spec.md

> Faithful to the Shinya Ramen (深夜ラーメン) 2.5D diorama showcase spec,
> built in one pass. Single static anime illustration → living 60 fps
> interactive diorama. No AI video, no looping MP4s, no cloud cost.
> Audio: procedural ambience is synthesised live; the lo-fi playlist
> is 6 real CC BY 4.0 tracks (user chose real tracks 2026-11-20 —
> see "Fix round 2" / the playlist exception below).

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
   splashes. Zero rain inside the stall (dry indoor mask). **Snowfall
   (hakodate-goryokaku only, 2026-11-20):** 250 soft round flakes, slow
   fall + sinusoidal sway, wind slider adds sideways drift; visible
   against dark sky and bright snow ground (white core, faint dark
   rim); one THREE.Points draw call; snow is a preset param, not a
   slider (see feature 11).
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
11. **Mood presets.** Drizzle, Typhoon, 3AM, Steam, Snow Night — one
    click each. Snow Night (rain 0, wind 0.2, flicker 0.3, steam 0.2,
    parallax 0.8, snow 1) turns the snowfall on; it works on all
    scenes, but snow only renders where the scene has it
    (hakodate-goryokaku). `snow` is a preset param like `lightning`,
    not a slider — readSliders preserves it across slider moves.
12. **Procedural spatial Web Audio + lo-fi playlist.** Ambience is
    synthesised live, zero audio files: rain/downpour, pitched awning
    drips, broth pot simmer, 120 Hz neon buzz + spark crackle, thunder,
    wet-tire whoosh, distant JR train rumble, toggleable Kitchen Lo-Fi
    Radio. Stereo panning tied to camera parallax. **Playlist
    exception (user chose real tracks 2026-11-20):** 6 real lo-fi MP3s
    in `assets/music/` (Free Music Archive, all CC BY 4.0, 24 MB total,
    16:49) with a HUD music panel — track list, play/pause, prev/next,
    auto-advance with wrap, volume, current-track display, and the
    exact attribution line for the playing track (in-app attribution
    is a license requirement). Tracks load on demand, never preloaded.
    The generative radio stays as a separate "合成" option in the same
    panel; playlist and radio are mutually exclusive. See
    `assets/music/README.md` for the license record.
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
- [ ] All five mood presets change the scene; all five sliders work;
      inspector shows all six modes and all seven layer toggles.
- [ ] Audio: every named sound synthesises live; the playlist plays
      the 6 real tracks with in-app CC BY 4.0 attribution (the only
      audio files in the repo — see the playlist exception in feature 12).
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

## Fix round 1 (2026-11-20 — pushed as `80573bc`, live re-tested 15:09–15:31)

Live E2E 2026-11-20 13:53–14:10 (cloud browser, 1919×998, software
WebGL) returned NOT SHIPPABLE. Every failure below was diagnosed from
the code first (verified, not guessed), then fixed, then covered by a
regression test. **Re-test 2026-11-20 15:09–15:31 (commit `80573bc`):
every functional item PASSED** — rest alignment, compare, parallax
with no gaps, depth model download + inference (~70 s), all four
interactions, presets/sliders/modes/toggles, all shortcuts incl. the
fixed H, no console errors. **The only failure left: fps stuck at
4–5 in the cloud browser** (software WebGL, no GPU) — manual Low
produced no improvement and Auto never visibly stepped down. That is
fix round 2.

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

## Fix round 2 (2026-11-20, local only — not yet pushed or live-verified)

Live E2E re-test 2026-11-20 15:09–15:31 (commit `80573bc`) passed
everything functional; the ONLY failure was fps stuck at 4–5 in the
cloud browser (software WebGL, no GPU), with manual Low producing no
improvement and Auto never visibly stepping down. This round diagnoses
first, then fixes — plus the lo-fi playlist the user chose the same
day. Nothing in this round is verified in a live browser yet.

### Part A — performance diagnosis (measured, not guessed)

Per-stage headless harness (`/tmp/r2-perf.mjs`, ephemeral) + layer
alpha coverages measured from the shipped PNGs (woman 0.251, rear
lantern 0.018, noren 0.209, front lantern 0.029):

1. **The fps meter lied — it floored at 4 fps.** `loop()` feeds the
   fps meter the SAME `dtWall` it feeds the sim, and `dtWall` is
   clamped to 0.25 s (`Math.min(0.25, ...)`). So the meter could never
   read below 1/0.25 = 4 fps: a 2 fps frame and a 4 fps frame both
   read "4 fps". The round-1 re-test's "Low produced no improvement"
   is therefore unproven — the frame time may have halved and the
   meter could not have shown it. Verified numerically: a 4-frame
   0.5 s sequence reads 4 fps through the old meter, 2 fps through
   the raw interval. Fix: the loop now computes `rawDt` (unclamped)
   for the meter and shows `fps · frameMs` in the HUD; the sim still
   advances on the clamped `dtWall`.
2. **The quality tiers did not reduce the dominant cost.** The
   fragment-fetch model at 1919×998 (1.91M visible px), from the
   measured coverages: before = 56.1M fetches/frame — scene render
   into postRT 16.6M (woman plate alone 9.6M: full-frame quad × 5-tap
   CAS, but the woman covers only 25% of it), street 9.6M (water
   heightfield 5 fetches + steam 4.6M), emissive 5.7M (5 fetches on a
   mostly-black mask), noren strips 0.5M, lantern plates ~1.5M
   invocations for ~0.05M covered px, and the post quad 38.3M — the
   single biggest cost, because `antialias: true` made the browser
   run the post pass at 4× MSAA (5 fetches × 4). `applyRenderScale`
   only shrank the drawing buffer and postRT — at 0.5× it cut fetches
   to 19.5M, but the post pass was still 4× MSAA'd, and the auto
   evaluator had no way to show it had stepped down (the select only
   ever displayed the mode "畫質：自動"), so "Auto never stepped
   down" was also unverifiable from the outside. The CPU side is
   innocent: sim 3600 steps ≈ 1.2–1.8 s wall (~33× real time),
   `waterStep` on the 32×32 grid ≈ 0.001 ms/step, zero per-frame
   texture uploads (all 9 textures are static; water is a 4 KB
   DataTexture upload per frame) — the bottleneck is fragment fill
   in software rasterization, not JS.
   Fixes, all verified by the fragment model in
   `test/slices.test.py` (computed from the real layer PNGs):
   - `antialias: false` — the scene render into postRT was never
     multisampled (render targets don't inherit canvas MSAA), so
     only the post quad changes; post goes 38.3M → 9.6M fetches.
   - Woman shader discards fully transparent fragments BEFORE the
     4 CAS neighbour fetches (`if (c.a < 0.02) discard;`) — saves
     ~5.7M fetches/frame at 1919×998 (75% of the plate is
     transparent). Visually identical: alpha < 0.02 blends to
     nothing anyway.
   - Lantern plates (layer1/layer3) get `alphaTest: 0.02` — their
     ~97–99% transparent pixels skip blending. Honest limit: an
     alpha test discards AFTER the texture fetch, so this saves
     blend/overdraw cost, not fetches; the fetch saving is the
     woman discard above.
   - Cheap post at the lowest tier (`uCheap` uniform): a single
     fetch, no 5-tap CAS, no heat-haze — the low tier must be
     cheaper in fragments, not just in resolution. Flash, curtain,
     vignette and sRGB still apply.
   - Auto now shows the ACTIVE tier: `applyRenderScale(next, true)`
     rewrites the Auto option label to e.g. "畫質：自動 → 低 0.5×"
     and toasts on a step-down.
   Model result: 21.7M fetches/frame at high/mid tier (39% of
   before), 14.0M at the low tier (25% of before). **This is a
   fragment model, not a measured fps gain** — the cloud browser's
   software rasterizer cannot be reproduced on this VM, and desktop
   60 fps is NOT claimed. Live E2E must measure the real fps.
3. **Sliders — no app bug.** The round-1 re-test saw no pointer
   response, but the wiring is a plain native `<input type=range>`
   + `input` listener, the panel sits above the canvas at z-index
   10 with no `pointer-events` block, and keyboard control works —
   the non-response is a synthetic-input artifact of the test
   harness. Belt-and-braces: sliders now also listen for `change`
   (pointer commit) and every label carries `for` so clicking a
   label focuses its slider. Live E2E must confirm pointer-drag on
   a real mouse.
4. **layer3 toggle — no bug.** The front lantern PNG was viewed
   directly (a large red paper lantern, top-left of the frame) and
   the toggle is wired to the right mesh (`setLayerVisible('layer3')`
   hides the lantern group); at 4 fps with a mostly-static scene
   the change is subtle in stills. Live E2E must confirm it hides
   the lantern visibly.

### Part B — lo-fi playlist (user chose real tracks 2026-11-20)

6 tracks from Free Music Archive, all **CC BY 4.0**, downloaded and
verified 2026-11-20 (ffprobe + full decode, zero errors):
`01-kyoto-1000-handz.mp3` (Kyoto, 1000 Handz, 2:36),
`02-shanghai-1000-handz.mp3` (Shanghai, 1000 Handz, 2:07),
`03-shatter-1000-handz.mp3` (Shatter, 1000 Handz, 2:40),
`04-silent-wood-purrple-cat.mp3` (Silent Wood, Purrple Cat, 3:08),
`05-long-day-purrple-cat.mp3` (Long Day, Purrple Cat, 3:05),
`06-through-the-trees-purrple-cat.mp3` (Through the Trees, Purrple
Cat, 3:12). Total 24,221,540 bytes (~24 MB), 16:49. License record
with source URLs and exact attribution text:
`assets/music/README.md`. **In-app attribution is a license
requirement, not decoration** — the playing track's attribution line
is shown in the music panel; no attribution = license violation.
Pixabay Music was blocked (Cloudflare bot challenge + runtime fetch
policy); FMA was the source that worked.

Built: a Music panel in the HUD (🎵 button in the control panel;
the old 📻 Lo-Fi button moved inside it). Track list (title —
artist + duration); tap a track to play it; play/pause, prev/next
buttons; auto-advance on `ended`, wrapping at the end; current-track
display; volume slider. Playback via `<audio>` + Web Audio
`MediaElementSource` through a new `AudioEngine.nodes.music` bus
(music gain → master), so the audio on/off switch mutes music with
the ambience and the volume slider controls it. The generative
Kitchen Lo-Fi Radio stays as a separate "合成" option in the same
panel (its chord pad now also routes through the music bus, not
straight to master); playlist and radio are mutually exclusive —
starting one stops the other. Pressing play on a track turns the
master audio on (an explicit request to hear music); auto-advance
does NOT re-enable audio if the user muted. **No preloading:** the
element has `preload = 'none'` and `src` is set only when a track
is played (24 MB is never fetched on page load). Rain ambience stays
independent. The "no audio files in repo" rule now carries an
explicit exception (this playlist, CC BY 4.0, in-app attribution) —
recorded here, in `CLAUDE.md`, and in `assets/music/README.md`.

Tests added in this round: playlist manifest match (6 files on disk,
>1 MB each, durations sum to 1008 s listed / 16:49 precise,
attribution contains artist + CC BY 4.0 + license link for every
track), `playlistNext`/`playlistPrev` wrap, fps-meter raw-dt,
quality-tier fragment reduction + Auto tier label, slider `change`
+ label `for`, playlist UI wiring (panel/radio placement, track
list from PLAYLIST, `ended` → `playlistNext`, attribution follows
the playing track, `preload = 'none'`, single `src` assignment,
music bus + `createMediaElementSource`, radio through the music
bus). Full suite after the round: **40/40 JS tests + all Python
slice tests pass** (incl. the fragment model: 21.7M vs 56.1M high/mid,
14.0M vs 56.1M low tier).

### Live E2E still to check for this round (do NOT close it without this)

- fps on a real GPU (cloud browser is software WebGL — note the
  reading), and whether Auto visibly steps the tier down at 4 fps
  (the select label + toast) and Low actually improves fps.
- Slider pointer-drag on a real mouse (keyboard worked; synthetic
  pointer did not).
- layer3 toggle hides the front lantern visibly.
- Playlist: tap a track → plays; prev/next wrap; auto-advance on
  track end; volume slider; attribution line visible for the playing
  track; radio still works and is labelled 合成; no 24 MB preload
  on page load (network check).
- Mobile ~390 px (not testable in the cloud browser; do not claim
  mobile works).
- Re-check the round-1 fixes (rest alignment, parallax, depth,
  interactions, presets, shortcuts, H) still hold.


## Phase 2 — multi-scene (2026-11-20, local only — not yet pushed or live-verified)

User request 2026-11-20 ~16:08: five more Tokyo lo-fi scenes to switch
between (Osaka kissaten, Kyoto machiya matcha house, Kamakura Enoden,
Tokyo shitamachi street, Kyoto Yasaka pagoda). Phase 1 (art + depth +
slice, 42 MB) was built and verified separately; this phase is the
scene switcher in `index.html`.

### Architecture

- **Scene registry `SCENES` in the logic block** (6 entries: ramen +
  5 scenes). Each entry carries: `id/name/title/dir`, `taxi` (ramen
  only), `rig` (pivot + hair flag + blink sigma, or null), `cloth`
  (layer + panels, or null), `lanterns` (swing defs, or `[]`), `signs`
  (emissive tap boxes), `steam` (src/top/width/z/mist), `street`
  (pixel rect), `drips` (awning band, or null). The registry is the
  single source of truth for interaction geometry; the manifest is
  the source of truth for render assets (layer/mask file names, z,
  cloth_layer, static_file).
- **Lazy loading.** Only the selected scene's assets are fetched
  (~7–9 MB). The other five scenes (~42 MB total) are never
  preloaded. `loadScene(id)`: fetch `dir/manifest.json`, validate,
  fetch that scene's layers/masks/source/depth, dispose the old
  scene graph (geometries, materials, textures, water render
  targets — `postRT` is reused, not disposed), rebuild, persist the
  choice in localStorage (`ramen-diorama.scene`). The mood and
  sliders are preserved across a switch; the sim is recreated per
  scene (noren count, drips, taxi). A fetch failure happens before
  the swap, so the old scene stays intact and the picker resets to it.
- **Picker.** `<select id="sel-scene">` in `#topbtns`, 6 Chinese
  names; the page `<title>` and the HUD title follow the scene.
- **Per-scene generalization.** Every ramen-hardcoded constant now
  comes from the manifest or the registry: eyes/bowl/steam/lantern
  pivots/counter_top_y/noren_rod/awning_drips, the street band
  (`uStreetBand` uniform in the street shader — ramen (0, 0, 0.36,
  0.3519) reproduces the old `tuv.x/0.36, tuv.y/0.352`), the post
  brightening centre (the scene's steam source), the depth worker's
  source art (`manifest.source`), the inspector depth/original/mask
  paths (`sceneDir + ...`). The rig shader takes `uHair` and
  `uBlinkSigma` uniforms (matcha's hair sits outside the shader's
  hair UV zone, so it stays 0 there; the eye gaussian scales with
  the eye separation — ramen 0.00045, matcha 0.00018, osaka 0.00024).
- **Graceful degradation.** Scenes without ramen-style anchors do
  not crash: no eyes → plain layer4 plate (no rig); no cloth →
  no strips; no lanterns → no swing groups; no drips (osaka, an
  interior) → no drip loop; no taxi → no taxi group. The sim's
  `signs`/`lanterns` arrays are built from the registry per scene
  (ramen 5/2, osaka 4/1, matcha 1/1, enoden 5/0, shotengai 5/0,
  yasaka 4/0) — the old hardcoded `for (i < 5)` flicker loop and
  `for (i < 2)` lantern loop would have thrown on the smaller
  scenes. The emissive `uSigns` upload guards missing signs.
- **Cloth layer.** Ramen's noren is on layer2 (2 panels, 6 strips);
  shotengai's is on layer3 (3 panels, 9 strips, `cloth_layer:
  "layer3"`, `static_file: "layers/layer3-static.png"`). The strip
  rig, the static variant, and the layer toggle all read the
  manifest's cloth layer. The other four scenes have no cloth.
- **Lantern swing is explicit, not by layer.** Only ramen (2),
  osaka (1, pendant lamps), and matcha (1, paper lantern) have
  swing groups. Enoden's layer1/layer3 are a station building and
  a train, yasaka's are the pagoda and the red-umbrella figure,
  shotengai's layer3 is the izakaya block — none of them swing.

### Bugs found while generalizing (both fixed in this phase)

- **Steam mirrored to the top of the frame (ramen, latent since the
  build).** `buildSteamMist` passed `bowlV = 1 - y/1080`
  (texture-v, from the bottom) where `mkSteam` expects a frame
  fraction from the top — the bowl steam sat at frame y≈44 instead
  of just above the bowl (≈722). The ramen `mask-steam` bbox
  (x 1316–1694, y 560–995) confirms the column runs from the bowl
  (885) up to the steam top (560). Fix: pure `steamPlaneRect(steam)`
  in RamenLogic — plane centred on the source/top midpoint, height
  = (srcY − topY)/1080 — used by `buildSteamMist` for all scenes.
  This CHANGES the ramen scene's steam placement (for the better,
  per design intent) — live E2E must confirm the steam now sits
  above the bowl. 1-line revert if the parent disagrees.
- **Osaka lamp tap overlap (minor, known, not fixed).** The osaka
  pendant-lamp centre (848,200) sits inside the window-glow sign
  box [631,99,954,387], so tapping the lamp sparks the sign; the
  tap circle's edge (960,200) is outside the box and swings the
  lamp. The lamps still swing from wind; only the tap mapping
  overlaps. Pinned in the tests.

### layer3 finding (E2E #3 open item — investigated, not a bug)

The live re-test reported: unchecking layer3 removed the low
mist/fog band, not the big front lantern; the lantern vanished
only with layer4. The evidence says the mapping is correct:

- PNGs (measured): inside the front-lantern bbox (x 320–570,
  y 0–362) layer3 is 82% opaque, layer4 is 0%, layer1 is 0%;
  the street band (y 700–1080, x 0–691) has 0% layer4 alpha and
  8.7% layer2 alpha. Pinned in `test/slices.test.py`.
- Code: `setLayerVisible('layer3')` hides the layer3 swing group
  (the lantern plate); `setLayerVisible('layer4')` hides only the
  woman plate. The mist plane is NOT in `plates` — no layer
  toggle can hide it. Pinned structurally in `test/smoke.mjs`.
- Most likely explanation: E2E misattribution — the animated mist
  noise plus the emissive glow overlay (additive, not tied to the
  toggle) persisting after the lantern body hid.
- Phase 2 also hardened the toggle: the lantern-group branch now
  applies only when a swing group actually exists for that layer
  (on enoden, layer3 is the train plate, not a lantern — the old
  branch would have hidden nothing).
- **Still needs a live re-check** to close it: toggle layer3 on
  the live ramen scene and confirm the front lantern (not the
  mist) disappears. Do NOT claim the E2E was wrong without it.

### Per-scene fragment cost (same model as round 2, at 1919×998)

| scene | before | high/mid | low | notes |
|---|---|---|---|---|
| ramen | 56.1M | 21.7M (39%) | 14.0M (25%) | rig, cov4 0.26 |
| osaka-cafe | 55.5M | 22.8M (41%) | 15.2M (27%) | rig, cov4 0.48 |
| kyoto-matcha | 55.5M | 21.5M (39%) | 13.8M (25%) | rig, cov4 0.31 |
| kamakura-enoden | 47.9M | 19.2M (40%) | 11.5M (24%) | plain layer4 |
| tokyo-shotengai | 48.3M | 19.5M (40%) | 11.9M (25%) | plain layer4, strips 0.20 |
| kyoto-yasaka | 47.9M | 19.2M (40%) | 11.5M (24%) | plain layer4 |

All scenes: high/mid < 45% of before, low < 30% — the quality
tiers stay honest. Model in `test/scenes.test.py` (rig scenes use
the CAS term `(1−cov4)+5·cov4`, non-rig use 1 fetch for layer4;
strips term = cloth-layer coverage or 0). This is a fragment model,
NOT a measured fps gain.

### Tests after this phase

- **48/48 JS** (`node --test test/*.test.mjs test/smoke.mjs`):
  6 new logic tests (registry + ramen constants, steamPlaneRect,
  classifyTap per scene, createSim per scene, validateManifest
  eyeless, cloth layer) + 2 new smoke tests (layer3 wiring,
  picker + loadScene + persistence + lazy load + dispose).
- **Python**: `test/slices.test.py` (layer3 pin) + `test/scenes.test.py`
  (per-scene fragment model) — all pass.
- `node --check` passes on both script blocks.

### Live E2E still to check for this phase (do NOT close it without this)

- Switch to each of the 5 new scenes: loads, looks right, rest
  alignment holds, parallax has no gaps, interactions respond
  (tap the signs / brush the shotengai noren / splash the street /
  swirl the steam), presets + sliders + inspector work per scene.
- Ramen steam now sits above the bowl (the mirroring fix).
- layer3 toggle on the live ramen scene: the front lantern (not
  the mist) disappears.
- Reload returns to the selected scene (localStorage).
- No preload of all 42 MB on page open (network check).
- fps on a real GPU per scene; the quality tiers still step down.
- Mobile ~390 px (not testable in the cloud browser; do not claim
  mobile works).
- Re-check the round-2 items still hold (playlist, sliders, H).

### Scene-switch 404 fix (2026-11-20, found by the Phase 2 live E2E)

Live E2E 2026-11-20 17:10–17:21 verdict NOT SHIPPABLE: switching to
osaka-cafe, kyoto-matcha, kamakura-enoden and kyoto-yasaka all failed
with a toast "場景載入失敗：[object Event]" and reverted to ramen;
tokyo-shotengai loaded but took 30–40 s. Steam fix, layer3 toggle
and the ramen regression all passed.

Root cause (verified against the deployed site: 75 files checked,
exactly 4 non-200): `sceneTextureFiles` fetched
`layers/layer2-static.png` for EVERY scene, but that file exists
only for ramen (and shotengai has its own `layer3-static.png`).
The four cloth-less scenes 404d, and `loadTexture` rejected with
the raw THREE error event, which the toast stringified as
"[object Event]". Deeper: `buildPlates` also defaulted a missing
`manifest.cloth_layer` to `'layer2'`, so those scenes would have
treated their real layer2 as cloth even if the file had loaded.

Fix (in `index.html`, tests 59/59): new pure `clothLayerFor(def, m)`
in the logic block — null when the registry has no cloth, otherwise
the manifest's `cloth_layer` or the registry's cloth layer.
`sceneTextureFiles` includes `clothStatic` only when it returns a
layer; `buildPlates` renders the cloth-static plate only when it
returns a layer (otherwise layer2 is a normal static plate);
`loadTexture` now rejects with `new Error('failed to load ' + url)`
so the toast shows a readable message. Pushed together with the
multi-language UI below; re-test live.

## Multi-language UI (2026-11-20, local only — not yet pushed or live-verified)

User request 2026-11-20 17:14 (after confirming scene switching works
on his own device): English and Japanese modes in addition to the
current Chinese UI. Chinese stays the default.

### Design

- **One table, `I18N = { zh, en, ja }`, in the logic block** (94 keys).
  Every user-facing string goes through it — HUD buttons, presets,
  slider labels, inspector modes + layer-toggle labels (layer ids
  themselves are technical and stay), music panel, scene picker
  names, toasts, loading/status lines, help/shortcut text, error and
  empty states. The app script contains NO hardcoded UI strings
  (a smoke test asserts this: the app script, comments stripped,
  contains zero CJK characters).
- **Lookup: `t(lang, key, vars)`.** Falls back to zh for an unknown
  language, returns the key itself for an unknown key (never renders
  blank). `{var}` placeholders substitute verbatim; the caller owns
  any punctuation around a var (e.g. the `：` / `: ` separator in
  `depth.error` is chosen per language at the call site).
- **Scene names live in the registry**, not the table: each `SCENES`
  entry gained `names: { zh, en, ja }` + `emoji`. The picker option
  text is `emoji + ' ' + sceneName(id, lang)`. The six names:
  拉麵店 / Ramen Shop / ラーメン店； 大阪喫茶店 / Osaka Kissaten /
  大阪喫茶店； 京都町家抹茶屋 / Kyoto Machiya Tea House /
  京都町家抹茶屋； 鎌倉江之電 / Kamakura Enoden / 鎌倉江ノ電；
  東京下町商店街 / Tokyo Shitamachi Street / 東京下町商店街；
  京都八坂塔 / Kyoto Yasaka Pagoda / 京都八坂の塔.
- **Switcher + persistence.** `<select id="sel-lang">` in `#topbtns`
  (中文 / English / 日本語 — language names are never translated).
  Choice persists in localStorage key `ramen-diorama.lang`
  (`savedLang`/`validLang` in the logic block; unknown or unreadable
  value → zh). `applyI18n()` re-renders everything immediately:
  static `[data-i18n]` / `[data-i18n-title]` / `[data-i18n-alt]`
  elements, scene picker options, quality options (incl. the auto
  step-down label), audio button state, curtain label
  (`data-label` + CSS `attr()`), depth status, loading line, music
  panel — and sets `document.documentElement.lang` (`zh-Hant` /
  `en` / `ja`). The font stack gained Hiragino/Yu Gothic/Meiryo so
  Japanese renders on systems without CJK fonts.
- **Dynamic strings are state, not text.** Depth status and loading
  progress keep `{key, vars}` (`depthStatusState`,
  `progressState`) and re-render through `tr()` — a language switch
  mid-download does not leave a stale Chinese status line. All
  `setProgress(f, message)` call sites now pass keys
  (`load.reading`, `load.layers` with `{loaded, total}`,
  `load.building`, `load.done`); all depth-status assignments go
  through `setDepthStatus(key, vars)`.
- **NOT translated (deliberate):** track titles and artist names
  (proper names — "Kyoto" by 1000 Handz stays); the "CC BY 4.0"
  license name and its URL (only the surrounding wording is
  translated); technical identifiers (layer ids, inspector mode
  values, `z=` labels); the scene header title (`sceneDef.title`
  — the artwork's title, like a painting's name; for ramen it is
  深夜ラーメン, for the five new scenes it is the Chinese name).

### Chinese strings changed (only two, both listed)

1. **Switch-scene toast.** Was `已切換到「{sceneDef.title}」` —
   for ramen that rendered the Japanese title
   `已切換到「深夜ラーメン」`. It now uses the translated scene
   name, so zh shows `已切換到「深夜拉麵」`. The other five scenes
   are unchanged (their `title` already equals their Chinese name).
   This is the intended behaviour (toast follows the current
   language, like the picker), not a rewording.
2. **Panel heading.** Was `氣氛 ATMO&shy;SPHERE` (with a soft
   hyphen for line-breaking); `textContent` cannot carry `&shy;`,
   so it is now `氣氛 ATMOSPHERE`. Renders identically; only the
   invisible hyphen is gone. Every other zh value is the exact
   string the app shipped with.

### Tests after this change

- **57/57 JS** (`node --test test/*.test.mjs test/smoke.mjs`,
  was 48): 5 new logic tests (default zh, full-table key parity
  across the three languages, `t()` fallback + `{vars}`
  substitution, all 6 scene names in all 3 languages,
  `savedLang` round-trip + unknown/throwing storage) + 4 new smoke
  tests (switcher exists + persists + re-renders, every
  `data-i18n(*)` key exists in all three languages and every I18N
  key is used somewhere, picker re-renders from scene names, no
  hardcoded CJK in the app script). Python slice + scene tests
  still pass. `node --check` passes on both script blocks.
- Adding a string: add the key to ALL THREE tables in `I18N`
  (the parity test fails otherwise), wire it with `data-i18n` /
  `tr()`, and the coverage test fails if the key is never used.
  See `CLAUDE.md`.

### Live E2E still to check for this change (do NOT close it without this)

- Switch to EN and JA: every HUD string changes (presets, sliders,
  inspector modes, music panel, scene picker names, toasts,
  depth status, loading line, keys hint, curtain label).
- Persistence: pick JA, reload, still JA; pick EN, reload, still EN.
- No overflow: Japanese strings are longer — check the 248 px
  control panel and the 300 px music panel at ~390 px width.
- Switch back to zh: the exact original wording returns (see the
  two changed strings above).
- The switch-scene toast shows the translated name in each language.
- No console errors on a language switch mid-load or mid-download.

## Layer-seam fix (2026-11-20, local only — not yet pushed or live-verified)

User request 2026-11-20 18:40, after the 17:42–17:55 live E2E (verdict
SHIPPABLE) noted blurred rectangular layer seams at rest in every
scene — most obvious in 抹茶屋 (a brown vertical strip through the
shelves, a grey strip over the garden) and 大阪喫茶店.

### Root cause (measured, not guessed)

The plates are minified by the renderer — 1.18x overscan at rest, up
to ~2.4x at the lowest quality tier — and mipmapped bilinear
filtering blurs the alpha edge. With the old 2 px feather, the
blurred edge lets the inpainted backdrop leak through at every layer
boundary. Measured by simulating the minification (downscale each
plate 1/1.18 with bilinear, upscale back, composite, compare against
the resampled source — the generic resample blur cancels out, so
what remains is the boundary error): **0.5–0.9% of pixels off by
>12** with the old assets. Total coverage at rest was 1.0
everywhere, so this was NOT a missing-pixel gap, and the RGB of the
transparent pixels was NOT the driver — a colour-bleed experiment
changed the minified error by <0.01, so no bleed step was added
(it would also have undone the PNG compression from zeroing RGB
where alpha is ~0).

### Fix

- **12 px edge bleed** (`soft()` in `scripts/slice.py`, the Shinya
  showcase's number): layer alpha is dilated 12 px, then blurred
  (sigma 3). The total coverage stays ~1 at the true boundary even
  after the mip blur, so the seam disappears; the dilated band
  carries the source colour, so at rest it is invisible, and during
  parallax it is a <=12 px fringe moving with the wrong layer —
  negligible against the shift.
- **Backdrop inpaint holes dilated 15 px** (was 9), so no foreground
  ghost remains inside the 12 px band to show during parallax.
- Re-sliced all 6 scenes (ramen + 5). Rest composite actually
  improved (ramen mean abs diff 0.305 → 0.058, osaka 0.464 → 0.067)
  because the dilated layers now cover the boundaries fully.
- **32 PNGs changed** (all 30 layer plates + 2 cloth-static
  variants); all 42 masks byte-identical; depth maps and source art
  untouched. The 6 manifests changed only in `rest_composite`
  (better numbers). PNGs needing re-upload (browser): the 30 layer
  plates + `assets/layers/layer2-static.png` +
  `assets/scenes/tokyo-shotengai/layers/layer3-static.png`.
- Tests: the alpha-coverage upper bound is now +0.08 (was +0.03;
  measured max growth +0.051, osaka layer2), and both Python suites
  gained a minified-composite check (mean < 0.15, zero pixels off
  by >12 — measured 0.03–0.04 mean, 0.00% on all 6 scenes).
  JS 59/59, both Python suites pass.

### Live E2E still to check for this change (do NOT close it without this)

- At rest in each of the 6 scenes: no visible seams / strips along
  layer boundaries (check 抹茶屋 shelves + garden and 大阪喫茶店
  first — the worst two).
- During parallax: no ghost fringe at boundaries, no missing slivers
  at the frame edges.
- The cloth scenes (ramen, shotengai) still render the strips
  correctly — the static variants were regenerated from the
  re-sliced layers.

## Osaka drip bug + seams verdict (2026-11-20, found by E2E #6 — fix local, not yet pushed)

### E2E #6 result (2026-11-20 19:38–19:45, head ac40092): NOT SHIPPABLE

- Build stamp correct (19:28). Ramen seams PASS at rest and full parallax.
- Osaka-cafe: switch shows the ramen scene again + a pale tan block;
  cold start with osaka as the remembered scene = black canvas 40+ s,
  no loading text, no toast, fps "—". Switching back to ramen recovers.
- Matcha / shotengai / yasaka: the reported strips are STILL visible.
  Enoden mostly clean, only a thin left-edge artifact.
- Regressions all PASS (language, music panel, presets).

### Osaka root cause: a render-loop bug, not deployment, layers, or slicing

`syncRainLines()` looped 16 drip segments unconditionally
(`const d = sim.drips[i]; const on = d.wait <= 0;`). Osaka is the ONLY
scene with `drips: null` in the registry, so `createSim` gives it
`drips: []` — `sim.drips[0]` is `undefined` and the first animation
frame throws a TypeError. `syncRainLines()` is the first call in
`syncScene()`, which runs before rendering, so no osaka frame was ever
drawn; `requestAnimationFrame(loop)` is scheduled first, so every frame
throws identically and the picture freezes forever. That explains every
symptom: the "osaka" view is the frozen pre-switch ramen frame (the tan
block is the frozen ramen street overlay's edge); cold start loads fine
then throws before the first draw, and the fps meter update sits after
`syncScene`, so it never runs. Deployed osaka manifest/PNGs/index.html
are byte-identical to local (sha256 checked); local osaka art is a real
kissaten. CORRECTION: E2E #5's "osaka PASS" was a false pass — the same
unguarded loop was in 759a447; the check trusted the progress bar +
toast + picker value without verifying the pixels.

Fix (code only, 1 place): the drip loop parks a missing drip off-screen
(`if (!d) { ...; continue; }`). `stepSim` was already correct (loops on
`sim.drips.length`); only the render side assumed 16 drips always exist.

Secondary fix (same incident): a first-load failure was invisible —
`loadScene`'s catch hides `#loading` before rethrowing, and `init`'s
catch wrote the failure message into the now-hidden `#loadmsg`, leaving
only a toast that disappears in seconds. `init`'s catch now un-hides
`#loading` so the message stays on screen.

### Seams verdict: the remaining strips are IN the source art, not seams

Measured on the deployed PNGs: layer composite vs source art at every
reported strip differs by mean 0.00–0.09, max ≤8.3; NO layer boundary
(alpha 0.5 crossing) falls on any strip; every strip sits mid-layer
(matcha x447–510 = lattice-window wooden pillar + shelf edge in layer4;
shotengai x573–607 = wall corner beside the おでん sign in layer3;
yasaka x393–420 = dark gap beside the stone lantern in layer4; left-edge
banding = real horizontal rails / sea wall). The 12px feather works
(local minified test 0.00% was correct). No re-slice, feather, or
renderer change can remove these — only source-art-level work: (1) accept
them as scene content, (2) inpaint/edit the strips in source-art and
re-run depth + slice for the 3 affected scenes, or (3) regenerate the 3
images. Decision pending with the user.

### Tests after this fix

- New smoke test: drip loop guards missing drips + init failure
  re-shows the loading overlay. (Logic test already asserted
  `createSim` gives osaka `drips.length === 0` — the sim side was never
  the problem; the render side had no test until now.)

### Live E2E still to check for this fix (do NOT close it without this)

- Switch to osaka: the kissaten renders (barista + customer + 喫茶ライオン
  neon), parallax works; reload with osaka remembered draws within 10 s,
  no black screen; fps meter moves; osaka → ramen → osaka round trip.
- No regression on the other five scenes.

## Source-art regeneration (2026-11-20, local only — not yet pushed or live-verified)

User decision 2026-11-20 19:59 (option 3 in the seams verdict): regenerate
the three source images whose strips were in the art itself — kyoto-matcha,
tokyo-shotengai, kyoto-yasaka. The other three scenes (ramen, osaka-cafe,
kamakura-enoden) were NOT touched. Raw generations + old source arts are
kept under `assets/scenes/_raw/` (provenance, NEVER pushed).

### New art (all 16:9, viewed at full size, no retry needed)

- **kyoto-matcha v2** (was 1920×1280, centre-cropped y+100 → 1920×1080):
  woman in a purple floral kimono whisking matcha at a low black table,
  big paper 茶 lantern upper-left, shelves with pottery/bonsai left,
  garden with stone lanterns + maple right. Old strips gone: the shelves
  have thin even frames (no thick dark pillar at x447–510), the garden's
  left edge is the shoji frame, no grey strip at x1145–1175. Column-mean
  profile at the old strip zones shows no sustained wide dip (sharpest
  1px steps are real object edges: shelf frame 44, shoji edge 36).
- **tokyo-shotengai v2** (was 2240×1120, centre x-crop → 1920×1080):
  izakaya with 居酒屋 noren, 酒 lanterns, もつ煮・やきとり sign, red
  おでん sign flush on an unbroken wood wall, steaming pot, cat
  bottom-right. Old strip gone: the wall beside the おでん sign is
  continuous warm wood planking, no grey gap at x573–607 (the 65-step at
  x568 is the oden sign's own edge). All Japanese text reads correctly.
- **kyoto-yasaka v2** (was 1920×1280, centre-cropped y+100 → 1920×1080):
  five-storey pagoda centre, red-umbrella figure walking away down a wet
  slope, stone lanterns both sides. Old strips gone: no dark gap beside
  the stone lantern at x393–420, no left-edge banding (profile max|dev|
  9, sharpest step 5 across x0–70).

### Depth (Depth Anything V2 Small, same weights as Phase 1, sha256 fcf51f1b…)

- matcha: range 0.063–7.396, mean 1.779. Garden [1250,100,1850,700] mean
  12.9 (<60 PASS). Table check had to move: the old rect
  [800,800,1300,1000] measured 132.3 (<140) because it included the dark
  wall behind the woman's arm — new rect [900,950,1450,1060] (table +
  bowl + kettle) measures 173.0 (>140 PASS).
- shotengai: range 0.000–5.827, mean 2.652. Near street
  [100,900,1800,1060] mean 145.5 (>100 PASS). Sky check had to move: the
  old rect [900,50,1250,400] measured 49.4 (>40) because it caught the
  bright 酒 lanterns and lit signs — new rect [1250,450,1450,650]
  (far street) measures 13.3 (<40 PASS), check renamed "far street is far".
- yasaka: range 0.000–5.480, mean 2.390. Slope [500,800,1400,1050] mean
  144.9 (>120 PASS); sky [600,0,1300,150] mean 0.6 (<40 PASS) — both old
  checks still fit, unchanged.

### Re-slice (12px feather, 15px inpaint, same bars as Phase 1)

All three: layer coverages sum to 1.000; rest composite mean < 0.15,
p99 < 12.

| scene | rest mean | rest p99 | coverages L0/L1/L2/L3/L4 |
|---|---|---|---|
| kyoto-matcha | 0.067 | 1.44 | 0.614 / 0.015 / 0.132 / 0.028 / 0.211 |
| tokyo-shotengai | 0.046 | 1.20 | 0.126 / 0.058 / 0.242 / 0.370 / 0.204 |
| kyoto-yasaka | 0.094 | 2.73 | 0.311 / 0.036 / 0.416 / 0.004 / 0.233 |

Geometry was re-measured from 100px-grid overlays and all three configs
in `scripts/scenes.json` rewritten (anchors, layers, masks, inpaint,
depth_checks; shotengai punch polys = the 3 noren panels, test point
[200,500]). Two real defects found while re-tuning, both fixed locally:

- **Yasaka figure swallowed by the slope plate.** In the new composition
  the figure stands ON the slope (y 620–750), inside layer4's slope
  polygon — first slice left layer3-figure at 0.001 (umbrella tip only).
  Fix: the slope polygon is notched around the figure
  (x 920–1010, y 650–760); `mask-street` keeps the full wedge. After the
  fix layer3 = 0.004 and the figure plate shows the umbrella + person
  cleanly isolated.
- **Shotengai depth_assist must not touch the noren.** layer4's assist
  rect was narrowed to x ≥ 950 ([950,700,1920,1080], thr 130) so the
  noren (x 0–620) cannot be split across layer3/layer4.

Layer plates viewed after slicing: matcha woman+table clean (head
ellipse, body rect, table, kettle); shotengai izakaya whole with the
noren unsplit; yasaka figure isolated. Known minor over-coverage, same
pattern as Phase 1: matcha's body rect and head ellipse carry small
chunks of shelf/shoji with the woman, and the depth_assist grabs a
patch of pond onto layer4 — invisible at rest, a ≤12px fringe at most
during parallax.

### Tests after this change

- JS: 61/61 pass (`node --test test/*.test.mjs test/smoke.mjs`).
- `python3 test/slices.test.py`: all passed. `python3 test/scenes.test.py`:
  all passed. `node --check` on both index.html script blocks: OK
  (block 0 is the importmap JSON, skipped). index.html was NOT touched.

### Files changed (local only, nothing pushed or uploaded)

- `scripts/scenes.json` (3 scene configs rewritten).
- Per scene (×3): `source-art.png`, `depth.png`, `manifest.json`,
  `layers/` (5 plates; shotengai also `layer3-static.png`), `masks/`
  (7 masks). Total 46 scene files + `scripts/scenes.json` + `spec.md` =
  48, plus 9 new files under `_raw/` = 57 files changed/created.
- `assets/scenes/_raw/`: 3 new v2 generation files + 3 metadata jsons,
  3 `old-<scene>-source-art.png` backups (provenance, never push).
- `spec.md` (this record).
- NOT touched: `index.html` (osaka drip fix intact), ramen, osaka-cafe,
  kamakura-enoden.

### Open before push / live E2E (do NOT close without these)

- **The `SCENES` registry geometry in index.html still holds the OLD
  art's values** (matcha lantern [234,244] → [335,115], eyes, bowl,
  steam; shotengai noren panels, pot, cat; yasaka figure, lanterns).
  The registry must be updated to the new coordinates (see the configs
  in `scripts/scenes.json`) before the new art goes live, or lantern
  pivots, steam, eyes and the figure anchor will point at the wrong
  places. This task was forbidden to touch index.html — update it in a
  follow-up, then push the new art + registry together with the osaka
  drip fix.
- Live E2E after push: at rest in each of the 3 scenes, no hard vertical
  strips at the old locations; parallax clean; cloth (shotengai noren)
  still renders; no regression on the other three scenes.

### Registry update for the v2 art (2026-11-20, local only, nothing pushed)

`SCENES` in `index.html` now matches the v2 art (measured from the new
source-art.png files + the v2 `scripts/scenes.json` anchors; nothing
copied from the old registry). Derivation rules, all verified against
the v1 scenes: street = mask-street bbox; mist = street-band centre as
frame fractions; drips x-range = street x-range as fractions, landY
just above the street top; rig pivot = eye midpoint x, eye y + 1.2× eye
separation; lantern body/rx/ry from the slicer's fitted ellipse
(cross-checked against the layer PNG alpha bbox); signs measured from
the art (wooden board and oden sign tightened by crop reading).

- **kyoto-matcha:** rig pivot [773,450] → [959,559]; lantern pivot
  [234,0] → [335,0], body [234,244] → [335,115], rx 110 → 155, ry
  140 → 118, taps [[234,244,130]] → [[335,115,140]]; signs
  [[1417,399,1622,602]] → [[1625,625,1775,775]] (nearest stone
  lantern); steam src [900,731] → [1075,925], top [900,560] →
  [1075,700], mist [0.76,0.72] → [0.81,0.82]; street
  {1200,700,1737,863} → {1200,700,1920,1080}; drips x0/x1
  0.62/0.90 → 0.62/1.0 (y0 0.05, landY 0.62 kept). hair false,
  sigma 0.00018 kept.
- **tokyo-shotengai:** cloth panels → {0,135,290,810,830},
  {135,340,300,800,800}, {340,620,330,700,780} (from punch_polys);
  signs (5) → [[0,0,620,290] board, [595,310,720,670] oden,
  [1430,325,1490,430] white vertical far sign, [1510,360,1680,470]
  beige horizontal sign, [1290,450,1345,540] yellow vertical far
  sign]; steam src [580,700] → [750,830], top [580,420] →
  [750,620], mist [0.52,0.82] → [0.62,0.82]; street
  {501,700,1499,1079} → {450,700,1920,1080}; drips x0/x1
  0.26/0.78 → 0.23/1.0 (landY 0.62 kept). lanterns [] kept.
- **kyoto-yasaka:** signs (4) → [[900,120,1020,440] pagoda lit
  windows, [100,130,320,345] left shop windows, [1610,130,1820,340]
  right shop windows, [1420,780,1530,920] front-right stone lantern];
  steam src [960,670] → [960,690], top [960,420] → [960,500], mist
  [0.50,0.80] → [0.51,0.80]; street {301,650,1619,1079} →
  {150,650,1800,1080}; drips x0/x1 0.16/0.84 → 0.08/0.94 (landY
  0.57 kept). lanterns [] kept, rig null kept.

Test change: `test/logic.test.mjs` classifyTap points moved to the
new geometry (same intent): shotengai (20,400)→strip 0, (310,400)→
strip 4, (515,500)→strip 7, (610,400)→neon; matcha (335,115)→lantern,
(1700,690)→neon; yasaka (975,700)→street fx 0.5. The strip points
follow classifyTap's uniform-across-the-rod-span mapping (see note
below), not the per-panel visual strip centres.

Tests after this change: JS 61/61 pass; `test/slices.test.py` pass;
`test/scenes.test.py` pass; `node --check` on both index.html script
blocks OK. Osaka drip fix untouched (guard + init re-show verified
present); ramen, osaka-cafe, kamakura-enoden entries untouched.

Known follow-up (not fixed here — it is a classifyTap logic change,
not a registry value): the tap-to-strip mapping assumes uniform
strips across the whole rod span, but the v2 shotengai panels are
unequal (135 / 205 / 280 wide), so a tap can brush a strip ~1 strip
away from the finger (v1 panels were near-equal, so the mapping was
approximately right). Fix would be per-panel mapping in classifyTap.

### Old-art check: the OLD matcha registry vs the OLD art

Live still runs the old art + old registry for kyoto-matcha. Checked
every old registry number against the backup
`assets/scenes/_raw/old-kyoto-matcha-source-art.png` (annotated crops):

- **Steam src [900,731] — WRONG, biggest mismatch.** The matcha bowl
  is at x 830–1000, y 775–875, centre ≈ (915,825). The registry src
  sits 94px above the bowl centre, in the steam wisp above the rim.
  The steam plane therefore spans y 560–731 and never reaches the
  bowl (rim 775): the animated steam floats above the bowl, and
  tapping the bowl itself gives 'none' instead of 'steam' (tap rect
  ends at y 731). Correct value: src ≈ (915,825). Top [900,560]
  is correct (the painted wisp fades ~y 550).
- **Lantern — WRONG (body/radius/pivot).** The lantern spans
  x 127–297, y 150–360, centre (212,255), half-extents (85,105).
  Registry body [234,244] rx 110 ry 140 draws an ellipse
  x 124–344, y 104–384: 22px too far right, rx +25, ry +35 — the
  glow spills ~47px past the lantern's right edge and ~46px above
  its top onto the wall, and the swing pivot [234,0] is 22px right
  of the true hang point (~212, where the cords meet). Correct:
  pivot ≈ [212,0], body ≈ [212,255], rx ≈ 85, ry ≈ 105.
- **Rig pivot [773,450] — small error.** Eyes ≈ [743,428] and
  [778,433] (3/4 view, separation 35) → pivot should be
  ≈ [760,472] (eye midpoint x, eye y + 1.2× separation). Registry
  is ~13px right and ~22px high (near the cheek, not the neck).
- **Street x1 1737 — slightly short.** The wet stepping-stone path
  visibly extends to x ≈ 1800 at y 750–860; the rect cuts off ~60px
  on the right (taps there give 'none' instead of 'street').
- **Signs [[1417,399,1622,602]] — OK, loose but functional.** The
  stone lantern (roof x 1500–1620, y 440–600) sits inside the rect;
  tapping it hits the sign.
- **Drips {0.62,0.90,0.05,0.62} — OK.** Matches the street x-range
  pattern, lands just above the path.

Most likely live issue: the steam floating above the bowl (and the
bowl not responding to taps), with the lantern glow/pivot
misalignment as the second candidate. Both are fixed by the v2 art +
the registry update above — no separate fix to the old values is
needed if the new art + registry are pushed together. If the old art
ever has to stay live, the minimal old-registry fix is steam src →
(915,825) and lantern pivot/body/rx/ry → (212,0)/(212,255)/85/105.

## Registry lint + per-panel noren taps (2026-11-20, local only — not yet pushed)

User's rule (2026-11-20, after the matcha live issue): when a coordinate
mistake ships, add a check that catches it.

- **Lint test** (`test/logic.test.mjs`, "registry geometry matches the
  scene anchors"): for every scene in `scripts/scenes.json`, the
  `index.html` registry must agree with the anchors — steam top exact,
  steam src exact on the named bowl/cup centre (else same x as the top,
  below it), swinging-lantern pivot x exact with y = 0, rig pivot from
  the eyes (midpoint x, eye y + 1.2x eye separation, ±5px), cloth
  panels equal to the slicer's punch polygons. The two files may not
  drift. It does NOT verify the anchors themselves — a number can be
  consistently wrong in both files; anchors are verified by viewing
  the art (regen checklist).
- **Per-panel noren taps**: `classifyTap` mapped taps uniformly across
  the whole noren rod, but `buildNorenStrips` builds strips per panel
  (3 per panel). With unequal v2 shotengai panels (135 / 205 / 280)
  a tap could brush a strip ~1 away from the finger. `classifyTap`
  now maps per panel; test case (310,400) moved strip 4 → 5, with a
  discriminating case (300,400) → 5 (uniform mapping would say 4).
- Tests after this change: JS 62/62, both Python suites pass.

## Hakodate Goryokaku snow scene — Phase 1 (2026-11-20, local only — not yet pushed)

User chose Goryokaku over Hachiman-zaka / Kanemori warehouses (2026-11-20 21:07).
7th scene: Goryokaku star fort, Hakodate, Hokkaido, in snow at dusk.
Phase 1 = art + depth + slice only. Phase 2 (registry entry, snow particle
system, snow preset) is a separate step; index.html untouched.

- **Art**: generated 1920x1280, cropped y offset 100 to 1920x1080 (same
  convention as the ramen source art). Elevated oblique view from
  Goryokaku Tower: five-pointed star moat reads clearly, Magistrate's
  Office (white walls, dark roof, warm lit windows) at centre (915,350),
  snow-covered pine branches with cones bottom-left foreground, city
  lights + snow mountains + dusky blue sky behind. Light snow specks
  only (falling snow is a runtime effect, not painted in). No text
  anywhere — nothing to garble. Raw webp + metadata in
  assets/scenes/_raw/ (provenance, never push).
- **Depth** (V2 Small, Python onnxruntime, 1.8s, range 0–7.585): a smooth
  ground-plane gradient, as expected for an aerial view — sky 0, city
  4.4, far tree line 13, office 19, fort mid 32–36, near bastion 71,
  near snow ground 103, foreground pines 175. Manual shapes carry the
  layering; depth assists only cut bands (layer4 thr 120 pines,
  layer3 thr 45, layer2 thr 22).
- **Layers** (coverages sum 1.0000): layer0 backdrop 0.2581, layer1
  far fort 0.1214, layer2 mid fort + office 0.2023, layer3 near fort +
  big pine 0.2268, layer4 foreground pines + near snow 0.1914.
  Rest composite mean 0.008, p99 0.16 — best of any scene (the smooth
  snow backdrop blends almost exactly under the feathered edges).
- **Inpaint lesson**: the first slice used blend 0.2 with a patch
  sampled from the bridge/moat area; wood_texture mirrors the patch
  into chevrons across layer0. This aerial scene has no large
  featureless snow patch (every candidate carries a bridge/moat
  diagonal or tree line), so the config sets blend 0.0 — pure Laplace
  fill. Snow is smooth; the Laplace base alone is the correct
  backdrop. (If a later scene needs texture, the patch must contain
  no strong linear feature.)
- **Masks**: cloth = layer2 (no cloth), dry = pine-branch shelter
  (0.216), emissive = 4 lit buildings (office, pavilion, annex,
  mid building; 0.008), flame = same 4 points, rain = snowfall area
  (depth_rect below 150, 0.701), steam = EMPTY (no steaming object in
  this scene — coverage 0.0), street = near snow ground band
  (0.269).
- **Anchors** (for the Phase-2 registry): office_center [915,350],
  pavilion [803,353], annex [710,420], mid_building [1067,460],
  big_pine [1370,690], bridge [1040,540], street_band
  [0,760,1920,1080]. NO steam anchors and NO lantern pivots — this
  scene has no steaming object and no swinging lantern; Phase 2 must
  handle a steam-less, lantern-less scene (registry steam field and
  the lint test already tolerate a missing steam_top anchor).
  No person with visible eyes → rig null.
- **Tests**: scenes.test.py pass (count updated 5 → 6 scenes),
  slices.test.py pass, JS 62/62 pass. Fragment model: high/mid
  19.2M vs 48.6M (40%), low 12.2M (25%) — plain (non-rig) scene.
- **Files**: 9.7 MB total (source-art 4.1 MB, depth 0.2 MB, layers
  5.4 MB, masks ~0.05 MB). NOT pushed; nothing uploaded.
- **Caveat for Phase 2 / E2E**: E2E #7 (same evening) found NEW
  blurred vertical strips at new positions in the three regenerated
  scenes — cause still under diagnosis (source art / slicing / 0.5x
  rendering). Hakodate uses the same 12px-feather pipeline; if the
  cause turns out to be pipeline-related rather than source-art
  content, this scene may need the same fix.

## Hakodate Goryokaku snow scene — Phase 2 (2026-11-20, local only — not yet pushed)

Wires the Phase-1 scene into the app + snowfall + snow-night preset +
cold-start title fix. index.html, tests and docs only — no art,
manifest or config touched. NOT pushed; nothing uploaded.

- **Registry entry** (`hakodate-goryokaku`): names {zh 函館五稜郭雪夜,
  en Hakodate Goryokaku Snow, ja 函館五稜郭}, emoji ❄️, dir
  `assets/scenes/hakodate-goryokaku`, taxi false, rig null, cloth
  null, lanterns [], steam null, drips null, snow true. Signs: one
  rect per lit building, measured from the emissive-mask blobs
  (office 859–971 × 314–386, pavilion 772–834 × 332–374, annex
  664–756 × 394–446, mid building 1016–1118 × 429–491), padded
  ~15 px as tap targets: office [850,300,985,400], pavilion
  [758,318,848,388], annex [650,380,770,460], mid building
  [1002,415,1132,505]. The anchor centre sits inside its rect
  (pinned by the registry lint test). Street = the near snow ground
  band [0,760,1920,1080] (from the street_band anchor = mask-street
  bbox). Every scene's `snow` flag is now explicit (true/false,
  never undefined) — pinned in the registry test.
- **Steam-less support**: the registry entry has no steam source.
  Every consumer guards: `buildSteamMist` returns early when
  `!sceneDef.steam` (no steam plane, no mist plane — the snow is the
  atmosphere); `buildPost` centres the heat brightening on the frame
  centre instead of the bowl; `classifyTap` only tests the steam rect
  when `def.steam` exists, so a steam-less scene has no steam tap
  target; `handleDrag`'s swirl is guarded upstream by classifyTap's
  kind. `createSim` never referenced def.steam; `sim.steamPhase` is
  just a timer. Empty `lanterns[]` and `rig: null` were already
  tolerated (buildLanterns loops an empty array; buildLayer4 checks
  `sceneDef.rig`; syncScene's lantern loop and mist guard are no-ops).
  Ramen and the other five scenes behave exactly as before.
- **Snowfall system** (same shape as the rain system: sim state +
  render sync): `makeSnow(SNOW_COUNT=250, rng)` creates flakes
  (x/y frame fractions, size 0.010–0.028 world ≈ 6–16 px at 1080p,
  fall speed 0.03–0.09 UV/s, sinusoidal sway amp 0.010–0.030,
  freq 0.5–1.5 Hz); `stepSnow` advances the active flakes
  (fall + sway + wind drift 0.08 × wind per second), respawns
  fallen/off-frame flakes at the top; inactive flakes (index ≥
  active count) are frozen. `createSim` gives flakes only to
  `def.snow` scenes (others get `[]`); `stepSim` steps them with the
  active count = floor(250 × params.snow). Render: one
  `THREE.Points` (250 max), soft round sprite per flake — white core
  (0.85 alpha) with a faint dark rim (0.22) so a flake reads against
  the dark sky AND the bright snow ground; no mask (snow falls over
  the whole frame including the sky); never shifted by parallax
  (full-frame weather, like rain); inactive flakes parked at y=-10.
  `uScale` = drawing-buffer height × 2.5, refreshed every frame so a
  resize or quality-tier change cannot stale it. Cost: one draw call
  + 250 points — far cheaper than the 600-segment rain lines; the
  quality-tier system applies unchanged (render scale shrinks the
  point size with the buffer, which is the correct behaviour).
  Tapping the snow ground stays the existing street interaction.
- **Snow-night preset** (5th): rain 0, wind 0.2, flicker 0.3, steam
  0.2, parallax 0.8, lightning 0, snow 1. i18n keys `mood.snow`:
  zh ❄ 雪夜, en ❄ Snow Night, ja ❄ 雪の夜. `snow` is a preset param
  like `lightning`, not a slider — `readSliders` preserves it across
  slider moves, and `loadScene` preserves `params` across scene
  switches (so the snow preset survives a switch to hakodate, and
  switching away just leaves an empty snow array). Works on all
  scenes: on non-snow scenes it only sets the weather params.
  Cold start on a snow scene opens in the snow-night preset instead
  of drizzle — rain falling over the snow would contradict the scene.
- **Cold-start title fix** (from the E2E #7 diagnosis): `init` now
  reads the saved scene id once (`firstId`), sets `#scene-title` and
  `document.title` from it synchronously BEFORE the first
  `loadScene(firstId)` — the hardcoded ramen `<h1>` no longer
  flashes for ~5–10 s on a remembered non-ramen scene. The title is
  the scene's own name (like a painting's title), so it is not
  translated. Residual caveat: a paint between HTML parse and the
  end-of-body app script could still show the hardcoded title for one
  frame — not observed, and the 5–10 s flash is what this closes.
  No change to the "flash of ramen layers" (the diagnosis showed no
  ramen layers are drawn before load).
- **Tests after this phase**: JS 65/65 (was 62; +2 snow logic tests,
  +1 smoke structural test), slices.test.py pass, scenes.test.py
  pass, both script blocks node --check OK. Updated: moods test
  (five presets, snow param), registry test (7 scenes + hakodate
  fields + snow flag explicit), lint test (no steam_top anchor ⇒
  no steam in the registry; lit-building anchors inside sign rects),
  steamPlaneRect (skips steam-less scenes), classifyTap (hakodate
  signs/street/no-steam), createSim (hakodate snow 250, others 0),
  i18n names + mood.snow keys, smoke manifest/picker tests (7
  scenes), new smoke test pinning the steam guards, the snow wiring,
  and the title fix (title set before first load).
- **Live E2E still to check for this phase (do NOT close it without this)**:
  - [ ] hakodate renders (star fort, office, pines, city lights) and
        the snow falls visibly against sky AND snow ground.
  - [ ] snow preset on/off, wind slider visibly changes the drift.
  - [ ] cold start with hakodate remembered: title is 函館五稜郭雪夜
        from the first paint; no rain falls.
  - [ ] tapping each lit building sparks it; tapping the snow ground
        splashes (street interaction); no steam tap target anywhere.
  - [ ] regression: the other six scenes unchanged (ramen steam,
        osaka interior, matcha lantern, shotengai noren).
  - [ ] fps on the snow scene (250 points should be negligible).
- **Push plan (when approved)**: text files via the App (index.html,
  test/logic.test.mjs, test/smoke.mjs, spec.md, CLAUDE.md — with a
  fresh build stamp at push time, per the push rules) + 14 hakodate
  PNGs via browser upload (root 2, layers 5, masks 7). Do NOT push
  `assets/scenes/_raw/` (provenance only).

## Targeted source-art strip edits (2026-11-20, local only — not yet pushed)

User decision 2026-11-20 23:47 (option 2 in the strip-diagnosis #2
verdict): edit ONLY the five strip spots in the source art, then
re-run depth + slice for the affected scenes — no regeneration.
Method (all four scenes): dark-pixel-only luminance lift toward a
per-row neighbour reference (bright pixels — text, lantern glow, lit
windows — are untouched by construction), inside a feathered mask,
capped so no region can be lifted past its neighbours (max_lift
30–55). Backups of the pre-edit art are in `assets/scenes/_raw/` as
`old-<scene>-source-art-v2.png` (osaka: `old-osaka-cafe-source-art.png`,
its art is Phase 1, no v2 exists). Depth re-run with V2 Small
(model re-downloaded after a VM restart wiped /tmp, sha256
`fcf51f1b…`), then `scripts/slice_scene.py --scene <slug>` per scene.
Feather 12px / inpaint 15px unchanged. `index.html` untouched — no
anchor moved (all edits are luminance-only, no object moved).

### Per-strip results (full-height column-mean dip, old → new)

- **kyoto-matcha x1130–1170** (shoji frame post): the post was already
  garden-toned (~70 vs garden ~75); the strip was the HARD LEFT EDGE
  (shoji 150 → post 61 in one column). Fix: texture-preserving
  luminance ramp across x1100–1145 (per-row profile replaced by a
  smoothstep interpolation, pixels scaled by the profile ratio so
  wood grain survives) + gentle lift of the post core toward the
  garden tone. Cliff step 79 → ~21 max; dip +31.1 → +28.8 (the dip
  metric barely moves because the post must stay darker than the
  bright shoji — the cliff step is the honest metric here). **First
  attempt used a horizontal Gaussian blur for the edge and created a
  soft blurry column — a new artifact, same class as the complaint.
  Reverted from backup and redid with the ramp. Lesson in CLAUDE.md:
  never blur source art to fix a strip.**
- **tokyo-shotengai x0–120** (left edge): post-only edit, noren panel
  untouched per the constraint (panel band +12.1 → +11.9, unchanged).
  Top sign sliver x0–52 lifted (dip +34.5 → +28.7; the residual is
  the も text strokes, which must stay dark). Door post x0–108,
  y845–1080 lifted toward the counter tone, handle rect excluded
  (dip +51.4 → +23.7). Full-height dip +27.2 → +19.2.
- **kyoto-yasaka x1180–1225** (building corner/gap): dark rows only
  (y520–800; the lit-window rows were already brighter than their
  neighbours and the dark-only lift skips them). Gap rows +48.8/+37.4
  → +23/+8. Full-height dip −3.7 → −7.7 (was already ~flat).
- **kyoto-yasaka x0–120** (left edge): wall/door/bamboo lifted toward
  the lit-window tone, capped at +45 (dip +23.3 → +11.2). Lit lattice
  window intact.
- **osaka-cafe x665–735** (lamp glow column, lowest-confidence
  verdict): conservative wall-valley lift only, y200–620 (lamp,
  poster text, cake dome all excluded). Posters-upper dip +33.4 →
  +22.0, posters-lower +20.1 → +11.1, full-height +5.0 → +0.9. Kept:
  the improvement is measurable and no new light band appears in the
  crop. Residual +22 in the upper band is the wall being darker than
  two bright posters — genuine wall content; pushing further would
  risk a light column.

### Verification

- Dips re-measured on the NEW source art AND on the composited layer
  plates (composite dip == source dip at every strip: +28.8 / +19.1 /
  −7.6 / +11.2 / +0.8) — what the app renders at rest is the fixed art.
- Viewed the new source-art.png for all four scenes at full size and
  a crop around each strip: strips visually gone, text/features near
  them survive (matcha 茶 lantern/steam/bowl, shotengai 居酒屋 noren +
  waves + もつ煮 text + door handle, yasaka paper/stone lanterns +
  lit windows, osaka lamp + コーヒー100円/純喫茶 posters + cake dome),
  no new artifact.
- Rest composites: matcha 0.067, shotengai 0.046, yasaka 0.096, osaka
  0.067 (all mean < 0.15); coverages sum to 1.0000 per scene
  (matcha L4 0.211 → 0.210, yasaka L4 0.233 → 0.222 — small depth-driven
  shifts, no boundary moved).
- Tests: JS 65/65, `test/slices.test.py` pass, `test/scenes.test.py`
  pass (incl. depth checks). No anchor moved, so the registry lint
  needs no update and `index.html` stays untouched.

### Files changed (local only, nothing pushed or uploaded)

- Per scene (×4): `source-art.png`, `depth.png`, `manifest.json`,
  `layers/` (5 plates; shotengai also `layer3-static.png`),
  `masks/` (7 masks) = 61 files. Plus `assets/scenes/_raw/` backups
  (4 files, never push) and this spec record. Pushes with the
  Hakodate Phase 2 files in one batch (text via App, PNGs via browser
  upload); the live E2E must re-check all five strips at rest after
  the push.

## Two new scenes + seam fix (2026-11-21 00:31–00:47)

User request 00:31: create Himeji cafe and Gero onsen scenes. Built by a
coordinator agent (one worker per scene), verified by me: JS tests,
rest composites, and I viewed both arts myself.

### himeji-cafe — 姬路咖啡館 / Himeji Cafe / 姫路カフェ (🏯)

Warm kissaten interior: 3 steaming cups on a polished counter, 7 hanging
lamps, shelves of cups/jars, big window with the white Himeji Castle on a
green hill at dusk. Steam yes (cups); lanterns [] (layer3 carries the
shelves too — swinging the plate would swing the shelves; lamps
flicker/spark as signs instead, 7 emissive rects). No person, no text.
drips null (interior), snow false, rig null, cloth null.
Rest composite mean 0.002, p99 0.00, max 4.4; coverages sum 1.0000.
Emoji was ☕ as specified, changed to 🏯 by me — osaka-cafe already uses
☕ and the castle is this scene's identity.

### gero-onsen — 下呂溫泉 / Gero Onsen / 下呂温泉 (♨️)

Rotenburo at dusk: steaming milky bath, 2 glowing stone lanterns, red
maple + pine, wooden fence, river + mountains. Steam yes (strong);
lanterns [] (stone, don't swing; 2 emissive rects). No people/bathers,
no text. drips null (no awning), snow false, rig null, cloth null.
Rest composite mean 0.004, p99 0.05, max 6.3; coverages sum 1.0000.
One config change after slicing: mask-steam blur 8→4 (tall thin steam
column + wide flat plume gave intermediate-value fraction 0.068, failing
the "mostly binary < 0.05" check; blur 4 brings it to 0.034, coverage
0.124, rest composite unchanged; mask-steam is inspector-only).

Both scenes: 15 files each (source-art, depth, manifest, 5 layers,
7 masks); fragment model 19.2M vs 47.9M (40%) high/mid, 11.5M (24%) low.

### Seam fix (E2E #8 follow-up, user chose amplitude cap 0.12 at 00:41)

Diagnosis (`analysis/seam-diagnosis/README.md`, pure analysis, no repo
changes): the band is a parallax gap at layer boundaries showing the
backdrop's inpaint fill; band width ≈ relative displacement (layer2↔0
203·px, layer4↔0 289·px); rest composites pixel-perfect (0.01–0.10,
zero bad pixels). E2E #8's "at rest" was never still — idle drift rocked
the pointer (tx amplitude 0.55, px up to ±0.44). Bleed tested and
ineffective (alpha 12→36 only shifts the band +24 px — do NOT re-slice
for this). Fix, index.html only, zero re-slice:
- Idle return-to-centre: after 4 s idle, `state.pointer.tx/ty *= 0.97`
  per frame instead of the sine drift; the picture returns to
  pixel-perfect a few seconds after the user stops moving the pointer.
- Amplitude clamp in `syncScene`: |px|,|py| ≤ 0.12 (worst band ≈38 px);
  sits on px/py after slider + pScale, so sliders/presets need no change.
- Lint test added (`test/logic.test.mjs`): asserts the clamp lines and
  the idle decay exist and the sine drift is gone. JS is now 66/66.
- Also fixed a wrong comment found by the diagnosis: the inpaint hole
  dilation is a (15,15) kernel = 7 px radius, not 15 px (`slice.py`,
  `slice_scene.py`).

### Files changed (local only, nothing pushed or uploaded yet)

- `index.html` (2 registry entries + 2 picker options, seam fix,
  himeji emoji, build stamp 2026-11-21 00:47), `scripts/scenes.json`
  (8 scenes), `test/logic.test.mjs` (registry 9 scenes + seam lint),
  `test/smoke.mjs` (9 scenes), `test/scenes.test.py` (8 scenes),
  `scripts/slice.py` + `scripts/slice_scene.py` (comment only),
  this spec record, `analysis/seam-diagnosis/` (report + figures +
  scripts, analysis-only).
- Per new scene (×2): 14 PNGs (source-art, depth, 5 layers, 7 masks)
  = 28 PNGs to upload via browser; text files via App push.
- Live E2E still to check: both scenes render (castle through the
  window, steaming bath), steam positions, lamp/lantern tap-spark,
  rain on himeji window / gero river band, no freeze on interior
  himeji; seam fix — idle a few seconds, the picture goes pixel-perfect
  (no band at rest); at full pointer deflection the worst band ≈38 px.
