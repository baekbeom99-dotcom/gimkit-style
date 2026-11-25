import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAddSub } from '../js/data/addsub.js';
import { loadIndex, loadSet } from '../js/data/question-sets.js';

const M = '−';
function seeded(seed = 12345) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const parse = (it) => { const m = it.q.match(/^(\d+) ([+−]) (\d+)$/); assert.ok(m, it.q); return [Number(m[1]), m[2], Number(m[3])]; };
const byUnit = (set, u) => set.items.filter((i) => i.unit === u);
const digits = (n) => String(n).length;

test('unit ids and titles', () => {
  const a = generateAddSub('add', { rng: seeded() });
  const s = generateAddSub('sub', { rng: seeded() });
  assert.deepEqual(a.units, [
    { id: 'a11', title: '1자리+1자리' }, { id: 'a21', title: '2자리+1자리' }, { id: 'a22', title: '2자리+2자리' }]);
  assert.deepEqual(s.units, [
    { id: 's11', title: `1자리${M}1자리` }, { id: 's21', title: `2자리${M}1자리` }, { id: 's22', title: `2자리${M}2자리` }]);
  assert.equal(a.subject, '수학'); assert.equal(a.title, '덧셈'); assert.equal(s.title, '뺄셈');
});

test('counts per unit', () => {
  const a = generateAddSub('add', { rng: seeded() });
  const s = generateAddSub('sub', { rng: seeded() });
  assert.equal(byUnit(a, 'a11').length, 81);
  assert.equal(byUnit(a, 'a21').length, 150);
  assert.equal(byUnit(a, 'a22').length, 150);
  assert.equal(byUnit(s, 's11').length, 45);
  assert.equal(byUnit(s, 's21').length, 150);
  assert.equal(byUnit(s, 's22').length, 150);
});

test('answers correct, digit constraints, no negatives, unique q', () => {
  for (let seed = 1; seed <= 5; seed++) {
    for (const id of ['add', 'sub']) {
      const set = generateAddSub(id, { rng: seeded(seed) });
      for (const it of set.items) {
        const [x, op, y] = parse(it);
        assert.equal(op, id === 'add' ? '+' : M);
        const r = op === '+' ? x + y : x - y;
        assert.equal(it.answer, String(r));
        assert.ok(r >= 0);
        const dx = { a11: [1, 1], a21: [2, 1], a22: [2, 2], s11: [1, 1], s21: [2, 1], s22: [2, 2] }[it.unit];
        assert.deepEqual([digits(x), digits(y)], dx, it.q);
        if (it.unit === 's22') assert.ok(x > y);
      }
      for (const u of set.units) {
        const qs = byUnit(set, u.id).map((i) => i.q);
        assert.equal(new Set(qs).size, qs.length);
      }
    }
  }
});

test('carry/borrow mix and >=100 answers', () => {
  const a = generateAddSub('add', { rng: seeded(7) });
  const s = generateAddSub('sub', { rng: seeded(7) });
  for (const u of ['a21', 'a22']) {
    const its = byUnit(a, u).map(parse);
    const carry = its.filter(([x, , y]) => (x % 10) + (y % 10) >= 10).length;
    assert.ok(carry >= 50 && carry <= 100, `${u} carry ${carry}`);
  }
  assert.ok(byUnit(a, 'a22').some((i) => Number(i.answer) >= 100));
  for (const u of ['s21', 's22']) {
    const its = byUnit(s, u).map(parse);
    const borrow = its.filter(([x, , y]) => (x % 10) < (y % 10)).length;
    assert.ok(borrow >= 50 && borrow <= 100, `${u} borrow ${borrow}`);
  }
});

test('distractors: 3 unique non-negative strings != answer', () => {
  for (const id of ['add', 'sub']) {
    const set = generateAddSub(id, { rng: seeded(3) });
    for (const it of set.items) {
      assert.equal(it.distractors.length, 3);
      assert.equal(new Set(it.distractors).size, 3);
      for (const d of it.distractors) {
        assert.equal(typeof d, 'string');
        assert.notEqual(d, it.answer);
        assert.ok(/^\d+$/.test(d) && Number(d) >= 0);
      }
    }
  }
});

test('deterministic with seeded rng; differs across seeds', () => {
  const x = generateAddSub('add', { rng: seeded(9) });
  const y = generateAddSub('add', { rng: seeded(9) });
  const z = generateAddSub('add', { rng: seeded(10) });
  assert.deepEqual(x, y);
  assert.notDeepEqual(x.items, z.items);
});

test('units option filters; unknown/empty falls back to all', () => {
  const one = generateAddSub('sub', { units: ['s21'], rng: seeded() });
  assert.deepEqual(one.units.map((u) => u.id), ['s21']);
  assert.ok(one.items.every((i) => i.unit === 's21'));
  const two = generateAddSub('add', { units: ['a11', 'a22'], rng: seeded() });
  assert.deepEqual([...new Set(two.items.map((i) => i.unit))], ['a11', 'a22']);
  for (const u of [undefined, [], ['zzz']]) {
    assert.equal(generateAddSub('add', { units: u, rng: seeded() }).units.length, 3);
  }
});

test('loadIndex lists add/sub; loadSet generates them', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const idx = await loadIndex();
    for (const id of ['add', 'sub']) {
      const e = idx.find((i) => i.id === id);
      assert.ok(e); assert.equal(e.subject, '수학');
    }
    const set = await loadSet('add', { units: ['a11'] });
    assert.equal(set.items.length, 81);
  } finally { globalThis.fetch = prev; }
});
