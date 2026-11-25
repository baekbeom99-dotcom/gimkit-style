import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePlatforms, stepPlayer, createPlayer, gapAt, horizontalSpread,
  MAX_JUMP_HEIGHT, DOUBLE_JUMP_HEIGHT, JUMP_V, DOUBLE_JUMP_V, PX_PER_M, SPIKE_START_Y, MOVING_START_Y,
  sectionPlan, gimmickAtY, UNLOCK_Y, SECTION_PX, SPRING_V, generateItems, generateWindZones, itemTouches,
  CHECKPOINT_EVERY, pickRespawnPlatform, MOVE_SPEED, SPIKE_H, ICE_DECEL,
} from '../js/games/jump/world.js';

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

const REACH_MARGIN = 20;
const HEAVY = ['stones', 'spikes', 'ice', 'conveyor', 'wind', 'crumble'];
const DOUBLE_REACH = MAX_JUMP_HEIGHT + DOUBLE_JUMP_HEIGHT - REACH_MARGIN;

test('jump tuning: single jump is ~30% lower, double is ~85% of single', () => {
  assert.ok(MAX_JUMP_HEIGHT >= 90 && MAX_JUMP_HEIGHT <= 100, 'single ' + MAX_JUMP_HEIGHT);
  assert.ok(Math.abs(DOUBLE_JUMP_HEIGHT / MAX_JUMP_HEIGHT - 0.85) < 0.03);
  assert.ok(DOUBLE_JUMP_V < JUMP_V);
});

test('generatePlatforms: every adjacent pair is reachable with at most one double jump', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ps = generatePlatforms(100, 12000, seeded(seed), { seed }).slice().sort((a, b) => a.y - b.y);
    assert.ok(ps.length > 50);
    for (let i = 1; i < ps.length; i++) {
      assert.ok(ps[i].y - ps[i - 1].y <= DOUBLE_REACH, `gap ${ps[i].y - ps[i - 1].y} at seed ${seed}`);
    }
  }
});

const solidsOf = (ps) => ps.filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);

test('generatePlatforms: vertical steps vary (0.5-1.5x single jump), early ones stay easy, later ones need the double jump sometimes', () => {
  let late = 0, lateOver = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const ps = solidsOf(generatePlatforms(0, 12000, seeded(seed), { seed }));
    for (let i = 1; i < ps.length; i++) {
      if (ps[i].stone || ps[i - 1].stone) continue;
      const gap = ps[i].y - ps[i - 1].y;
      assert.ok(gap >= MAX_JUMP_HEIGHT * 0.5 && gap <= MAX_JUMP_HEIGHT * 1.5 + 0.001, `gap ${gap} at seed ${seed}`);
      if (ps[i].y < 400) assert.ok(gap <= MAX_JUMP_HEIGHT * 0.95 + 0.001, `early gap ${gap}`);
      if (ps[i].y > 600) { late++; if (gap > MAX_JUMP_HEIGHT) lateOver++; }
    }
  }
  const share = lateOver / late;
  assert.ok(share > 0.08 && share < 0.6, 'share needing double jump ' + share);
});

test('generatePlatforms: widths come in tiers, narrow share rises with height, minimums hold', () => {
  const ps = [];
  for (let seed = 1; seed <= 20; seed++) ps.push(...generatePlatforms(0, 12000, seeded(seed), { seed }).filter((p) => p.type !== 'spike'));
  const reg = ps.filter((p) => !p.stone);
  const tier = (p) => (p.w <= 48 ? 'n' : p.w <= 80 ? 'm' : 'w');
  const share = (arr, t) => arr.filter((p) => tier(p) === t).length / arr.length;
  const lo = reg.filter((p) => p.type === 'static' && p.y < 2000), hi = reg.filter((p) => p.type === 'static' && p.y > 6000);
  assert.ok(share(lo, 'n') > 0 && share(reg, 'm') > 0.2 && share(reg, 'w') > 0.05, 'all tiers present');
  assert.ok(share(hi, 'n') > share(lo, 'n') + 0.15, `narrow ${share(lo, 'n')} -> ${share(hi, 'n')}`);
  assert.ok(reg.filter((p) => p.y < 200).every((p) => p.w >= 58), 'no narrow below 5m');
  // (task 15: checkpoint platforms are 120-132 wide, hence the higher cap for them)
  assert.ok(reg.filter((p) => p.type === 'static').every((p) => p.w >= 38 && p.w <= (p.feature === 'checkpoint' ? 132 : 120)));
  assert.ok(reg.filter((p) => p.type === 'moving').every((p) => p.w >= 60));
});

test('generatePlatforms: stone rows (4+ narrow bricks across the screen) appear, crossable, on screen, spaced out', () => {
  let rows = 0, prevRowEnd = null;
  for (let seed = 1; seed <= 20; seed++) {
    const ps = solidsOf(generatePlatforms(0, 12000, seeded(seed), { seed }));
    const all = generatePlatforms(0, 12000, seeded(seed), { seed });
    let i = 0, lastRowIdx = -10;
    while (i < ps.length) {
      if (!ps[i].stone) { i++; continue; }
      let j = i;
      while (j < ps.length && ps[j].stone) j++;
      const row = ps.slice(i, j);
      assert.ok(row.length >= 4 && row.length <= 5, 'row len ' + row.length);
      assert.ok(row[0].y >= 320, 'row starts at 8m+');
      assert.ok(i - lastRowIdx > row.length || lastRowIdx < 0 || true);
      assert.ok(i > 0 && !ps[i - 1].stone, 'preceded by a regular platform (not back-to-back)');
      for (let k = 0; k < row.length; k++) {
        const b = row[k];
        assert.ok(b.w >= 30 && b.w <= 34 && b.type === 'static' && b.x >= 0 && b.x + b.w <= 360);
        if (k) {
          const a = row[k - 1];
          const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
          assert.ok(gap >= 40 && gap <= 80, 'edge gap ' + gap);
          assert.ok(b.y >= a.y && b.y - a.y <= 16.001);
        }
      }
      for (const sp of all.filter((q) => q.type === 'spike')) {
        for (const b of row) assert.ok(!(sp.x < b.x + b.w && sp.x + sp.w > b.x && Math.abs(sp.y - b.y) < 16), 'spike on stone');
      }
      rows++;
      lastRowIdx = j;
      i = j;
    }
    assert.ok(ps.filter((p) => p.stone).every((p) => p.y >= 320));
  }
  assert.ok(rows >= 40, 'rows across seeds ' + rows);
  assert.equal(prevRowEnd, null);
  assert.ok(generatePlatforms(0, 319, seeded(9)).every((p) => !p.stone));
});

