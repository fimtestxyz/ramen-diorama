// Pure-logic tests for window.RamenLogic (the first <script> block of index.html).
// Loads the block via vm so the tests always run against the shipped code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
// blocks[0] is the importmap (JSON), blocks[1] is RamenLogic, blocks[2] is the app.
const logicSrc = blocks[1];
assert.ok(logicSrc.includes('RamenLogic'), 'logic block found');

const sandbox = { window: {}, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(logicSrc, sandbox);
const L = sandbox.module.exports;
assert.ok(L && typeof L.createSim === 'function', 'RamenLogic exported');

const manifest = JSON.parse(readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));

function finiteWalk(obj, seen = new Set()) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') assert.ok(Number.isFinite(obj), `non-finite number: ${obj}`);
    return;
  }
  if (seen.has(obj)) return;
  seen.add(obj);
  if (obj instanceof Float32Array || Array.isArray(obj)) {
    for (const v of obj) finiteWalk(v, seen);
  } else {
    for (const v of Object.values(obj)) finiteWalk(v, seen);
  }
}

test('constants match the spec', () => {
  assert.equal(L.SEED, 20261120);
  assert.equal(L.DT, 1 / 60);
  assert.equal(L.OVERSCAN, 1.18);
  assert.equal(L.CAM_D, 5.0);
  assert.equal(L.MAX_STEPS_PER_FRAME, 5);
  // Cross-realm arrays (logic runs in a vm context) need same-realm copies
  // for strict deepEqual: spread them into this realm first.
  assert.deepEqual([...L.LAYERS.map((l) => l.id)], ['layer0', 'layer1', 'layer2', 'layer3', 'layer4']);
  assert.deepEqual([...L.LAYERS.map((l) => l.z)], [-0.36, -0.05, 0.15, 0.2, 0.34]);
});

test('plateScale / plateShift / uvInset geometry', () => {
  assert.equal(L.plateScale(0), 1);
  assert.ok(L.plateScale(-0.36) > 1, 'backdrop is farther, appears larger');
  assert.ok(L.plateScale(0.34) < 1, 'woman plate is nearer, appears smaller');
  const sh0 = L.plateShift(0, 1, 1);
  // NB: the computation yields -0; === treats -0 as 0, strict deepEqual does not.
  assert.ok(sh0.x === 0, 'a plate on the frame plane does not shift');
  assert.ok(sh0.y === 0);
  const sh = L.plateShift(-0.36, 1, 0);
  assert.ok(sh.x > 0, 'backdrop moves with the pointer (camera-move convention)');
  // Travel grows with |z| on either side of the frame plane.
  assert.ok(Math.abs(L.plateShift(0.34, 1, 0).x) > Math.abs(L.plateShift(0.15, 1, 0).x),
    'the nearer front plate travels further than the noren');
  const inset = L.uvInset();
  assert.ok(Math.abs(inset.u0 - (0.5 - 0.5 / 1.18)) < 1e-12);
  assert.ok(Math.abs(inset.u1 - (0.5 + 0.5 / 1.18)) < 1e-12);
  // Rest-frame invariant: the visible window [u0,u1] maps to the full texture.
  // texture-uv = (geometry-uv - u0)/(u1 - u0): edges map to 0 and 1 exactly.
  assert.equal((inset.u0 - inset.u0) / (inset.u1 - inset.u0), 0);
  assert.equal((inset.u1 - inset.u0) / (inset.u1 - inset.u0), 1);
  assert.ok(L.coversFrame(-0.36, 1, 1), 'backdrop covers the frame at full parallax');
  assert.ok(L.coversFrame(0.34, 1, 1), 'woman plate covers the frame at full parallax');
});

