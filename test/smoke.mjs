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

test('structure: every manifest asset exists and is referenced by index.html', () => {
  for (const info of Object.values(manifest.layers)) {
    assert.ok(existsSync(path.join(root, 'assets', info.file)), `missing ${info.file}`);
    assert.ok(html.includes(info.file), `index.html does not reference ${info.file}`);
  }
  for (const info of Object.values(manifest.masks)) {
    assert.ok(existsSync(path.join(root, 'assets', info.file)), `missing ${info.file}`);
    assert.ok(html.includes(info.file), `index.html does not reference ${info.file}`);
  }
  for (const f of ['assets/source-art.png', 'assets/depth.png', 'assets/layers/layer2-static.png']) {
    assert.ok(existsSync(path.join(root, f)), `missing ${f}`);
    assert.ok(html.includes(f), `index.html does not reference ${f}`);
  }
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