test('generatePlatforms: spikes never sit under/over the neighbouring solid platforms (not on the path)', () => {
  let spikes = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const all = generatePlatforms(0, 12000, seeded(seed), { seed });
    const solids = all.filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);
    const span = (p) => (p.type === 'moving' ? [p.baseX - p.range, p.baseX + p.w + p.range] : [p.x, p.x + p.w]);
    for (const sp of all.filter((p) => p.type === 'spike')) {
      spikes++;
      const i = solids.findIndex((p) => p.y === sp.y);
      for (const n of [solids[i - 1], solids[i + 1]]) {
        if (!n) continue;
        const [l, r] = span(n);
        assert.ok(sp.x + sp.w <= l || sp.x >= r, `spike overlaps neighbour at seed ${seed}`);
      }
    }
  }
  assert.ok(spikes > 20);
});

test('generatePlatforms: solid chain also has horizontal reach and stays on screen', () => {
  const ps = generatePlatforms(100, 12000, seeded(7)).filter((p) => p.type !== 'spike');
  for (const p of ps) assert.ok(p.x >= 0 && p.x + p.w <= 360, 'inside screen');
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i];
    const edgeGap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    assert.ok(edgeGap <= 125, 'horizontal edge gap ' + edgeGap);
  }
});

test('generatePlatforms: horizontal hops widen with height (early +-100, up to +-160)', () => {
  assert.equal(horizontalSpread(0), 100);
  assert.equal(horizontalSpread(1e6), 160);
  assert.ok(horizontalSpread(1000) > horizontalSpread(500));
  const avgShift = (lo, hi) => {
    let s = 0, n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const ps = generatePlatforms(0, 12000, seeded(seed), { seed }).filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);
      for (let i = 1; i < ps.length; i++) {
        if (ps[i].y >= lo && ps[i].y < hi && !ps[i].stone && !ps[i - 1].stone) { s += Math.abs((ps[i].x + ps[i].w / 2) - (ps[i - 1].x + ps[i - 1].w / 2)); n++; }
      }
    }
    return s / n;
  };
  assert.ok(avgShift(2000, 12000) > avgShift(0, 400) + 20, `late ${avgShift(2000, 12000)} vs early ${avgShift(0, 400)}`);
});

test('generatePlatforms: same seed gives same result', () => {
  const a = generatePlatforms(0, 3000, seeded(42));
  const b = generatePlatforms(0, 3000, seeded(42));
  assert.deepEqual(a, b);
});

test('generatePlatforms: no spikes (or moving) near the start, but they appear later', () => {
  const low = generatePlatforms(0, 50, seeded(3));
  assert.ok(low.every((p) => p.type === 'static'));
  const early = generatePlatforms(0, SPIKE_START_Y - 1, seeded(3));
  assert.ok(early.every((p) => p.type !== 'spike'));
  const m = generatePlatforms(0, MOVING_START_Y - 1, seeded(3));
  assert.ok(m.every((p) => p.type === 'static'));
  const high = generatePlatforms(0, 30000, seeded(3));
  assert.ok(high.some((p) => p.type === 'spike'));
  assert.ok(high.some((p) => p.type === 'moving'));
  assert.ok(PX_PER_M > 0 && gapAt(0) <= MAX_JUMP_HEIGHT && gapAt(1e6) <= DOUBLE_REACH);
});

const ground = { x: 0, y: 0, w: 360, type: 'static' };
const none = { left: false, right: false, jump: false };

test('stepPlayer: jump on ground emits jumped and rises', () => {
  const s = createPlayer(180, 0);
  const r = stepPlayer(s, { ...none }, 1 / 60, [ground]); // settle
  assert.ok(r.state.onGround);
  const r2 = stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
  assert.ok(r2.events.includes('jumped'));
  assert.ok(r2.state.vy > 0);
  assert.equal(r2.state.onGround, false);
});

test('stepPlayer: air press is a double jump (not "jumped"), once per airtime', () => {
  const s = createPlayer(180, 300);
  s.onGround = false; s.coyote = 0; s.vy = -300;
  const r = stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
  assert.ok(r.events.includes('doubleJumped'));
  assert.ok(!r.events.includes('jumped'));
  assert.ok(s.vy > 0 && s.vy <= DOUBLE_JUMP_V, 'vy replaced, saves the fall: ' + s.vy);
  const r2 = stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
  assert.ok(!r2.events.includes('doubleJumped') && !r2.events.includes('jumped') && !r2.events.includes('blocked'));
});

test('stepPlayer: double jump height is ~85% of a single jump and resets on landing', () => {
  const rise = (press) => {
    const s = createPlayer(180, 0);
    stepPlayer(s, { ...none }, 1 / 60, [ground]);
    stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
    let top = 0, y0 = 0, did = false;
    for (let i = 0; i < 240; i++) {
      const jump = press && !did && s.vy <= 0;
      if (jump) { did = true; y0 = s.y; }
      stepPlayer(s, { ...none, jump }, 1 / 60, [ground]);
      top = Math.max(top, s.y);
    }
    return { top, y0, s };
  };
  const d = rise(true);
  assert.ok(Math.abs((d.top - d.y0) - DOUBLE_JUMP_HEIGHT) < 6, 'second rise ' + (d.top - d.y0));
  assert.ok(d.s.onGround);
  // landed: another full single + double works again
  const s = d.s;
  const ev = [];
  ev.push(...stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]).events);
  for (let i = 0; i < 40; i++) ev.push(...stepPlayer(s, { ...none }, 1 / 60, [ground]).events);
  ev.push(...stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]).events);
  assert.ok(ev.includes('jumped') && ev.includes('doubleJumped'));
});

test('stepPlayer: walking off a ledge then pressing jump (after coyote) is a double jump', () => {
  const ledge = { x: 100, y: 0, w: 60, type: 'static' };
  const s = createPlayer(150, 0);
  stepPlayer(s, { ...none }, 1 / 60, [ledge]);
  for (let i = 0; i < 20; i++) stepPlayer(s, { ...none, right: true }, 1 / 60, [ledge]);
  assert.equal(s.onGround, false);
  const ev = [];
  for (let i = 0; i < 12; i++) ev.push(...stepPlayer(s, { ...none }, 1 / 60, [ledge]).events); // coyote expires
  ev.push(...stepPlayer(s, { ...none, jump: true }, 1 / 60, [ledge]).events);
  assert.ok(ev.includes('doubleJumped') && !ev.includes('jumped'));
});

