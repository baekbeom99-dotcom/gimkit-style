// 못깨는 타워: every pattern must stay clearable under each physics mutator (🪶 low gravity, ⏱ jump power
// low/high, 💨 wind both ways), mirrored, and with 🧱 crumbleAll (applyCrumbleAll) - unless flagged in
// `incompatible` ('crumbleall' is the flag name for 🧱) - and a flag must be real (still unsolvable).
// Uses the solver's 'any' mode (weighted A*, one start phase): it proves solvability, not the fastest time.
// Results are memoised by tests/obby-cache.mjs (content-hashed: any change re-solves for real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, isCompatible, mirrorPattern } from '../js/games/obby/sections.js';
import { envFor, ENV_KINDS, applyCrumbleAll } from '../js/games/obby/tower.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('mutators');
const MIN_RATIO = 0.65;   // tests/obby-nontrivial.test.js: a mutator may not clear a pattern faster than 65% of its normal time

for (const kind of ENV_KINDS.filter((k) => k !== 'none')) {
  test(`mutator ${kind}: every compatible pattern is solvable, flagged ones really are not (unsolvable or skippable)`, () => {
    const env = envFor(kind);
    for (const s of SECTIONS) {
      const r = cache.section(s, { env, mode: 'any' });
      if (isCompatible(s, kind)) assert.equal(r.solvable, true, `${s.id} ${s.name} under ${kind}`);
      else if (r.solvable) {
        // a flag on a solvable pattern means the mutator makes it skippable: the optimum is < 65% of the normal time
        const base = cache.section(s, { phaseSamples: 1 }), e = cache.section(s, { env, phaseSamples: 1 });
        assert.ok(e.fastestSec / base.fastestSec < MIN_RATIO, `${s.id} is flagged incompatible with ${kind} but neither unsolvable nor skippable (${e.fastestSec}s vs ${base.fastestSec}s): drop the flag`);
      }
    }
  });
}

test('mutator crumbleAll (applyCrumbleAll): every compatible pattern stays solvable, rest platforms and walkways stay solid', () => {
  for (const s of SECTIONS) {
    const r = cache.section({ ...s, platforms: applyCrumbleAll(s.platforms) }, { mode: 'any' });
    if (isCompatible(s, 'crumbleall')) assert.equal(r.solvable, true, `${s.id} ${s.name} under crumbleAll`);
    else assert.equal(r.solvable, false, `${s.id} is flagged crumbleall but solvable: drop the flag`);
  }
  const conv = applyCrumbleAll([
    { x: 0, y: 0, w: 100, type: 'static', surface: 'normal', rest: true }, { x: 0, y: 90, w: 80, type: 'static', surface: 'normal' },
    { x: 0, y: 180, w: 300, type: 'static', surface: 'normal' }, { x: 0, y: 270, w: 60, type: 'static', surface: 'normal', feature: 'spring' },
    { x: 0, y: 300, w: 60, type: 'static', surface: 'ice' }, { x: 0, y: 330, w: 30, type: 'spike' },
  ]);
  assert.deepEqual(conv.map((p) => p.surface), ['normal', 'crumble', 'normal', 'normal', 'ice', undefined]);
});

test('mirrored patterns are solvable too', () => {
  for (const s of SECTIONS) assert.equal(cache.section(mirrorPattern(s), { mode: 'any' }).solvable, true, s.id + ' mirrored');
});
