// 못깨는 타워: fairness margin. A route must survive human input jitter: jump press delayed / advanced,
// start x shifted, air-jump press and air-control release shifted (see solver.js "Robust mode").
//   tier 1 and 2: +-80 ms and +-8 px      tier 3: +-50 ms and +-5 px (reduced; tier 3 is meant to be precise)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, SECTION_H } from '../js/games/obby/sections.js';
import { solveSection, solveSectionRobust, MARGIN_LADDER } from '../js/games/obby/solver.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('robust');
const JITTER = { 1: { timingMs: 80, xPx: 8 }, 2: { timingMs: 80, xPx: 8 }, 3: { timingMs: 50, xPx: 5 } };

for (const tier of [1, 2, 3]) {
  test(`robust: every tier ${tier} pattern has a route with margin >= ${JITTER[tier].timingMs} ms / ${JITTER[tier].xPx} px`, () => {
    for (const s of SECTIONS.filter((q) => q.tier === tier)) {
      const r = cache.robust(s, { jitter: JITTER[tier], mode: 'any' });
      assert.equal(r.solvable, true, `${s.id} ${s.name} not robust at ${JSON.stringify(JITTER[tier])}`);
      assert.deepEqual(r.margin, JITTER[tier]);
      assert.equal(r.endsAtExit, true);
    }
  });
}

test('robust: a knife-edge layout is rejected while the nominal solver still clears it', () => {
  // a 16px landing window between two spikes on every step: clearable, but not with +-8 px of slop
  const step = (cx, y) => [
    { x: cx - 40, y, w: 80, type: 'static', surface: 'normal' },
    { x: cx - 40, y, w: 24, type: 'spike' }, { x: cx + 16, y, w: 24, type: 'spike' },
  ];
  const plats = [];
  for (let y = 60, i = 0; y < SECTION_H - 50; y += 65, i++) plats.push(...step(i % 2 ? 160 : 230, y));
  const pat = { id: 'edge', platforms: plats };
  assert.equal(solveSection(pat, { mode: 'any' }).solvable, true);
  assert.equal(solveSectionRobust(pat, { jitter: { timingMs: 80, xPx: 8 }, mode: 'any' }).solvable, false);
});

test('robust: findMax reports the largest proven ladder margin', () => {
  const pat = { id: 'easy', platforms: [] };
  for (let y = 90, i = 0; y < SECTION_H - 40; y += 90, i++) pat.platforms.push({ x: i % 2 ? 60 : 200, y, w: 100, type: 'static', surface: 'normal' });
  const r = solveSectionRobust(pat, { findMax: true, mode: 'any' });
  assert.equal(r.solvable, true);
  assert.ok(MARGIN_LADDER.some((m) => m.timingMs === r.margin.timingMs && m.xPx === r.margin.xPx));
  assert.ok(r.margin.timingMs >= 80, JSON.stringify(r.margin));
});
