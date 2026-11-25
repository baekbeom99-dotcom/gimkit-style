import test from 'node:test';
import assert from 'node:assert/strict';
import { energyGain, buildChoices, createQuizSession } from '../js/core/quiz-engine.js';

test('energyGain', () => {
  const t = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 9: 4 };
  for (const [s, g] of Object.entries(t)) assert.equal(energyGain(Number(s)), g);
});
test('buildChoices numeric: unique, contains answer', () => {
  for (let i = 0; i < 50; i++) {
    const item = { q: '7 x 8', answer: '56' };
    const { choices, correctIndex } = buildChoices(item, ['56', '56', '12'], Math.random);
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices).size, choices.length);
    assert.equal(choices[correctIndex], '56');
  }
});
test('buildChoices text with small pool', () => {
  const item = { q: 'apple', answer: 'A' };
  const two = buildChoices(item, ['A', 'B', 'A'], Math.random);
  assert.equal(two.choices.length, 2);
  assert.equal(two.choices[two.correctIndex], 'A');
  const three = buildChoices(item, ['A', 'B', 'C'], Math.random);
  assert.equal(three.choices.length, 3);
  assert.equal(new Set(three.choices).size, 3);
  assert.equal(three.choices[three.correctIndex], 'A');
});
test('buildChoices uses distractors first', () => {
  const item = { q: 'q', answer: 'a', distractors: ['b', 'c', 'd', 'e', 'a'] };
  const { choices, correctIndex } = buildChoices(item, ['x', 'y'], Math.random);
  assert.equal(choices[correctIndex], 'a');
  assert.equal(new Set(choices).size, choices.length);
  for (const c of choices) assert.ok(['a', 'b', 'c', 'd', 'e'].includes(c));
});
test('buildChoices empty pool does not throw', () => {
  const r = buildChoices({ q: 'q', answer: 'only' }, [], Math.random);
  assert.deepEqual(r.choices, ['only']);
  assert.equal(r.correctIndex, 0);
});

const items = [
  { unit: '2', q: '2 x 3', answer: '6' },
  { unit: '2', q: '2 x 4', answer: '8' },
  { unit: '3', q: '3 x 3', answer: '9' },
];
test('answer correct increments streak and gain', () => {
  const s = createQuizSession({ items });
  const q = s.next();
  const r = s.answer(q.correctIndex);
  assert.equal(r.correct, true);
  assert.equal(r.streak, 1);
  assert.equal(r.gain, 2);
  assert.equal(s.streak, 1);
});
test('answer wrong resets streak, lockMs 1000', () => {
  const s = createQuizSession({ items });
  let q = s.next();
  s.answer(q.correctIndex);
  q = s.next();
  const r = s.answer((q.correctIndex + 1) % q.choices.length);
  assert.equal(r.correct, false);
  assert.equal(r.gain, 0);
  assert.equal(r.streak, 0);
  assert.equal(r.lockMs, 1000);
  assert.equal(r.correctIndex, q.correctIndex);
});
test('two wrongs remove a wrong choice; correct clears it', () => {
  const s = createQuizSession({ items });
  for (let i = 0; i < 2; i++) {
    const q = s.next();
    assert.equal(q.removedIndex, null);
    s.answer((q.correctIndex + 1) % q.choices.length);
  }
  assert.equal(s.wrongStreak, 2);
  let q = s.next();
  assert.notEqual(q.removedIndex, null);
  assert.notEqual(q.removedIndex, q.correctIndex);
  s.answer(q.correctIndex);
  q = s.next();
  assert.equal(q.removedIndex, null);
});
test('double answer on same question gives no gain', () => {
  const s = createQuizSession({ items });
  const q = s.next();
  const a = s.answer(q.correctIndex);
  const b = s.answer(q.correctIndex);
  assert.equal(a.gain, 2);
  assert.equal(b.gain, 0);
  assert.equal(s.streak, 1);
});
test('answer before next gives no gain', () => {
  const s = createQuizSession({ items });
  assert.equal(s.answer(0).gain, 0);
});
test('units filter and empty units uses all', () => {
  const s = createQuizSession({ items, units: ['3'] });
  for (let i = 0; i < 5; i++) assert.equal(s.next().q, '3 x 3');
  const all = createQuizSession({ items, units: [] });
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(all.next().q);
  assert.equal(seen.size, 3);
});

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function memStats() {
  const m = new Map();
  return {
    get: (k) => ({ ...(m.get(k) || { wrong: 0, right: 0 }) }),
    record(k, c) { const v = m.get(k) || { wrong: 0, right: 0 }; if (c) { v.right++; v.wrong = Math.max(0, v.wrong - 1); } else v.wrong = Math.min(6, v.wrong + 1); m.set(k, v); },
    weakItems: () => [],
  };
}
const nine = Array.from({ length: 9 }, (_, i) => ({ unit: '2', q: `2 x ${i + 1}`, answer: String(2 * (i + 1)) }));
test('no repeat of previous and last 2 (>=4 items)', () => {
  const s = createQuizSession({ items: nine, rng: seeded(1) });
  const hist = [];
  for (let i = 0; i < 200; i++) {
    const q = s.next().q;
    assert.ok(!hist.slice(-2).includes(q), `repeat at ${i}`);
    hist.push(q);
    s.answer(0);
  }
});
test('2-3 items: never equal to previous; 1 item repeats', () => {
  const s = createQuizSession({ items: items, rng: seeded(2) });
  let prev = null;
  for (let i = 0; i < 100; i++) { const q = s.next().q; assert.notEqual(q, prev); prev = q; }
  const one = createQuizSession({ items: [items[0]], rng: seeded(3) });
  assert.equal(one.next().q, one.next().q);
});
test('weak item drawn much more often', () => {
  const stats = memStats();
  for (let i = 0; i < 3; i++) stats.record('2|2 x 1', false);
  const s = createQuizSession({ items: nine, rng: seeded(4), stats });
  const counts = {};
  for (let i = 0; i < 2000; i++) { const q = s.next().q; counts[q] = (counts[q] || 0) + 1; }
  assert.ok(counts['2 x 1'] > 2 * counts['2 x 5'], JSON.stringify(counts));
});
test('answer records to stats', () => {
  const stats = memStats();
  const s = createQuizSession({ items: [items[0]], stats });
  const q = s.next();
  s.answer((q.correctIndex + 1) % q.choices.length);
  assert.equal(stats.get('2|2 x 3').wrong, 1);
});
test('gainMultiplier 2 gives 4/6/8', () => {
  const s = createQuizSession({ items, gainMultiplier: 2, rng: seeded(5) });
  const gains = [];
  for (let i = 1; i <= 5; i++) { const q = s.next(); gains[i] = s.answer(q.correctIndex).gain; }
  assert.equal(gains[1], 4); assert.equal(gains[3], 6); assert.equal(gains[5], 8);
});

