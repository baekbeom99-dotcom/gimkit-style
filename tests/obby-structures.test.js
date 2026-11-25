// 못깨는 타워: skeleton families. Every pattern belongs to a family; the new 'slab-*' skeletons (stacked slabs with
// one hood window per floor) must be provably un-skippable (full-width hoods, single window, rest columns kept
// clear, the solver's fastest route walks every floor), and buildTower must mix skeletons (no two neighbouring
// sections of one family, switchbacks rare).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, SECTION_H, WORLD_W, sectionPlatforms, familyGroup, isCompatible } from '../js/games/obby/sections.js';
import { buildTower, MIN_GROUPS, MUTATORS } from '../js/games/obby/tower.js';
import { solveSection } from '../js/games/obby/solver.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slabPatterns = SECTIONS.filter((s) => s.family.startsWith('slab-'));

test('families: every pattern has one; 12+ patterns use the new skeletons, spread over tiers, with a final gate', () => {
  for (const s of SECTIONS) assert.match(s.family, /^[a-z-]+$/, s.id);
  const old = SECTIONS.filter((s) => s.family === 'switchback');
  assert.ok(old.length >= 20, 'existing switchbacks are kept');
  assert.ok(slabPatterns.length >= 12, 'new patterns ' + slabPatterns.length);
  for (const tier of [1, 2, 3]) assert.ok(slabPatterns.filter((s) => s.tier === tier).length >= 4, 'tier ' + tier);
  assert.ok(slabPatterns.some((s) => s.tier === 3 && s.finalGate), 'a new final gate');
  assert.ok(new Set(slabPatterns.map((s) => s.family)).size >= 4, 'several window layouts');
  assert.ok(new Set(slabPatterns.map((s) => JSON.stringify(s.platforms.filter((p) => p.ceiling).map((p) => [p.x, p.w])))).size >= 5, 'window layouts differ');
});

test('slab patterns: every floor is under a full-width hood with exactly one window, floors 86px apart', () => {
  const HOOD = 66;
  for (const s of slabPatterns) {
    const hoodYs = [...new Set(s.platforms.filter((p) => p.ceiling).map((p) => p.y))].sort((a, b) => a - b);
    assert.equal(hoodYs.length, 8, s.id);
    hoodYs.forEach((hy, k) => {
      const y = hy - HOOD;
      if (k) assert.equal(y - (hoodYs[k - 1] - HOOD), 86, s.id + ' floor spacing');
      // a walkable platform (floor piece) exists at the floor height
      assert.ok(s.platforms.some((p) => p.type !== 'spike' && p.y === y), s.id + ' floor ' + k);
      const hoods = s.platforms.filter((p) => p.ceiling && p.y === hy).sort((a, b) => a.x - b.x);
      assert.ok(hoods.length >= 1 && hoods.length <= 2, s.id);
      // coverage of [0, WORLD_W]: the only uncovered stretch is the window
      let at = 0;
      const gaps = [];
      for (const h of hoods) { if (h.x > at) gaps.push([at, h.x]); at = Math.max(at, h.x + h.w); }
      if (at < WORLD_W) gaps.push([at, WORLD_W]);
      assert.equal(gaps.length, 1, `${s.id} floor ${k}: one window`);
      const [a, b] = gaps[0];
      assert.equal(b - a, 96, `${s.id} window ${a}-${b}`);
      assert.ok(hy + 16 <= SECTION_H, s.id + ' hood inside the section');
    });
    // the second floor is out of a double jump's reach from the entry rest (the first window is no shortcut)
    const first = Math.min(...s.platforms.filter((p) => p.ceiling).map((p) => p.y)) - HOOD;
    assert.ok(first + 86 > 178, s.id);
    assert.ok(first <= 96, s.id + ' the first floor is a single jump from the rest');
  }
});

test('slab patterns: the fastest route lands on (nearly) every gate piece, i.e. nothing is skipped', () => {
  for (const s of slabPatterns) {
    const pl = sectionPlatforms(s);
    const gates = pl.map((p, i) => (p.gate ? i : -1)).filter((i) => i >= 0);
    assert.ok(gates.length >= 4, s.id);
    for (const phaseSamples of [1, 3]) {
      const r = solveSection(s, { phaseSamples });
      assert.equal(r.solvable, true, s.id);
      const landed = new Set(r.path.map((st) => st.to));
      const hit = gates.filter((i) => landed.has(i)).length;
      assert.ok(hit / gates.length >= 0.9, `${s.id}: route lands on ${hit}/${gates.length} gate pieces`);
      assert.equal(r.path[r.path.length - 1].to, 1);
    }
  }
});

test('buildTower: neighbouring sections never share a skeleton group; 4+ groups and families per tower; switchbacks and slabs are minorities', () => {
  let total = 0;
  const share = {};
  for (const mutator of [undefined, 'wind', 'crumbleAll', 'jumppower', 'lowgravity']) {
    for (let seed = 1; seed <= 50; seed++) {
      const t = buildTower(seeded(seed * 31 + 7), { mode: seed % 2 ? 'practice' : 'hard', mutator });
      const groups = t.sections.map((s) => familyGroup(s.family));
      // groups that have at least one pattern clearable under this mutator (🪶 / ⏱ flag most open-air patterns as skippable)
      const envKinds = mutator ? MUTATORS.find((m) => m.kind === mutator).envKinds : [];
      const avail = new Set(SECTIONS.filter((p) => envKinds.every((k) => isCompatible(p, k))).map((p) => familyGroup(p.family)));
      t.sections.forEach((s, i) => {
        assert.ok(s.family, s.id);
        if (i) {
          assert.notEqual(s.family, t.sections[i - 1].family, `seed ${seed} section ${i} ${s.id}`);
          assert.notEqual(groups[i], groups[i - 1], `seed ${seed} section ${i} ${s.id} group`);
        }
        if (mutator !== 'lowgravity' && mutator !== 'jumppower') {   // shares: towers where every group is (mostly) available
          total++;
          share[groups[i]] = (share[groups[i]] || 0) + 1;
        }
      });
      // 🪶 / ⏱ flag most open-air patterns as skippable, so fewer groups (and tiers) survive there: 3 is the floor
      const need = Math.min(mutator === 'lowgravity' || mutator === 'jumppower' ? 3 : MIN_GROUPS, avail.size);
      assert.ok(new Set(groups).size >= need, `seed ${seed} ${mutator}: ${new Set(groups).size} groups of ${avail.size} available`);
      const availF = new Set(SECTIONS.filter((p) => envKinds.every((k) => isCompatible(p, k))).map((p) => p.family));
      assert.ok(new Set(t.sections.map((s) => s.family)).size >= Math.min(4, availF.size), `seed ${seed} ${mutator}: families mixed`);
      // tiers still climb: 1,1,2,2,2,3,3,final
      assert.deepEqual(t.sections.map((s) => s.tier), [1, 1, 2, 2, 2, 3, 3, 3]);
    }
  }
  assert.ok((share.switchback || 0) / total < 0.3, 'switchback share ' + share.switchback / total);
  assert.ok((share.slab || 0) / total < 0.3, 'slab share ' + share.slab / total);
  const openShare = ['stones', 'drop', 'airjump', 'mixed'].reduce((a, g) => a + (share[g] || 0), 0) / total;
  assert.ok(openShare > 0.4, 'open-air skeleton share ' + openShare);
  for (const g of ['stones', 'drop', 'airjump', 'mixed']) assert.ok((share[g] || 0) / total > 0.05, g + ' appears ' + share[g]);
});