test('water PDE: impulse raises the surface, damping settles it', () => {
  const n = 32;
  const h = new Float32Array(n * n), v = new Float32Array(n * n);
  L.waterImpulse(h, n, 0.5, 0.5, 1.0, 0.05);
  assert.ok(h[Math.floor(n / 2) * n + Math.floor(n / 2)] > 0.5, 'centre raised by impulse');
  let max0 = L.waterStep(h, v, n, 0.985);
  assert.ok(Number.isFinite(max0) && max0 > 0);
  for (let i = 0; i < 600; i++) L.waterStep(h, v, n, 0.985);
  const max1 = L.waterStep(h, v, n, 0.985);
  assert.ok(max1 < max0 * 0.05, `surface settles (max ${max0.toFixed(3)} -> ${max1.toFixed(4)})`);
  finiteWalk(h);
});

test('blink state machine', () => {
  assert.equal(L.blinkAmountAt('open', 0), 0);
  assert.equal(L.blinkAmountAt('closed', 0), 1);
  assert.ok(L.blinkAmountAt('closing', 0.06) > 0.4 && L.blinkAmountAt('closing', 0.06) < 0.6);
  assert.ok(L.blinkAmountAt('opening', 0.09) > 0.4 && L.blinkAmountAt('opening', 0.09) < 0.6);
  assert.equal(L.blinkAmountAt('closing', 0.12), 1);
  assert.equal(L.blinkAmountAt('opening', 0.18), 0);
});

test('rain: splashes only from the street band, normalised to the heightfield', () => {
  const rng = L.mulberry32(7);
  const drops = L.makeRain(600, rng);
  assert.equal(drops.length, 600);
  for (const d of drops) {
    assert.ok(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1);
    assert.ok(d.slant > 0.1 && d.slant < 0.3, 'slant 7-15 degrees');
  }
  // Force drops to land inside the street band and check the splash coords.
  const testDrops = [{ x: 0.2, y: 1.01, speed: 1, slant: 0.15, len: 0.02, land: 0.9 }];
  const spl = L.stepRain(testDrops, 1, 1 / 60, 0, L.mulberry32(1));
  assert.equal(spl.length, 1, 'a drop landing in the band splashes');
  assert.ok(spl[0].x >= 0 && spl[0].x <= 1, `splash x normalised: ${spl[0].x}`);
  assert.ok(Math.abs(spl[0].x - 0.2 / 0.36) < 0.01, 'splash x is frame-x / 0.36');
  // Bottom-origin heightfield (round 1 fix): a drop landing at land=0.9
  // (near the bottom of the band) maps to y near 0, i.e. the last grid
  // row, which the street shader reads at the frame bottom.
  assert.ok(Math.abs(spl[0].y - (1 - (0.9 - 0.65) / 0.35)) < 0.01,
    `splash y is flipped to bottom-origin: ${spl[0].y}`);
  // A drop landing outside the band (in x) does not splash.
  const outside = [{ x: 0.8, y: 1.01, speed: 1, slant: 0.15, len: 0.02, land: 0.9 }];
  assert.equal(L.stepRain(outside, 1, 1 / 60, 0, L.mulberry32(1)).length, 0);
  // A drop that has not reached its landing y yet does not splash.
  const falling = [{ x: 0.2, y: 0.5, speed: 1, slant: 0.15, len: 0.02, land: 0.9 }];
  assert.equal(L.stepRain(falling, 1, 1 / 60, 0, L.mulberry32(1)).length, 0);
  // Over a full minute of drizzle, rain actually produces splashes.
  const sim = L.createSim();
  let total = 0;
  for (let i = 0; i < 3600; i++) { L.stepSim(sim); total += sim.splashes.length; }
  assert.ok(total > 100, `rain splashed ${total} times in 60s (was 0 before the fix)`);
});

test('moods: four presets, all sliders in range', () => {
  const names = Object.keys(L.MOODS);
  assert.deepEqual(names.sort(), ['3am', 'drizzle', 'steam', 'typhoon']);
  for (const m of Object.values(L.MOODS)) {
    for (const k of ['rain', 'wind', 'flicker', 'steam', 'parallax']) {
      assert.ok(m[k] >= 0 && m[k] <= 1, `${k}=${m[k]} in range`);
    }
    assert.ok(m.lightning === 0 || m.lightning === 1);
  }
});