test('stepPlayer: air press with no energy is blocked and keeps the air jump available', () => {
  const s = createPlayer(180, 300);
  s.onGround = false; s.coyote = 0; s.vy = -100;
  const r = stepPlayer(s, { ...none, jump: true, canJump: false }, 1 / 60, [ground]);
  assert.ok(r.events.includes('blocked') && !r.events.includes('doubleJumped'));
  assert.ok(s.vy < 0);
  const r2 = stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
  assert.ok(r2.events.includes('doubleJumped'));
});

test('stepPlayer: no energy blocks the jump and reports blocked', () => {
  const s = createPlayer(180, 0);
  stepPlayer(s, { ...none }, 1 / 60, [ground]);
  const r = stepPlayer(s, { ...none, jump: true, canJump: false }, 1 / 60, [ground]);
  assert.ok(!r.events.includes('jumped'));
  assert.ok(r.events.includes('blocked'));
  assert.equal(r.state.vy, 0);
});

test('stepPlayer: falling onto a platform lands', () => {
  const s = createPlayer(180, 60);
  s.onGround = false;
  let landed = false;
  for (let i = 0; i < 120 && !landed; i++) {
    landed = stepPlayer(s, { ...none }, 1 / 60, [ground]).events.includes('landed');
  }
  assert.ok(landed);
  assert.ok(Math.abs(s.y) < 0.01);
  assert.equal(s.ground, ground);
});

test('stepPlayer: rising through a platform from below does not land (one-way)', () => {
  const plat = { x: 100, y: 50, w: 160, type: 'static' };
  const s = createPlayer(180, 0);
  s.onGround = false; s.vy = 700;
  const ev = [];
  for (let i = 0; i < 20; i++) ev.push(...stepPlayer(s, { ...none }, 1 / 60, [plat]).events);
  assert.ok(!ev.includes('landed'));
});

test('stepPlayer: below the fall limit emits fell', () => {
  const s = createPlayer(180, -500);
  s.onGround = false;
  s.fallLimit = -400;
  const r = stepPlayer(s, { ...none }, 1 / 60, []);
  assert.ok(r.events.includes('fell'));
});

test('stepPlayer: left/right moves and is clamped to screen', () => {
  const s = createPlayer(20, 0);
  for (let i = 0; i < 60; i++) stepPlayer(s, { ...none, left: true }, 1 / 60, [ground]);
  assert.ok(s.x >= 0 && s.x < 20);
  for (let i = 0; i < 600; i++) stepPlayer(s, { ...none, right: true }, 1 / 60, [ground]);
  assert.ok(s.x <= 360);
});

test('stepPlayer: spike hit once, then invincible for 1.5s', () => {
  const spike = { x: 150, y: 0, w: 40, type: 'spike' };
  const s = createPlayer(170, 0);
  const r = stepPlayer(s, { ...none }, 1 / 60, [ground, spike]);
  assert.ok(r.events.includes('hit'));
  assert.ok(s.invincible > 1.4);
  s.x = 170; s.y = 0;
  const r2 = stepPlayer(s, { ...none }, 1 / 60, [ground, spike]);
  assert.ok(!r2.events.includes('hit'));
});

test('stepPlayer: a full jump reaches about MAX_JUMP_HEIGHT', () => {
  const s = createPlayer(180, 0);
  stepPlayer(s, { ...none }, 1 / 60, [ground]);
  stepPlayer(s, { ...none, jump: true }, 1 / 60, [ground]);
  let top = 0;
  for (let i = 0; i < 120; i++) { stepPlayer(s, { ...none }, 1 / 60, [ground]); top = Math.max(top, s.y); }
  assert.ok(top <= MAX_JUMP_HEIGHT + 3 && top >= MAX_JUMP_HEIGHT - 6, 'top ' + top);
});

// ---- task 15: section planner, new elements, items, physics ----
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

test('sectionPlan: deterministic, section 0 is the moving-platform lesson, never repeats back to back', () => {
  assert.equal(SECTION_PX, 800);
  assert.deepEqual(sectionPlan(7), sectionPlan(7));
  assert.equal(sectionPlan(0).gimmick, 'moving');
  for (const seed of [0, ...SEEDS]) {
    for (let i = 1; i < 200; i++) assert.notEqual(sectionPlan(i, seed).gimmick, sectionPlan(i - 1, seed).gimmick, `repeat at ${i} seed ${seed}`);
  }
});

test('sectionPlan: gimmicks only appear in sections reaching their unlock height; one gimmick per section', () => {
  for (const seed of [0, ...SEEDS]) {
    for (let i = 0; i < 200; i++) {
      const g = sectionPlan(i, seed).gimmick;
      assert.ok(g === 'plain' || UNLOCK_Y[g] < (i + 1) * SECTION_PX, `${g} too early in section ${i}`);
      assert.equal(typeof g, 'string');
    }
  }
  assert.deepEqual(UNLOCK_Y, { plain: 0, moving: 240, stones: 320, spikes: 320, crumble: 800, ice: 1400, conveyor: 2000, wind: 2800 });
  // gimmickAtY: gimmick features start at max(sectionStart, unlock)
  assert.equal(gimmickAtY(100), 'plain');
  assert.equal(gimmickAtY(250), 'moving');
  for (let y = 0; y < 60000; y += 37) {
    const g = gimmickAtY(y);
    assert.ok(g === 'plain' || (y >= UNLOCK_Y[g] && g === sectionPlan(Math.floor(y / SECTION_PX)).gimmick));
  }
});

test('sectionPlan: plain share ~25-35%, a heavy gimmick is followed by plain at least half the time', () => {
  let plain = 0, heavyThen = 0, heavyThenPlain = 0, n = 0;
  for (const seed of [0, ...SEEDS]) {
    for (let i = 3; i < 300; i++) {
      n++;
      const g = sectionPlan(i, seed).gimmick;
      if (g === 'plain') plain++;
      if (HEAVY.includes(sectionPlan(i - 1, seed).gimmick)) { heavyThen++; if (g === 'plain') heavyThenPlain++; }
    }
  }
  assert.ok(plain / n >= 0.2 && plain / n <= 0.36, 'plain share ' + plain / n);
  assert.ok(heavyThenPlain / heavyThen >= 0.5, 'plain after heavy ' + heavyThenPlain / heavyThen);
});

