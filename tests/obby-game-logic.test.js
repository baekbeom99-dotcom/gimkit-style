import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER, waterLevel, createJumpSchedule, JUMP_SCALES, JUMP_CYCLE_SEC, createShakeDrift, SHAKE, pickMutator,
  mutatorBanner, createMutatorRuntime, preparePlatforms, WIND_VX,
} from '../js/games/obby/mutators.js';
import {
  FAIL_SEC, createAttempts, beginAttempt, track, failAttempt, tickFail, isCleared, clearRun, sectionAt,
  metersAt, formatTime, saveBestTime, getBestTime, BEST_TIME_KEY, bestTimeKey,
} from '../js/games/obby/attempt.js';
import { buildTower, MUTATORS } from '../js/games/obby/tower.js';

function seeded(s) {
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

// ---- mutators ----
test('water: waits WATER.delay s 300px below the spawn, then rises at WATER.speed', () => {
  assert.equal(WATER.startBelow, 300);
  assert.equal(waterLevel(0, 0), -300);
  assert.equal(waterLevel(WATER.delay, 0), -300);
  assert.equal(waterLevel(WATER.delay + 10, 0), -300 + 10 * WATER.speed);
  assert.equal(waterLevel(WATER.delay + 1, 1000), 1000 - 300 + WATER.speed);
  // a competent climb (520px section in ~10 s) outpaces it comfortably
  assert.ok(WATER.speed * 10 < 520 * 0.6);
});

test('jump power: period 0 is 1.0, then a different scale every 10 s; deterministic with the rng; countdown', () => {
  const a = createJumpSchedule(seeded(3)), b = createJumpSchedule(seeded(3));
  assert.equal(JUMP_CYCLE_SEC, 10);
  assert.equal(a.at(0).scale, 1);
  let prev = a.at(0).scale;
  for (let i = 1; i < 30; i++) {
    const s = a.at(i * 10 + 0.5).scale;
    assert.ok(JUMP_SCALES.includes(s));
    assert.notEqual(s, prev);
    prev = s;
    assert.equal(b.at(i * 10 + 3).scale, s);
  }
  const j = a.at(12.5);
  assert.equal(j.index, 1);
  assert.ok(Math.abs(j.remaining - 7.5) < 1e-9);
  assert.equal(j.next, a.at(20).scale);
  assert.ok(Math.abs(a.at(0).remaining - 10) < 1e-9);
});

test('shake drift: vx stays within ±maxVx, re-rolled every interval; camera offset within amp', () => {
  const d = createShakeDrift(seeded(9));
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    d.update(1 / 60);
    assert.ok(Math.abs(d.vx) <= SHAKE.maxVx);
    seen.add(d.vx);
    const o = d.offset(i / 60);
    assert.ok(Math.abs(o.x) <= SHAKE.amp && Math.abs(o.y) <= SHAKE.amp);
  }
  // 10 s / 0.35 s ≈ 28 changes
  assert.ok(seen.size >= 25 && seen.size <= 31, String(seen.size));
  // constant within one interval
  const e = createShakeDrift(seeded(2));
  const v0 = e.vx; e.update(0.2); assert.equal(e.vx, v0); e.update(0.2); assert.notEqual(e.vx, v0);
});

test('mutator runtime: envs per kind', () => {
  assert.deepEqual(createMutatorRuntime('none').env(), {});
  assert.equal(createMutatorRuntime('lowgravity').env().gravityScale, 0.85);
  const w = createMutatorRuntime('wind', seeded(1));
  assert.equal(Math.abs(w.env().wind[0].vx), WIND_VX);
  assert.equal(w.env().wind[0].vx, w.windDir * 45);
  const s = createMutatorRuntime('shake', seeded(1));
  assert.ok(Math.abs(s.env().wind[0].vx) <= SHAKE.maxVx);
  const j = createMutatorRuntime('jumppower', seeded(4));
  assert.equal(j.env().jumpScale, 1);
  j.update(10.5);
  assert.notEqual(j.env().jumpScale, 1);
  j.reset();
  assert.equal(j.env().jumpScale, 1); // each attempt replays the same schedule
  const wa = createMutatorRuntime('water');
  assert.equal(wa.waterY(0), -300);
  wa.update(15);
  assert.equal(wa.waterY(0), -300 + 10 * WATER.speed);
  wa.reset();
  assert.equal(wa.waterY(0), -300);
  assert.equal(createMutatorRuntime('wind').waterY(0), -Infinity);
});

test('pickMutator covers every kind; banners use the metadata', () => {
  const rng = seeded(7), seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickMutator(rng));
  assert.deepEqual([...seen].sort(), MUTATORS.map((m) => m.kind).sort());
  const b = mutatorBanner('water');
  assert.equal(b.title, '🌊 물이 차올라요!');
  assert.equal(b.sub, MUTATORS.find((m) => m.kind === 'water').description);
  for (const m of MUTATORS) assert.ok(mutatorBanner(m.kind).title.startsWith(m.emoji));
  assert.equal(mutatorBanner('none'), null);
});

test('preparePlatforms: crumbleAll converts small normal platforms, keeps rests; others copy', () => {
  const t = buildTower(seeded(5), { mode: 'hard', mutator: 'crumbleAll' });
  const p = preparePlatforms('crumbleAll', t.platforms);
  assert.ok(p.some((q) => q.surface === 'crumble' && !q.rest));
  assert.ok(p.filter((q) => q.rest).every((q) => q.surface === 'normal'));
  const c = preparePlatforms('wind', t.platforms);
  assert.notEqual(c[0], t.platforms[0]);
  assert.deepEqual(c[0], t.platforms[0]);
});

