// A section whose exit is next to the following section's entry lava pools (stones / drop / airjump / mixed start
// with PIT) must still be clearable: NO_PIT_AFTER lists exactly the patterns that are not (and tower.js avoids it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, NO_PIT_AFTER, hasEntryLava } from '../js/games/obby/sections.js';
import { LAVA } from '../js/games/obby/families.js';
import { buildTower } from '../js/games/obby/tower.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('pit');
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

test('NO_PIT_AFTER is exactly the set of patterns that cannot exit past entry lava', () => {
  for (const s of SECTIONS) {
    const t = { ...s, platforms: [...s.platforms, LAVA(0, 108, 782), LAVA(252, 360, 782)] };
    const r = cache.section(t, { mode: 'any' });
    assert.equal(!r.solvable, NO_PIT_AFTER.has(s.id), `${s.id} ${s.name}`);
  }
});

test('towers never put an entry-lava section right above a NO_PIT_AFTER pattern', () => {
  for (const mode of ['practice', 'hard']) for (let seed = 1; seed <= 150; seed++) {
    const t = buildTower(seeded(seed), { mode, sectionCount: 8 });
    for (let i = 1; i < t.sections.length; i++) {
      const prev = t.sections[i - 1], cur = SECTIONS.find((p) => p.id === t.sections[i].id);
      if (NO_PIT_AFTER.has(prev.id)) assert.equal(hasEntryLava(cur), false, `seed ${seed}: ${prev.id} -> ${cur.id}`);
    }
  }
});
