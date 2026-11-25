// 못깨는 타워: elimination hazards (lava / laser / saw / crusher) and the open-air families (stones / drop / airjump /
// mixed): physics unit tests (touching kills, timing windows, positions deterministic from the world clock), the solver
// clock, and structural proofs for the new skeletons (the 'drop' routes really need the air-jump press mid-fall).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepPlayer, createPlayer, SPIKE_H } from '../js/games/jump/world.js';
import {
  applyHazard, updateHazards, laserIsOn, crusherY, crusherUpTime, touchesHazard, hitReason, hazardCycle, isDynamicHazard,
  LASER_WARN, CRUSHER_FALL, CRUSHER_DOWN, CRUSHER_RISE, CRUSHER_WARN, HAZARD_KINDS,
} from '../js/games/obby/hazards.js';
import { LAVA, LASER_H, LASER_V, SAW_X, SAW_Y, CRUSH } from '../js/games/obby/families.js';
import { SECTIONS, mirrorPattern, familyGroup } from '../js/games/obby/sections.js';
import { solvePlatforms, solveSection, solveSectionRobust } from '../js/games/obby/solver.js';
import { solverCache } from './obby-cache.mjs';

const cache = solverCache('hazards');
const DT = 1 / 60;
const FLOOR = { x: 0, y: 0, w: 360, type: 'static', surface: 'normal' };
const copy = (h) => ({ ...h });
// a player standing on the floor at x, one tick of idle physics against `plats`
function tickAt(x, y, plats, onGround = true) {
  const s = createPlayer(x, y);
  if (onGround) { s.onGround = true; s.ground = plats[0]; }
  return stepPlayer(s, {}, DT, plats, {}).events;
}

test('hazard kinds: lava / laser / saw / crusher exist next to the plain spike', () => {
  assert.deepEqual([...HAZARD_KINDS], ['lava', 'laser', 'saw', 'crusher']);
  for (const h of [LAVA(50, 150), LASER_H(50, 150, 10, 2, 1), LASER_V(100, 0, 80, 2, 1), SAW_X(100, 0, 40, 2), SAW_Y(100, 0, 40, 2), CRUSH(100, 50, 12, 70, 3)]) {
    assert.equal(h.type, 'spike', 'every hazard is a spike entry: touching = the attempt ends');
    assert.ok(HAZARD_KINDS.includes(h.hz));
  }
});

test('touching a hazard ends the attempt (hit); a switched-off laser and anything out of reach are harmless', () => {
  const lava = LAVA(100, 200, 0, 14), laser = copy(LASER_H(100, 200, 10, 2, 1)), saw = SAW_X(150, 0, 0.0001, 2);
  const crusher = CRUSH(150, 60, 6, 70, 3);
  applyHazard(laser, 0);                       // t = 0: on
  assert.equal(laser.off, false);
  for (const h of [lava, laser, saw]) {
    assert.ok(tickAt(150, 0, [FLOOR, h]).includes('hit'), h.hz + ' kills a standing player');
    assert.ok(touchesHazard({ x: 150, y: 0 }, h));
    assert.equal(hitReason({ x: 150, y: 0 }, [FLOOR, h]), h.hz);
    assert.ok(!tickAt(40, 0, [FLOOR, h]).includes('hit'), h.hz + ' is local');
  }
  const slam = copy(crusher); slam.y0 = 6; slam.y = 6;               // slammed down: the block is 6..40 over the floor
  assert.ok(tickAt(150, 0, [FLOOR, slam]).includes('hit'));
  assert.equal(hitReason({ x: 150, y: 0 }, [FLOOR, slam]), 'crusher');
  const up = copy(crusher); up.y0 = 6; up.y = 76;                    // raised: 76..110, 46px over the head
  assert.ok(!tickAt(150, 0, [FLOOR, up]).includes('hit'));
  laser.off = true;                                                  // off = harmless
  assert.ok(!tickAt(150, 0, [FLOOR, laser]).includes('hit'));
  assert.equal(hitReason({ x: 150, y: 0 }, [FLOOR, laser]), 'spike', 'no hazard touched -> the spike default');
  // the hitbox height is the hazard's own `h` (default SPIKE_H), measured from its y
  const tall = { x: 100, y: 0, w: 100, h: 60, type: 'spike', hz: 'lava' };
  assert.ok(stepPlayer(createPlayer(150, 59.9), {}, 0, [FLOOR, tall], {}).events.includes('hit'), 'feet 0.1px inside the 60px hazard');
  assert.ok(!stepPlayer(createPlayer(150, 60.5), {}, 0, [FLOOR, tall], {}).events.includes('hit'), 'feet above the hazard top');
  assert.ok(SPIKE_H < 60);
});

