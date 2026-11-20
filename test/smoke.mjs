// Headless smoke test for the ramen diorama.
//
// Mirrors LIVE conditions, per the donkey-kong-jr lesson (a perfect-16.7ms
// smoke passed while the live game died): frame cadence is variable with
// jitter and occasional long spikes, and the sim runs against a seeded
// history. No browser is involved: the pure sim is exercised, plus
// structural checks on the shipped index.html (assets, shaders, CDN).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const sandbox = { window: {}, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(blocks[1], sandbox);
const L = sandbox.module.exports;
const manifest = JSON.parse(readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));

function finiteWalk(obj, seen = new Set(), trail = 'sim') {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') assert.ok(Number.isFinite(obj), `non-finite at ${trail}: ${obj}`);
    return;
  }
  if (seen.has(obj)) return;
  seen.add(obj);
  if (obj instanceof Float32Array || Array.isArray(obj)) {
    obj.forEach((v, i) => finiteWalk(v, seen, `${trail}[${i}]`));
  } else {
    for (const [k, v] of Object.entries(obj)) finiteWalk(v, seen, `${trail}.${k}`);
  }
}

function snapshot(sim) {
  return JSON.stringify(sim, (k, v) => (typeof v === 'function' ? undefined : v));
}

// Jittered frame-time generator (seeded): mostly 8-33ms, occasional 50-250ms
// hitches, exactly the cadence a real browser tab produces under load.
function makeDtSequence(seed, seconds) {
  const rng = L.mulberry32(seed);
  const dts = [];
  let t = 0;
  while (t < seconds) {
    const r = rng();
    let dt;
    if (r < 0.55) dt = 0.008 + rng() * 0.017;      // 8-25ms, smooth
    else if (r < 0.85) dt = 0.025 + rng() * 0.025; // 25-50ms, busy
    else if (r < 0.97) dt = 0.05 + rng() * 0.1;    // 50-150ms, hitch
    else dt = 0.15 + rng() * 0.35;                 // 150-500ms, tab switch
    dts.push(dt);
    t += dt;
  }
  return dts;
}

test('smoke: 120s of jittered frames, sim stays finite and bounded', () => {
  const sim = L.createSim();
  const dts = makeDtSequence(99, 120);
  let frames = 0, steps = 0, discarded = 0, sawTaxi = false, sawLightning = false;
  for (const dt of dts) {
    const r = L.advance(sim, dt);
    frames++;
    steps += r.steps;
    discarded += r.discarded;
    if (sim.events.taxi > 0) sawTaxi = true;
    if (sim.events.lightning > 0 || sim.events.lightningEnv > 0) sawLightning = true;
    // Bounds that must hold at every frame, not just at the end.
    assert.ok(Math.abs(sim.lanterns[0].a) <= 0.16 && Math.abs(sim.lanterns[1].a) <= 0.16,
      `lantern angle clamped (frame ${frames})`);
    for (const p of sim.noren) assert.ok(Math.abs(p.d) <= 0.3, `noren deflection clamped`);
    assert.ok(sim.water.max < 2.5, `water max bounded (saturating puddle): ${sim.water.max}`);
    for (const d of sim.rain) assert.ok(d.y >= -0.1 && d.y <= 1.1, `rain drop in range`);
  }
  finiteWalk(sim);
  assert.ok(steps > 5000, `sim advanced ${steps} fixed steps`);
  assert.ok(discarded > 0.5, `discard guard fired under hitches (discarded ${discarded.toFixed(2)}s)`);
  assert.ok(sawTaxi, 'taxi fired during the jittered run');
  assert.ok(sawLightning, 'lightning fired during the jittered run');
  assert.ok(sim.frame === steps, 'frame counter matches steps taken');
});

test('smoke: identical dt sequence => identical final state (deterministic)', () => {
  const run = () => {
    const sim = L.createSim();
    for (const dt of makeDtSequence(42, 60)) L.advance(sim, dt);
    return snapshot(sim);
  };
  assert.equal(run(), run());
});

