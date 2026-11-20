// Pure-logic tests for window.RamenLogic (the first <script> block of index.html).
// Loads the block via vm so the tests always run against the shipped code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.ok(Math.abs(spl[0].y - (0.9 - 0.65) / 0.35) < 0.01, 'splash y is (land-0.65)/0.35');
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