test('a plain spike behaves exactly as before (no h / off fields)', () => {
  const sp = { x: 100, y: 0, w: 40, type: 'spike' };
  assert.ok(stepPlayer(createPlayer(120, 0), {}, 0, [FLOOR, sp], {}).events.includes('hit'));
  assert.ok(!stepPlayer(createPlayer(120, SPIKE_H + 0.1), {}, 0, [FLOOR, sp], {}).events.includes('hit'));
});

test('laser: on for `on` seconds of every `period` (world clock + phase), warning just before it fires', () => {
  const L = { ...LASER_V(100, 0, 80, 2.6, 1.0, 0.3) };
  for (let t = 0; t < 8; t += 0.05) {
    const c = (((t + 0.3) % 2.6) + 2.6) % 2.6;
    assert.equal(laserIsOn(L, t), c < 1.0, 't=' + t);
    const w = copy(L); applyHazard(w, t);
    assert.equal(w.off, !(c < 1.0));
    assert.equal(w.warn, c >= 2.6 - LASER_WARN && c >= 1.0, 'warn window ' + t);
  }
  // exact boundaries: on [0, 1.0), off [1.0, 2.6)
  const edge = { ...L, phase: 0 };
  assert.equal(laserIsOn(edge, 0.999), true);
  assert.equal(laserIsOn(edge, 1.0), false);
  assert.equal(laserIsOn(edge, 2.6), true);
  assert.equal(hazardCycle(L), 2.6);
});

test('saw: the position is a pure function of the clock (x or y patrol), periodic, mirrored saws mirror', () => {
  const sx = SAW_X(150, 40, 50, 2, 0.4), sy = SAW_Y(150, 100, 40, 2, 1.0);
  for (const t of [0, 0.37, 1.9, 5.5]) {
    const a = copy(sx); applyHazard(a, t);
    assert.ok(Math.abs(a.x - (sx.baseX + Math.sin(t * 2 + 0.4) * 50)) < 1e-9);
    assert.equal(a.y, 40);
    const b = copy(sy); applyHazard(b, t);
    assert.ok(Math.abs(b.y - (100 + Math.sin(t * 2 + 1.0) * 40)) < 1e-9);
    assert.equal(b.x, sy.x);
    // order independent: advancing 0 -> t in steps equals jumping straight to t
    const c = copy(sx); for (let u = 0; u <= t; u += 0.1) applyHazard(c, u); applyHazard(c, t);
    assert.ok(Math.abs(c.x - a.x) < 1e-9);
    const p = copy(sx); applyHazard(p, t + hazardCycle(sx));
    assert.ok(Math.abs(p.x - a.x) < 1e-6, 'periodic');
  }
  assert.ok(isDynamicHazard(sx) && isDynamicHazard(sy) && !isDynamicHazard(LAVA(0, 50)));
  const sec = SECTIONS.find((s) => s.platforms.some((p) => p.hz === 'saw' && p.axis === 'x'));
  assert.ok(sec, 'a pattern with a horizontal saw exists');
  const m = mirrorPattern(sec);
  const i = sec.platforms.findIndex((p) => p.hz === 'saw' && p.axis === 'x');
  const o = copy(sec.platforms[i]), q = copy(m.platforms[i]);
  applyHazard(o, 1.3); applyHazard(q, 1.3);
  assert.ok(Math.abs(q.x - (360 - o.x - o.w)) < 1e-9);
});

