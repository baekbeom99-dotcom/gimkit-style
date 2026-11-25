import test from 'node:test';
import assert from 'node:assert/strict';
import stairs from '../js/games/stairs/index.js';
import { createEnergy } from '../js/core/energy.js';
import {
  STAIRS_THEMES, stairsThemeAt, drawStairsBackground, drawStairBlock, drawClimber, drawTapHint,
} from '../js/games/stairs/render.js';

function makeProxyG2d() {
  let depth = 0;
  const g = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'save') return () => { depth++; };
      if (k === 'restore') return () => { depth--; };
      return () => {};
    },
    set: () => true,
  });
  return { g, getDepth: () => depth };
}

test('STAIRS_THEMES and stairsThemeAt stay continuous across altitudes', () => {
  assert.deepEqual(STAIRS_THEMES.map((t) => t.startFloor), [0, 30, 70, 120]);
  assert.equal(stairsThemeAt(0).name, '낮');
  assert.equal(stairsThemeAt(45).name, '노을');
  assert.equal(stairsThemeAt(90).name, '밤하늘');
  assert.equal(stairsThemeAt(140).name, '우주');

  let prev = stairsThemeAt(0);
  for (let f = 0.25; f <= 160; f += 0.25) {
    const cur = stairsThemeAt(f);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(cur.wallA[i] - prev.wallA[i]) < 8);
    prev = cur;
  }
});

test('stairs render helpers run cleanly and balance save/restore on Proxy mock', () => {
  const { g, getDepth } = makeProxyG2d();
  for (const floor of [0, 35, 80, 130]) {
    drawStairsBackground(g, 360, 640, floor * 12, -floor * 30, floor, 1.2);
  }
  drawStairBlock(g, 0, 180, 400, 56, 16, true, 0);
  drawStairBlock(g, 10, 220, 370, 56, 16, false, 0.2);
  drawClimber(g, { x: 180, y: 400, facing: 1, sq: 1, scx: 1, air: 0, time: 0.5 });
  drawClimber(g, { x: 180, y: 370, facing: -1, sq: 1.1, scx: 0.92, air: 0.8, time: 0.7, wrong: true, fast: true });
  drawTapHint(g, 180, 400, 'R', 0.4);
  assert.equal(getDepth(), 0);
});

test('stairs game module steps, handles wrong tap, and renders cleanly on Proxy mock', () => {
  const { g, getDepth } = makeProxyG2d();
  const subs = new Map();
  const game = stairs.create({
    g2d: g,
    width: 360,
    height: 640,
    rng: () => 0.25,
    energy: createEnergy(20),
    hearts: { value: 3, lose() { return 2; } },
    input: { on: (k, fn) => { subs.set(k, fn); return () => subs.delete(k); } },
    hud: { setScore() {} },
    sfx: { play() {} },
    requestQuiz: async () => true,
    endGame() {},
  });
  game.start();
  const ctxEnergy = game.debug.st;
  const firstDir = ctxEnergy.expected();
  subs.get(firstDir === 'L' ? 'left' : 'right')();
  subs.get(firstDir === 'L' ? 'right' : 'left')(); // trigger wrong tap flash/particles
  for (let i = 0; i < 10; i++) game.update(1 / 60);
  game.render();
  game.destroy();
  assert.equal(getDepth(), 0);
});