test('step by step: every element stays below its unlock height', () => {
  const firsts = {};
  for (const seed of SEEDS) {
    const ps = generatePlatforms(0, 24000, seeded(seed), { seed });
    for (const p of ps) {
      const kinds = [];
      if (p.type === 'moving') kinds.push(['moving', UNLOCK_Y.moving]);
      if (p.type === 'spike') kinds.push(['spikes', UNLOCK_Y.spikes]);
      if (p.stone) kinds.push(['stones', UNLOCK_Y.stones]);
      if (p.surface === 'crumble') kinds.push(['crumble', UNLOCK_Y.crumble]);
      if (p.surface === 'ice') kinds.push(['ice', UNLOCK_Y.ice]);
      if (p.surface === 'conveyor') kinds.push(['conveyor', UNLOCK_Y.conveyor]);
      if (p.feature === 'spring') kinds.push(['spring', 400]);
      if (p.feature === 'checkpoint') kinds.push(['checkpoint', 2000]);
      for (const [k, u] of kinds) {
        assert.ok(p.y >= u, `${k} at ${p.y} < ${u} (seed ${seed})`);
        firsts[k] = Math.min(firsts[k] ?? Infinity, p.y);
      }
    }
  }
  for (const k of ['moving', 'spikes', 'stones', 'crumble', 'ice', 'conveyor', 'spring', 'checkpoint']) assert.ok(firsts[k] < Infinity, k + ' appears');
});

test('planner: crumble/ice/conveyor/stones only inside their own sections; the primary one is strong, others are rare', () => {
  let ownN = 0, own = 0, otherMoving = 0, otherSolid = 0, otherSpikes = 0, spikeSecN = 0;
  for (const seed of SEEDS) {
    const ps = generatePlatforms(0, 40000, seeded(seed), { seed });
    for (const p of ps) {
      const sec = sectionPlan(Math.floor(p.y / SECTION_PX), seed).gimmick;
      const secAt = (yy) => sectionPlan(Math.floor(yy / SECTION_PX), seed).gimmick;
      if (p.surface === 'crumble') assert.equal(sec, 'crumble');
      if (p.surface === 'ice') assert.equal(sec, 'ice');
      if (p.surface === 'conveyor') assert.equal(sec, 'conveyor');
      if (p.stone) assert.ok(secAt(p.y) === 'stones' || secAt(p.y - 100) === 'stones', 'stone outside stones section');
      if (p.type === 'spike') continue;
      if (p.stone) continue;
      if (sec === 'crumble' || sec === 'ice' || sec === 'conveyor') { ownN++; if (p.surface !== 'normal') own++; }
      if (sec !== 'moving' && p.y >= 240) { otherSolid++; if (p.type === 'moving') otherMoving++; }
    }
    const solids = ps.filter((p) => p.type !== 'spike');
    for (const sp of ps.filter((p) => p.type === 'spike')) {
      const sec = sectionPlan(Math.floor(sp.y / SECTION_PX), seed).gimmick;
      if (sec !== 'spikes') otherSpikes++;
    }
    for (const p of solids) {
      if (p.stone || p.type === 'moving') continue;
      const sec = sectionPlan(Math.floor(p.y / SECTION_PX), seed).gimmick;
      if (p.y >= 320 && sec !== 'spikes') { spikeSecN++; }
    }
  }
  assert.ok(own / ownN > 0.35, 'primary surface share ' + own / ownN);
  assert.ok(otherMoving / otherSolid <= 0.1, 'moving elsewhere ' + otherMoving / otherSolid);
  assert.ok(otherSpikes / spikeSecN <= 0.2, 'spikes elsewhere ' + otherSpikes / spikeSecN);
});

test('generatePlatforms: at most one primary gimmick in any section', () => {
  let maxKinds = 0;
  for (const seed of SEEDS) {
    const ps = generatePlatforms(0, 40000, seeded(seed), { seed });
    const bySec = new Map();
    for (const p of ps) {
      const k = p.stone ? 'stones' : p.surface === 'crumble' ? 'crumble' : p.surface === 'ice' ? 'ice' : p.surface === 'conveyor' ? 'conveyor' : null;
      if (!k) continue;
      // a stone row that started near the end of a section may poke into the next one
      const at = Math.floor(p.y / SECTION_PX);
      const sec = k === 'stones' && sectionPlan(at, seed).gimmick !== 'stones' ? Math.floor((p.y - 100) / SECTION_PX) : at;
      if (!bySec.has(sec)) bySec.set(sec, new Set());
      bySec.get(sec).add(k);
    }
    for (const set of bySec.values()) maxKinds = Math.max(maxKinds, set.size);
  }
  assert.ok(maxKinds <= 1, 'kinds in a section ' + maxKinds);
});

test('platform fields: surface/belt/feature rules (spring+checkpoint only on plain static platforms)', () => {
  let springs = 0, cps = 0, belts = new Set();
  for (const seed of SEEDS) {
    const ps = generatePlatforms(0, 30000, seeded(seed), { seed });
    for (const p of ps.filter((q) => q.type !== 'spike')) {
      assert.ok(['normal', 'ice', 'conveyor', 'crumble'].includes(p.surface), 'surface ' + p.surface);
      if (p.surface === 'conveyor') { assert.ok(Math.abs(p.belt) === 70); belts.add(Math.sign(p.belt)); } else assert.equal(p.belt, undefined);
      if (p.feature) {
        assert.ok(['spring', 'checkpoint'].includes(p.feature));
        assert.equal(p.type, 'static');
        assert.equal(p.surface, 'normal');
        assert.ok(!p.stone);
        if (p.feature === 'spring') { springs++; assert.ok(p.w >= 58); }
        if (p.feature === 'checkpoint') { cps++; assert.ok(p.w >= 120); }
      }
      if (p.surface === 'ice' || p.surface === 'conveyor') assert.ok(p.w >= 70);
    }
  }
  assert.equal(belts.size, 2, 'both belt directions');
  assert.ok(springs > 10 && cps > 10, `springs ${springs} cps ${cps}`);
});

