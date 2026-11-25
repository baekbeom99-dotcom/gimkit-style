import test from 'node:test';
import assert from 'node:assert/strict';
import { createStairs } from '../js/games/stairs/logic.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('correct direction moves and scores', () => {
  const st = createStairs(seeded(1));
  const dir = st.steps[st.pos];
  assert.deepEqual(st.tap(dir), { moved: true, wrong: false });
  assert.equal(st.score, 1);
  assert.equal(st.pos, 1);
});

test('wrong direction stays and keeps score', () => {
  const st = createStairs(seeded(2));
  const wrong = st.steps[st.pos] === 'L' ? 'R' : 'L';
  assert.deepEqual(st.tap(wrong), { moved: false, wrong: true });
  assert.equal(st.score, 0);
  assert.equal(st.pos, 0);
});

test('steps stay generated far ahead (infinite) with repeated same dirs', () => {
  const st = createStairs(seeded(3));
  for (let i = 0; i < 500; i++) {
    assert.ok(st.steps.length > st.pos + 10);
    assert.equal(st.tap(st.steps[st.pos]).moved, true);
  }
  assert.equal(st.score, 500);
  assert.ok(st.steps.every((d) => d === 'L' || d === 'R'));
});

test('same seed gives same sequence', () => {
  const a = createStairs(seeded(7));
  const b = createStairs(seeded(7));
  for (let i = 0; i < 100; i++) { a.tap(a.steps[a.pos]); b.tap(b.steps[b.pos]); }
  assert.deepEqual(a.steps.slice(0, 100), b.steps.slice(0, 100));
});

test('long runs: few direction changes, runs within 2..9, avg >= 4', () => {
  for (const seed of [1, 5, 9, 42, 1234]) {
    const st = createStairs(seeded(seed));
    for (let i = 0; i < 2000; i++) st.tap(st.steps[st.pos]);
    const s = st.steps;
    const runs = [];
    let n = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1]) n++; else { runs.push(n); n = 1; }
    }
    const changes = runs.length;
    assert.ok(changes / s.length <= 0.3, `changes ${changes}/${s.length}`);
    assert.ok(s.length / (changes + 1) >= 4, 'avg run');
    runs.forEach((r, i) => { assert.ok(r <= 9); if (i > 0) assert.ok(r >= 2, `run ${r}`); });
    assert.ok(runs[0] >= 1 && runs[0] <= 9);
  }
});

test('expected() returns the correct next direction', () => {
  const st = createStairs(seeded(4));
  assert.equal(st.expected(), st.steps[0]);
});
