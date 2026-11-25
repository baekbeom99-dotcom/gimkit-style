import test from 'node:test';
import assert from 'node:assert/strict';
import stack3d from '../js/games/stack3d/index.js';
import { createEnergy } from '../js/core/energy.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeCtx(hearts0 = 3, energy0 = 10) {
  const g2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
  const calls = { end: [], opts: [], quiz: 0, sfx: [] };
  const subs = new Set();
  const energy = createEnergy(20);
  energy.add(energy0);
  const ctx = {
    g2d, width: 360, height: 640, rng: seeded(7),
    input: { held: {}, on: (n, fn) => { if (n === 'jump') subs.add(fn); return () => subs.delete(fn); } },
    energy,
    hearts: { value: hearts0, lose() { this.value = Math.max(0, this.value - 1); return this.value; }, add(n) { this.value += n; return this.value; } },
    requestQuiz: async () => { calls.quiz++; await null; energy.add(10); },
    endGame: (s, o) => { calls.end.push(s); calls.opts.push(o); return { best: s, isNewRecord: false }; },
    hud: { setScore() {} },
    sfx: { play: (n, a) => calls.sfx.push([n, a]) },
  };
  return { ctx, calls, press: () => subs.forEach((f) => f()) };
}

const step = (game, sec) => { for (let t = 0; t < sec; t += 1 / 120) game.update(1 / 120); };
// 퍼펙트 정렬이 될 때까지(오프셋이 -2..2) 진행
function untilAligned(game) {
  for (let i = 0; i < 20000; i++) {
    if (game.debug.state === 'moving' && game.debug.mt > 0.2 && Math.abs(game.debug.offset) < 1.2) return;
    game.update(1 / 240);
  }
  throw new Error('never aligned');
}

// 블록이 스택에서 크게 벗어났을 때(|오프셋| > 블록 크기)까지 진행 → 이때 누르면 확실한 MISS
function untilFar(game) {
  for (let i = 0; i < 20000; i++) {
    if (game.debug.state === 'moving' && game.debug.mt > 0.2 && Math.abs(game.debug.offset) > 205) return;
    game.update(1 / 240);
  }
  throw new Error('never far');
}

test('placing spends 1 energy; perfect snaps, counts a floor and climbs the note scale', () => {
  const { ctx, calls, press } = fakeCtx();
  const game = stack3d.create(ctx);
  game.start();
  untilAligned(game);
  press();
  assert.equal(ctx.energy.value, 9);
  assert.equal(game.debug.floors, 1);
  assert.equal(game.debug.combo, 1);
  assert.deepEqual(calls.sfx.at(-1), ['note', 0]);
  step(game, 0.5);
  untilAligned(game);
  press();
  assert.equal(game.debug.floors, 2);
  assert.deepEqual(calls.sfx.at(-1), ['note', 1]);
  assert.equal(ctx.energy.value, 8);
  game.render();
});

test('a miss costs a heart, retries the same layer at the same size, and spends energy', () => {
  const { ctx, calls, press } = fakeCtx(3);
  const game = stack3d.create(ctx);
  game.start();
  step(game, 0.125); // block is still ~202 units off the stack (amplitude 220, block 200): no overlap
  press();
  assert.equal(ctx.hearts.value, 2);
  assert.equal(ctx.energy.value, 9);
  assert.equal(game.debug.floors, 0);
  assert.deepEqual(calls.sfx.at(-1), ['hit', undefined]);
  assert.equal(game.debug.debrisCount, 1);
  step(game, 1.2);
  assert.equal(game.debug.state, 'moving');
  assert.equal(game.debug.layer, 1);
  assert.equal(game.debug.moving.w, 200);
  assert.equal(game.debug.moving.d, 200);
  assert.equal(calls.end.length, 0);
});

test('hearts reaching 0 ends the game exactly once with the floor count', () => {
  const { ctx, calls, press } = fakeCtx(1);
  const game = stack3d.create(ctx);
  game.start();
  untilAligned(game); press(); step(game, 0.5);
  assert.equal(game.debug.floors, 1);
  while (game.debug.state !== 'moving') game.update(1 / 120);
  untilFar(game);
  press(); // miss at the far edge (|offset| > block size 200)
  assert.equal(ctx.hearts.value, 0);
  press(); press();
  step(game, 5);
  press();
  step(game, 5);
  assert.equal(calls.end.length, 1);
  assert.equal(calls.end[0], 1);
  assert.equal(calls.opts[0].review, true);
  assert.equal(calls.opts[0].unit, '층');
  assert.ok(calls.opts[0].buttonsDelayMs > 0);
});