test('crusher: raised, falls fast, stays down, rises slowly; lethal height only while it is low', () => {
  const C = CRUSH(150, 60, 12, 70, 3, 0.2);
  const up = crusherUpTime(C);
  assert.ok(Math.abs(up + CRUSHER_FALL + CRUSHER_DOWN + CRUSHER_RISE - 3) < 1e-9);
  const at = (t) => crusherY({ y: 12, rise: 70, period: 3, phase: 0.2 }, t);
  assert.equal(at(-0.2 + 0.0001) > 81.9, true, 'raised at the start of the cycle');
  assert.equal(at(-0.2 + up - 0.01) > 81.9, true);
  assert.ok(at(-0.2 + up + CRUSHER_FALL / 2) < 82 && at(-0.2 + up + CRUSHER_FALL / 2) > 12, 'falling');
  assert.equal(at(-0.2 + up + CRUSHER_FALL + CRUSHER_DOWN / 2), 12, 'slammed down');
  assert.ok(at(-0.2 + up + CRUSHER_FALL + CRUSHER_DOWN + CRUSHER_RISE / 2) > 12 && at(-0.2 + up + CRUSHER_FALL + CRUSHER_DOWN + CRUSHER_RISE / 2) < 82, 'rising');
  for (let t = 0; t < 7; t += 0.013) { const y = at(t); assert.ok(y >= 12 - 1e-9 && y <= 82 + 1e-9); assert.ok(Math.abs(at(t + 3) - y) < 1e-9, 'periodic'); }
  // warning: shaking for CRUSHER_WARN before the fall; the walker is safe under it while it is raised, dead under it when slammed
  const w = copy(C); applyHazard(w, -0.2 + up - CRUSHER_WARN / 2); assert.equal(w.warn, true);
  const w2 = copy(C); applyHazard(w2, -0.2 + 0.5); assert.equal(w2.warn, false);
  const walker = (t) => { const h = copy(C); applyHazard(h, t); return tickAt(150, 0, [FLOOR, h]).includes('hit'); };
  assert.equal(walker(-0.2 + up - 0.2), false);
  assert.equal(walker(-0.2 + up + CRUSHER_FALL + 0.1), true);
  assert.equal(walker(-0.2 + up + CRUSHER_FALL + CRUSHER_DOWN + CRUSHER_RISE - 0.02), false, 'back up (head room again)');
});

test('updateHazards advances every dynamic hazard of a platform list, leaves lava / spikes alone', () => {
  const list = [FLOOR, { ...LASER_V(50, 0, 80, 2, 0.5) }, SAW_X(200, 30, 40, 2), LAVA(0, 40), { x: 0, y: 0, w: 10, type: 'spike' }, CRUSH(300, 40, 12, 60, 3)];
  updateHazards(list, 1.2);
  assert.equal(list[1].off, true);
  assert.ok(Math.abs(list[2].x - (list[2].baseX + Math.sin(2.4) * 40)) < 1e-9);
  assert.equal(list[3].off, undefined);
  assert.equal(list[4].off, undefined);
  assert.ok(list[5].y >= 12);
});

