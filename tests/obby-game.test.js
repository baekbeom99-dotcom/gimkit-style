// 못깨는 타워 game module with a fake ctx (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import obby from '../js/games/obby/index.js';
import { createEnergy } from '../js/core/energy.js';
import { BEST_TIME_KEY } from '../js/games/obby/attempt.js';
import { FAIL_SEC } from '../js/games/obby/attempt.js';

function seeded(s) {
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeCtx(modeId = 'practice') {
  const g2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
  const calls = { end: [], quiz: 0, quizAtPhase: [], choose: [], sfx: [] };
  const held = { left: false, right: false, jump: false };
  const subs = new Set();
  let game;
  const ctx = {
    g2d, width: 360, height: 700, rng: seeded(5),
    input: { held, on: (n, fn) => { if (n === 'jump') subs.add(fn); return () => subs.delete(fn); } },
    energy: createEnergy(15),
    hearts: { value: 3, lose() { return 3; }, add() { return 3; } },
    choose: async (o) => { calls.choose.push(o); return modeId; },
    requestQuiz: async () => {
      calls.quiz++;
      calls.quizAtPhase.push(game && game.debug.att && game.debug.att.phase);
      ctx.energy.add(15);
      return true;
    },
    endGame: (s, o) => { calls.end.push([s, o]); return { best: s, isNewRecord: true }; },
    hud: { setScore() {} }, sfx: { play: (n) => calls.sfx.push(n) },
  };
  return { ctx, calls, held, press: () => subs.forEach((f) => f()), setGame: (gm) => { game = gm; } };
}

async function started(modeId = 'practice') {
  const f = fakeCtx(modeId);
  const game = obby.create(f.ctx);
  f.setGame(game);
  game.start();
  await tick();
  return { ...f, game };
}

function fallOut(game) {
  const p = game.debug.player;
  p.onGround = false; p.ground = null; p.vy = -50; p.y = game.debug.camY - 200;
  game.update(1 / 60);
}
function runFailBeat(game) {
  for (let t = 0; t < FAIL_SEC + 0.1; t += 1 / 30) game.update(1 / 30);
}

test('module flags', () => {
  assert.equal(obby.id, 'obby');
  assert.equal(obby.title, '3학년은 못깨는 타워');
  assert.equal(obby.controls, 'jump');
  assert.equal(obby.fullscreen, true);
  assert.equal(obby.hideHearts, true);
  assert.equal(obby.energyMax, 15);
});

test('start: asks for the mode with ctx.choose, the first attempt costs no energy', async () => {
  const { ctx, calls, game } = await started('practice');
  assert.equal(calls.choose.length, 1);
  assert.deepEqual(calls.choose[0].options.map((o) => o.id), ['practice', 'hard']);
  assert.equal(game.debug.mode, 'practice');
  assert.equal(game.debug.kind, 'none');
  assert.equal(game.debug.tower.sections.length, 8);
  assert.equal(game.debug.att.phase, 'playing');
  assert.equal(game.debug.att.attempts, 1);
  assert.equal(ctx.energy.value, 15);
  game.render();
});

test('each jump (ground and air) costs 1 energy, like the jump map', async () => {
  const { ctx, game, press } = await started();
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  press(); game.update(1 / 60);
  assert.equal(ctx.energy.value, 14);
  press(); game.update(1 / 60);
  assert.equal(ctx.energy.value, 13);
  for (let i = 0; i < 30; i++) game.update(1 / 60);
  assert.equal(game.debug.att.phase, 'playing');
});

test('a fall costs 1 energy; at 0 energy the quiz opens before the next attempt', async () => {
  const { ctx, calls, game } = await started('hard');
  assert.equal(game.debug.mode, 'hard');
  assert.notEqual(game.debug.kind, 'none');
  const tower = game.debug.tower;
  ctx.energy.spend(13); // 2 left
  for (let a = 1; a <= 2; a++) {
    assert.equal(game.debug.att.attempts, a);
    for (let i = 0; i < 10; i++) game.update(1 / 60);
    fallOut(game);
    assert.equal(game.debug.att.phase, 'failed');
    assert.equal(ctx.energy.value, 2 - a);
    assert.match(game.debug.banner.text, /^이번 도전 \d구간 · 최고 \d구간$/);
    if (a < 2) { runFailBeat(game); assert.equal(calls.quiz, 0); }
  }
  assert.equal(calls.quiz, 0);
  runFailBeat(game);
  await tick();
  assert.equal(calls.quiz, 1);
  assert.deepEqual(calls.quizAtPhase, ['needsQuiz']);
  assert.equal(game.debug.att.attempts, 3);
  assert.equal(game.debug.att.phase, 'playing');
  assert.equal(ctx.energy.value, 15);
  assert.equal(game.debug.tower, tower); // same tower for every attempt of the run
});

test('energy 0 on the ground: a jump press opens the quiz mid-attempt and play resumes', async () => {
  const { ctx, calls, game, press } = await started();
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  ctx.energy.spend(15);
  press(); game.update(1 / 60);
  await tick();
  assert.equal(calls.quiz, 1);
  assert.equal(game.debug.att.phase, 'playing');
  assert.ok(ctx.energy.value > 0);
});

test('a spike hit ends the attempt (no hearts involved)', async () => {
  const { ctx, game } = await started('practice');
  const sp = game.debug.platforms.find((p) => p.type === 'spike' && !p.hz);
  const pl = game.debug.player;
  pl.onGround = false; pl.ground = null; pl.x = sp.x + sp.w / 2; pl.y = sp.y + 4; pl.vy = 0;
  game.update(1 / 60);
  assert.equal(game.debug.att.phase, 'failed');
  assert.equal(game.debug.att.failReason, 'spike');
  assert.equal(ctx.hearts.value, 3);
});

test('every new hazard kind ends the attempt with its own fail reason, text and sound', async () => {
  const cases = [
    ['lava', { w: 60, h: 14, hz: 'lava' }, /용암/, 'wrong'],
    ['laser', { w: 60, h: 8, hz: 'laser', period: 100, on: 99, phase: 0 }, /레이저/, 'wrong'],
    ['saw', { w: 30, h: 30, hz: 'saw', axis: 'x', range: 0.01, speed: 1, phase: 0 }, /톱날/, 'hit'],
    ['crusher', { w: 60, h: 34, hz: 'crusher', rise: 1, period: 3, phase: 0 }, /쇠뭉치/, 'hit'],
  ];
  for (const [reason, def, text, sound] of cases) {
    const { calls, game } = await started('practice');
    const pl = game.debug.player;
    const hz = { type: 'spike', x: pl.x - 20, y: pl.y, baseX: pl.x - 20, baseY: pl.y, ...def };
    game.debug.platforms.push(hz);
    game.update(1 / 60);
    assert.equal(game.debug.att.phase, 'failed', reason);
    assert.equal(game.debug.att.failReason, reason);
    assert.match(game.debug.banner.sub, text);
    assert.equal(calls.sfx.filter((n) => n === 'wrong' || n === 'hit').pop(), sound, reason);
  }
});

test('a laser that is off does not hurt, then fires on the world clock (simT) and hits', async () => {
  const { game } = await started('practice');
  const pl = game.debug.player;
  // on for the first 0.5 s of every 2 s with phase 1.0 -> off during t in [0, 1.0), on during [1.0, 1.5)
  game.debug.platforms.push({ type: 'spike', hz: 'laser', x: pl.x - 20, y: pl.y, w: 60, h: 8, period: 2, on: 0.5, phase: 1.0 });
  for (let i = 0; i < 50; i++) game.update(1 / 60);          // 0.83 s: still off
  assert.equal(game.debug.att.phase, 'playing');
  for (let i = 0; i < 20; i++) game.update(1 / 60);          // 1.17 s: on -> hit
  assert.equal(game.debug.att.phase, 'failed');
  assert.equal(game.debug.att.failReason, 'laser');
});

test('recordScore is called with meters at each attempt end', async () => {
  store.clear();
  const { game } = await started('hard');
  game.debug.advance(2);       // stand on the rest on top of section 2
  game.update(1 / 60);
  const y = game.debug.player.y;
  fallOut(game);
  assert.equal(store.get('gimkit-energy:best:obby'), String(Math.floor(y / 40)));
});

test('practice checkpoint: reached by height, respawn there on the next attempt', async () => {
  const { calls, game } = await started('practice');
  const cp = game.debug.tower.checkpoints[0];
  game.debug.advance(cp.section);
  game.update(1 / 60);
  assert.equal(game.debug.att.checkpoint, 0);
  assert.equal(game.debug.banner.text, '🚩 체크포인트!');
  assert.ok(calls.sfx.includes('correct'));
  fallOut(game);
  runFailBeat(game);
  assert.equal(game.debug.att.phase, 'playing');
  assert.equal(game.debug.player.y, cp.y);
  assert.equal(game.debug.player.ground, game.debug.platforms[cp.platformIndex]);
  assert.ok(game.debug.platforms[cp.platformIndex].reached);
});

test('hard mode has no checkpoints: respawn at the bottom', async () => {
  const { game } = await started('hard');
  game.debug.advance(4);
  game.update(1 / 60);
  fallOut(game);
  runFailBeat(game);
  assert.equal(game.debug.player.y, 0);
});

test('clear: endGame once with the review opts, best time stored', async () => {
  store.clear();
  const { calls, game } = await started('hard');
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  game.debug.forceClear();
  game.update(1 / 60);
  assert.equal(game.debug.att.phase, 'cleared');
  for (let i = 0; i < 120; i++) game.update(1 / 60);
  assert.equal(calls.end.length, 1);
  const [score, o] = calls.end[0];
  assert.equal(score, Math.floor(game.debug.tower.height / 40));
  assert.equal(o.review, true);
  assert.equal(o.heading, '🎉 클리어!');
  assert.equal(o.label, '도달 높이');
  assert.equal(o.unit, 'm');
  assert.equal(o.buttonsDelayMs, 1200);
  assert.match(o.lines[0], /^걸린 시간 \d\d:\d\d · 도전 1번$/);
  assert.equal(o.lines[1], '🏆 최단 기록!');
  assert.ok(Number(store.get(BEST_TIME_KEY)) >= 1);
  game.render();
});

test('water mutator: rising water ends the attempt; reset on the next attempt', async () => {
  const { game } = await started('hard');
  game.debug.setMutator('water');
  assert.equal(game.debug.kind, 'water');
  assert.equal(game.debug.info.text, '🌊 물이 차올라요!');
  for (let t = 0; t < 30 && game.debug.att.phase === 'playing'; t += 1 / 30) game.update(1 / 30);
  assert.equal(game.debug.att.failReason, 'water');
  runFailBeat(game);
  assert.equal(game.debug.rt.waterY(0) < -250, true);
});

test('wind / shake: standing still on a rest platform is safe (shelter)', async () => {
  for (const k of ['wind', 'shake']) {
    const { game } = await started('hard');
    game.debug.setMutator(k);
    const x0 = game.debug.player.x;
    for (let i = 0; i < 600; i++) game.update(1 / 60);
    assert.equal(game.debug.att.phase, 'playing', k);
    assert.equal(game.debug.player.x, x0, k);
  }
});

test('every mutator runs and renders without errors', async () => {
  for (const k of ['water', 'shake', 'lowgravity', 'jumppower', 'crumbleAll', 'wind']) {
    const { game, held, press } = await started('hard');
    game.debug.setMutator(k);
    held.right = true;
    for (let i = 0; i < 120; i++) { if (i % 20 === 0) press(); game.update(1 / 60); game.render(); }
    held.right = false;
    if (k === 'crumbleAll') assert.ok(game.debug.platforms.some((p) => p.surface === 'crumble' && !p.rest));
  }
});

test('missing ctx.choose falls back to practice; destroy is safe', async () => {
  const f = fakeCtx();
  delete f.ctx.choose;
  const game = obby.create(f.ctx);
  game.start();
  game.render(); // before setup
  await tick();
  assert.equal(game.debug.mode, 'practice');
  game.destroy();
  game.update(1 / 60);
});

test('crumble platforms respawn 5 seconds after disappearing', async () => {
  const { game } = await started('hard');
  game.debug.setMutator('crumbleAll');
  const cr = game.debug.platforms.find((p) => p.surface === 'crumble' && !p.rest);
  assert.ok(cr, 'has a crumble platform');
  // simulate the platform crumbling
  cr.gone = true;
  cr.crumbleT = 0.5;
  cr.respawnT = 0;
  // keep player safely standing on ground rest platform
  for (let i = 0; i < 60 * 4; i++) game.update(1 / 60);
  assert.equal(cr.gone, true, 'still gone before 5s');
  game.render(); // ghost outline renders cleanly while gone
  for (let i = 0; i < 70; i++) game.update(1 / 60); // > 5s total
  assert.equal(cr.gone, false, 'respawned after 5s');
  assert.equal(cr.crumbleT, 0);
  assert.equal(cr.respawnT, 0);
});