test('energy 0 after a placement opens the quiz only once it settled, before the next block moves', async () => {
  const { ctx, calls, press } = fakeCtx(3, 1);
  const game = stack3d.create(ctx);
  game.start();
  untilAligned(game);
  press();
  assert.equal(ctx.energy.value, 0);
  assert.equal(game.debug.floors, 1);
  assert.equal(calls.quiz, 0); // not yet: the block is still settling
  assert.notEqual(game.debug.state, 'moving');
  step(game, 0.5);
  assert.equal(calls.quiz, 1);
  assert.equal(game.debug.state, 'quiz');
  const mt = game.debug.mt;
  game.update(1 / 60); game.update(1 / 60);
  assert.equal(game.debug.mt, mt); // block does not move during the quiz
  press(); // taps during the quiz are ignored
  assert.equal(ctx.energy.value, 0);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(game.debug.state, 'moving');
  assert.equal(game.debug.mt, 0);
  assert.equal(ctx.energy.value, 10);
});

test('a tap with 0 energy never places a block; it triggers the quiz flow', async () => {
  const { ctx, calls, press } = fakeCtx(3, 10);
  const game = stack3d.create(ctx);
  game.start();
  step(game, 0.3);
  ctx.energy.spend(10);
  press();
  assert.equal(game.debug.floors, 0);
  assert.equal(ctx.hearts.value, 3);
  step(game, 0.1);
  assert.equal(calls.quiz, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(game.debug.state, 'moving');
  assert.equal(game.debug.floors, 0);
});

test('destroy unsubscribes taps; render works for a tall tower', () => {
  const { ctx, press } = fakeCtx(3, 20);
  const game = stack3d.create(ctx);
  game.start();
  for (let i = 0; i < 6; i++) { untilAligned(game); press(); step(game, 0.4); }
  assert.equal(game.debug.floors, 6);
  assert.equal(game.debug.combo, 6);
  game.render();
  game.destroy();
  press();
  assert.equal(game.debug.floors, 6);
});

test('every successful placement sparkles (perfect stronger), a miss does not; effect ends', () => {
  const { ctx, press } = fakeCtx(3, 20);
  const game = stack3d.create(ctx);
  game.start();
  untilAligned(game); press();
  let sp = game.debug.sparkles;
  assert.equal(sp.length, 1); assert.equal(sp[0].perfect, true); assert.equal(sp[0].layer, 1);
  step(game, 1.2);
  assert.equal(game.debug.sparkles.length, 0);
  // cut placement: sparkle, not perfect
  while (game.debug.state !== 'moving') game.update(1 / 120);
  for (let i = 0; i < 20000 && !(game.debug.mt > 0.2 && Math.abs(Math.abs(game.debug.offset) - 40) < 1.5); i++) game.update(1 / 240);
  press();
  sp = game.debug.sparkles;
  assert.equal(game.debug.combo, 0); assert.equal(sp.length, 1); assert.equal(sp[0].perfect, false);
  game.render(); step(game, 0.2); game.render();
  step(game, 1.2);
  // miss: no sparkle
  for (let i = 0; i < 20000 && !(game.debug.mt > 0.15 && Math.abs(game.debug.offset) > (game.debug.axis === "x" ? game.debug.prev.w : game.debug.prev.d) + 1); i++) game.update(1 / 240);
  press();
  assert.equal(ctx.hearts.value, 2);
  assert.equal(game.debug.sparkles.length, 0);
});

test('review: zoom reaches progress 1 with fitView k, taps do nothing afterwards', () => {
  const { ctx, calls, press } = fakeCtx(1, 20);
  const game = stack3d.create(ctx);
  game.start();
  for (let i = 0; i < 4; i++) { untilAligned(game); press(); step(game, 0.4); }
  for (let i = 0; i < 20000 && !(game.debug.mt > 0.15 && Math.abs(game.debug.offset) > (game.debug.axis === 'x' ? game.debug.prev.w : game.debug.prev.d) + 1); i++) game.update(1 / 240);
  press();
  assert.equal(game.debug.floors, 4);
  step(game, 1.2);
  assert.equal(game.debug.state, 'review');
  assert.equal(calls.end.length, 1);
  assert.equal(game.debug.review.p < 1, true);
  game.render();
  step(game, 2);
  const r = game.debug.review;
  assert.equal(r.p, 1);
  assert.ok(Math.abs(r.k - r.targetK) < 1e-9);
  assert.ok(r.targetK < 0.57 + 1e-9);
  game.render();
  const e = ctx.energy.value, fl = game.debug.floors;
  press(); step(game, 1);
  assert.equal(ctx.energy.value, e); assert.equal(game.debug.floors, fl); assert.equal(calls.end.length, 1);
});