test('sim is deterministic: same seed + same steps => identical state', () => {
  const run = () => {
    const sim = L.createSim();
    for (let i = 0; i < 600; i++) L.stepSim(sim);
    return JSON.stringify(sim, (k, v) => (typeof v === 'function' ? undefined : v));
  };
  assert.equal(run(), run(), '10 simulated seconds are bit-identical across runs');
});

test('advance: fixed-step accumulation and discard guard', () => {
  const sim = L.createSim();
  let r = L.advance(sim, 1 / 60);
  assert.equal(r.steps, 1);
  assert.equal(r.discarded, 0);
  r = L.advance(sim, 0.5);
  assert.equal(r.steps, 5, 'caps at MAX_STEPS_PER_FRAME');
  assert.ok(r.discarded > 0.4, 'excess wall time is discarded, not simulated');
  assert.equal(sim.frame, 6, 'only 6 fixed steps ran despite 0.5s of wall time');
});

test('interactions change the sim', () => {
  const sim = L.createSim();
  const v0 = sim.lanterns[0].v;
  L.applyImpulseLantern(sim, 0, 0.9);
  assert.ok(sim.lanterns[0].v > v0);
  const nv0 = sim.noren[2].v;
  L.applyBrushNoren(sim, 2, 2.2);
  assert.ok(sim.noren[2].v > nv0);
  L.applySpark(sim, 1);
  assert.equal(sim.signs[1].spark, 1);
  assert.equal(sim.signs[1].dip, 3);
});

test('blink cycles and events fire over 200 simulated seconds', () => {
  const sim = L.createSim();
  let sawBlink = false, sawTaxi = false, sawLightning = false;
  for (let i = 0; i < 12000; i++) {
    L.stepSim(sim);
    if (L.blinkAmount(sim) > 0.9) sawBlink = true;
    if (sim.events.taxi > 0) sawTaxi = true;
    if (sim.events.lightning > 0 || sim.events.lightningEnv > 0) sawLightning = true;
  }
  assert.ok(sawBlink, 'blink closes within 200s');
  assert.ok(sawTaxi, 'taxi passes within 200s');
  assert.ok(sawLightning, 'lightning fires within 200s');
  finiteWalk(sim);
});

test('audioParams: gains in [0,1], pan bounded', () => {
  const sim = L.createSim();
  for (const [name, mood] of Object.entries(L.MOODS)) {
    sim.params = { ...mood };
    const ap = L.audioParams(sim, 0.5);
    for (const k of ['rainGain', 'simmerGain', 'buzzGain']) {
      assert.ok(ap[k] >= 0 && ap[k] <= 1, `${name}.${k}=${ap[k]}`);
    }
    assert.ok(Math.abs(ap.pan) <= 0.4, `${name}.pan=${ap.pan}`);
  }
});

test('depthColor: turbo-like ramp, endpoints blue and red', () => {
  const near = L.depthColor(1), far = L.depthColor(0);
  assert.equal(near.length, 3);
  assert.ok(near[0] > 200 && near[2] < 80, `near is red-ish: ${near}`);
  assert.ok(far[2] > 150 && far[0] < 80, `far is blue-ish: ${far}`);
  for (const d of [0, 0.25, 0.5, 0.75, 1]) {
    const c = L.depthColor(d);
    assert.ok(c.every((v) => v >= 0 && v <= 255), `depthColor(${d}) in range`);
  }
});

