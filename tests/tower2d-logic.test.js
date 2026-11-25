import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPES, SHAPE_KEYS, rotateCells, cellsSize, cellOffsets, createBag, createMagicSchedule,
  stageLinePx, stageLineM, towerHeightPx, pxToM, fallSpeed, isLost, settleStep, approach,
  LIGHT_EFFECTS, DARK_EFFECTS, EFFECT_LABEL, MAGIC_INFO, INFO_SEC, splitInfo, infoAlpha,
} from '../js/games/tower2d/logic.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('7 tetromino shapes with 4 cells each', () => {
  assert.deepEqual(SHAPE_KEYS, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  for (const k of SHAPE_KEYS) {
    assert.equal(SHAPES[k].length, 4, k);
    assert.equal(new Set(SHAPES[k].map((c) => c.join(','))).size, 4, k);
  }
});

test('rotateCells: clockwise, normalized, 4 turns = identity', () => {
  assert.deepEqual(cellsSize(SHAPES.I), { w: 4, h: 1 });
  assert.deepEqual(cellsSize(rotateCells(SHAPES.I, 1)), { w: 1, h: 4 });
  // T (nub up, flat bottom) -> clockwise: vertical bar with nub on the right
  const t1 = rotateCells(SHAPES.T, 1).map((c) => c.join(',')).sort();
  assert.deepEqual(t1, ['0,0', '0,1', '0,2', '1,1']);
  for (const k of SHAPE_KEYS) {
    const a = rotateCells(SHAPES[k], 4).map((c) => c.join(',')).sort();
    const b = rotateCells(SHAPES[k], 0).map((c) => c.join(',')).sort();
    assert.deepEqual(a, b, k);
  }
  assert.deepEqual(rotateCells(SHAPES.O, 1).map((c) => c.join(',')).sort(), ['0,0', '0,1', '1,0', '1,1']);
});

test('cellOffsets are centred on the centroid', () => {
  for (const k of SHAPE_KEYS) {
    const o = cellOffsets(SHAPES[k], 24);
    const sx = o.reduce((s, [x]) => s + x, 0);
    const sy = o.reduce((s, [, y]) => s + y, 0);
    assert.ok(Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9, k);
  }
});

test('bag: every 7 draws is a permutation; never 3 in a row; peek matches next', () => {
  for (let seed = 1; seed < 30; seed++) {
    const bag = createBag(seeded(seed));
    const seq = [];
    for (let i = 0; i < 700; i++) {
      const p = bag.peek(2);
      const n = bag.next();
      assert.equal(n, p[0]);
      seq.push(n);
    }
    for (let i = 0; i < 700; i += 7) assert.equal(new Set(seq.slice(i, i + 7)).size, 7);
    for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]));
  }
});

test('magic schedule: light every 4-6, no dark before stage 3, dark spacing 7-9 after', () => {
  for (let seed = 1; seed < 20; seed++) {
    const m = createMagicSchedule(seeded(seed));
    let lastLight = 0;
    for (let i = 1; i <= 60; i++) {
      const r = m.next(1);
      assert.ok(!r || r.kind === 'light');
      if (r) {
        assert.ok(LIGHT_EFFECTS.includes(r.effect));
        const gap = i - lastLight;
        assert.ok(gap >= 4 && gap <= 6, 'light gap ' + gap);
        lastLight = i;
      }
    }
    const darks = [];
    let lights = 0;
    for (let i = 1; i <= 200; i++) {
      const r = m.next(3);
      if (r && r.kind === 'dark') { darks.push(i); assert.ok(DARK_EFFECTS.includes(r.effect)); }
      if (r && r.kind === 'light') lights++;
    }
    assert.ok(darks.length >= 18, 'darks ' + darks.length);
    for (let i = 1; i < darks.length; i++) {
      const gap = darks[i] - darks[i - 1];
      assert.ok(gap >= 7 && gap <= 10, 'dark gap ' + gap); // +1 when it collided with a forced light
    }
    assert.ok(lights >= 25);
  }
});