test('solver world clock: a laser gate on the only walkway is waited out (off window), never crossed while on', () => {
  // start platform and goal platform joined by a 4px joint at x 120..124; a (tall) vertical laser (on 1.5 s of every 2.6 s) stands in the joint
  const start = { x: 20, y: 0, w: 100, type: 'static', surface: 'normal' }, goal = { x: 124, y: 0, w: 100, type: 'static', surface: 'normal' };
  const beam = LASER_V(122, 0, 220, 2.6, 1.5, 0);   // 220px tall: no jumping over it
  const plats = [start, goal, beam];
  const onNow = solvePlatforms(plats, { startIndex: 0, goalIndex: 1, startTimes: [0], startX: 100 });
  const offNow = solvePlatforms(plats, { startIndex: 0, goalIndex: 1, startTimes: [1.7], startX: 100 });
  assert.equal(onNow.solvable, true);
  assert.equal(offNow.solvable, true);
  assert.ok(onNow.fastestSec >= 1.45, 'waits for the off window ' + onNow.fastestSec);
  assert.ok(offNow.fastestSec < 0.8, 'crosses at once ' + offNow.fastestSec);
  // the game loop (index.js order: clock += h, updateHazards, stepPlayer) agrees: walking into the joint at t ~ 1.0 is a hit, at t ~ 1.9 it is not
  const walk = (t0) => {
    const g = createPlayer(100, 0); g.onGround = true; g.ground = start;
    const b = copy(beam); let t = t0, hit = false;
    for (let i = 0; i < 60; i++) { t += DT; updateHazards([b], t); if (stepPlayer(g, { right: true }, DT, [start, goal, b], {}).events.includes('hit')) hit = true; }
    return hit;
  };
  assert.equal(walk(0.2), true);
  assert.equal(walk(1.7), false);
});

test('solver world clock: periods that do not divide each other still solve (time-binned)', () => {
  const start = { x: 20, y: 0, w: 100, type: 'static', surface: 'normal' }, goal = { x: 124, y: 0, w: 100, type: 'static', surface: 'normal' };
  const odd = [start, goal, LASER_V(122, 0, 60, 2.3, 1.0, 0), LASER_V(122, 80, 90, 3.1, 1.0, 0)];
  assert.equal(solvePlatforms(odd, { mode: 'any' }).solvable, true);
});

// ------------------------------------------------------------------ the new skeleton families
const OPEN = ['stones', 'drop', 'airjump', 'mixed'];
const open = SECTIONS.filter((s) => OPEN.includes(s.family));

test('families: stones / drop / airjump / mixed have 3+ patterns each, spread over tiers 1-3, ids unique, group = family', () => {
  for (const f of OPEN) {
    const ps = SECTIONS.filter((s) => s.family === f);
    assert.ok(ps.length >= 4, f + ' ' + ps.length);
    for (const tier of [1, 2, 3]) assert.ok(ps.some((s) => s.tier === tier), `${f} has a tier ${tier}`);
    assert.equal(familyGroup(f), f);
  }
  assert.equal(familyGroup('slab-edge'), 'slab');
  assert.equal(familyGroup('switchback'), 'switchback');
  assert.ok(open.some((s) => s.finalGate), 'an open-air final gate exists');
});

test('hazards in the new families: every pattern uses one, all four kinds appear, lava pits under stones / drop shafts', () => {
  const kinds = new Set();
  for (const s of open) {
    const hz = new Set(s.platforms.filter((p) => p.hz).map((p) => p.hz));
    hz.forEach((k) => kinds.add(k));
    assert.ok(hz.size >= 1, s.id + ' has a hazard');
    if (s.tier === 3) assert.ok(hz.size >= 2 || s.family === 'drop', s.id + ' tier 3 mixes hazards');
  }
  assert.deepEqual([...kinds].sort(), [...HAZARD_KINDS].sort());
  for (const s of SECTIONS.filter((q) => q.family === 'stones' || q.family === 'drop')) assert.ok(s.platforms.some((p) => p.hz === 'lava'), s.id + ' lava');
  // timed hazards of one pattern share a period or divide the longest (so the solver bins the clock, not 0.25 s steps)
  for (const s of open) {
    const cycles = s.platforms.filter(isDynamicHazard).map(hazardCycle).concat(s.platforms.filter((p) => p.type === 'moving').map((p) => (2 * Math.PI) / p.speed));
    if (!cycles.length) continue;
    const L = Math.max(...cycles);
    for (const c of cycles) assert.ok(Math.abs(L / c - Math.round(L / c)) < 1e-3, `${s.id}: cycle ${c} vs ${L}`);
  }
});

