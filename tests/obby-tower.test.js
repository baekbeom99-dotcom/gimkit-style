// 못깨는 타워: tower assembly (buildTower), mutator envs and a full-tower solver chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTower, envFor, MUTATORS, ENV_KINDS, slotTier, towerSectionPlatforms, GROUND_W } from '../js/games/obby/tower.js';
import { SECTION_H, SECTION_BY_ID, isCompatible } from '../js/games/obby/sections.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('tower');
import { stepPlayer, createPlayer } from '../js/games/jump/world.js';

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

test('buildTower: 8 sections, tier progression 1,1,2,2,2,3,3,final, no duplicate pattern', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = buildTower(seeded(seed), { mode: 'practice', sectionCount: 8 });
    assert.equal(t.sections.length, 8);
    assert.deepEqual(t.sections.map((s) => s.tier), [1, 1, 2, 2, 2, 3, 3, 3]);
    assert.equal(new Set(t.sections.map((s) => s.id)).size, 8);
    assert.equal(t.sections[7].finalGate, true, 'last slot is a final gate');
    assert.ok(t.sections.slice(5, 7).every((s) => !s.finalGate));
    t.sections.forEach((s, i) => {
      assert.equal(s.index, i);
      assert.equal(s.y0, i * SECTION_H);
      assert.equal(s.y1, (i + 1) * SECTION_H);
      assert.equal(s.name, SECTION_BY_ID.get(s.id).name);
    });
  }
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => slotTier(i, 8)), [1, 1, 2, 2, 2, 3, 3, 'final']);
});

test('buildTower: deterministic for a seeded rng, varied across seeds, mirrors about half the sections', () => {
  const a = buildTower(seeded(7)), b = buildTower(seeded(7));
  assert.deepEqual(a, b);
  const combos = new Set();
  let mirrored = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const t = buildTower(seeded(seed));
    combos.add(t.sections.map((s) => s.id + (s.mirrored ? 'm' : '')).join(','));
    for (const s of t.sections) { total++; if (s.mirrored) mirrored++; }
  }
  assert.ok(combos.size >= 55, 'varied ' + combos.size);
  assert.ok(mirrored / total > 0.35 && mirrored / total < 0.65, 'mirror share ' + mirrored / total);
});

test('buildTower: rest platforms line up at k*SECTION_H, goal on top, everything inside the world', () => {
  for (const mode of ['practice', 'hard']) {
    const t = buildTower(seeded(3), { mode });
    const rests = t.platforms.filter((p) => p.rest);
    assert.deepEqual(rests.map((p) => p.y), [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => k * SECTION_H));
    assert.equal(t.platforms[0].y, 0);
    assert.equal(t.platforms[0].w, GROUND_W);
    for (const r of rests.slice(1)) { assert.equal(r.x, 110); assert.equal(r.w, 140); }
    const goal = rests[rests.length - 1];
    assert.equal(goal.feature, 'goal');
    assert.equal(t.platforms.filter((p) => p.feature === 'goal').length, 1);
    assert.deepEqual(t.goal, { x: goal.x + goal.w / 2, y: goal.y });
    assert.equal(t.height, 8 * SECTION_H);
    assert.deepEqual(t.spawn, { x: 180, y: 0 });
    for (const p of t.platforms) {
      const l = p.type === 'moving' ? p.baseX - p.range : p.x;
      const r = p.type === 'moving' ? p.baseX + p.w + p.range : p.x + p.w;
      assert.ok(l >= 0 && r <= 360, JSON.stringify(p));
      assert.ok(p.y >= 0 && p.y <= t.height, JSON.stringify(p));
      if (!p.rest) assert.ok(p.y > p.section * SECTION_H && p.y < (p.section + 1) * SECTION_H + 1);
    }
  }
});

test('buildTower: checkpoints after sections 2, 4, 6 in practice mode only', () => {
  const p = buildTower(seeded(11), { mode: 'practice' });
  assert.deepEqual(p.checkpoints.map((c) => c.section), [2, 4, 6]);
  for (const c of p.checkpoints) {
    assert.equal(c.y, c.section * SECTION_H);
    assert.equal(p.platforms[c.platformIndex].feature, 'checkpoint');
    assert.equal(p.platforms[c.platformIndex].y, c.y);
  }
  assert.equal(p.platforms.filter((q) => q.feature === 'checkpoint').length, 3);
  const h = buildTower(seeded(11), { mode: 'hard' });
  assert.deepEqual(h.checkpoints, []);
  assert.equal(h.platforms.filter((q) => q.feature === 'checkpoint').length, 0);
});

