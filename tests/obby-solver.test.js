// 못깨는 타워: the section solver (forward simulation with the real stepPlayer) and the 'none' env proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, SECTION_H } from '../js/games/obby/sections.js';
import { solveSection, solvePlatforms } from '../js/games/obby/solver.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('solver');
const rest = (y) => ({ x: 110, y, w: 140, type: 'static', surface: 'normal' });
const plat = (x, y, w, more = {}) => ({ x, y, w, type: 'static', surface: 'normal', ...more });
// a plain ladder: rungs every 90px alternating sides, from y0 up to the exit
const ladder = (y0 = 90) => {
  const out = [];
  for (let y = y0, i = 0; y < SECTION_H - 40; y += 90, i++) out.push(plat(i % 2 ? 60 : 200, y, 100));
  return out;
};

test('solver: a plain ladder is solvable and the path walks from entry to exit', () => {
  const r = solveSection({ id: 'ladder', platforms: ladder() }, { mode: 'any' });
  assert.equal(r.solvable, true);
  assert.ok(r.fastestSec > 2 && r.fastestSec < 12, 'fastest ' + r.fastestSec);
  assert.equal(r.path[0].from, 0);
  assert.equal(r.path[r.path.length - 1].to, 1);
  assert.deepEqual(r.margin, { timingMs: 0, xPx: 0 });
});

test('solver: an empty section is not solvable', () => {
  assert.equal(solveSection({ id: 'empty', platforms: [] }, { mode: 'any' }).solvable, false);
});

test('solver: spikes count as failure (a spike strip across the whole width blocks the way)', () => {
  assert.equal(solveSection({ id: 'blocked', platforms: [...ladder(), { x: 0, y: 400, w: 360, type: 'spike' }] }, { mode: 'any' }).solvable, false);
});

test('solver: springs launch, moving rafts are timed, walkways under a ceiling are walked', () => {
  // only a spring bridges 0 -> 300 (spring apex ~190 + air jump ~82); a ladder continues above
  const spring = { id: 's', platforms: [plat(150, 60, 60, { feature: 'spring' }), ...ladder(300)] };
  const rs = solveSection(spring, { mode: 'any' });
  assert.equal(rs.solvable, true);
  assert.ok(rs.path.some((st) => st.action === 'springAir'), 'used the spring');
  const noSpring = { id: 'n', platforms: spring.platforms.map((p) => ({ ...p, feature: undefined })) };
  assert.equal(solveSection(noSpring, { mode: 'any' }).solvable, false);
  // a moving raft is the only bridge across a full-width gap
  const raft = { id: 'r', platforms: [
    plat(310, 70, 45), { x: 152, y: 130, w: 56, type: 'moving', surface: 'normal', baseX: 152, range: 85, speed: 1.7, phase: 0 },
    plat(5, 190, 45), ...ladder(280),
  ] };
  const rr = solveSection(raft, { mode: 'any' });
  assert.equal(rr.solvable, true);
  assert.ok(rr.path.some((st) => st.to === 3), 'rode the raft');
  assert.equal(solveSection({ id: 'nr', platforms: raft.platforms.filter((p) => p.type !== 'moving') }, { mode: 'any' }).solvable, false);
});

test('solver: solvePlatforms accepts explicit start/goal indices', () => {
  const pl = [rest(0), rest(SECTION_H), plat(200, 80, 80)];
  assert.equal(solvePlatforms(pl, { startIndex: 0, goalIndex: 2, mode: 'any' }).solvable, true);
  assert.equal(solvePlatforms(pl, { startIndex: 0, goalIndex: 1, mode: 'any' }).solvable, false);
});

// Design targets for the solver-optimal clear time (default physics, mean of 3 moving-platform phases):
// tier 1 6-10 s, tier 2 10-16 s, tier 3 14-24 s. Measured values are in .superpowers/task-28-report.md.
const RANGE = { 1: [6, 10], 2: [10, 16], 3: [14, 24] };
// The open-air families (stones / drop / airjump / mixed) have no walkways to pad the route: their fastest route is
// bounded by the hop cadence (~0.5 s per single hop, ~0.8-1 s per double jump, ~7 hops), so their LOWER bounds are
// lower; difficulty there comes from timing and precision (hazards), not duration. Upper bounds are unchanged.
const OPEN_RANGE = { 1: [5, 10], 2: [5, 16], 3: [5, 24] };
const OPEN = ['stones', 'drop', 'airjump', 'mixed'];
test('every pattern is solvable with the default physics, the route is long (no double-jump shortcut) and its time fits its tier', () => {
  const by = { 1: [], 2: [], 3: [] };
  for (const s of SECTIONS) {
    const r = cache.section(s);
    assert.equal(r.solvable, true, `${s.id} ${s.name} unsolvable`);
    assert.equal(r.endsAtExit, true, s.id);
    const [lo, hi] = (OPEN.includes(s.family) ? OPEN_RANGE : RANGE)[s.tier];
    assert.ok(r.fastestSec >= lo && r.fastestSec <= hi, `${s.id} fastest ${r.fastestSec} not in tier ${s.tier} range ${lo}-${hi}`);
    assert.ok(r.steps >= (OPEN.includes(s.family) ? 7 : 10), `${s.id} route has only ${r.steps} steps`);   // open-air ladders: ~7 hops
    by[s.tier].push(r.fastestSec);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(by[1]) < mean(by[2]) && mean(by[2]) < mean(by[3]), `tier means ${mean(by[1])} ${mean(by[2])} ${mean(by[3])}`);
});
