import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewText, normalizeChoose, createSerialQueue } from '../js/core/overlay-opts.js';

test('reviewText defaults match the 3D stack wording', () => {
  assert.deepEqual(reviewText(12, 30, { review: true, unit: '층' }), { heading: '게임 종료', score: '쌓은 12층', best: '최고 기록 30', lines: [] });
  assert.equal(reviewText(5, 5).score, '쌓은 5');
});
test('reviewText overrides', () => {
  const t = reviewText(123, 200, { heading: '🎉 클리어!', label: '도달 높이', unit: 'm', lines: ['a', '', null, 'b'] });
  assert.equal(t.heading, '🎉 클리어!');
  assert.equal(t.score, '도달 높이 123m');
  assert.deepEqual(t.lines, ['a', 'b']);
  assert.equal(reviewText(1, 1, { label: '' }).score, ' 1');
});
test('normalizeChoose', () => {
  assert.equal(normalizeChoose({ title: 'x', options: [] }), null);
  assert.equal(normalizeChoose(null), null);
  const n = normalizeChoose({ title: 'T', options: [{ id: 1, label: 'A', emoji: '🔥' }, { label: 'no id' }, { id: 'b' }] });
  assert.deepEqual(n.options.map((o) => o.id), ['1', 'b']);
  assert.equal(n.options[1].label, 'b');
  assert.equal(n.subtitle, '');
});
test('serial queue runs jobs one at a time', async () => {
  const q = createSerialQueue(); const log = [];
  const a = q(() => new Promise((r) => setTimeout(() => { log.push('a'); r(1); }, 20)));
  const b = q(async () => { log.push('b'); return 2; });
  assert.deepEqual(await Promise.all([a, b]), [1, 2]);
  assert.deepEqual(log, ['a', 'b']);
});
