import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergy } from '../js/core/energy.js';

test('spend at 0 returns false and leaves value', () => {
  const e = createEnergy();
  assert.equal(e.value, 0);
  assert.equal(e.spend(1), false);
  assert.equal(e.value, 0);
});
test('add clamps to max', () => {
  const e = createEnergy();
  assert.equal(e.max, 10);
  e.add(99);
  assert.equal(e.value, 10);
  assert.equal(e.isFull(), true);
  e.add(3);
  assert.equal(e.value, 10);
});
test('spend reduces and never goes below 0', () => {
  const e = createEnergy();
  e.add(3);
  assert.equal(e.spend(1), true);
  assert.equal(e.value, 2);
  assert.equal(e.spend(5), false);
  assert.equal(e.value, 2);
});
test('subscribe notifies and unsubscribes', () => {
  const e = createEnergy();
  const seen = [];
  const off = e.subscribe((v) => seen.push(v));
  e.add(2);
  e.spend(1);
  off();
  e.add(1);
  assert.deepEqual(seen, [2, 1]);
});
test('reset empties', () => {
  const e = createEnergy();
  e.add(5);
  e.reset();
  assert.equal(e.value, 0);
});