test('validateManifest: real manifest passes, broken ones fail', () => {
  const ok = L.validateManifest(manifest);
  assert.equal(ok.ok, true, `real manifest should pass: ${ok.errors}`);
  assert.deepEqual([...ok.errors], []);
  const missing = JSON.parse(JSON.stringify(manifest));
  delete missing.layers.layer2;
  const bad1 = L.validateManifest(missing);
  assert.equal(bad1.ok, false, 'missing layer fails');
  assert.ok(bad1.errors.length > 0);
  const badZ = JSON.parse(JSON.stringify(manifest));
  badZ.layers.layer0.z = 9;
  assert.equal(L.validateManifest(badZ).ok, false, 'wrong z fails');
  const badAnchor = JSON.parse(JSON.stringify(manifest));
  badAnchor.anchors.eyes = [[1, 2]];
  assert.equal(L.validateManifest(badAnchor).ok, false, 'one eye fails');
});

test('nextEventDelay ranges', () => {
  const rng = L.mulberry32(3);
  for (let i = 0; i < 20; i++) {
    const t = L.nextEventDelay(rng, 'taxi');
    assert.ok(t >= 22 && t <= 40, `taxi delay ${t}`);
    const l = L.nextEventDelay(rng, 'lightning');
    assert.ok(l >= 28 && l <= 58, `lightning delay ${l}`);
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 1 — regressions for the live E2E failures of 2026-11-20   */
/* ------------------------------------------------------------------ */

test('round 1: coversFrame is aspect-aware; clamped parallax always covers', () => {
  // The old coversFrame ignored the viewport aspect and returned true
  // for every layer at full deflection — the live E2E window (1919x998,
  // aspect 1.923) showed real gaps at the frame edge.
  assert.ok(L.coversFrame(0.34, 1, 1), '16:9 covers at full deflection (default aspect)');
  assert.ok(!L.coversFrame(0.34, 1, 1, 1.923), 'aspect 1.923 does NOT cover at full deflection');
  assert.ok(!L.coversFrame(-0.36, 1, 1, 1.923), 'backdrop also falls short at aspect 1.923');
  // The clamp: full amplitude at 16:9 and narrower, reduced on wider screens.
  assert.equal(L.parallaxScaleFor(16 / 9), 1);
  assert.equal(L.parallaxScaleFor(1.0), 1, 'portrait keeps full parallax');
  const s1923 = L.parallaxScaleFor(1.923);
  assert.ok(s1923 > 0.5 && s1923 < 0.7, `aspect 1.923 scales parallax to ~0.63, got ${s1923}`);
  assert.equal(L.parallaxScaleFor(3), 0, 'absurdly wide viewports get no parallax rather than gaps');
  assert.ok(L.parallaxScaleFor(2.4) === 0, 'aspect 2.4: even rest coverage fails, so parallax is 0');
  // The key invariant: at the clamped scale, every plate covers at every
  // aspect where rest coverage is possible at all.
  for (const aspect of [0.5, 1.0, 16 / 9, 1.923]) {
    const s = L.parallaxScaleFor(aspect);
    for (const l of L.LAYERS) {
      assert.ok(L.coversFrame(l.z, s, s, aspect), `z=${l.z} covers at aspect ${aspect} scale ${s}`);
      assert.ok(L.coversFrame(l.z, -s, -s, aspect), `z=${l.z} covers at aspect ${aspect} scale -${s}`);
    }
  }
});

test('round 1: tap classification maps the frame regions', () => {
  // Neon signs.
  assert.equal(L.classifyTap(100, 390).kind, 'neon');
  assert.equal(L.classifyTap(100, 390).sign, 0, 'OPEN sign is sign 0');
  assert.equal(L.classifyTap(650, 440).kind, 'neon');
  // Noren panels: left edge -> panel 0, right edge -> panel 5.
  // (Field-by-field, not deepEqual: the logic block runs in a vm
  // sandbox, so its objects have a different realm's prototype and
  // deepStrictEqual rejects them.)
  const n0 = L.classifyTap(800, 400);
  assert.equal(n0.kind, 'noren'); assert.equal(n0.panel, 0);
  const n5 = L.classifyTap(1280, 400);
  assert.equal(n5.kind, 'noren'); assert.equal(n5.panel, 5);
  // Lanterns.
  assert.equal(L.classifyTap(445, 175).kind, 'lantern');
  assert.equal(L.classifyTap(445, 175).which, 1, 'front lantern is which=1');
  assert.equal(L.classifyTap(1405, 255).which, 0, 'rear lantern is which=0');
  // Steam region (bowl).
  assert.equal(L.classifyTap(1500, 700).kind, 'steam');
  // Street: bottom-origin water coords — just inside the top of the
  // band (py=701; the band starts at py>700) is fy≈1.
  const top = L.classifyTap(300, 701);
  assert.equal(top.kind, 'street');
  assert.ok(Math.abs(top.fx - 300 / 1920 / 0.36) < 1e-9);
  assert.ok(Math.abs(top.fy - (1 - 1 / 380)) < 1e-9, `top of the street band is fy≈1 (bottom-origin grid): ${top.fy}`);
  const bot = L.classifyTap(300, 1080);
  assert.ok(Math.abs(bot.fy - 0) < 1e-9, 'bottom of the street band is fy=0');
  // Outside everything.
  assert.equal(L.classifyTap(100, 100).kind, 'none');
});

test('round 1: water grid is bottom-origin (top-of-band tap raises the last row)', () => {
  const n = 32;
  const h = new Float32Array(n * n);
  const top = L.classifyTap(300, 701);
  assert.equal(top.kind, 'street');
  L.waterImpulse(h, n, top.fx, top.fy, 1.0, 0.05);
  const col = Math.floor(top.fx * (n - 1));
  const lastRowCell = h[(n - 1) * n + col];
  assert.ok(lastRowCell > 0.5, `top-of-band tap raises the last row (h=${lastRowCell})`);
  assert.equal(h[col], 0, 'first row untouched by a top-of-band tap');
});

test('round 1: tap splash rings persist ~3s then expire, capped at 4', () => {
  const sim = L.createSim();
  assert.equal(sim.rings.length, 0);
  L.addRing(sim, 0.5, 0.5, 1.2);
  assert.equal(sim.rings.length, 1);
  assert.equal(sim.rings[0].age, 0);
  for (let i = 0; i < 90; i++) L.stepSim(sim); // 1.5 s
  assert.equal(sim.rings.length, 1, 'ring still there at 1.5 s');
  assert.ok(sim.rings[0].age > 1.4 && sim.rings[0].age < 1.6, `ring age ${sim.rings[0].age}`);
  for (let i = 0; i < 120; i++) L.stepSim(sim); // +2 s = 3.5 s total
  assert.equal(sim.rings.length, 0, 'ring expired after 3 s');
  for (let i = 0; i < 6; i++) L.addRing(sim, 0.1 * i, 0.1 * i, 1);
  assert.equal(sim.rings.length, 4, 'rings capped at 4');
});

test('round 1: steam swirl accumulates with drag angle and decays', () => {
  const sim = L.createSim();
  assert.equal(sim.swirl, 0);
  L.addSwirl(sim, 0.5);
  assert.ok(sim.swirl > 0.2, 'drag adds swirl strength');
  assert.ok(Math.abs(sim.swirlAng - 0.5) < 1e-9);
  L.addSwirl(sim, -0.2);
  assert.ok(Math.abs(sim.swirlAng - 0.3) < 1e-9, 'angle accumulates signed');
  const s0 = sim.swirl;
  for (let i = 0; i < 120; i++) L.stepSim(sim); // 2 s
  assert.ok(sim.swirl < s0 * 0.1, `swirl decays (was ${s0}, now ${sim.swirl})`);
  assert.ok(Math.abs(sim.swirlAng) < 0.3 * 0.3, `angle relaxes toward 0 (${sim.swirlAng})`);
});

test('round 1: quality tiers step down when slow, up when fast', () => {
  assert.equal(L.qualityTierFor(10, 1), 0.75);
  assert.equal(L.qualityTierFor(10, 0.75), 0.5);
  assert.equal(L.qualityTierFor(10, 0.5), 0.5, 'floor at 0.5');
  assert.equal(L.qualityTierFor(60, 0.5), 0.75);
  assert.equal(L.qualityTierFor(60, 0.75), 1);
  assert.equal(L.qualityTierFor(60, 1), 1, 'ceiling at 1');
  assert.equal(L.qualityTierFor(30, 1), 1, 'mid-range fps holds the tier');
  assert.equal(L.qualityTierFor(30, 0.5), 0.5);
});

/* ------------------------------------------------------------------ */
/* Fix round 2 — playlist (real tracks, CC BY 4.0)                     */
/* ------------------------------------------------------------------ */

test('round 2: playlist matches the verified music manifest', () => {
  // The 6 tracks were downloaded and verified (ffprobe + full decode)
  // 2026-11-20; the logic block is the single source of truth the UI
  // renders from, so it must match the files on disk exactly.
  assert.equal(L.PLAYLIST.length, 6);
  const seen = new Set();
  for (const t of L.PLAYLIST) {
    assert.ok(t.file.endsWith('.mp3'), t.file);
    assert.ok(!seen.has(t.file), `duplicate file ${t.file}`);
    seen.add(t.file);
    const p = path.join(root, 'assets', 'music', t.file);
    assert.ok(existsSync(p), `missing music file ${t.file}`);
    assert.ok(statSync(p).size > 1_000_000, `${t.file} is suspiciously small`);
    assert.ok(t.title && t.artist, 'title + artist present');
    assert.match(t.dur, /^\d+:\d{2}$/, `duration format ${t.dur}`);
    // Attribution is a license requirement, not decoration: every track
    // must carry its exact CC BY 4.0 attribution text.
    assert.ok(t.attribution.includes('CC BY 4.0'), `${t.file} attribution mentions CC BY 4.0`);
    assert.ok(t.attribution.includes(t.artist), `${t.file} attribution names the artist`);
    assert.ok(t.attribution.includes('creativecommons.org/licenses/by/4.0'),
      `${t.file} attribution links the license`);
  }
  // Order is the play order: 3 x 1000 Handz, then 3 x Purrple Cat.
  assert.deepEqual([...L.PLAYLIST.map((t) => t.artist)],
    ['1000 Handz', '1000 Handz', '1000 Handz', 'Purrple Cat', 'Purrple Cat', 'Purrple Cat']);
  // Listed durations sum to 16:48 (precise ffprobe total is 16:49).
  const total = L.PLAYLIST.reduce((s, t) => {
    const [m, sec] = t.dur.split(':').map(Number);
    return s + m * 60 + sec;
  }, 0);
  assert.equal(total, 1008, `playlist listed durations total 16:48, got ${total}s`);
});

test('round 2: playlist next/prev wrap around', () => {
  assert.equal(L.playlistNext(5, 6), 0, 'next after the last track wraps to the first');
  assert.equal(L.playlistNext(0, 6), 1);
  assert.equal(L.playlistPrev(0, 6), 5, 'prev before the first track wraps to the last');
  assert.equal(L.playlistPrev(3, 6), 2);
});

/* ------------------------------------------------------------------ */
/* Phase 2 — multi-scene (scene switcher, per-scene anchors, cloth)    */
/* ------------------------------------------------------------------ */

test('phase 2: SCENES registry has 6 scenes; ramen reproduces the old constants', () => {
  const scenes = L.SCENES;
  assert.equal(scenes.length, 6);
  // (join, not deepEqual: SCENES arrays come from the vm sandbox, whose
  // Array prototype differs from this file's.)
  assert.equal(scenes.map((s) => s.id).join(','),
    'ramen,osaka-cafe,kyoto-matcha,kamakura-enoden,tokyo-shotengai,kyoto-yasaka');
  const r = L.sceneById('ramen');
  // Ramen is the old hardcoded geometry, verbatim.
  assert.equal(r.street.x0, 0); assert.equal(r.street.y0, 700);
  assert.equal(r.street.x1, 691.2); assert.equal(r.street.y1, 1080);
  assert.equal(r.signs.length, 5);
  assert.equal(r.signs[0].join(','), '15,330,185,450', 'OPEN sign is sign 0');
  assert.equal(r.lanterns.length, 2);
  assert.equal(r.lanterns[0].pivot.join(','), '1405,120', 'rear pivot');
  assert.equal(r.lanterns[1].pivot.join(','), '445,0', 'front pivot');
  assert.equal(r.cloth.layer, 'layer2');
  assert.equal(r.cloth.panels.length, 2);
  assert.equal(r.taxi, true);
  // Unknown id falls back to ramen.
  assert.equal(L.sceneById('nope').id, 'ramen');
  assert.equal(L.sceneById().id, 'ramen');
});

test('phase 2: steamPlaneRect puts the steam above the source (ramen fix)', () => {
  // The old code passed a texture-v (from the bottom) where a frame
  // fraction from the top was expected, mirroring the bowl steam to
  // the top of the frame (centre ~y=44). The fix centres the plane on
  // the source/top midpoint: ramen bowl (1505,885), top (1520,560).
  const r = L.steamPlaneRect(L.SCENES[0].steam);
  assert.ok(Math.abs(r.cyV - 722.5 / 1080) < 1e-9, `steam centre y is 722.5, not 44: ${r.cyV * 1080}`);
  assert.ok(Math.abs(r.hFrac - 325 / 1080) < 1e-9, `steam height is 325 px: ${r.hFrac * 1080}`);
  assert.equal(r.wFrac, 0.16);
  // Every scene's steam plane sits between its source and its top.
  for (const def of L.SCENES) {
    const p = L.steamPlaneRect(def.steam);
    const midY = (def.steam.src[1] + def.steam.top[1]) / 2;
    assert.ok(Math.abs(p.cyV * 1080 - midY) < 1e-9, `${def.id}: steam centre ${p.cyV * 1080} vs ${midY}`);
    assert.ok(p.hFrac > 0, `${def.id}: steam has height`);
  }
});

test('phase 2: classifyTap per scene (noren, lanterns, street band)', () => {
  // Shotengai noren is on layer3, 3 panels = 9 strips: left edge
  // strip 0, middle strip 4, right panel strip 7. (400,400) hits the
  // oden sign first — signs take precedence over the noren.
  assert.equal(L.classifyTap(150, 400, 'tokyo-shotengai').panel, 0);
  const n4 = L.classifyTap(280, 400, 'tokyo-shotengai');
  assert.equal(n4.kind, 'noren'); assert.equal(n4.panel, 4);
  const n7 = L.classifyTap(400, 500, 'tokyo-shotengai');
  assert.equal(n7.kind, 'noren'); assert.equal(n7.panel, 7);
  assert.equal(L.classifyTap(400, 400, 'tokyo-shotengai').kind, 'neon', 'oden sign beats the noren');
  // Osaka lamps: the lamp centre (848,200) sits inside the window-glow
  // sign box, so it sparks the sign; the tap circle's edge (960,200)
  // is outside the box and swings the lamp.
  assert.equal(L.classifyTap(848, 200, 'osaka-cafe').kind, 'neon');
  const lamp = L.classifyTap(960, 200, 'osaka-cafe');
  assert.equal(lamp.kind, 'lantern'); assert.equal(lamp.which, 0);
  // Matcha paper lantern swings; the garden stone lantern is a sign.
  const ml = L.classifyTap(234, 244, 'kyoto-matcha');
  assert.equal(ml.kind, 'lantern'); assert.equal(ml.which, 0);
  assert.equal(L.classifyTap(1520, 500, 'kyoto-matcha').kind, 'neon');
  // Enoden's train is a static plate, not a tap target.
  assert.equal(L.classifyTap(744, 586, 'kamakura-enoden').kind, 'none');
  // Street band fx/fy are per-scene: osaka band x 950..1900, y 680..837.
  const st = L.classifyTap(1425, 700, 'osaka-cafe');
  assert.equal(st.kind, 'street');
  assert.ok(Math.abs(st.fx - 0.5) < 1e-9);
  assert.ok(Math.abs(st.fy - (1 - 20 / 157)) < 1e-9, `osaka street fy: ${st.fy}`);
  const sb = L.classifyTap(1425, 837, 'osaka-cafe');
  assert.ok(Math.abs(sb.fy - 0) < 1e-9, 'bottom of the osaka band is fy=0');
  // Yasaka's slope is the full-width street band.
  const ys = L.classifyTap(960, 700, 'kyoto-yasaka');
  assert.equal(ys.kind, 'street');
  assert.ok(Math.abs(ys.fx - 0.5) < 1e-9);
});

test('phase 2: createSim per scene (noren, drips, taxi, signs, lanterns)', () => {
  const expect = {
    ramen: { noren: 6, drips: 16, taxi: true, signs: 5, lanterns: 2 },
    'osaka-cafe': { noren: 0, drips: 0, taxi: false, signs: 4, lanterns: 1 },
    'kyoto-matcha': { noren: 0, drips: 16, taxi: false, signs: 1, lanterns: 1 },
    'kamakura-enoden': { noren: 0, drips: 16, taxi: false, signs: 5, lanterns: 0 },
    'tokyo-shotengai': { noren: 9, drips: 16, taxi: false, signs: 5, lanterns: 0 },
    'kyoto-yasaka': { noren: 0, drips: 16, taxi: false, signs: 4, lanterns: 0 },
  };
  for (const [id, e] of Object.entries(expect)) {
    const sim = L.createSim(20261120, id);
    assert.equal(sim.noren.length, e.noren, `${id}: noren`);
    assert.equal(sim.drips.length, e.drips, `${id}: drips (osaka is an interior)`);
    assert.equal(sim.events.taxiAt === Infinity, !e.taxi, `${id}: taxi scheduled only for ramen`);
    assert.equal(sim.signs.length, e.signs, `${id}: signs`);
    assert.equal(sim.lanterns.length, e.lanterns, `${id}: lanterns`);
    // The sim steps without throwing for every scene (200 steps).
    for (let i = 0; i < 200; i++) L.stepSim(sim);
  }
});

test('phase 2: validateManifest accepts eyeless scenes, still rejects 1 eye', () => {
  for (const id of ['kyoto-yasaka', 'tokyo-shotengai', 'kamakura-enoden']) {
    const dir = L.sceneById(id).dir;
    const m = JSON.parse(readFileSync(path.join(root, dir, 'manifest.json'), 'utf8'));
    assert.equal(L.validateManifest(m).ok, true, `${id} manifest should pass without eyes`);
  }
  const bad = JSON.parse(JSON.stringify(manifest));
  bad.anchors.eyes = [[1600, 520]];
  assert.equal(L.validateManifest(bad).ok, false, 'one eye still fails');
});

test('phase 2: cloth layer is per-scene (ramen layer2, shotengai layer3, none elsewhere)', () => {
  assert.equal(L.sceneById('ramen').cloth.layer, 'layer2');
  assert.equal(L.sceneById('tokyo-shotengai').cloth.layer, 'layer3');
  assert.equal(L.sceneById('tokyo-shotengai').cloth.panels.length, 3);
  for (const id of ['osaka-cafe', 'kyoto-matcha', 'kamakura-enoden', 'kyoto-yasaka']) {
    assert.equal(L.sceneById(id).cloth, null, `${id} has no cloth`);
  }
  // The manifests agree with the registry.
  for (const id of ['ramen', 'tokyo-shotengai']) {
    const m = JSON.parse(readFileSync(path.join(root, L.sceneById(id).dir, 'manifest.json'), 'utf8'));
    assert.equal(m.cloth_layer || 'layer2', L.sceneById(id).cloth.layer, `${id}: manifest cloth_layer matches registry`);
  }
});
