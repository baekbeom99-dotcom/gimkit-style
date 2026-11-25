// 못깨는 타워: section pattern data checks (geometry only, no solver).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS, SECTION_H, WORLD_W, REST_ENTRY, REST_EXIT, sectionPlatforms, mirrorPattern, mirrorPlatform, isCompatible, SECTION_BY_ID,
} from '../js/games/obby/sections.js';
import { hazardHeight } from '../js/games/obby/hazards.js';
import { ENV_KINDS } from '../js/games/obby/tower.js';

const solids = (p) => p.platforms.filter((q) => q.type !== 'spike');

test('sections: at least 24 patterns, 8+ per tier, unique ids, Korean names', () => {
  assert.ok(SECTIONS.length >= 24, 'count ' + SECTIONS.length);
  for (const tier of [1, 2, 3]) assert.ok(SECTIONS.filter((s) => s.tier === tier).length >= 8, 'tier ' + tier);
  const ids = new Set(SECTIONS.map((s) => s.id));
  assert.equal(ids.size, SECTIONS.length);
  for (const s of SECTIONS) {
    assert.match(s.id, /^t[123]-\d\d$/);
    assert.equal(s.id[1], String(s.tier));
    assert.match(s.name, /[가-힣]/, s.id);
    assert.ok(s.platforms.length >= 3, s.id);
    assert.equal(SECTION_BY_ID.get(s.id), s);
  }
  assert.ok(SECTIONS.some((s) => s.finalGate), 'a final gate exists');
  for (const s of SECTIONS.filter((q) => q.finalGate)) assert.equal(s.tier, 3, s.id);
});

function checkInside(s) {
  for (const p of s.platforms) {
    const tag = `${s.id} ${JSON.stringify(p)}`;
    assert.ok(['static', 'moving', 'spike'].includes(p.type), tag);
    assert.ok(p.w > 0, tag);
    if (p.type === 'moving') {
      assert.equal(p.x, p.baseX, tag);
      assert.ok(p.baseX - p.range >= 0 && p.baseX + p.w + p.range <= WORLD_W, 'moving range inside the world: ' + tag);
      assert.ok(p.range > 0 && p.speed > 0 && Number.isFinite(p.phase), tag);
    } else {
      assert.ok(p.x >= 0 && p.x + p.w <= WORLD_W, 'inside the world: ' + tag);
    }
    if (p.type === 'spike') {
      assert.ok(p.y >= 0 && p.y + hazardHeight(p) + (p.rise || 0) <= SECTION_H, 'spike within [0,SECTION_H]: ' + tag);
      if (p.hz === 'saw') {
        assert.equal(p.w, 30); assert.equal(p.h, 30);
        assert.ok(p.range > 0 && p.speed > 0 && Number.isFinite(p.phase), tag);
        if (p.axis === 'y') assert.ok(p.baseY === p.y && p.y - p.range >= 0 && p.y + p.range + 30 <= SECTION_H, 'saw lane inside the section: ' + tag);
        else assert.ok(p.x === p.baseX && p.baseX - p.range >= 0 && p.baseX + p.w + p.range <= WORLD_W, 'saw lane inside the world: ' + tag);
      }
      if (p.hz === 'laser') assert.ok(p.period > 0 && p.on > 0 && p.on < p.period, tag);
      if (p.hz === 'crusher') assert.ok(p.period > 1.3 && p.rise > 0 && p.h > 0, tag);
    } else {
      assert.ok(p.y > 0 && p.y < SECTION_H, 'platform strictly between the rest platforms: ' + tag);
      assert.ok(['normal', 'ice', 'conveyor', 'crumble'].includes(p.surface), tag);
      if (p.surface === 'conveyor') assert.ok(Math.abs(p.belt) > 0, tag);
      if (p.feature) assert.equal(p.feature, 'spring', tag);
    }
  }
}

test('sections: every platform is inside the 360px world and within [0, SECTION_H]', () => {
  for (const s of SECTIONS) checkInside(s);
});

