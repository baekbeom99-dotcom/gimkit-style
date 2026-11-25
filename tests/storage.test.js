import test from 'node:test';
import assert from 'node:assert/strict';
import { getBest, recordScore } from '../js/core/storage.js';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
test('throwing storage does not break', () => {
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(getBest('jump'), 0);
  assert.deepEqual(recordScore('jump', 7), { best: 7, isNewRecord: true });
});
test('missing storage does not break', () => {
  delete globalThis.localStorage;
  assert.equal(getBest('a'), 0);
  assert.deepEqual(recordScore('a', 3), { best: 3, isNewRecord: true });
});
test('only higher scores are records', () => {
  globalThis.localStorage = memStore();
  assert.deepEqual(recordScore('g', 5), { best: 5, isNewRecord: true });
  assert.deepEqual(recordScore('g', 3), { best: 5, isNewRecord: false });
  assert.deepEqual(recordScore('g', 5), { best: 5, isNewRecord: false });
  assert.deepEqual(recordScore('g', 9), { best: 9, isNewRecord: true });
  assert.equal(getBest('g'), 9);
});

import { createItemStats } from '../js/core/storage.js';
test('itemStats record/get/weakItems with persistence', () => {
  globalThis.localStorage = memStore();
  const s = createItemStats('set1');
  assert.deepEqual(s.get('a|1'), { wrong: 0, right: 0 });
  s.record('a|1', false); s.record('a|1', false); s.record('b|2', false); s.record('b|2', true);
  assert.deepEqual(s.get('a|1'), { wrong: 2, right: 0 });
  assert.deepEqual(s.get('b|2'), { wrong: 0, right: 1 });
  const again = createItemStats('set1');
  assert.deepEqual(again.get('a|1'), { wrong: 2, right: 0 });
  assert.deepEqual(again.weakItems(5).map((w) => w.key), ['a|1']);
  assert.ok(globalThis.localStorage.getItem('gimkit-energy:stats:set1'));
  assert.deepEqual(createItemStats('other').get('a|1'), { wrong: 0, right: 0 });
});
test('itemStats caps wrong at 6 and sorts weak items', () => {
  globalThis.localStorage = memStore();
  const s = createItemStats('c');
  for (let i = 0; i < 10; i++) s.record('x', false);
  s.record('y', false);
  assert.equal(s.get('x').wrong, 6);
  assert.deepEqual(s.weakItems(1).map((w) => w.key), ['x']);
});
test('itemStats survives throwing/missing storage', () => {
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const s = createItemStats('t');
  s.record('k', false);
  assert.equal(s.get('k').wrong, 1);
  delete globalThis.localStorage;
  const m = createItemStats('t');
  m.record('k', true);
  assert.equal(m.get('k').right, 1);
});
