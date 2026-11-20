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

## Scene & depth scale (from the original, to match)

- World artwork plane 3.5833 × 2.000, camera distance 5.0, 1.036 parallax
  overscan, ±0.26 horizontal / ±0.14 vertical shift.
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