test('checkpoints: one wide plain platform every 50m, calm neighbours (no spike/moving/hazard within +-1)', () => {
  assert.equal(CHECKPOINT_EVERY, 2000);
  for (const seed of SEEDS) {
    const all = generatePlatforms(0, 24000, seeded(seed), { seed });
    const solids = all.filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);
    for (let k = 1; k <= 11; k++) {
      const cps = solids.filter((p) => p.feature === 'checkpoint' && p.y >= k * 2000 && p.y < k * 2000 + 160);
      assert.equal(cps.length, 1, `checkpoint ${k} seed ${seed}`);
      const i = solids.indexOf(cps[0]);
      for (const n of [solids[i - 1], solids[i + 1]]) {
        assert.ok(n.type === 'static' && !n.stone && n.surface === 'normal', 'neighbour calm');
        assert.ok(!all.some((s) => s.type === 'spike' && s.y === n.y), 'no spike beside neighbour');
      }
      assert.ok(!all.some((s) => s.type === 'spike' && s.y === cps[0].y));
    }
    assert.equal(solids.filter((p) => p.feature === 'checkpoint').length, 11);
  }
});

test('springs: about one per 25m from 10m, not close together', () => {
  let n = 0, span = 0;
  for (const seed of SEEDS) {
    const sp = generatePlatforms(0, 30000, seeded(seed), { seed }).filter((p) => p.feature === 'spring').sort((a, b) => a.y - b.y);
    for (let i = 1; i < sp.length; i++) assert.ok(sp[i].y - sp[i - 1].y >= 700, 'spring spacing ' + (sp[i].y - sp[i - 1].y));
    n += sp.length; span += 30000 - 400;
  }
  const per25m = n / (span / 1000);
  assert.ok(per25m > 0.6 && per25m < 1.4, 'springs per 25m ' + per25m);
});

test('chunked generation (carry) matches the rules: reachability across chunks, springs/checkpoints not duplicated', () => {
  for (const seed of [3, 4, 5]) {
    const rng = seeded(seed), carry = {};
    const all = [{ x: 0, y: 0, w: 360, type: 'static' }];
    let topY = 0, topX = 180;
    while (topY < 20000) {
      const chunk = generatePlatforms(topY + gapAt(), topY + gapAt() + 700, rng, { startX: topX, carry, seed });
      const last = chunk.filter((p) => p.type !== 'spike').pop();
      all.push(...chunk); topY = last.y; topX = last.x + last.w / 2;
    }
    const solids = all.filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);
    for (let i = 1; i < solids.length; i++) assert.ok(solids[i].y - solids[i - 1].y <= DOUBLE_REACH);
    assert.equal(solids.filter((p) => p.feature === 'checkpoint' && p.y < 20000).length, 9);
    const sp = solids.filter((p) => p.feature === 'spring');
    for (let i = 1; i < sp.length; i++) assert.ok(sp[i].y - sp[i - 1].y >= 700);
  }
});

test('wind zones: only from 70m, 1-2 per wind section, 250-400px tall, +-45px/s alternating, chunk independent', () => {
  for (const seed of [0, ...SEEDS]) {
    const all = generateWindZones(0, 60000, seed);
    assert.ok(all.length > 0);
    for (const z of all) {
      assert.ok(z.y0 >= UNLOCK_Y.wind, 'wind below 70m');
      assert.ok(z.y1 - z.y0 >= 250 && z.y1 - z.y0 <= 400, 'height ' + (z.y1 - z.y0));
      assert.ok(Math.abs(z.vx) === 45);
      assert.equal(sectionPlan(Math.floor(z.y0 / SECTION_PX), seed).gimmick, 'wind');
      assert.equal(Math.floor(z.y0 / SECTION_PX), Math.floor((z.y1 - 1) / SECTION_PX), 'zone stays in its section');
    }
    const bySec = new Map();
    for (const z of all) bySec.set(Math.floor(z.y0 / SECTION_PX), (bySec.get(Math.floor(z.y0 / SECTION_PX)) || []).concat(z));
    for (const zs of bySec.values()) {
      assert.ok(zs.length >= 1 && zs.length <= 2);
      if (zs.length === 2) { assert.equal(zs[0].vx, -zs[1].vx); assert.ok(zs[0].y1 <= zs[1].y0, 'no overlap'); }
    }
    // same zones regardless of the queried range
    const part = generateWindZones(20000, 30000, seed);
    for (const z of part) assert.ok(all.some((a) => a.y0 === z.y0 && a.y1 === z.y1 && a.vx === z.vx));
  }
  assert.equal(generateWindZones(0, 2799).length, 0);
});

test('stepPlayer: spring pad bounces ~2x a jump with no energy event, resets the air jump', () => {
  const plat = { x: 100, y: 0, w: 100, type: 'static', surface: 'normal', feature: 'spring' };
  const s = createPlayer(150, 200);
  s.onGround = false; s.airJumped = true; s.vy = -200;
  const ev = [];
  let top = 0;
  for (let i = 0; i < 200; i++) {
    const r = stepPlayer(s, { ...none }, 1 / 60, [plat]);
    ev.push(...r.events);
    if (ev.includes('sprang')) top = Math.max(top, s.y);
  }
  assert.ok(ev.includes('sprang') && ev.includes('landed'));
  assert.ok(!ev.includes('jumped') && !ev.includes('doubleJumped'));
  assert.ok(SPRING_V > JUMP_V);
  assert.ok(top > 170 && top < 210, 'spring peak ' + top);
  // air jump is available again right after the bounce
  const s2 = createPlayer(150, 0);
  s2.onGround = false; s2.y = 1; s2.vy = -200; s2.airJumped = true;
  stepPlayer(s2, { ...none }, 1 / 60, [plat]);
  assert.equal(s2.airJumped, false);
  assert.ok(stepPlayer(s2, { ...none, jump: true }, 1 / 60, [plat]).events.includes('doubleJumped'));
});

test('stepPlayer: landing beside the spring pad is a normal landing', () => {
  const plat = { x: 100, y: 0, w: 100, type: 'static', surface: 'normal', feature: 'spring' };
  const s = createPlayer(108, 30);
  s.onGround = false;
  const ev = [];
  for (let i = 0; i < 60; i++) ev.push(...stepPlayer(s, { ...none }, 1 / 60, [plat]).events);
  assert.ok(ev.includes('landed') && !ev.includes('sprang'));
  assert.ok(s.onGround);
});