test('buildTower: a mutator option skips patterns flagged incompatible with it', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const t = buildTower(seeded(seed), { mode: 'hard', mutator: 'jumppower' });
    for (const s of t.sections) {
      assert.ok(isCompatible(SECTION_BY_ID.get(s.id), 'jumppower-low') && isCompatible(SECTION_BY_ID.get(s.id), 'jumppower-high'), s.id);
    }
    assert.equal(t.sections.length, 8);
    const c = buildTower(seeded(seed), { mode: 'hard', mutator: 'crumbleAll' });
    for (const s of c.sections) assert.ok(isCompatible(SECTION_BY_ID.get(s.id), 'crumbleall'), 'crumbleAll skips ' + s.id);
    assert.equal(c.sections[7].finalGate, true, 'a compatible final gate remains for crumbleAll');
  }
  assert.deepEqual(MUTATORS.find((m) => m.kind === 'crumbleAll').envKinds, ['crumbleall']);
});

test('envFor / MUTATORS: physics envs per kind, HUD metadata for all six mutators', () => {
  assert.deepEqual(envFor('none'), {});
  assert.deepEqual(envFor('lowgravity'), { gravityScale: 0.85 });
  assert.deepEqual(envFor('jumppower-low'), { jumpScale: 0.8 });
  assert.deepEqual(envFor('jumppower-high'), { jumpScale: 1.1 });
  assert.deepEqual(envFor('wind-left'), { wind: [{ y0: -Infinity, y1: Infinity, vx: -45 }] });
  assert.deepEqual(envFor('wind-right'), { wind: [{ y0: -Infinity, y1: Infinity, vx: 45 }] });
  assert.deepEqual(envFor('water'), {});
  assert.notEqual(envFor('lowgravity'), envFor('lowgravity'), 'fresh objects');
  assert.deepEqual(MUTATORS.map((m) => m.kind), ['water', 'shake', 'lowgravity', 'jumppower', 'crumbleAll', 'wind']);
  assert.deepEqual(MUTATORS.map((m) => m.emoji), ['🌊', '🤝', '🪶', '⏱', '🧱', '💨']);
  for (const m of MUTATORS) {
    assert.ok(m.label && m.description, m.kind);
    for (const k of m.envKinds) assert.ok(ENV_KINDS.includes(k) || k === 'crumbleall', k);
  }
  // the env really changes the physics through stepPlayer
  const ground = { x: 0, y: 0, w: 360, type: 'static', surface: 'normal' };
  const apex = (env) => {
    const s = createPlayer(180, 0);
    stepPlayer(s, {}, 1 / 60, [ground], env);
    stepPlayer(s, { jump: true }, 1 / 60, [ground], env);
    let top = 0;
    for (let i = 0; i < 200 && !s.onGround; i++) { stepPlayer(s, {}, 1 / 60, [ground], env); top = Math.max(top, s.y); }
    return top;
  };
  assert.ok(apex(envFor('lowgravity')) > apex(envFor('none')) * 1.12);
  assert.ok(apex(envFor('jumppower-low')) < apex(envFor('none')) * 0.7);
  assert.ok(apex(envFor('jumppower-high')) > apex(envFor('none')) * 1.15);
});

test('full tower: the solver chains through every assembled section (absolute coords, real rest platforms)', () => {
  for (const seed of [5, 21]) {
    const t = buildTower(seeded(seed), { mode: 'hard' });
    for (let i = 0; i < t.sections.length; i++) {
      const pl = towerSectionPlatforms(t, i);
      assert.equal(pl[0].y, 0);
      assert.equal(pl[1].y, SECTION_H);
      const r = cache.platforms(pl, { mode: 'any' });
      assert.equal(r.solvable, true, `seed ${seed} section ${i} ${t.sections[i].id}${t.sections[i].mirrored ? ' (mirrored)' : ''}`);
    }
  }
  // and under a mutator the tower was built for
  const t = buildTower(seeded(9), { mode: 'hard', mutator: 'wind' });
  for (let i = 0; i < t.sections.length; i++) {
    const r = cache.platforms(towerSectionPlatforms(t, i), { mode: 'any', env: envFor('wind-right') });
    assert.equal(r.solvable, true, `wind section ${i} ${t.sections[i].id}`);
  }
});