test('smoke: different seeds diverge, same seed converges', () => {
  const run = (seed) => {
    const sim = L.createSim(seed);
    for (const dt of makeDtSequence(7, 30)) L.advance(sim, dt);
    return snapshot(sim);
  };
  assert.equal(run(20261120), run(20261120));
  assert.notEqual(run(20261120), run(12345), 'different seeds produce different weather');
});

test('smoke: pure-sim frame budget (60 sim-seconds must run fast)', () => {
  const sim = L.createSim();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 3600; i++) L.stepSim(sim);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // 3600 steps = 60 sim-seconds; must run much faster than real time even
  // on this throttled 1.5-CPU VM (measured ~0.5ms/step before the
  // waterImpulse bounding-box optimisation; budget is 3000ms).
  assert.ok(ms < 3000, `3600 fixed steps took ${ms.toFixed(0)}ms (budget 3000ms)`);
});

test('structure: every scene manifest asset exists on disk (all 9 scenes)', () => {
  // Phase 2: paths are manifest-driven, so index.html no longer lists
  // them literally. What is pinned instead: every file every manifest
  // names exists, the registry lists all 9 scenes, and the app builds
  // texture URLs from the manifest it fetched.
  const scenes = L.SCENES;
  assert.equal(scenes.length, 9, 'registry has 9 scenes');
  // (join, not deepEqual: SCENES arrays come from the vm sandbox, whose
  // Array prototype differs from this file's, so deepStrictEqual fails
  // on identical contents.)
  assert.equal(scenes.map((s) => s.id).join(','),
    'ramen,osaka-cafe,kyoto-matcha,kamakura-enoden,tokyo-shotengai,kyoto-yasaka,hakodate-goryokaku,himeji-cafe,gero-onsen');
  for (const def of scenes) {
    const m = JSON.parse(readFileSync(path.join(root, def.dir, 'manifest.json'), 'utf8'));
    const check = L.validateManifest(m);
    assert.ok(check.ok, `${def.id} manifest invalid: ${check.errors.join('; ')}`);
    for (const info of Object.values(m.layers)) {
      assert.ok(existsSync(path.join(root, def.dir, info.file)), `${def.id}: missing ${info.file}`);
    }
    for (const info of Object.values(m.masks)) {
      assert.ok(existsSync(path.join(root, def.dir, info.file)), `${def.id}: missing ${info.file}`);
    }
    assert.ok(existsSync(path.join(root, def.dir, 'depth.png')), `${def.id}: missing depth.png`);
    assert.ok(existsSync(path.join(root, m.source)), `${def.id}: missing ${m.source}`);
  }
  assert.ok(html.includes("fetch(def.dir + '/manifest.json')"), 'app fetches the per-scene manifest');
  assert.ok(html.includes("files[id] = def.dir + '/' + info.file"), 'texture URLs come from the manifest');
  assert.ok(html.includes("'layers/layer2-static.png'"), 'ramen cloth-static default literal');
});

test('structure: cloth-static is fetched and built only for cloth scenes; texture errors carry a message', () => {
  // 2026-11-20 scene-switch 404: the old code fetched
  // layers/layer2-static.png for every scene, so the four cloth-less
  // scenes 404d and the whole switch failed. The file list must be
  // gated on clothLayerFor, and buildPlates must skip the cloth block
  // when there is no cloth layer.
  assert.ok(html.includes("if (L.clothLayerFor(def, m)) files['clothStatic']"),
    'clothStatic only in the file map when the scene has cloth');
  assert.equal((html.match(/files\['clothStatic'\]/g) || []).length, 1,
    'exactly one clothStatic entry in the file map, and it is the guarded one');
  assert.ok(html.includes('if (clothLayer) {'), 'cloth-static plate built only when a cloth layer exists');
  // The old failure surfaced as "[object Event]" because loadTexture
  // rejected with the raw THREE error event. It must reject with a
  // real Error so the toast shows a readable message.
  assert.ok(html.includes("reject(new Error('failed to load ' + url"),
    'loadTexture rejects with a real Error naming the URL');
  assert.ok(!html.includes('}, undefined, reject);'), 'no bare reject passthrough remains in loadTexture');
});