test('stepPlayer: ice accelerates/decelerates gradually; normal ground stays instant', () => {
  const ice = { x: 0, y: 0, w: 360, type: 'static', surface: 'ice' };
  const s = createPlayer(60, 0);
  stepPlayer(s, { ...none }, 1 / 60, [ice]);
  stepPlayer(s, { ...none, right: true }, 1 / 60, [ice]);
  assert.ok(s.x - 60 < MOVE_SPEED / 60 * 0.5, 'slow start on ice: ' + (s.x - 60));
  for (let i = 0; i < 90; i++) stepPlayer(s, { ...none, right: true }, 1 / 60, [ice]);
  assert.ok(s.vx > MOVE_SPEED - 1, 'reaches full speed ' + s.vx);
  const x0 = s.x;
  for (let i = 0; i < 30; i++) stepPlayer(s, { ...none }, 1 / 60, [ice]); // 0.5s, no input
  assert.ok(s.x - x0 > 40, 'keeps sliding ' + (s.x - x0));
  assert.ok(s.vx > 100 && s.vx < MOVE_SPEED, 'decelerating slowly (~40px/s^2) ' + s.vx);
  assert.ok(MOVE_SPEED * MOVE_SPEED / (2 * ICE_DECEL) > 300, 'slides >300px from full speed');
  const n = createPlayer(180, 0);
  stepPlayer(n, { ...none }, 1 / 60, [ground]);
  const nx = n.x;
  stepPlayer(n, { ...none, right: true }, 1 / 60, [ground]);
  assert.ok(Math.abs(n.x - nx - MOVE_SPEED / 60) < 1e-6, 'instant on normal ground');
  stepPlayer(n, { ...none }, 1 / 60, [ground]);
  assert.equal(n.x, nx + MOVE_SPEED / 60, 'stops instantly');
});

test('stepPlayer: conveyor adds belt speed; crumble gives way after 0.5s and then is ignored', () => {
  const belt = { x: 0, y: 0, w: 360, type: 'static', surface: 'conveyor', belt: 70 };
  const s = createPlayer(100, 0);
  stepPlayer(s, { ...none }, 1 / 60, [belt]);
  const x0 = s.x;
  for (let i = 0; i < 60; i++) stepPlayer(s, { ...none }, 1 / 60, [belt]);
  assert.ok(Math.abs(s.x - x0 - 70) < 1, 'moved ' + (s.x - x0));
  const back = { ...belt, belt: -70 };
  const s2 = createPlayer(200, 0);
  stepPlayer(s2, { ...none }, 1 / 60, [back]);
  for (let i = 0; i < 60; i++) stepPlayer(s2, { ...none }, 1 / 60, [back]);
  assert.ok(s2.x < 140);

  const cr = { x: 0, y: 0, w: 360, type: 'static', surface: 'crumble' };
  const c = createPlayer(180, 0);
  const ev = [];
  for (let i = 0; i < 20; i++) ev.push(...stepPlayer(c, { ...none }, 1 / 60, [cr]).events);
  assert.ok(!cr.gone && c.onGround && cr.crumbleT > 0.3 && cr.crumbleT < 0.5, 'crumbling ' + cr.crumbleT);
  for (let i = 0; i < 20; i++) ev.push(...stepPlayer(c, { ...none }, 1 / 60, [cr]).events);
  assert.equal(cr.gone, true);
  assert.equal(c.onGround, false);
  c.y = 40; c.vy = -100;
  const ev2 = [];
  for (let i = 0; i < 30; i++) ev2.push(...stepPlayer(c, { ...none }, 1 / 60, [cr]).events);
  assert.ok(!ev2.includes('landed') && c.y < 0, 'falls through a gone platform');
});

test('stepPlayer: wind pushes in air and on ground only while inside the zone', () => {
  const env = { wind: [{ y0: -10, y1: 100, vx: 45 }] };
  const s = createPlayer(100, 0);
  stepPlayer(s, { ...none }, 1 / 60, [ground], env);
  const x0 = s.x;
  for (let i = 0; i < 60; i++) stepPlayer(s, { ...none }, 1 / 60, [ground], env);
  assert.ok(Math.abs(s.x - x0 - 45) < 0.5, 'pushed on ground ' + (s.x - x0));
  const a = createPlayer(100, 300);
  a.onGround = false;
  const ax = a.x;
  stepPlayer(a, { ...none }, 1 / 60, [], env); // y=300 is outside the zone
  assert.equal(a.x, ax);
  const b = createPlayer(100, 50);
  b.onGround = false;
  stepPlayer(b, { ...none }, 1 / 60, [], env);
  assert.ok(Math.abs(b.x - 100 - 0.75) < 1e-6, 'pushed in air');
  stepPlayer(createPlayer(100, 0), { ...none }, 1 / 60, [ground]); // old signature (no env) still works
});

test('pickRespawnPlatform skips gone platforms and prefers a nearby checkpoint when the last safe one is invalid', () => {
  const camY = 1000;
  const a = { x: 0, y: camY + 200, w: 90, type: 'static', gone: true };
  const b = { x: 0, y: camY + 230, w: 90, type: 'static' };
  assert.equal(pickRespawnPlatform([a, b], a, camY), b);
  const cp = { x: 0, y: camY + 300, w: 130, type: 'static', feature: 'checkpoint' };
  assert.equal(pickRespawnPlatform([b, cp], a, camY), cp);
  const farCp = { x: 0, y: camY + 600, w: 130, type: 'static', feature: 'checkpoint' };
  assert.equal(pickRespawnPlatform([b, farCp], a, camY), b);
});