test('sections: widths follow the building blocks (solid >= 38px), movers share one speed per section', () => {
  for (const s of SECTIONS) {
    for (const p of solids(s)) assert.ok(p.w >= 38, `${s.id} width ${p.w}`);
    const speeds = new Set(s.platforms.filter((p) => p.type === 'moving').map((p) => p.speed));
    assert.ok(speeds.size <= 1, s.id);
    for (const p of solids(s)) if (p.feature === 'spring') assert.ok(p.w >= 44, 'spring pad fits ' + s.id);
  }
});

test('sections: tiers get harder (narrower platforms on average)', () => {
  const avgW = (tier) => {
    const ws = SECTIONS.filter((s) => s.tier === tier).flatMap((s) => solids(s).filter((p) => p.w < 200).map((p) => p.w));
    return ws.reduce((a, b) => a + b, 0) / ws.length;
  };
  assert.ok(avgW(1) > avgW(3), `${avgW(1)} > ${avgW(3)}`);
  const narrow3 = SECTIONS.filter((s) => s.tier === 3 && solids(s).some((p) => p.w <= 50)).length;
  assert.ok(narrow3 >= 6, 'tier 3 uses narrow platforms ' + narrow3);
});

test('sections: incompatible flags name real env kinds; the classic skeletons stay (almost) flag-free', () => {
  let classic = 0;
  const OPEN = ['stones', 'drop', 'airjump', 'mixed'];
  for (const s of SECTIONS) {
    for (const k of s.incompatible || []) {
      assert.ok((ENV_KINDS.includes(k) && k !== 'none') || k === 'crumbleall', s.id + ' ' + k);
      if (!OPEN.includes(s.family)) classic++;
    }
    assert.equal(isCompatible(s, 'none'), true);
  }
  assert.ok(classic <= 3, 'classic flags ' + classic);
});

test('sectionPlatforms: entry rest first, exit rest second, pattern copied with defaults', () => {
  const s = SECTIONS[0];
  const pl = sectionPlatforms(s);
  assert.deepEqual({ ...pl[0] }, { ...REST_ENTRY });
  assert.deepEqual({ ...pl[1] }, { ...REST_EXIT });
  assert.equal(REST_EXIT.y, SECTION_H);
  assert.equal(pl.length, s.platforms.length + 2);
  pl[2].x += 1;
  assert.notEqual(pl[2].x, s.platforms[0].x, 'copies, not the pattern objects');
});

test('mirrorPattern: x -> 360 - x - w, movers and belts flip, involution, still inside the world', () => {
  for (const s of SECTIONS) {
    const m = mirrorPattern(s);
    assert.equal(m.mirrored, true);
    assert.equal(m.id, s.id);
    checkInside(m);
    s.platforms.forEach((p, i) => {
      const q = m.platforms[i];
      assert.equal(q.x, WORLD_W - p.x - p.w);
      assert.equal(q.y, p.y);
      if (p.belt) assert.equal(q.belt, -p.belt);
      if (p.hz === 'saw' && p.axis !== 'y') {
        for (const t of [0, 0.7, 2.3]) {
          const x = p.baseX + Math.sin(t * p.speed + p.phase) * p.range;
          const xm = q.baseX + Math.sin(t * q.speed + q.phase) * q.range;
          assert.ok(Math.abs(xm - (WORLD_W - x - p.w)) < 1e-9, 'mirrored saw ' + s.id);
        }
      }
      if (p.type === 'moving') {
        // the mirrored platform's position is the mirror image at every moment
        for (const t of [0, 0.7, 2.3]) {
          const x = p.baseX + Math.sin(t * p.speed + p.phase) * p.range;
          const xm = q.baseX + Math.sin(t * q.speed + q.phase) * q.range;
          assert.ok(Math.abs(xm - (WORLD_W - x - p.w)) < 1e-9);
        }
      }
    });
    const back = mirrorPattern(m);
    back.platforms.forEach((p, i) => { assert.equal(p.x, s.platforms[i].x); assert.equal(p.belt, s.platforms[i].belt); });
  }
  assert.deepEqual(mirrorPlatform({ x: 10, y: 5, w: 40, type: 'spike' }), { x: 310, y: 5, w: 40, type: 'spike' });
});