test('structure: drip loop tolerates drip-less scenes; first-load failure stays visible', () => {
  // 2026-11-20 E2E #6: osaka-cafe (the only scene with drips: null) froze
  // forever — syncRainLines looped 16 times unconditionally and threw on
  // sim.drips[0].wait before the first frame was ever drawn. The loop
  // must park missing drips off-screen instead of dereferencing them.
  assert.ok(html.includes('if (!d) { dp[i * 6] = 0;'),
    'drip loop guards missing drips (osaka has none)');
  // Same incident, secondary find: loadScene hides #loading in its catch
  // before rethrowing, so init's failure message was written into a
  // hidden element and a first-load failure looked like a black screen.
  assert.ok(html.includes("$('loading').classList.remove('hidden');"),
    'init failure re-shows the loading overlay so the message is visible');
});

test('structure: steam-less scenes do not crash the builders; snow is registry-driven; cold-start title is set before load', () => {
  // 2026-11-20 hakodate-goryokaku: the first scene with no steaming
  // object (steam: null), no swinging lanterns, no rig, no drips.
  // Every consumer of def.steam must guard for it:
  assert.ok(html.includes('if (!st) return;'), 'buildSteamMist returns early without steam');
  assert.ok(html.includes('if (def.steam) {'), 'classifyTap only tests the steam rect when the scene has steam');
  assert.ok(html.includes('const bowlUV = st'), 'buildPost defaults the brightening centre for steam-less scenes');
  // Snowfall is registry-driven: one Points draw call, built and synced
  // with the rain lines, disposed with the graph, and only the scene
  // with snow: true has flakes (createSim guards the count).
  assert.ok(html.includes('function buildSnowLines()'), 'snow builder exists');
  assert.ok(html.includes('function syncSnowLines()'), 'snow sync exists');
  assert.ok(html.includes('buildSnowLines();'), 'loadScene builds the snow');
  assert.ok(html.includes('syncSnowLines();'), 'syncScene syncs the snow');
  assert.ok(html.includes('snowLines = null;'), 'dispose clears the snow reference');
  assert.ok(html.includes('snow: def.snow ? makeSnow(SNOW_COUNT, rng) : []'), 'flakes only for snow scenes');
  assert.ok(html.includes("snow: true"), 'hakodate has snow: true in the registry');
  // Cold-start title (E2E #7 diagnosis): the hardcoded <h1> said
  // 深夜拉麵 until updateSceneChrome ran after the scene loaded, so a
  // remembered non-ramen scene flashed the wrong title for ~5-10 s.
  // init must set the title from the saved scene BEFORE the first load.
  assert.ok(html.includes('const firstDef = L.sceneById(firstId);'), 'init reads the saved scene first');
  assert.ok(html.includes("$('scene-title').innerHTML = firstDef.title"), 'init sets the title from the saved scene');
  assert.ok(html.indexOf('firstDef.title') < html.indexOf('await loadScene(firstId);'),
    'title is set before the first scene loads');
  assert.ok(html.includes("applyMood(firstDef.snow ? 'snow' : 'drizzle');"),
    'a snow scene opens in its snow-night preset, not drizzle');
});

test('structure: build stamp is present in the title block', () => {
  // 2026-11-20: a stale pre-fix page on a phone is indistinguishable
  // from the current build without it. The stamp is a build timestamp
  // (YYYY-MM-DD HH:MM, +08) — update it on every index.html push.
  // The test pins presence + format, never the value.
  const m = html.match(/id="build-stamp"[^>]*>build (\d{4}-\d{2}-\d{2} \d{2}:\d{2})</);
  assert.ok(m, 'build stamp missing from the title block');
});