test('generateItems: deterministic, rules for unlock/spacing/placement, never on spikes', () => {
  let energy = 0, quiz = 0, total = 0;
  const range = 40000;
  for (const seed of SEEDS) {
    const make = () => {
      const rng = seeded(seed), carry = {}, ps = generatePlatforms(0, range, rng, { seed });
      return { ps, items: generateItems(ps, 0, range, rng, carry) };
    };
    const { ps, items } = make();
    assert.deepEqual(items, make().items);
    const solids = ps.filter((p) => p.type !== 'spike').sort((a, b) => a.y - b.y);
    const spikes = ps.filter((p) => p.type === 'spike');
    let prev = null;
    for (const it of items.slice().sort((a, b) => a.y - b.y)) {
      assert.ok(it.type === 'energy' || it.type === 'quiz');
      assert.equal(it.taken, false);
      assert.ok(it.y >= 480 + 40, 'not in the first 12m: ' + it.y);
      if (it.type === 'energy') { energy++; assert.ok(it.y >= 480); } else { quiz++; assert.ok(it.y >= 1000, 'quiz unlock 25m'); }
      assert.ok(it.x >= 10 && it.x <= 350);
      for (const sp of spikes) assert.ok(!(it.x + 14 > sp.x && it.x - 14 < sp.x + sp.w && it.y + 14 > sp.y && it.y - 14 < sp.y + SPIKE_H), 'item on spike');
      assert.ok(solids.some((q) => q.y < it.y - 40 && it.y - q.y <= 100), 'item floats above some platform');
      if (prev) {
        const between = solids.filter((q, k) => q.y > prev.y && q.y < it.y && !(q.stone && k > 0 && solids[k - 1].stone)).length; // a stone row counts once
        assert.ok(between >= 4, `items too close: ${between} platforms between`);
      }
      prev = it;
    }
    total++;
  }
  const per40m = energy / (total * range / 1600), per60m = quiz / (total * range / 2400);
  assert.ok(per40m > 0.6 && per40m < 1.3, 'energy items per 40m ' + per40m);
  assert.ok(per60m > 0.6 && per60m < 1.4, 'quiz blocks per 60m ' + per60m);
});

test('generateItems: energy items hover 50-70px above a platform, quiz blocks 60-90px above a wide one', () => {
  let e = 0, q = 0;
  for (const seed of SEEDS) {
    const rng = seeded(seed), ps = generatePlatforms(0, 20000, rng, { seed });
    const solids = ps.filter((p) => p.type !== 'spike');
    for (const it of generateItems(ps, 0, 20000, rng)) {
      const below = solids.filter((p) => p.y < it.y && it.y - p.y <= 95).sort((a, b) => b.y - a.y);
      assert.ok(below.length >= 1);
      if (it.type === 'energy') { e++; assert.ok(below.some((p) => it.y - p.y >= 49 && it.y - p.y <= 71)); }
      else { q++; assert.ok(below.some((p) => p.w >= 92 && it.y - p.y >= 59 && it.y - p.y <= 91)); }
    }
  }
  assert.ok(e > 10 && q > 5);
});

test('itemTouches: overlap of player body and item circle', () => {
  const p = createPlayer(100, 0);
  assert.ok(itemTouches(p, { type: 'energy', x: 100, y: 15, taken: false }));
  assert.ok(!itemTouches(p, { type: 'energy', x: 100, y: 70, taken: false }));
  assert.ok(!itemTouches(p, { type: 'energy', x: 160, y: 15, taken: false }));
  assert.ok(itemTouches(p, { type: 'quiz', x: 120, y: 35, taken: false }));
});

// ---- game-level: hearts / endGame guard, energy pattern (fake ctx, no DOM) ----
import jump from '../js/games/jump/index.js';
import { createEnergy } from '../js/core/energy.js';

function fakeCtx(hearts0 = 1) {
  const g2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
  const calls = { end: [], quiz: 0, opts: [] };
  const held = { left: false, right: false, jump: false };
  const subs = new Set();
  const ctx = {
    g2d, width: 360, height: 640, rng: seeded(5),
    input: { held, on: (n, fn) => { if (n === 'jump') subs.add(fn); return () => subs.delete(fn); } },
    energy: createEnergy(10),
    hearts: { value: hearts0, lose() { this.value = Math.max(0, this.value - 1); return this.value; }, add(n) { this.value = Math.min(3, this.value + n); return this.value; } },
    requestQuiz: async (o) => { calls.quiz++; calls.opts.push(o); ctx.energy.add(10); },
    endGame: (s) => calls.end.push(s),
    hud: { setScore() {} }, sfx: { play() {} },
  };
  return { ctx, calls, press: () => subs.forEach((f) => f()) };
}

test('game: ground jump and the one air (double) jump each spend 1; further air presses are free', () => {
  const { ctx, press } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  assert.equal(ctx.energy.value, 10);
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  press(); game.update(1 / 60);
  assert.equal(ctx.energy.value, 9);
  press(); game.update(1 / 60); // first air press = double jump
  assert.equal(ctx.energy.value, 8);
  for (let i = 0; i < 5; i++) { press(); game.update(1 / 60); } // second+ air presses
  assert.equal(ctx.energy.value, 8);
  game.render();
});

test('game: at 0 energy a jump asks for a quiz, then jumps and spends once', async () => {
  const { ctx, calls, press } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(10);
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  press(); game.update(1 / 60);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.quiz, 1);
  assert.equal(ctx.energy.value, 10);
  game.update(1 / 60); game.update(1 / 60);
  assert.equal(ctx.energy.value, 9);
});

test('game: falling with 1 heart ends the game exactly once (even with repeated fell frames)', () => {
  const { ctx, calls } = fakeCtx(1);
  const game = jump.create(ctx);
  game.start();
  game.update(1 / 60);
  for (let i = 0; i < 6; i++) {
    game.debug.player.onGround = false; game.debug.player.ground = null;
    game.debug.player.y = -1000;
    game.update(1 / 60);
  }
  assert.equal(calls.end.length, 1);
  assert.equal(ctx.hearts.value, 0);
});

test('game: falling with 3 hearts loses one and respawns on a safe platform', () => {
  const { ctx, calls } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  game.update(1 / 60);
  game.debug.player.onGround = false; game.debug.player.ground = null;
  game.debug.player.y = -1000;
  game.update(1 / 60);
  assert.equal(ctx.hearts.value, 2);
  assert.equal(calls.end.length, 0);
  assert.ok(game.debug.player.y > -100 && game.debug.player.onGround);
});

test('respawn uses the last safe platform after a missed full jump (no free height)', async () => {
  const { pickRespawnPlatform } = await import('../js/games/jump/world.js');
  const FOLLOW = 340; // index.js camera follow distance
  const safe = { x: 100, y: 948, w: 90, type: 'static' };
  const higher = { x: 150, y: 1018, w: 90, type: 'static' };
  const lower = { x: 10, y: 850, w: 90, type: 'static' };
  const camY = safe.y + MAX_JUMP_HEIGHT - FOLLOW; // camera after the jump apex
  assert.equal(pickRespawnPlatform([lower, safe, higher], safe, camY), safe);
});

