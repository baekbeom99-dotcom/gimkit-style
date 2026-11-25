import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGugudan } from '../js/data/gugudan.js';

test('generateGugudan([7]) makes 9 items all in unit "7"', () => {
  const set = generateGugudan([7]);
  assert.equal(set.id, 'gugudan');
  assert.equal(set.items.length, 9);
  assert.ok(set.items.every((it) => it.unit === '7'));
});

test('7 x 8 has answer 56', () => {
  const set = generateGugudan([7]);
  const item = set.items.find((it) => it.q === '7 × 8');
  assert.ok(item, 'item "7 × 8" should exist');
  assert.equal(item.answer, '56');
});

test('generateGugudan(2..9) makes 72 items', () => {
  const set = generateGugudan([2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(set.items.length, 72);
});

test('generateGugudan([]) means all dans: 8 units, 72 items', () => {
  const set = generateGugudan([]);
  assert.equal(set.units.length, 8);
  assert.equal(set.items.length, 72);
});
