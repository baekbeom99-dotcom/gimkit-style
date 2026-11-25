import test from 'node:test';
import assert from 'node:assert/strict';
import { themeAt, drawBackground, THEMES } from '../js/games/jump/themes.js';

test('THEMES describes four themes by startMeters', () => {
  assert.deepEqual(THEMES.map((t) => t.startMeters), [0, 30, 70, 120]);
});

test('theme names at key heights', () => {
  assert.equal(themeAt(0).name, '맑은 하늘');
  assert.equal(themeAt(45).name, '노을');
  assert.equal(themeAt(90).name, '밤하늘');
  assert.equal(themeAt(150).name, '우주');
});

test('themeAt is continuous', () => {
  let prev = themeAt(0);
  for (let m = 0.05; m <= 200; m += 0.05) {
    const cur = themeAt(m);
    for (const k of ['top', 'bottom']) {
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(cur[k][i] - prev[k][i]) < 6, `${k} jump at ${m}`);
    }
    assert.ok(Math.abs(cur.starAlpha - prev.starAlpha) < 0.05, `star jump at ${m}`);
    prev = cur;
  }
});

test('starAlpha increases with height', () => {
  const a = [0, 45, 90, 150].map((m) => themeAt(m).starAlpha);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1]);
  assert.ok(a[3] > a[2] && a[2] > a[1] && a[1] >= a[0]);
});

test('drawBackground does not throw and balances save/restore', () => {
  let depth = 0;
  const g = new Proxy({}, {
    get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} })
      : k === 'measureText' ? (s) => ({ width: String(s).length * 10 })
      : k === 'save' ? () => { depth++; } : k === 'restore' ? () => { depth--; } : () => {}),
    set: () => true,
  });
  for (const camY of [0, 400, 1200, 2800, 5000, 9000, 20000]) drawBackground(g, 375, 812, camY, camY / 100);
  assert.equal(depth, 0);
});
