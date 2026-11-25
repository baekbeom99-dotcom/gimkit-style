import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createWorld, ASSIST, foldAngle } from '../js/games/tower2d/world.js';

const Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const NO = { left: false, right: false, down: false };
const DEG = Math.PI / 180;

function sim(w, sec, input = NO, each) {
  for (let i = 0; i < Math.round(sec * 60); i++) { w.step(1 / 60, input); if (each) each(); }
}
// 무중력 빈 공간(받침대에서 멀리)에 O 두 개를 가로로 놓는다. gap = 마주 보는 면 사이 틈(px)
function pair(gap, { angleB = 0, dyB = 0, magicB = null, assist } = {}) {
  const w = createWorld(Matter, { assist });
  w.engine.gravity.y = 0;
  const a = w.place('O', 120, -400);
  const b = w.place('O', 120 + 47 + gap, -400 + dyB, { magic: magicB });
  if (angleB) Matter.Body.setAngle(b.body, angleB);
  return { w, a, b };
}
const gapOf = (a, b) => b.body.bounds.min.x - a.body.bounds.max.x;

test('assist knobs live in one exported constant', () => {
  assert.equal(ASSIST.range, 3);
  assert.equal(ASSIST.force, 0.12);
  assert.equal(ASSIST.angleSnapDeg, 5);
  assert.equal(ASSIST.minOverlap, 0.5);
  assert.ok(ASSIST.slideDamp > 0 && ASSIST.slideDamp < 2);
  assert.ok(ASSIST.angleTorque > 0 && ASSIST.angleTorque < 2);
  const f = foldAngle(Math.PI / 2 + 0.03);
  assert.equal(f.k, 1);
  assert.ok(Math.abs(f.d - 0.03) < 1e-9);
});

test('two bricks 10 px apart do not move toward each other', () => {
  const { w, a, b } = pair(10);
  const ax = a.body.position.x;
  const bx = b.body.position.x;
  sim(w, 3);
  assert.ok(Math.abs(a.body.position.x - ax) < 0.01 && Math.abs(b.body.position.x - bx) < 0.01);
  assert.equal(w.assistStats.pulls, 0);
});

test('aligned bricks ~2 px apart close the gap, then rest, with a small speed', () => {
  const { w, a, b } = pair(2);
  let maxV = 0;
  sim(w, 3, NO, () => { maxV = Math.max(maxV, a.body.speed * 60, b.body.speed * 60); });
  const g = gapOf(a, b);
  assert.ok(g < 0.3 && g > -0.6, 'gap ' + g);
  assert.ok(a.body.speed < 0.05 && b.body.speed < 0.05, 'at rest');
  assert.ok(maxV < ASSIST.maxApproach + 5, 'max speed px/s ' + maxV);
  assert.ok(Math.abs(a.body.angle) < 1e-3 && Math.abs(b.body.angle) < 1e-3);
  // without the assist nothing happens
  const off = pair(2, { assist: { enabled: false } });
  sim(off.w, 3);
  assert.ok(Math.abs(gapOf(off.a, off.b) - 2) < 0.05);
});

test('misaligned pairs are not pulled: angle > 5° or face overlap < 50%', () => {
  // rotated 8°: its corners reach 3 px further out, so gap 5 leaves ~2 px of real space
  const tilted = pair(5, { angleB: 8 * DEG });
  const g0 = gapOf(tilted.a, tilted.b);
  sim(tilted.w, 2);
  assert.ok(Math.abs(gapOf(tilted.a, tilted.b) - g0) < 0.05, 'tilted pulled');
  assert.ok(Math.abs(tilted.b.body.angle - 8 * DEG) < 1e-4, 'tilted brick not rotated');
  // shifted 30 px down: shared face 17 of 47 px (36%)
  const shifted = pair(2, { dyB: 30 });
  sim(shifted.w, 2);
  assert.ok(Math.abs(gapOf(shifted.a, shifted.b) - 2) < 0.05, 'shifted pulled');
  assert.equal(shifted.w.assistInfo(shifted.a).length, 0);
  // shifted 18 px: 29 of 47 px (62%) -> pulled
  const ok = pair(2, { dyB: 18 });
  sim(ok.w, 2);
  assert.ok(gapOf(ok.a, ok.b) < 0.5, 'overlapping pair should close');
});

test('ice bricks are never assisted (and nothing is pulled toward them)', () => {
  const { w, a, b } = pair(2, { magicB: { kind: 'dark', effect: 'ice' } });
  assert.equal(b.tint, 'ice');
  sim(w, 2);
  assert.ok(Math.abs(gapOf(a, b) - 2) < 0.05);
  assert.equal(w.assistStats.pulls, 0);
});

test('within 5° the angle is nudged gently toward the neighbour face; speed stays tiny', () => {
  const { w, a, b } = pair(2.5, { angleB: 3 * DEG }); // ~1.3 px real gap at the corner
  let maxW = 0;
  sim(w, 3, NO, () => { maxW = Math.max(maxW, Math.abs(a.body.angularVelocity), Math.abs(b.body.angularVelocity)); });
  const diff = Math.abs(foldAngle(b.body.angle - a.body.angle).d);
  assert.ok(diff < 3 * DEG * 0.6, 'diff deg ' + diff / DEG);
  // includes the spin from the corner touching first; the assist itself adds at most maxAngSpeed
  assert.ok(maxW * 60 < 0.6, 'ang speed ' + maxW * 60);
});

test('the controlled brick is not assisted before it touches anything', () => {
  const w = createWorld(Matter);
  w.engine.gravity.y = 0;
  const n = w.place('O', 200, -400);
  const c = w.spawn('O', null, { x: 200 - 49, y: -400 }); // 2 px left of n
  w.setFallSpeed(0.0001);
  const x0 = c.body.position.x;
  sim(w, 1);
  assert.equal(c.state, 'controlled');
  assert.ok(Math.abs(c.body.position.x - x0) < 0.01, 'controlled moved ' + (c.body.position.x - x0));
  assert.ok(Math.abs(n.body.position.x - 200) < 0.6);
});

test('the assist cannot lift a brick: a brick hanging 2 px under another is not pulled up', () => {
  const w = createWorld(Matter);
  w.engine.gravity.y = 0;
  const top = w.place('O', 180, -400);
  const under = w.place('O', 180, -400 + 49);
  let minUnderY = Infinity;
  sim(w, 2, NO, () => { minUnderY = Math.min(minUnderY, under.body.position.y); });
  // the lower brick never rises (only the upper one is pulled down onto it and nudges it)
  assert.ok(minUnderY >= -351 - 0.01, 'under rose ' + minUnderY);
  assert.ok(top.body.position.y > -400 + 1, 'top pulled down');
});

test('stacks stay stable with the assist: speeds sane, bricks fall asleep', () => {
  const w = createWorld(Matter);
  const xs = [180 - 48.5, 180, 180 + 48.5];
  const bs = [];
  for (const x of xs) bs.push(w.place('O', x, -23.5));
  for (const x of xs) bs.push(w.place('O', x, -70.6));
  for (let i = 0; i < 4; i++) bs.push(w.place('O', 180, -118 - i * 47.2));
  let maxV = 0;
  sim(w, 8, NO, () => { for (const b of bs) maxV = Math.max(maxV, b.body.speed * 60); });
  assert.equal(w.bricks.length, 10);
  assert.ok(maxV < 200, 'max speed ' + maxV);
  for (const b of bs) assert.equal(b.state, 'settled');
  assert.ok(bs.every((b) => b.body.isSleeping || b.body.speed < 0.05), 'resting');
  assert.ok(w.assistStats.pulls > 0, 'assist was active');
});