test('structure: importmap pins three@0.187.0 on jsDelivr, no other CDN', () => {
  const importmap = JSON.parse(blocks[0]);
  assert.equal(importmap.imports.three,
    'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js');
  const cdnHits = [...html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/[^\s"'\)]+/g)].map((m) => m[0]);
  const unique = [...new Set(cdnHits)];
  assert.ok(unique.every((u) => u.includes('three@0.187.0') || u.includes('@huggingface/transformers@3.7.2')),
    `unexpected CDN urls: ${unique}`);
});

test('structure: all GLSL shader blocks have balanced braces', () => {
  const shaders = [...html.matchAll(/\/\* glsl \*\/`([\s\S]*?)`/g)].map((m) => m[1]);
  assert.ok(shaders.length >= 12, `found ${shaders.length} shader blocks`);
  for (const [i, s] of shaders.entries()) {
    const open = (s.match(/{/g) || []).length;
    const close = (s.match(/}/g) || []).length;
    assert.equal(open, close, `shader ${i}: unbalanced braces (${open} vs ${close})`);
    // Helper-only blocks (noise functions) have no main(); every block that
    // actually draws pixels must have one.
    if (s.includes('gl_FragColor') || s.includes('gl_Position')) {
      assert.ok(s.includes('void main()'), `shader ${i} has a main()`);
    }
  }
});

test('structure: both JS blocks pass node --check', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ramen-check-'));
  writeFileSync(path.join(dir, 'logic.js'), blocks[1]);
  writeFileSync(path.join(dir, 'app.js'), blocks[2]);
  execFileSync('node', ['--check', path.join(dir, 'logic.js')], { stdio: 'pipe' });
  execFileSync('node', ['--check', path.join(dir, 'app.js')], { stdio: 'pipe' });
});

test('structure: HUD controls referenced in JS exist in the HTML', () => {
  const ids = [...html.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
  const unique = [...new Set(ids)];
  assert.ok(unique.length > 15, `found ${unique.length} element ids`);
  for (const id of unique) {
    assert.ok(html.includes(`id="${id}"`), `missing element id="${id}"`);
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 1 — structural regressions for the 2026-11-20 live E2E    */
/* ------------------------------------------------------------------ */

test('round 1: noren strips are right-side up (rod above hem)', () => {
  // The strip grid maps frame pixel (fx, fy) to plane-local
  // ((fx/1920-0.5)*PLANE_W*s, (0.5-fy/1080)*PLANE_H*s). The old code
  // used (0.5 - v) with v = 1 - fy/1080 — the negative of that — so
  // the noren rendered upside-down and displaced. Assert the fixed
  // expression is what the shipped code uses, and check the invariant.
  const m = html.match(/pos\.push\(\(u - 0\.5\) \* L\.PLANE_W \* s, ([^,]+), 0\)/);
  assert.ok(m, 'strip position expression found');
  assert.ok(m[1].includes('fy / 1080'), `strip y uses the frame fraction: ${m[1]}`);
  assert.ok(!m[1].includes('(0.5 - v)'), 'strip y must not use the texture-v');
  const y = (fy) => (0.5 - fy / 1080);
  assert.ok(y(55) > y(730), 'rod (fy=55) sits above hem (fy=730)');
});

test('round 1: lantern plates are shifted by their groups, not clobbered', () => {
  // buildLanterns stores the pivot as group.userData.baseX/baseY and
  // marks the mesh; syncScene must skip lantern meshes in the plates
  // loop and shift the groups instead — the old code overwrote the
  // mesh position every frame, displacing the lantern plates off-frame.
  assert.ok(html.includes('mesh.userData.lantern = true'), 'lantern mesh marked');
  assert.ok(html.includes('if (mesh.userData.lantern) continue;'), 'plates loop skips lantern meshes');
  assert.ok(html.includes('g.position.x = g.userData.baseX + sh.x'), 'group shifted by base + parallax');
  assert.ok(html.includes('g.position.y = g.userData.baseY + sh.y'), 'group shifted vertically too');
});

test('round 1: overlays and steam follow parallax', () => {
  assert.ok(html.includes("plates['street'] = mesh"), 'street overlay registered in plates');
  assert.ok(html.includes("plates['emissive'] = mesh"), 'emissive overlay registered in plates');
  assert.ok(html.includes('mesh.userData.shiftZ = -0.36'), 'emissive shifts with the backdrop depth');
  assert.ok(html.includes('steamMeshes.push(mesh)'), 'steam planes tracked for parallax');
  assert.ok(html.includes('L.parallaxScaleFor(camera.aspect)'), 'parallax is aspect-scaled at runtime');
});

test('round 1: depth worker is a module worker (transformers v3 is ESM-only)', () => {
  // dist/transformers.min.js@3.7.2 ends with a bare export{...} and
  // exposes no global; importScripts of it throws a SyntaxError, which
  // is exactly the <2s "深度模型載入失敗" seen live. Assert the shipped
  // worker imports the ESM entry as a module worker.
  const m = html.match(/const workerSrc = `([\s\S]*?)`;/);
  assert.ok(m, 'worker source found');
  assert.ok(m[1].includes("import { pipeline, env, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2'"),
    'worker imports the ESM entry');
  assert.ok(!m[1].includes('importScripts'), 'no importScripts of the ESM bundle');
  assert.ok(!m[1].includes('Transformers.'), 'no (nonexistent) Transformers global');
  assert.ok(html.includes("{ type: 'module' }"), 'worker created as a module worker');
});

test('round 1: H hides all HUD chrome via one body class; rings + swirl wired', () => {
  assert.ok(html.includes("document.body.classList.toggle('hud-hidden')"), 'H toggles the body class');
  assert.ok(html.includes('body.hud-hidden .hud:not(#toast)'), 'CSS hides HUD chrome except the toast');
  assert.ok(html.includes('uniform vec4 uRings[4]'), 'street shader declares the ring uniforms');
  assert.ok(html.includes('uSwirlAng'), 'steam shader has a swirl-angle uniform');
  assert.ok(html.includes('id="sel-quality"'), 'quality select exists in the HUD');
  assert.ok(html.includes('L.addRing(state.sim, fx, fy, 1.2)'), 'street tap adds a splash ring');
  assert.ok(html.includes('L.addSwirl(state.sim, d)'), 'steam drag accumulates swirl');
});

/* ------------------------------------------------------------------ */
/* Fix round 2 — performance diagnosis (2026-11-20 live E2E: fps 4-5) */
/* ------------------------------------------------------------------ */

test('round 2: fps meter reads the raw frame interval, not the clamped sim dt', () => {
  // The old meter accumulated dtWall, which is clamped to 0.25 s, so it
  // floored at 4 fps and could not show slow frames truthfully — the
  // round-1 re-test reported "no improvement" from Low quality even if
  // the frame time had halved.
  assert.ok(html.includes('const rawDt ='), 'raw frame interval is computed');
  assert.ok(html.includes('fpsTime += rawDt'), 'meter accumulates the raw interval');
  assert.ok(!html.includes('fpsTime += dtWall'), 'meter must not accumulate the clamped dt');
  assert.ok(html.includes('state.frameMs'), 'frame time in ms is tracked');
  assert.ok(html.includes("el.textContent = state.fps + ' fps · ' + state.frameMs + 'ms'"),
    'fps readout shows fps + frame ms');
});

test('round 2: quality tiers reduce fragment cost, and Auto shows the active tier', () => {
  // MSAA off: the post pass is a fullscreen quad, so 4x MSAA multiplies
  // its fragment cost ~4x in software rendering for no visible benefit
  // (the scene render into postRT was never multisampled — render
  // targets don't inherit canvas MSAA — so only the post quad changes).
  assert.ok(html.includes('new THREE.WebGLRenderer({ antialias: false'),
    'antialias is off');
  // The auto evaluator must call the tier change as an auto step so the
  // UI reflects it — the round-1 re-test reported "Auto never stepped
  // down" because the select only ever showed the mode.
  assert.ok(html.includes('applyRenderScale(next, true)'), 'auto evaluator marks its step');
  assert.ok(html.includes("querySelector('option[value=\"auto\"]')"),
    'applyRenderScale rewrites the Auto option label');
  assert.ok(html.includes('qualityTierName'), 'tier names are human-readable');
  // Cheap post at the lowest tier: a single fetch, no CAS / heat-haze.
  assert.ok(html.includes('uCheap'), 'cheap-post uniform exists');
  assert.ok(html.includes('postMat.uniforms.uCheap.value = renderScale <= 0.5 ? 1 : 0'),
    'cheap post engages at the lowest tier');
  // Woman shader discards transparent fragments before the CAS fetches.
  const wfrag = html.match(/const WOMAN_FRAG = \/\* glsl \*\/`([\s\S]*?)`;/);
  assert.ok(wfrag, 'WOMAN_FRAG found');
  const discardAt = wfrag[1].indexOf('if (c.a < 0.02) discard;');
  const casAt = wfrag[1].indexOf('5-tap neighbourhood-clamped CAS');
  assert.ok(discardAt > 0 && casAt > discardAt, 'discard precedes the CAS fetches');
  // Lantern plates: alpha test discards their ~97-99% transparent
  // pixels after the fetch, so it saves the blend/overdraw cost (not
  // the texture fetch — the fetch happens first). The fetch saving is
  // the woman discard above. Phase 2: the test is per-layer now
  // (layer1/layer3 are lantern plates on ramen; on enoden they are a
  // station and a train, so the test must not apply blindly).
  assert.ok(html.includes("alphaTest: (id === 'layer1' || id === 'layer3') ? 0.02 : 0"),
    'lantern plates carry an alpha test');
});

test('round 2: sliders respond to pointer commit as well as drag/keyboard', () => {
  // The round-1 re-test saw no pointer response; the wiring is a plain
  // native range + 'input', the panel sits above the canvas at
  // z-index 10 with no pointer-events block, and keyboard control
  // works — the harness observation is a synthetic-input artifact.
  // 'change' is belt-and-braces for pointer commit.
  assert.ok(html.includes("addEventListener('change', onSlider)"),
    'sliders listen for change as well as input');
  for (const k of ['rain', 'wind', 'flicker', 'steam', 'parallax']) {
    assert.ok(html.includes(`<label for="s-${k}">`), `label for s-${k} focuses its slider`);
  }
});

test('round 2: playlist UI is wired (panel, transport, auto-advance, attribution)', () => {
  // Panel + transport exist and the radio moved into the music panel.
  const panelAt = html.indexOf('id="music-panel"');
  const radioAt = html.indexOf('id="btn-radio"');
  const inspAt = html.indexOf('id="inspector"');
  assert.ok(panelAt > 0 && radioAt > panelAt && radioAt < inspAt,
    'radio button lives inside the music panel');
  assert.ok(html.includes('id="btn-music"'), 'music button opens the panel');
  assert.ok(html.includes('L.PLAYLIST.forEach((t, i) => {'), 'track list is built from PLAYLIST');
  assert.ok(html.includes("playlistAudio.addEventListener('ended'"),
    'ended handler auto-advances');
  assert.ok(html.includes('L.playlistNext(playlistIndex, L.PLAYLIST.length)'),
    'auto-advance wraps via playlistNext');
  // Attribution is shown for the playing track (CC BY 4.0 requirement).
  assert.ok(html.includes("$('music-attr').textContent = t"),
    'attribution line follows the playing track');
  // Load on demand: nothing is preloaded on page load (24 MB total).
  assert.ok(html.includes("playlistAudio.preload = 'none'"), 'playlist does not preload');
  assert.equal([...html.matchAll(/playlistAudio\.src/g)].length, 1,
    'src is set in exactly one place (playTrack)');
  // Playback runs through the music bus (MediaElementSource -> music
  // gain -> master), so the audio switch and volume slider apply.
  assert.ok(html.includes('createMediaElementSource(playlistAudio)'), 'MediaElementSource created');
  assert.ok(html.includes('this.nodes.music'), 'music bus exists in AudioEngine');
  assert.ok(html.includes('g.connect(this.nodes.music)'), 'radio routes through the music bus');
  // The music panel is HUD chrome, so H hides it with everything else.
  assert.ok(panelAt > 0 && html.includes('id="music-panel" class="hud glass hidden"'),
    'music panel is hud chrome');
});

test('phase 2: layer toggle maps to the mesh that holds the layer (layer3 finding)', () => {
  // The round-2 live re-test saw: unchecking layer3 removed the mist
  // band, not the front lantern; the lantern vanished only with
  // layer4. The shipped PNGs + code say otherwise (see the Python pin
  // in test/slices.test.py): layer3's alpha is the lantern, and the
  // mist plane is not in `plates` at all, so no toggle can hide it.
  // The wiring that matters:
  //  - buildLanterns pairs ramen layer1->rear, layer3->front (registry
  //    pivots), so the layer3 swing group IS the lantern plate;
  //  - setLayerVisible hides the swing group for a lantern layer, the
  //    plate for any other layer — and the group branch now applies
  //    only when a group actually exists for that layer (on enoden,
  //    layer3 is the train plate, not a lantern, so the toggle must
  //    hide the plate).
  assert.ok(html.includes('for (const d of sceneDef.lanterns)'), 'lanterns built from the registry');
  assert.ok(html.includes('group.userData.layerId = d.layer;'), 'swing group carries its layer id');
  assert.ok(html.includes('lanternGroups.some((gr) => gr.userData.layerId === id)'),
    'group branch applies only when a group exists for the layer');
  assert.ok(html.includes('if (sceneDef.cloth && id === sceneDef.cloth.layer)'),
    'cloth layer toggle hides the static plate + strips');
  assert.ok(!html.includes("plates['mist']"), 'mist is not a plate');
  assert.ok(html.includes('mist.userData.shiftZ = -0.2;'), 'mist shifts with the backdrop, not a layer');
});

test('phase 2: scene picker exists, switches scenes, persists the choice', () => {
  assert.ok(html.includes('id="sel-scene"'), 'picker exists');
  for (const id of ['ramen', 'osaka-cafe', 'kyoto-matcha', 'kamakura-enoden', 'tokyo-shotengai', 'kyoto-yasaka', 'hakodate-goryokaku']) {
    assert.ok(html.includes(`value="${id}"`), `picker lists ${id}`);
  }
  assert.ok(html.includes('async function loadScene(id)'), 'loadScene exists');
  assert.ok(html.includes('async function switchScene(id)'), 'switchScene exists');
  assert.ok(html.includes('localStorage.setItem(SCENE_STORAGE_KEY, def.id)'), 'choice is persisted');
  // The first load uses the saved scene — via firstId, so init can set
  // the title from the same saved scene before loading (title fix).
  assert.ok(html.includes('await loadScene(firstId);'), 'first load uses the saved scene');
  assert.ok(html.includes("const SCENE_STORAGE_KEY = 'ramen-diorama.scene'"), 'storage key is stable');
  // Lazy loading: no scene assets are preloaded — only the selected
  // scene's manifest + files are fetched, on demand.
  assert.ok(!html.includes('rel="preload"'), 'no preload of scene assets');
  assert.ok(html.includes('Lazy load: only this scene'), 'lazy-load is documented in loadScene');
  // The depth worker re-estimates the SELECTED scene's source art.
  assert.ok(html.includes('img.src = manifest.source;'), 'depth worker uses the current scene source');
  // A switch disposes the old graph instead of leaking it.
  assert.ok(html.includes('disposeSceneGraph();'), 'loadScene disposes the old graph');
  assert.ok(html.includes('function disposeSceneGraph()'), 'dispose helper exists');
});

test('i18n: language switcher exists, persists the choice, re-renders UI strings', () => {
  assert.ok(html.includes('id="sel-lang"'), 'switcher exists');
  for (const v of ['zh', 'en', 'ja']) assert.ok(html.includes(`value="${v}"`), `switcher offers ${v}`);
  assert.ok(html.includes('中文') && html.includes('English') && html.includes('日本語'),
    'switcher labels are the language names themselves');
  assert.ok(html.includes('localStorage.setItem(LANG_STORAGE_KEY, lang)'), 'choice is persisted');
  assert.ok(html.includes('L.savedLang('), 'saved language is restored on load');
  assert.ok(html.includes('function applyI18n()'), 'applyI18n exists');
  assert.ok(html.includes('applyI18n();'), 'applyI18n is called (init + language change)');
  assert.ok(html.includes("document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;"),
    'html lang follows the language');
  assert.ok(html.includes('<html lang="zh-Hant">'), 'default html lang is zh-Hant');
});

test('i18n: every data-i18n key in the HTML exists in I18N, and every I18N key is used', () => {
  const used = new Set();
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-title="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-alt="([^"]+)"/g)) used.add(m[1]);
  assert.ok(used.size > 30, `expected many static keys, got ${used.size}`);
  for (const k of used) {
    assert.ok(k in L.I18N.zh, `data-i18n key ${k} must exist in I18N.zh`);
    assert.ok(k in L.I18N.en, `data-i18n key ${k} must exist in I18N.en`);
    assert.ok(k in L.I18N.ja, `data-i18n key ${k} must exist in I18N.ja`);
  }
  // Every key in the table must be reachable: either a static
  // data-i18n(*) attribute in the HTML or a quoted use in the app —
  // tr('key'), setDepthStatus('key', …), setProgress(…, 'key', …).
  for (const k of Object.keys(L.I18N.zh)) {
    const viaAttr = used.has(k);
    const viaCode = html.includes(`'${k}'`);
    assert.ok(viaAttr || viaCode, `I18N key ${k} is never used`);
  }
});

test('i18n: scene picker options are re-rendered from the translated scene names', () => {
  assert.ok(html.includes('function renderSceneOptions()'), 'renderSceneOptions exists');
  assert.ok(html.includes('L.sceneName(def.id, lang)'), 'picker text comes from sceneName');
  assert.ok(html.includes("(def.emoji ? def.emoji + ' ' : '')"), 'picker keeps the emoji prefix');
  for (const id of ['ramen', 'osaka-cafe', 'kyoto-matcha', 'kamakura-enoden', 'tokyo-shotengai', 'kyoto-yasaka', 'hakodate-goryokaku']) {
    assert.ok(html.includes(`value="${id}"`), `picker still lists ${id}`);
  }
});

test('i18n: no hardcoded Chinese UI string remains in the app script', () => {
  const app = blocks[2];
  // Strip comments first: the two remaining CJK lines are comments
  // quoting the old strings (depth-worker root cause, quality label).
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const cjk = code.match(/[\u4e00-\u9fff\u3040-\u30ff]/g);
  assert.equal(cjk, null, `app script still has hardcoded CJK: ${cjk ? cjk.slice(0, 10).join('') : ''}`);
  // And no toast() call carries a literal Chinese string.
  assert.ok(!/toast\('[^']*[\u4e00-\u9fff]/.test(code), 'no hardcoded toast string');
});