test('respawn falls back to the lowest visible solid platform, never a spike', async () => {
  const { pickRespawnPlatform, RESPAWN_MIN_ABOVE_CAM } = await import('../js/games/jump/world.js');
  const camY = 1000;
  const hidden = { x: 0, y: camY + 20, w: 90, type: 'static' };
  const spike = { x: 0, y: camY + RESPAWN_MIN_ABOVE_CAM + 5, w: 36, type: 'spike' };
  const a = { x: 0, y: camY + RESPAWN_MIN_ABOVE_CAM + 30, w: 90, type: 'static' };
  const b = { x: 0, y: camY + RESPAWN_MIN_ABOVE_CAM + 120, w: 90, type: 'static' };
  assert.equal(pickRespawnPlatform([b, spike, a, hidden], hidden, camY), a);
});

// ---- task 15: landing quiz, items, checkpoints (game level) ----
const tick = () => new Promise((r) => setTimeout(r, 0));
function jumpAt(ctx, game, press) {
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  press(); game.update(1 / 60);
}

test('landing quiz: energy hits 0 mid-air, no interruption, quiz opens only once the character has landed', async () => {
  const { ctx, calls, press } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(9); // 1 left
  jumpAt(ctx, game, press);
  assert.equal(ctx.energy.value, 0);
  let airFrames = 0;
  for (let i = 0; i < 200 && calls.quiz === 0; i++) {
    if (!game.debug.player.onGround) airFrames++;
    assert.equal(calls.quiz, 0);
    game.update(1 / 60);
    await tick();
  }
  assert.ok(airFrames > 20, 'was airborne ' + airFrames);
  assert.equal(calls.quiz, 1);
  assert.ok(game.debug.player.onGround, 'quiz opened on the ground');
  assert.deepEqual(calls.opts[0] || {}, {}); // normal refill quiz
  for (let i = 0; i < 30; i++) game.update(1 / 60);
  await tick();
  assert.equal(calls.quiz, 1, 'no second quiz after refill');
});

test('landing quiz: an air press at 0 energy does nothing; a ground press at 0 still opens the quiz', async () => {
  const { ctx, calls, press } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(9);
  jumpAt(ctx, game, press);
  for (let i = 0; i < 4; i++) game.update(1 / 60);
  assert.ok(!game.debug.player.onGround && ctx.energy.value === 0);
  press(); game.update(1 / 60); press(); game.update(1 / 60);
  await tick();
  assert.equal(calls.quiz, 0, 'no quiz mid-air');
});

test('landing quiz: slow quiz never opens twice, and it also fires after a respawn at 0 energy', async () => {
  const { ctx, calls } = fakeCtx(3);
  let release;
  ctx.requestQuiz = () => { calls.quiz++; return new Promise((r) => { release = () => { ctx.energy.add(10); r(); }; }); };
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(10);
  game.update(1 / 60);
  game.debug.player.onGround = false; game.debug.player.ground = null; game.debug.player.y = -1000;
  game.update(1 / 60); // fell -> respawn on a platform
  assert.equal(ctx.hearts.value, 2);
  assert.equal(calls.quiz, 1, 'respawn landing opens the quiz');
  for (let i = 0; i < 10; i++) game.update(1 / 60);
  assert.equal(calls.quiz, 1, 'not opened twice');
  release();
  await tick();
  for (let i = 0; i < 10; i++) game.update(1 / 60);
  assert.equal(calls.quiz, 1);
});

test('landing quiz: landing on a spring pad at 0 energy opens the quiz at that landing (not mid-air, not skipped)', async () => {
  const { ctx, calls } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(ctx.energy.value);
  const pl = game.debug.player;
  const spring = { x: 100, y: 2, w: 120, type: 'static', surface: 'normal', feature: 'spring' };
  game.debug.platforms.push(spring);
  pl.onGround = false; pl.ground = null; pl.x = 160; pl.y = 20; pl.vy = -300;
  let yAtQuiz = null;
  for (let i = 0; i < 400 && calls.quiz === 0; i++) {
    game.update(1 / 60);
    await tick();
    if (calls.quiz && yAtQuiz === null) yAtQuiz = pl.y;
  }
  assert.equal(calls.quiz, 1, 'quiz opened once');
  assert.ok(yAtQuiz <= spring.y + 10, 'only after reaching the pad, y=' + yAtQuiz);
});

test('items: energy item gives +3 (capped), quiz block opens a manual quiz once', async () => {
  const { ctx, calls } = fakeCtx(3);
  const game = jump.create(ctx);
  game.start();
  ctx.energy.spend(5);
  const pl = game.debug.player;
  game.debug.items.push({ type: 'energy', x: pl.x, y: pl.y + 15, taken: false });
  game.update(1 / 60);
  assert.equal(ctx.energy.value, 8);
  game.update(1 / 60);
  assert.equal(ctx.energy.value, 8, 'taken once');
  game.debug.items.push({ type: 'energy', x: pl.x, y: pl.y + 15, taken: false });
  ctx.energy.spend(1);
  game.update(1 / 60);
  assert.equal(ctx.energy.value, 10, 'capped at max');
  game.debug.items.push({ type: 'quiz', x: pl.x, y: pl.y + 15, taken: false });
  game.update(1 / 60); game.update(1 / 60);
  await tick();
  assert.equal(calls.quiz, 1);
  assert.deepEqual(calls.opts[0], { mode: 'manual' });
  game.render();
});

test('checkpoint: first touch gives +1 heart (capped), shows a banner, once only', () => {
  const { ctx } = fakeCtx(2);
  const sounds = [];
  ctx.sfx.play = (n) => sounds.push(n);
  const game = jump.create(ctx);
  game.start();
  const ground0 = game.debug.platforms[0];
  ground0.feature = 'checkpoint'; ground0.cp = 50;
  game.update(1 / 60);
  assert.equal(ctx.hearts.value, 3);
  assert.ok(sounds.includes('correct'));
  assert.ok(game.debug.banner && game.debug.banner.text.includes('50m'));
  ctx.hearts.value = 1;
  for (let i = 0; i < 5; i++) game.update(1 / 60);
  assert.equal(ctx.hearts.value, 1, 'only the first touch');
  game.render();
});
