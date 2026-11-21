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

test('moods: five presets, all sliders in range', () => {
  const names = Object.keys(L.MOODS);
  assert.deepEqual(names.sort(), ['3am', 'drizzle', 'snow', 'steam', 'typhoon']);
  for (const m of Object.values(L.MOODS)) {
    for (const k of ['rain', 'wind', 'flicker', 'steam', 'parallax', 'snow']) {
      assert.ok(m[k] >= 0 && m[k] <= 1, `${k}=${m[k]} in range`);
    }
    assert.ok(m.lightning === 0 || m.lightning === 1);
  }
  // Snow is a preset param like lightning: only the snow-night preset
  // turns it on; the other four keep it at 0.
  assert.equal(L.MOODS.snow.snow, 1);
  for (const k of ['drizzle', 'typhoon', '3am', 'steam']) assert.equal(L.MOODS[k].snow, 0);
  assert.equal(L.MOODS.snow.rain, 0, 'snow night: no rain');
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

test('phase 2: SCENES registry has 9 scenes; ramen reproduces the old constants', () => {
  const scenes = L.SCENES;
  assert.equal(scenes.length, 9);
  // (join, not deepEqual: SCENES arrays come from the vm sandbox, whose
  // Array prototype differs from this file's.)
  assert.equal(scenes.map((s) => s.id).join(','),
    'ramen,osaka-cafe,kyoto-matcha,kamakura-enoden,tokyo-shotengai,kyoto-yasaka,hakodate-goryokaku,himeji-cafe,gero-onsen');
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
  // Hakodate (2026-11-20): the snow scene — no steam, no lanterns, no
  // rig, no drips; snowfall on; four lit-building signs; the snow flag
  // is explicit on every scene, never undefined.
  for (const def of L.SCENES) {
    assert.equal(typeof def.snow, 'boolean', `${def.id}: snow flag is explicit`);
  }
  const h = L.sceneById('hakodate-goryokaku');
  assert.equal(h.steam, null);
  assert.equal(h.lanterns.length, 0);
  assert.equal(h.rig, null);
  assert.equal(h.drips, null);
  assert.equal(h.snow, true);
  assert.equal(h.signs.length, 4);
  assert.equal(h.taxi, false);
  assert.equal(h.street.x0, 0); assert.equal(h.street.y0, 760);
  assert.equal(h.street.x1, 1920); assert.equal(h.street.y1, 1080);
  assert.equal(L.SCENES.filter((s) => s.snow).map((s) => s.id).join(','), 'hakodate-goryokaku');
  // Unknown id falls back to ramen.
  assert.equal(L.sceneById('nope').id, 'ramen');
  assert.equal(L.sceneById().id, 'ramen');
});

test('lint: registry geometry matches the scene anchors in scripts/scenes.json', () => {
  // 2026-11-20, the user's rule: when a coordinate mistake ships, add a
  // check that catches it. Two shipped mistakes motivated this lint:
  // (1) the v2 regeneration rewrote the scenes.json anchors but the
  // index.html registry still pointed at the v1 art, so lanterns, steam
  // and eyes all aimed at the wrong places; (2) the v1 matcha steam src
  // sat 94px above the bowl, so the steam floated and the bowl never
  // responded to taps. This test pins the registry to the anchors — the
  // two files may not drift. What it does NOT check: whether the anchors
  // themselves were measured right. That is verified by viewing the art
  // (regen checklist in spec.md) — a number can be consistently wrong
  // in both files.
  const cfg = JSON.parse(readFileSync(path.join(root, 'scripts', 'scenes.json'), 'utf8')).scenes;
  for (const [id, scene] of Object.entries(cfg)) {
    const def = L.sceneById(id);
    const a = scene.anchors || {};
    // Steam top is the anchor every scene has; the registry must agree.
    if (a.steam_top) assert.equal(def.steam.top.join(','), a.steam_top.join(','), `${id}: steam top`);
    // Steam src is the steaming object itself: bowl/cup centre where the
    // anchors name one, else directly below the top on the same x.
    const srcName = a.bowl_center ? 'bowl_center' : a.cup_center ? 'cup_center' : null;
    if (srcName) {
      assert.equal(def.steam.src.join(','), a[srcName].join(','), `${id}: steam src is the ${srcName}`);
    } else if (a.steam_top) {
      assert.equal(def.steam.src[0], a.steam_top[0], `${id}: steam src under its top`);
      assert.ok(def.steam.src[1] > a.steam_top[1], `${id}: steam src below its top`);
    }
    // Extra steam columns (himeji's other cups, gero's bath spread):
    // each src must be a named anchor in scenes.json, and its top
    // must sit directly above it on the same x.
    if (def.steam && def.steam.extra) {
      const anchorVals = new Set(Object.values(a).map((v) => (Array.isArray(v) ? v.join(',') : null)));
      for (const ex of def.steam.extra) {
        assert.ok(anchorVals.has(ex.src.join(',')), `${id}: extra steam src ${ex.src} is a scenes.json anchor`);
        assert.equal(ex.top[0], ex.src[0], `${id}: extra steam top above its src`);
        assert.ok(ex.top[1] < ex.src[1], `${id}: extra steam top above its src`);
      }
    }
    // Swinging lantern pivot is the hang point: x must equal the front
    // lantern anchor, y must be the top edge (0).
    if (def.lanterns.length && a.lantern_front_pivot) {
      assert.equal(def.lanterns[0].pivot[0], a.lantern_front_pivot[0], `${id}: lantern pivot x`);
      assert.equal(def.lanterns[0].pivot[1], 0, `${id}: lantern pivot hangs from the top`);
    }
    // Rig pivot is derived from the eyes: midpoint x, eye y + 1.2x the
    // eye separation (the derivation rule from the registry update).
    if (def.rig && a.eyes) {
      const [e0, e1] = a.eyes;
      const midX = (e0[0] + e1[0]) / 2;
      const sep = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
      const eyeY = (e0[1] + e1[1]) / 2;
      assert.ok(Math.abs(def.rig.pivot[0] - midX) <= 5, `${id}: rig pivot x near eye midpoint`);
      assert.ok(Math.abs(def.rig.pivot[1] - (eyeY + 1.2 * sep)) <= 5, `${id}: rig pivot y from eyes`);
    }
    // Cloth panels must be the slicer's punch polygons: same count, same
    // x-extent and top per panel, bottom corners in the same order.
    if (def.cloth && scene.punch_polys) {
      assert.equal(def.cloth.panels.length, scene.punch_polys.length, `${id}: panel count`);
      scene.punch_polys.forEach((poly, i) => {
        const p = def.cloth.panels[i];
        const xs = poly.map((pt) => pt[0]); const ys = poly.map((pt) => pt[1]);
        assert.equal(p.x0, Math.min(...xs), `${id}: panel ${i} x0`);
        assert.equal(p.x1, Math.max(...xs), `${id}: panel ${i} x1`);
        assert.equal(p.yTop, Math.min(...ys), `${id}: panel ${i} yTop`);
        assert.equal(p.yBot0, poly[3][1], `${id}: panel ${i} yBot0 (bottom-left)`);
        assert.equal(p.yBot1, poly[2][1], `${id}: panel ${i} yBot1 (bottom-right)`);
      });
    }
    // Steam-less scenes: no steam_top anchor means no steam field in
    // the registry — the builders must not find one (hakodate, the
    // first scene with no steaming object). A scene WITH a steam_top
    // anchor must have a steam field (checked above).
    if (!a.steam_top) {
      assert.equal(def.steam, null, `${id}: no steam anchor means no steam in the registry`);
    }
    // Lit-building anchors must sit inside a sign rect, so tapping the
    // building sparks it (hakodate's office, pavilion, annex and mid
    // building — measured from the emissive-mask blobs).
    for (const k of ['office_center', 'pavilion', 'annex', 'mid_building']) {
      if (a[k]) {
        const inside = (def.signs || []).some((b) =>
          b[0] <= a[k][0] && a[k][0] <= b[2] && b[1] <= a[k][1] && a[k][1] <= b[3]);
        assert.ok(inside, `${id}: ${k} anchor ${a[k]} sits inside a sign rect`);
      }
    }
  }
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
  // Steam-less scenes (hakodate) have no steam at all and are skipped.
  for (const def of L.SCENES) {
    if (!def.steam) { assert.equal(def.id, 'hakodate-goryokaku', 'only hakodate is steam-less'); continue; }
    const p = L.steamPlaneRect(def.steam);
    const midY = (def.steam.src[1] + def.steam.top[1]) / 2;
    assert.ok(Math.abs(p.cyV * 1080 - midY) < 1e-9, `${def.id}: steam centre ${p.cyV * 1080} vs ${midY}`);
    assert.ok(p.hFrac > 0, `${def.id}: steam has height`);
  }
});

test('steam particles (2026-11-21): every cup / bath column steams; puffs rise, grow and fade', () => {
  // himeji's three cups and gero's three bath columns each get a
  // column; hakodate stays steam-less; ramen keeps bowl + pot.
  const h = L.steamSources(L.sceneById('himeji-cafe'));
  assert.equal(h.length, 3);
  assert.equal(h.map((s) => s.src.join(',')).join(' | '), '972,828 | 430,878 | 1330,785');
  const g = L.steamSources(L.sceneById('gero-onsen'));
  assert.equal(g.length, 3);
  assert.equal(g.map((s) => s.src.join(',')).join(' | '), '600,810 | 960,830 | 1320,810');
  assert.equal(L.steamSources(L.sceneById('hakodate-goryokaku')).length, 0);
  assert.equal(L.steamSources(L.sceneById('ramen')).length, 2);
  // A puff: phase 0 sits on the source invisible, phase 0.5 is
  // mid-rise and visible and bigger, phase 1 reaches the top
  // invisible again — so the column is visibly rising, not static.
  const src = h[0];
  const seed = { offset: 0, sway: 0, size: 1 };
  const p0 = L.steamParticle(src, 0, seed, 0, 0, 0);
  assert.equal(p0.y, 828); assert.equal(p0.alpha, 0);
  const p5 = L.steamParticle(src, 0.5, seed, 0, 0, 0);
  assert.ok(p5.y > 623 && p5.y < 828, `mid-rise y ${p5.y}`);
  assert.ok(p5.alpha > 0.2, `mid-rise alpha ${p5.alpha}`);
  assert.ok(p5.size > p0.size, `puff grows ${p0.size} -> ${p5.size}`);
  const p1 = L.steamParticle(src, 1, seed, 0, 0, 0);
  assert.equal(p1.y, 623); assert.equal(p1.alpha, 0);
  // Wind drifts exactly wind * phase * 70 px sideways (sway cancels
  // out when the same seed and phase are compared).
  const windDrift = L.steamParticle(src, 0.9, seed, 1, 0, 0).x - L.steamParticle(src, 0.9, seed, 0, 0, 0).x;
  assert.ok(Math.abs(windDrift - 63) < 1e-9, `wind drift ${windDrift} vs 63`);
  // The drag swirl twists the puff sideways.
  assert.notEqual(
    L.steamParticle(src, 0.5, seed, 0, 1, 0).x, L.steamParticle(src, 0.5, seed, 0, 0, 0).x);
  // Taps on the side cups and the bath columns swirl the steam too.
  assert.equal(L.classifyTap(430, 750, 'himeji-cafe').kind, 'steam');
  assert.equal(L.classifyTap(1330, 680, 'himeji-cafe').kind, 'steam');
  assert.equal(L.classifyTap(960, 600, 'gero-onsen').kind, 'steam');
});

test('phase 2: classifyTap per scene (noren, lanterns, street band)', () => {
  // Shotengai noren is on layer3, 3 panels = 9 strips (v2 panels
  // x 0..135, 135..340, 340..620; the tap maps PER PANEL, 3 strips
  // each, matching buildNorenStrips — a uniform division across the
  // rod would mis-assign taps by a strip on unequal panels):
  // left edge strip 0, strip 5, strip 7. (610,400) hits the oden
  // sign first — signs take precedence over the noren.
  assert.equal(L.classifyTap(20, 400, 'tokyo-shotengai').panel, 0);
  const n5 = L.classifyTap(310, 400, 'tokyo-shotengai');
  assert.equal(n5.kind, 'noren'); assert.equal(n5.panel, 5);
  // (300,400) is the discriminating case: uniform mapping would say
  // strip 4, per-panel mapping says 5 (panel 1, third third).
  assert.equal(L.classifyTap(300, 400, 'tokyo-shotengai').panel, 5);
  const n7 = L.classifyTap(515, 500, 'tokyo-shotengai');
  assert.equal(n7.kind, 'noren'); assert.equal(n7.panel, 7);
  assert.equal(L.classifyTap(610, 400, 'tokyo-shotengai').kind, 'neon', 'oden sign beats the noren');
  // Osaka lamps: the lamp centre (848,200) sits inside the window-glow
  // sign box, so it sparks the sign; the tap circle's edge (960,200)
  // is outside the box and swings the lamp.
  assert.equal(L.classifyTap(848, 200, 'osaka-cafe').kind, 'neon');
  const lamp = L.classifyTap(960, 200, 'osaka-cafe');
  assert.equal(lamp.kind, 'lantern'); assert.equal(lamp.which, 0);
  // Matcha paper lantern swings; the garden stone lantern is a sign.
  const ml = L.classifyTap(335, 115, 'kyoto-matcha');
  assert.equal(ml.kind, 'lantern'); assert.equal(ml.which, 0);
  assert.equal(L.classifyTap(1700, 690, 'kyoto-matcha').kind, 'neon');
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
  const ys = L.classifyTap(975, 700, 'kyoto-yasaka');
  assert.equal(ys.kind, 'street');
  assert.ok(Math.abs(ys.fx - 0.5) < 1e-9);
  // Hakodate: the four lit buildings are signs (tapping one sparks it),
  // the street band is the near snow ground, and there is NO steam
  // target — a point that would be steam on another scene is 'none'.
  assert.equal(L.classifyTap(915, 350, 'hakodate-goryokaku').kind, 'neon', 'office');
  assert.equal(L.classifyTap(803, 353, 'hakodate-goryokaku').kind, 'neon', 'pavilion');
  assert.equal(L.classifyTap(710, 420, 'hakodate-goryokaku').kind, 'neon', 'annex');
  assert.equal(L.classifyTap(1067, 460, 'hakodate-goryokaku').kind, 'neon', 'mid building');
  const hs = L.classifyTap(960, 900, 'hakodate-goryokaku');
  assert.equal(hs.kind, 'street');
  assert.ok(Math.abs(hs.fx - 0.5) < 1e-9);
  assert.ok(Math.abs(hs.fy - (1 - 140 / 320)) < 1e-9, `hakodate street fy: ${hs.fy}`);
  assert.equal(L.classifyTap(960, 500, 'hakodate-goryokaku').kind, 'none', 'no steam target on a steam-less scene');
});

test('phase 2: createSim per scene (noren, drips, taxi, signs, lanterns)', () => {
  const expect = {
    ramen: { noren: 6, drips: 16, taxi: true, signs: 5, lanterns: 2 },
    'osaka-cafe': { noren: 0, drips: 0, taxi: false, signs: 4, lanterns: 1 },
    'kyoto-matcha': { noren: 0, drips: 16, taxi: false, signs: 1, lanterns: 1 },
    'kamakura-enoden': { noren: 0, drips: 16, taxi: false, signs: 5, lanterns: 0 },
    'tokyo-shotengai': { noren: 9, drips: 16, taxi: false, signs: 5, lanterns: 0 },
    'kyoto-yasaka': { noren: 0, drips: 16, taxi: false, signs: 4, lanterns: 0 },
    'hakodate-goryokaku': { noren: 0, drips: 0, taxi: false, signs: 4, lanterns: 0, snow: 250 },
    'himeji-cafe': { noren: 0, drips: 0, taxi: false, signs: 7, lanterns: 0 },
    'gero-onsen': { noren: 0, drips: 0, taxi: false, signs: 2, lanterns: 0 },
  };
  for (const [id, e] of Object.entries(expect)) {
    const sim = L.createSim(20261120, id);
    assert.equal(sim.noren.length, e.noren, `${id}: noren`);
    assert.equal(sim.drips.length, e.drips, `${id}: drips (osaka is an interior)`);
    assert.equal(sim.events.taxiAt === Infinity, !e.taxi, `${id}: taxi scheduled only for ramen`);
    assert.equal(sim.signs.length, e.signs, `${id}: signs`);
    assert.equal(sim.lanterns.length, e.lanterns, `${id}: lanterns`);
    assert.equal(sim.snow.length, e.snow || 0, `${id}: snowflakes (only hakodate has any)`);
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

/* ---------- scene-switch 404 fix (2026-11-20) ---------- */

test('scene switch: clothLayerFor is null for cloth-less scenes, layer id otherwise', () => {
  // Real manifests, as deployed: the four cloth-less scenes have
  // cloth_layer null; ramen's manifest predates the key entirely.
  for (const id of ['osaka-cafe', 'kyoto-matcha', 'kamakura-enoden', 'kyoto-yasaka']) {
    const def = L.sceneById(id);
    const m = JSON.parse(readFileSync(path.join(root, def.dir, 'manifest.json'), 'utf8'));
    assert.equal(L.clothLayerFor(def, m), null, `${id} must have no cloth layer`);
  }
  const ramen = L.sceneById('ramen');
  const ramenM = JSON.parse(readFileSync(path.join(root, ramen.dir, 'manifest.json'), 'utf8'));
  assert.equal(L.clothLayerFor(ramen, ramenM), 'layer2', 'ramen falls back to the registry layer');
  const shotengai = L.sceneById('tokyo-shotengai');
  const shotengaiM = JSON.parse(readFileSync(path.join(root, shotengai.dir, 'manifest.json'), 'utf8'));
  assert.equal(L.clothLayerFor(shotengai, shotengaiM), 'layer3', 'shotengai uses the manifest cloth_layer');
  // A manifest override wins over the registry, and a null manifest is safe.
  assert.equal(L.clothLayerFor(shotengai, { cloth_layer: 'layer2' }), 'layer2');
  assert.equal(L.clothLayerFor(ramen, null), 'layer2');
  assert.equal(L.clothLayerFor({ cloth: null }, { cloth_layer: 'layer2' }), null, 'no registry cloth means no cloth layer, whatever the manifest says');
});

/* ---------- i18n (2026-11-20): zh / en / ja ---------- */

test('i18n: default language is zh; t() returns the translated string per language', () => {
  assert.equal(L.DEFAULT_LANG, 'zh');
  assert.equal(L.LANGS.join(','), 'zh,en,ja');
  assert.equal(L.t('zh', 'toast.splash'), '水花！');
  assert.equal(L.t('en', 'toast.splash'), 'Splash!');
  assert.equal(L.t('ja', 'toast.splash'), '水しぶき！');
  assert.equal(L.t('zh', 'app.subtitle'), '一張圖 · 全部在你的裝置上算出來');
  assert.equal(L.t('en', 'mood.3am'), '🌙 3AM');
  assert.equal(L.t('ja', 'mood.3am'), '🌙 午前3時');
  assert.equal(L.t('zh', 'mood.snow'), '❄ 雪夜');
  assert.equal(L.t('en', 'mood.snow'), '❄ Snow Night');
  assert.equal(L.t('ja', 'mood.snow'), '❄ 雪の夜');
});

test('i18n: every key exists in all three languages, non-empty, no extras', () => {
  const zhKeys = Object.keys(L.I18N.zh);
  assert.ok(zhKeys.length > 50, `expected a full table, got ${zhKeys.length} keys`);
  for (const lang of ['en', 'ja']) {
    const keys = Object.keys(L.I18N[lang]);
    assert.equal(keys.sort().join(','), [...zhKeys].sort().join(','), `${lang} keys must match zh exactly`);
    for (const k of keys) {
      assert.equal(typeof L.I18N[lang][k], 'string', `${lang}.${k} is a string`);
      assert.ok(L.I18N[lang][k].length > 0, `${lang}.${k} is non-empty`);
    }
  }
});

test('i18n: t() falls back to zh for an unknown language, returns the key for an unknown key, substitutes {vars}', () => {
  assert.equal(L.t('fr', 'toast.splash'), '水花！', 'unknown language falls back to zh');
  assert.equal(L.t('zh', 'no.such.key'), 'no.such.key', 'unknown key returns itself, never blank');
  assert.equal(L.t('zh', 'load.layers', { loaded: 3, total: 7 }), '正在載入圖層 3/7…');
  assert.equal(L.t('en', 'load.layers', { loaded: 3, total: 7 }), 'Loading layers 3/7…');
  assert.equal(L.t('ja', 'load.layers', { loaded: 3, total: 7 }), 'レイヤーを読み込み中 3/7…');
  assert.equal(L.t('zh', 'load.layers', {}), '正在載入圖層 /…', 'a missing var substitutes empty');
  assert.equal(L.t('en', 'depth.done', { w: 1920, h: 1080 }), 'Live depth estimate done (1920×1080, on-device)');
});

test('i18n: scene names translate in all three languages', () => {
  const expected = {
    'ramen': ['深夜拉麵', 'Ramen Shop', 'ラーメン店'],
    'osaka-cafe': ['大阪喫茶店', 'Osaka Kissaten', '大阪喫茶店'],
    'kyoto-matcha': ['京都町家抹茶屋', 'Kyoto Machiya Tea House', '京都町家抹茶屋'],
    'kamakura-enoden': ['鎌倉江之電', 'Kamakura Enoden', '鎌倉江ノ電'],
    'tokyo-shotengai': ['東京下町商店街', 'Tokyo Shitamachi Street', '東京下町商店街'],
    'kyoto-yasaka': ['京都八坂塔', 'Kyoto Yasaka Pagoda', '京都八坂の塔'],
    'hakodate-goryokaku': ['函館五稜郭雪夜', 'Hakodate Goryokaku Snow', '函館五稜郭'],
    'himeji-cafe': ['姬路咖啡館', 'Himeji Cafe', '姫路カフェ'],
    'gero-onsen': ['下呂溫泉', 'Gero Onsen', '下呂温泉'],
  };
  for (const [id, names] of Object.entries(expected)) {
    assert.equal(L.sceneName(id, 'zh'), names[0], `${id} zh`);
    assert.equal(L.sceneName(id, 'en'), names[1], `${id} en`);
    assert.equal(L.sceneName(id, 'ja'), names[2], `${id} ja`);
    // The zh name is the registry's existing `name` field — the
    // translation table did not reword the shipped Chinese.
    assert.equal(L.sceneById(id).names.zh, L.sceneById(id).name, `${id}: names.zh === name`);
    assert.ok(L.sceneById(id).emoji, `${id} has a picker emoji`);
  }
  assert.equal(L.sceneName('ramen', 'fr'), '深夜拉麵', 'unknown language falls back to zh name');
  assert.equal(L.sceneName('no-such-scene', 'en'), 'Ramen Shop', 'unknown scene falls back to ramen');
});

test('i18n: savedLang round-trips through storage; unknown/missing value means zh', () => {
  const store = {};
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
  assert.equal(L.savedLang(stub), 'zh', 'nothing saved yet');
  stub.setItem(L.LANG_STORAGE_KEY, 'ja');
  assert.equal(L.savedLang(stub), 'ja', 'ja round-trips');
  stub.setItem(L.LANG_STORAGE_KEY, 'en');
  assert.equal(L.savedLang(stub), 'en', 'en round-trips');
  stub.setItem(L.LANG_STORAGE_KEY, 'xx');
  assert.equal(L.savedLang(stub), 'zh', 'unknown value falls back to zh');
  assert.equal(L.savedLang(null), 'zh', 'no storage at all');
  assert.equal(L.savedLang({ getItem: () => { throw new Error('denied'); } }), 'zh', 'throwing storage');
  assert.equal(L.validLang('ja'), 'ja');
  assert.equal(L.validLang(''), 'zh');
  assert.equal(L.LANG_STORAGE_KEY, 'ramen-diorama.lang');
});

/* ---------- hakodate snowfall (2026-11-20) ---------- */

test('snow: makeSnow ranges, stepSnow falls, wind drifts, flakes respawn', () => {
  const rng = L.mulberry32(20261120);
  const flakes = L.makeSnow(L.SNOW_COUNT, rng);
  assert.equal(flakes.length, 250);
  for (const f of flakes) {
    assert.ok(f.x >= 0 && f.x <= 1, 'x in [0,1]');
    assert.ok(f.y >= 0 && f.y <= 1, 'y in [0,1]');
    assert.ok(f.size >= 0.010 && f.size <= 0.028, `size ${f.size} in [0.010,0.028]`);
    assert.ok(f.speed >= 0.03 && f.speed <= 0.09, `speed ${f.speed} in [0.03,0.09]`);
  }
  // A flake falls at its own speed: 1 s at wind 0 moves it down by
  // speed, and only by the sway sideways (swayAmp <= 0.03/s). Pin the
  // test flakes mid-frame first, so neither respawns mid-step.
  flakes[0].y = 0.3; flakes[0].x = 0.5;
  const f0 = { ...flakes[0] };
  L.stepSnow(flakes, 250, 1, 0, 0, rng);
  assert.ok(Math.abs(flakes[0].y - (f0.y + f0.speed)) < 1e-9, 'falls at its speed');
  assert.ok(Math.abs(flakes[0].x - f0.x) <= 0.031, 'sway only, no wind drift');
  // Wind pushes sideways: 1 s at wind 1 adds 0.08 to x, on top of sway.
  flakes[1].y = 0.3; flakes[1].x = 0.5;
  const f1 = { ...flakes[1] };
  L.stepSnow(flakes, 250, 1, 1, 0, rng);
  assert.ok(flakes[1].x - f1.x >= 0.08 - 0.031, 'wind drifts flakes right');
  // A flake below the frame respawns at the top; an inactive flake
  // (index >= active) does not move at all.
  flakes[0].y = 1.05; flakes[0].x = 0.5;
  L.stepSnow(flakes, 250, 1 / 60, 0, 0, rng);
  assert.ok(flakes[0].y < 0, 'fallen flake respawns above the frame');
  assert.ok(flakes[0].x >= 0 && flakes[0].x <= 1, 'respawn x in frame');
  const frozen = { ...flakes[249] };
  L.stepSnow(flakes, 10, 1, 1, 0, rng);
  assert.deepEqual({ x: flakes[249].x, y: flakes[249].y }, { x: frozen.x, y: frozen.y }, 'inactive flake is frozen');
});

test('snow: createSim wires flakes only for hakodate; stepSim runs the fall', () => {
  for (const def of L.SCENES) {
    const sim = L.createSim(20261120, def.id);
    assert.equal(sim.snow.length, def.snow ? L.SNOW_COUNT : 0, `${def.id}: flakes`);
  }
  // Snow on: 60 steps at the snow preset move the flakes down.
  const sim = L.createSim(20261120, 'hakodate-goryokaku');
  sim.params = { ...L.MOODS.snow };
  const y0 = sim.snow.map((f) => f.y);
  for (let i = 0; i < 60; i++) L.stepSim(sim);
  const moved = sim.snow.filter((f, i) => f.y > y0[i]).length;
  assert.ok(moved > 200, `most flakes fell after 1s (${moved}/250)`);
  // Snow off (drizzle): the same sim steps without moving any flake.
  const sim2 = L.createSim(20261120, 'hakodate-goryokaku');
  sim2.params = { ...L.MOODS.drizzle };
  const y1 = sim2.snow.map((f) => f.y);
  for (let i = 0; i < 60; i++) L.stepSim(sim2);
  assert.ok(sim2.snow.every((f, i) => f.y === y1[i]), 'drizzle leaves the flakes frozen');
  // And a non-snow scene steps fine with an empty snow array.
  const sim3 = L.createSim(20261120, 'ramen');
  sim3.params = { ...L.MOODS.snow };
  for (let i = 0; i < 60; i++) L.stepSim(sim3);
  assert.equal(sim3.snow.length, 0, 'ramen never grows flakes, even on the snow preset');
});

test('seam fix (2026-11-21): parallax amplitude clamped at 0.12, idle drift returns to centre', () => {
  // A layer-boundary gap opens ~203·px wide (layer2↔backdrop), so an
  // unclamped px leaves a visible blurred band; 0.12 keeps the worst
  // band ≈38 px. The old idle drift rocked the pointer (tx amplitude
  // 0.55, px up to ±0.44), so the tester never saw a true still frame.
  assert.ok(html.includes('Math.min(0.12, px)'), 'syncScene clamps px at 0.12');
  assert.ok(html.includes('Math.min(0.12, py)'), 'syncScene clamps py at 0.12');
  assert.ok(!html.includes('0.55 * Math.sin'), 'idle sine drift is gone');
  assert.ok(html.includes('state.pointer.tx *= 0.97'), 'idle eases tx back to 0');
  assert.ok(html.includes('state.pointer.ty *= 0.97'), 'idle eases ty back to 0');
});