// ---- kind / speak / distractor pool fix ----
test('next() returns kind and speak (defaults: equation / null)', () => {
  const d = createQuizSession({ items }).next();
  assert.equal(d.kind, 'equation');
  assert.equal(d.speak, null);
  const w = createQuizSession({ items, kind: 'word', speak: 'en-US' }).next();
  assert.equal(w.kind, 'word');
  assert.equal(w.speak, 'en-US');
  assert.ok(Array.isArray(w.choices) && typeof w.correctIndex === 'number' && 'removedIndex' in w && 'q' in w);
});
const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((w, i) => ({ unit: i === 0 ? 'one' : 'rest', q: w, answer: 'K' + w }));
test('one-word unit still yields 4 choices from the whole set', () => {
  const s = createQuizSession({ items: words, units: ['one'], rng: seeded(7) });
  for (let i = 0; i < 30; i++) {
    const q = s.next();
    assert.equal(q.q, 'a');
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.equal(q.choices[q.correctIndex], 'Ka');
    s.answer(q.correctIndex);
  }
});
test('pool is topped up only when the unit has < 8 answers; correct answer never duplicated', () => {
  const big = Array.from({ length: 9 }, (_, i) => ({ unit: 'big', q: `q${i}`, answer: `A${i}` }));
  const other = [{ unit: 'other', q: 'zz', answer: 'OTHER' }];
  const s = createQuizSession({ items: [...big, ...other], units: ['big'], rng: seeded(8) });
  for (let i = 0; i < 100; i++) { const q = s.next(); assert.ok(!q.choices.includes('OTHER')); s.answer(0); }
  const small = createQuizSession({ items: [...big.slice(0, 2), ...other, ...big.slice(2)], units: ['other'], rng: seeded(9) });
  const q = small.next();
  assert.equal(q.choices.length, 4);
  assert.equal(q.choices.filter((c) => c === 'OTHER').length, 1);
});
test('whole set with <4 distinct answers still gives as many choices as possible', () => {
  const s = createQuizSession({ items: [{ unit: 'a', q: 'x', answer: 'one' }, { unit: 'b', q: 'y', answer: 'two' }], units: ['a'] });
  assert.equal(s.next().choices.length, 2);
});
