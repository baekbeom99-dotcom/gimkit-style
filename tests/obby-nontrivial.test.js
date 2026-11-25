// 못깨는 타워: mutators must make a run harder or different, never let players skip floors. For every pattern
// and every physics mutator env, the solver-optimal clear time must be >= 65% of the pattern's default-physics
// fastest time (both measured with mode 'fastest', one moving-platform start phase). Memoised by obby-cache.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, isCompatible } from '../js/games/obby/sections.js';
import { envFor, ENV_KINDS } from '../js/games/obby/tower.js';
import { JUMP_SCALES } from '../js/games/obby/mutators.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('nontrivial');
const MIN_RATIO = 0.65;

test('the ⏱ jump-power schedule uses exactly the proven env values', () => {
  assert.equal(Math.min(...JUMP_SCALES), envFor('jumppower-low').jumpScale);
  assert.equal(Math.max(...JUMP_SCALES), envFor('jumppower-high').jumpScale);
  assert.ok(JUMP_SCALES.includes(1));
});

for (const kind of ENV_KINDS.filter((k) => k !== 'none')) {
  test(`non-trivialisation: under ${kind} no pattern clears faster than ${MIN_RATIO * 100}% of its normal time`, () => {
    for (const s of SECTIONS) {
      if (!isCompatible(s, kind)) continue;   // flagged: tests/obby-mutators.test.js proves the flag (unsolvable or ratio < 65%)
      const base = cache.section(s, { phaseSamples: 1 });
      const r = cache.section(s, { env: envFor(kind), phaseSamples: 1 });
      assert.equal(r.solvable, true, `${s.id} under ${kind}`);
      const ratio = r.fastestSec / base.fastestSec;
      assert.ok(ratio >= MIN_RATIO, `${s.id} ${s.name}: ${kind} ${r.fastestSec}s vs ${base.fastestSec}s (${ratio.toFixed(2)})`);
    }
  });
}