test('drop / mixed: the fastest route walks off the hooded edge and presses jump mid-fall; without the press nothing is clearable', () => {
  const dropish = open.filter((s) => s.family === 'drop' || s.family === 'mixed');
  assert.ok(dropish.length >= 8);
  for (const s of dropish) {
    const edges = s.platforms.filter((p) => p.dropEdge);
    assert.equal(edges.length, 1, s.id);
    const r = solveSection(s, { mode: 'any' });
    assert.equal(r.solvable, true, s.id);
    const drops = r.path.filter((st) => st.macro.type === 'drop' && st.macro.dj != null);
    assert.ok(drops.length >= 1, `${s.id}: the route uses a mid-fall air jump`);
    for (const d of drops) assert.ok(d.macro.dj >= 6, 'the press comes after the coyote time: a real AIR jump while falling');
    const no = cache.section(s, { mode: 'any', noDrop: true });
    assert.equal(no.solvable, false, `${s.id}: solvable without drop macros (walk-off falls + jumps alone)`);
    // the edge is hooded: a spike ceiling and pillar sit on it, so jumping off is not an option
    assert.ok(s.platforms.some((p) => p.ceiling), s.id + ' hood');
    assert.ok(s.platforms.some((p) => p.wall), s.id + ' pillar');
  }
});

test('drop: a plain walk-off fall (no press) from the edge ends in lava / below the shaft, never on the exit side', () => {
  const s = SECTIONS.find((q) => q.id === 't1-16');
  const E = s.platforms.find((p) => p.dropEdge);
  const plats = [FLOOR, ...s.platforms].map((p) => ({ ...p }));
  const g = createPlayer(E.x + 20, E.y); g.onGround = true; g.ground = plats.find((p) => p.dropEdge);
  let died = false, landedHigh = false;
  for (let i = 0; i < 300; i++) {
    const ev = stepPlayer(g, { right: i < 200 }, DT, plats.map((p) => p), {}).events;
    if (ev.includes('hit')) { died = true; break; }
    if (g.onGround && g.ground !== plats.find((p) => p.dropEdge) && g.y > E.y - 100) landedHigh = true;
    if (g.y < E.y - 400) break;
  }
  assert.equal(landedHigh, false, 'no ledge catches a plain fall');
  assert.ok(died || g.y < E.y - 100, 'it burns in the lava or keeps falling');
});

test('open-air patterns: robust (timing jitter) routes exist for the hazard timing', () => {
  for (const s of open.filter((q) => q.tier === 1)) {
    const r = cache.robust(s, { jitter: { timingMs: 80, xPx: 8 }, mode: 'any' });
    assert.equal(r.solvable, true, s.id);
  }
});

test('the gates of the stones / airjump patterns can be waited out: the solver margin report for a gate pattern', () => {
  const s = SECTIONS.find((q) => q.id === 't1-15');
  const r = solveSectionRobust(s, { jitter: { timingMs: 80, xPx: 8 }, mode: 'any' });
  assert.equal(r.solvable, true);
  assert.deepEqual(r.margin, { timingMs: 80, xPx: 8 });
});

test('rendering: every hazard state (laser on / off / warning, saws, a slammed and a raised crusher, lava) draws without errors', async () => {
  const { drawPlatform } = await import('../js/games/obby/render.js');
  const drawn = [];
  const g = new Proxy({}, {
    get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { drawn.push(String(k)); return undefined; }),
    set: () => true,
  });
  const laser = copy(LASER_V(100, 0, 80, 2.6, 1.0, 0));
  const list = [LAVA(10, 100), laser, copy(LASER_H(10, 100, 10, 2, 1)), SAW_X(150, 10, 40, 2), SAW_Y(150, 60, 30, 2), CRUSH(200, 56, 12, 70, 3)];
  for (const t of [0, 0.5, 1.2, 2.4, 2.6]) {
    updateHazards(list, t);
    for (const p of list) drawPlatform(g, p, 300, t);
  }
  assert.ok(drawn.length > 200);
  for (const p of list) assert.doesNotThrow(() => drawPlatform(g, p, -50, 1));
});