test('magic schedule: guaranteed light after a stage clear', () => {
  const m = createMagicSchedule(seeded(5));
  m.next(1);
  m.guaranteeLight();
  const r = m.next(1);
  assert.equal(r.kind, 'light');
  const m3 = createMagicSchedule(seeded(7));
  for (let i = 0; i < 30; i++) m3.next(3);
  m3.guaranteeLight();
  assert.equal(m3.next(3).kind, 'light');
});

test('stage lines, height and conversion helpers', () => {
  assert.equal(stageLineM(1), 6);
  assert.equal(stageLineM(3), 18);
  assert.equal(stageLinePx(2), 480);
  assert.equal(towerHeightPx([], 0), 0);
  assert.equal(towerHeightPx([{ minY: -48 }, { minY: -120 }, { minY: 10 }], 0), 120);
  assert.equal(towerHeightPx([{ minY: 500 }], 600), 100);
  assert.equal(pxToM(240), 6);
  assert.ok(EFFECT_LABEL.vine.includes('덩굴'));
});

test('fall speed ramps 3%/brick to 110 and x1.1 per stage', () => {
  assert.equal(fallSpeed(0, 1), 55);
  assert.ok(Math.abs(fallSpeed(10, 1) - 71.5) < 1e-9);
  assert.equal(fallSpeed(1000, 1), 110);
  assert.ok(Math.abs(fallSpeed(0, 2) - 60.5) < 1e-9);
  assert.ok(fallSpeed(1000, 20) <= 180);
});

test('lost predicate and settle tracker', () => {
  assert.equal(isLost(139, 0), false);
  assert.equal(isLost(141, 0), true);
  assert.equal(isLost(741, 600), true);
  const st = { age: 0, still: 0 };
  let done = false;
  let n = 0;
  while (!done) { done = settleStep(st, 0.01, 0, 1 / 60); n++; }
  assert.equal(n, 40);
  const st2 = { age: 0, still: 0 };
  let m = 0;
  while (!settleStep(st2, 5, 0, 1 / 60)) m++;
  assert.ok(Math.abs((m + 1) / 60 - 3.5) < 0.02, 'timeout ' + m);
  assert.equal(approach(0, 170, 900, 1 / 60), 15);
  assert.equal(approach(160, 170, 900, 1 / 60), 170);
  assert.equal(approach(-10, 0, 900, 1 / 60), 0);
});

test('every special brick kind (and concrete) has a short explanation text', () => {
  for (const k of [...LIGHT_EFFECTS, ...DARK_EFFECTS, 'concrete']) {
    const t = MAGIC_INFO[k];
    assert.equal(typeof t, 'string', k);
    assert.ok(t.length >= 10 && t.length <= 32, k + ' length ' + t.length);
    const lines = splitInfo(t);
    assert.equal(lines.length, 2, k);
    assert.ok(lines[0].length <= 12 && lines[1].length <= 22, k);
  }
  assert.equal(MAGIC_INFO.heavy, '⚙ 단단 벽돌 — 아주 무겁고 잘 안 밀려요');
  assert.deepEqual(splitInfo('🧊 얼음 벽돌 — 미끄러우니 조심하세요'), ['🧊 얼음 벽돌', '미끄러우니 조심하세요']);
});

test('explanation banner fades in and out over about 2.2 s', () => {
  assert.ok(INFO_SEC >= 2 && INFO_SEC <= 2.5);
  assert.equal(infoAlpha(0), 0);
  assert.ok(infoAlpha(0.1) > 0 && infoAlpha(0.1) < 1);
  assert.equal(infoAlpha(1), 1);
  assert.ok(infoAlpha(INFO_SEC - 0.1) < 0.5);
  assert.equal(infoAlpha(INFO_SEC), 0);
  assert.equal(infoAlpha(-1), 0);
});