// ---- attempt state machine ----
const towerP = () => buildTower(seeded(11), { mode: 'practice' });

test('attempts: idle -> playing -> failed -> playing; energy 0 -> needsQuiz before the next attempt', () => {
  const st = createAttempts({ mode: 'hard', tower: buildTower(seeded(1), { mode: 'hard' }) });
  assert.equal(st.phase, 'idle');
  assert.equal(beginAttempt(st, 5), 'start');
  assert.equal(st.phase, 'playing');
  assert.equal(st.attempts, 1);
  assert.equal(beginAttempt(st, 5), null); // no new attempt mid-climb
  const r = failAttempt(st, 'spike');
  assert.equal(st.phase, 'failed');
  assert.equal(r.reason, 'spike');
  assert.equal(tickFail(st, FAIL_SEC / 2), false);
  assert.equal(tickFail(st, FAIL_SEC / 2 + 0.01), true);
  assert.equal(beginAttempt(st, 0), 'quiz');
  assert.equal(st.phase, 'needsQuiz');
  assert.equal(st.attempts, 1);
  assert.equal(beginAttempt(st, 2), 'start');
  assert.equal(st.attempts, 2);
});

test('track: section progress, run best, and the fail summary', () => {
  const t = towerP();
  const st = createAttempts({ mode: 'hard', tower: t });
  beginAttempt(st, 5);
  track(st, { y: t.sections[2].y0 + 10 }, 0.5);
  assert.equal(st.attemptSection, 3);
  assert.equal(st.time, 0.5);
  const r = failAttempt(st, 'fall');
  assert.deepEqual([r.section, r.best], [3, 3]);
  assert.equal(r.meters, metersAt(t.sections[2].y0 + 10));
  beginAttempt(st, 5);
  assert.equal(st.attemptSection, 1);
  track(st, { y: 30 }, 0.5);
  const r2 = failAttempt(st, 'fall');
  assert.deepEqual([r2.section, r2.best], [1, 3]);
  assert.equal(st.runTime, 1);
  assert.equal(sectionAt(t.sections[0].y1 - 1, t.sections), 1);
  assert.equal(sectionAt(t.sections[0].y1, t.sections), 2); // standing on a rest = at the next section's entry
  assert.equal(sectionAt(t.height + 100, t.sections), 8);
});

test('checkpoints (practice): reached by height, respawn there; none in hard mode', () => {
  const t = towerP();
  const st = createAttempts({ mode: 'practice', tower: t });
  beginAttempt(st, 5);
  const cp = t.checkpoints[0];
  assert.deepEqual(track(st, { y: cp.y - 1 }, 0), []);
  // a jump that passes the checkpoint height counts even without landing on it
  assert.deepEqual(track(st, { y: cp.y + 3 }, 0), ['checkpoint']);
  assert.equal(st.respawn.y, cp.y);
  assert.equal(st.respawn.section, cp.section + 1);
  assert.equal(st.respawn.platformIndex, cp.platformIndex);
  failAttempt(st, 'fall');
  beginAttempt(st, 5);
  assert.equal(st.attemptMaxY, cp.y);
  assert.equal(st.attemptSection, cp.section + 1);
  assert.deepEqual(track(st, { y: cp.y + 3 }, 0), []); // not twice
  const h = createAttempts({ mode: 'hard', tower: buildTower(seeded(11), { mode: 'hard' }) });
  beginAttempt(h, 5);
  assert.deepEqual(track(h, { y: 3000 }, 0), []);
  assert.equal(h.respawn.y, 0);
});

test('clear detection: standing on the goal, or reaching the goal top within its span', () => {
  const t = towerP();
  const goal = t.platforms.find((p) => p.feature === 'goal');
  assert.ok(isCleared({ onGround: true, ground: goal, x: 0, y: 0, vy: 0 }, t));
  assert.ok(isCleared({ onGround: false, x: goal.x + 5, y: goal.y + 2, vy: -10 }, t));
  assert.ok(!isCleared({ onGround: false, x: goal.x + 5, y: goal.y + 2, vy: 200 }, t)); // still rising past it
  assert.ok(!isCleared({ onGround: false, x: goal.x + 5, y: goal.y - 30, vy: -10 }, t));
  assert.ok(!isCleared({ onGround: false, x: 5, y: goal.y + 2, vy: -10 }, t));
  const st = createAttempts({ mode: 'practice', tower: t });
  assert.equal(clearRun(st), false); // only while playing
  beginAttempt(st, 1);
  assert.equal(clearRun(st), true);
  assert.equal(st.phase, 'cleared');
  assert.equal(st.bestSection, 8);
  assert.equal(beginAttempt(st, 5), null);
});

test('formatTime and best clear time storage', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(151.9), '02:31');
  assert.equal(formatTime(3725), '62:05');
  assert.equal(formatTime(-3), '00:00');
  const s = memStore();
  assert.equal(getBestTime('hard', s), 0);
  assert.deepEqual(saveBestTime('hard', 100.4, s), { best: 100, prev: 0, isNew: true });
  assert.equal(s.m.get(BEST_TIME_KEY), '100');
  assert.deepEqual(saveBestTime('hard', 120, s), { best: 100, prev: 100, isNew: false });
  assert.deepEqual(saveBestTime('hard', 90, s), { best: 90, prev: 100, isNew: true });
  assert.equal(bestTimeKey('practice'), BEST_TIME_KEY + ':practice');
  assert.equal(saveBestTime('practice', 300, s).isNew, true);
  assert.equal(getBestTime('hard', s), 90);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(getBestTime('hard', broken), 0);
  assert.equal(saveBestTime('hard', 50, broken).isNew, true);
});
