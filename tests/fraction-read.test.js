import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFractionRead, fractionDistractors, FRACTION_UNITS } from '../js/data/fraction-read.js';
import { ALLOWED, figureParts } from '../js/ui/fraction-figure.js';
import { loadIndex, loadSet } from '../js/data/question-sets.js';

function seeded(seed = 777) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const PROPER = /^(\d+)분의 (\d+)$/;
const expectedCount = (shape) => ALLOWED[shape].reduce((s, n) => s + n - 1, 0);

test('set shape and unit counts', () => {
  const set = generateFractionRead({ rng: seeded() });
  assert.equal(set.id, 'fraction-read');
  assert.equal(set.title, '분수 읽기');
  assert.equal(set.kind, 'figure');
  assert.deepEqual(set.units, [
    { id: 'circle', title: '원' }, { id: 'square', title: '네모' }, { id: 'triangle', title: '삼각형' },
    { id: 'pentagon', title: '오각형' }, { id: 'hexagon', title: '육각형' }, { id: 'octagon', title: '팔각형' }]);
  for (const u of FRACTION_UNITS) {
    assert.equal(set.items.filter((i) => i.unit === u.id).length, Math.min(80, expectedCount(u.id)), u.id);
  }
});

test('items: answer, figure and ids are consistent', () => {
  const set = generateFractionRead({ rng: seeded(5) });
  const qs = new Set();
  for (const it of set.items) {
    const { shape, n, shaded } = it.figure;
    assert.equal(shape, it.unit);
    assert.ok(ALLOWED[shape].includes(n));
    assert.equal(it.answer, `${n}분의 ${shaded.length}`);
    assert.ok(shaded.length >= 1 && shaded.length <= n - 1);
    assert.equal(new Set(shaded).size, shaded.length);
    for (const i of shaded) assert.ok(Number.isInteger(i) && i >= 0 && i < n);
    assert.equal(figureParts(it.figure).length, n);
    assert.equal(it.prompt, '색칠한 부분은 전체의 얼마일까요?');
    assert.equal(it.q, `${shape}|${n}|${shaded.length}`);
    assert.ok(!qs.has(it.q), 'unique q'); qs.add(it.q);
  }
});

test('distractors are valid, distinct, and never the answer', () => {
  for (const shape of Object.keys(ALLOWED)) for (const n of ALLOWED[shape]) for (let m = 1; m < n; m++) {
    for (const seed of [1, 2, 3]) {
      const d = fractionDistractors(n, m, seeded(seed));
      assert.equal(d.length, 3, `${n}/${m}`);
      assert.equal(new Set(d).size, 3);
      assert.ok(!d.includes(`${n}분의 ${m}`));
      for (const s of d) { const g = s.match(PROPER); assert.ok(g, s); assert.ok(+g[1] >= 2 && +g[2] >= 1, s); }
    }
  }
  assert.ok(fractionDistractors(5, 3, seeded()).length === 3);
});

test('deterministic under a seeded rng, varies with seed', () => {
  const a = generateFractionRead({ rng: seeded(9) });
  const b = generateFractionRead({ rng: seeded(9) });
  assert.deepEqual(a, b);
  const c = generateFractionRead({ rng: seeded(10) });
  assert.notDeepEqual(a.items, c.items);
});

test('non-contiguous shading only on grids and never ambiguous', () => {
  let seen = false;
  for (let s = 1; s < 30; s++) {
    for (const it of generateFractionRead({ units: ['square'], rng: seeded(s) }).items) {
      const sh = it.figure.shaded;
      if (sh[sh.length - 1] - sh[0] !== sh.length - 1) seen = true;
    }
  }
  assert.ok(seen);
});

test('units subset and fallback', () => {
  const sub = generateFractionRead({ units: ['hexagon', 'octagon'], rng: seeded() });
  assert.deepEqual(sub.units.map((u) => u.id), ['hexagon', 'octagon']);
  assert.ok(sub.items.every((i) => ['hexagon', 'octagon'].includes(i.unit)));
  for (const bad of [[], ['nope'], undefined]) {
    assert.equal(generateFractionRead({ units: bad, rng: seeded() }).units.length, 6);
  }
});

test('loadIndex lists fraction-read once, loadSet generates it', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ id: 'fraction-read', title: 'dup' }, { id: 'x', title: 'X' }] });
  try {
    const idx = await loadIndex();
    assert.equal(idx.filter((e) => e.id === 'fraction-read').length, 1);
    assert.deepEqual(idx.find((e) => e.id === 'fraction-read'), { id: 'fraction-read', title: '분수 읽기', subject: '수학', grade: '3' });
    assert.ok(idx.some((e) => e.id === 'x'));
    const set = await loadSet('fraction-read', { units: ['circle'], rng: seeded() });
    assert.equal(set.items.length, 66);
    assert.equal(set.kind, 'figure');
  } finally { globalThis.fetch = realFetch; }
});
