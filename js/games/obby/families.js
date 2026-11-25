// 못깨는 타워: the open-air section families ('stones', 'drop', 'airjump', 'mixed') + the hazard builders (pure data).
// Same coordinate rules as sections.js (y = 0 is the entry rest's top, y goes up, the section ends at y = 780 on the
// exit rest; entry / exit rests are added by sectionPlatforms()). These skeletons are OPEN: platforms are separate
// small stones, ledges and rafts over a pit, so a 🪶 / ⏱-high jump can skip ledges (a double jump at +1.1x climbs two
// ladder steps at once). Geometry does what it can (stones cycle left / middle / right, +90px per stone: one single jump but
// never two stones at once at normal power); where a mutator still lets the player skip (optimum < 65% of the normal
// time, tests/obby-nontrivial.test.js) or breaks the pattern, the pattern carries `incompatible: [envKind]` and tower.js
// skips it under that mutator (tests/obby-mutators.test.js proves each flag: unsolvable or skippable).
// Hazards beyond spikes (hazards.js): LAVA pools (static), LASER beams (on/off), SAW blades (patrol), CRUSHER blocks
// (periodic drop). `dropEdge: true` marks a platform the solver also tries 'drop' macros from (walk off, fall, press
// the air jump mid-fall): the 'drop' family needs that press. Every hazard is `type:'spike'` (touching = fail).
export const H = 780;
const W = 360;

// ---------------------------------------------------------------- builders
export const P = (cx, y, w, more = {}) => ({ x: Math.round(cx - w / 2), y, w, type: 'static', surface: 'normal', ...more });
export const ICE = (cx, y, w, more = {}) => P(cx, y, w, { surface: 'ice', ...more });
export const CR = (cx, y, w, more = {}) => P(cx, y, w, { surface: 'crumble', ...more });
export const BELT = (cx, y, w, belt, more = {}) => P(cx, y, w, { surface: 'conveyor', belt, ...more });
export const SPR = (cx, y, w = 56, more = {}) => P(cx, y, w, { feature: 'spring', ...more });
export const MOV = (cx, y, w, range, speed, phase = 0, more = {}) => {
  const x = Math.round(cx - w / 2);
  return { x, y, w, type: 'moving', surface: 'normal', baseX: x, range, speed, phase, ...more };
};
export const SPIKE = (x, y, w = 30, more = {}) => ({ x, y, w, type: 'spike', ...more });
export const CEIL = (x0, x1, y) => ({ x: x0, y, w: x1 - x0, type: 'spike', ceiling: true });
export const WALL = (x, y0, y1, w = 14) => {
  const out = [];
  for (let y = y0; y + 16 <= y1; y += 16) out.push({ x, y, w, type: 'spike', wall: true });
  return out;
};
// lava pool from x0 to x1, surface at y + h
export const LAVA = (x0, x1, y = 2, h = 14) => ({ x: x0, y, w: x1 - x0, h, type: 'spike', hz: 'lava' });
// laser beams. horizontal: x0..x1 at height y (8 thick); vertical: column at cx from y0 to y1 (8 wide).
// on `on` s of every `period` s (clock + phase).
export const LASER_H = (x0, x1, y, period, on, phase = 0) => ({ x: x0, y, w: x1 - x0, h: 8, type: 'spike', hz: 'laser', period, on, phase });
export const LASER_V = (cx, y0, y1, period, on, phase = 0) => ({ x: cx - 5, y: y0, w: 10, h: Math.min(y1, H - 2) - y0, type: 'spike', hz: 'laser', vertical: true, period, on, phase });
// saw blade, 30x30. horizontal patrol around centre cx (x = cx - 15 + sin * range) at height y; vertical patrol
// around y (the blade's bottom) at column cx.
export const SAW_X = (cx, y, range, speed, phase = 0) => {
  const x = Math.round(cx - 15);
  return { x, y, w: 30, h: 30, type: 'spike', hz: 'saw', axis: 'x', baseX: x, range, speed, phase };
};
export const SAW_Y = (cx, y, range, speed, phase = 0) =>
  ({ x: Math.round(cx - 15), y, w: 30, h: 30, type: 'spike', hz: 'saw', axis: 'y', baseY: y, range, speed, phase });
// crusher block over cx (width w, height 34): bottom at yLow when slammed, hangs `rise` higher while raised
export const CRUSH = (cx, w, yLow, rise, period, phase = 0) =>
  ({ x: Math.round(cx - w / 2), y: yLow, w, h: 34, type: 'spike', hz: 'crusher', rise, period, phase });
const A = (p, more) => ({ ...p, ...more });

// ---------------------------------------------------------------- stones
// Stepping stones over a lava pit. Rise per stone is 90px: one single jump (apex 96) but never two stones at once (+180 > a
// double jump's 177), so the plain ladder cannot be skipped; the columns cycle left / middle / right so every hop is a
// real sideways jump. Time comes from gates: moving stones, laser curtains in the gaps, saws patrolling the gaps, crushers
// over stones. All periodic things of one pattern share one period (T = 2pi / raft speed, hazards use T or T/2).
const TWO_PI = 2 * Math.PI;
const PIT = [LAVA(0, 108), LAVA(252, 360)];   // lava on both sides of the entry rest
const COLS = [298, 180, 62, 180];             // the 3-column cycle (R, M, L, M)
// chain of stones: xs[i] = centre x of stone i, y = y0 + i * dy; kinds[i] = a builder (cx, y, w) => platform
function chain(xs, { y0 = 90, dy = 90, w = 46, kinds = {}, ws = {} } = {}) {
  return xs.map((cx, i) => (kinds[i] || P)(cx, y0 + i * dy, ws[i] ?? w));
}
// the gap midpoint between stone i and i+1 of such a chain: { x, ya, yb }
const gapMid = (xs, i, y0 = 90, dy = 90) => ({ x: Math.round((xs[i] + xs[i + 1]) / 2), ya: y0 + i * dy, yb: y0 + (i + 1) * dy });
// laser curtain through the gap between stone i and i+1 (vertical beam across the jump arc)
const gate = (xs, i, period, on, phase, o = {}) => {
  const g = gapMid(xs, i, o.y0, o.dy);
  return LASER_V(g.x, g.ya + 10, g.yb + 70, period, on, phase);
};

const TA = TWO_PI / 1.2 / 2;   // 2.618 s: half the swing period of speed-1.2 rafts (lasers / crushers / saws use TA or 2 * TA)
const XS1 = [298, 180, 62, 180, 298, 180, 62, 180];
const XS2 = [62, 180, 298, 180, 62, 180, 298, 180];
const gates = (xs, idxs, on, d, per = TA, o = {}) => idxs.map((i, k) => gate(xs, i, per, on, (o.k ? k : i) * d, o));
const sawLane = (xs, i, range, speed, phase, y0 = 90, dy = 90) => { const g = gapMid(xs, i, y0, dy); return SAW_Y(g.x, Math.round((g.ya + g.yb) / 2) + 6, range, speed, phase); };
// crusher hanging over stone i: slams down to 12px over the stone top (lethal to anyone standing there)
const crushOver = (xs, i, w, per, phase, y0 = 90, dy = 90) => CRUSH(xs[i], w, y0 + i * dy + 12, 70, per, phase);

// ---------------------------------------------------------------- drop
// Left: a short climb to a spring pad SP (altitude spY, x 50). The spring + air jump flings you up (+272) onto E, a hooded
// walkway (spike ceiling 35px over it + a spike pillar on its entry end: walk, never jump) on the left wall, 250px over SP.
// The only way on is to walk off E's right edge and press jump WHILE FALLING (jump ~0.15-0.4 s into the fall): the landing
// ledge T hangs on the far right wall, 140px under E, 190px away (a plain fall carries only ~75px, lava under the shaft).
// T is out of reach of everything lower (>200px away and above it) and of the spring (the arc is only ~230px wide).
// `upper` continues from T up to the exit. dropEdge marks E for the solver ('drop' macros).
const dropTower = ({ spY = 270, lower, upper, eDy = 240, depth = 130, extra = [], lava = true }) => {
  const eY = spY + eDy, tY = eY - depth;
  return [...PIT, ...lower, ...extra,
    P(65, eY, 90, { dropEdge: true }), CEIL(60, 130, eY + 35), ...WALL(60, eY + 51, Math.min(eY + 165, H)),
    ...(lava ? [LAVA(125, 360, tY - 80)] : []), P(336, tY, 40), ...(typeof upper === 'function' ? upper(tY) : upper)];
};
const LOWER1 = () => [P(62, 90, 56), P(110, 180, 56), SPR(48, 270, 56)];

const LADDER = [290, 70, 290, 70, 290, 70, 290];   // airjump ledges: right, left, right ...

export const NEW_SECTIONS = [
  // ---- stones ----
  { id: 't1-15', incompatible: ['lowgravity', 'jumppower-high'], tier: 1, family: 'stones', name: '용암 위 징검다리', theme: 'lava',
    platforms: [...PIT, ...chain(XS1), ...gates(XS1, [0, 1, 2, 3, 4, 5, 6], 1.4, 0.9)] },
  { id: 't2-15', incompatible: ['jumppower-high'], tier: 2, family: 'stones', name: '톱날 징검다리', theme: 'saw',
    platforms: [...PIT, ...chain(XS2, { w: 42, kinds: { 3: CR, 6: CR } }), ...[0, 1, 2, 3, 4, 5, 6].map((i) => sawLane(XS2, i, 34, TWO_PI / TA, i * 0.9))] },
  { id: 't2-16', incompatible: ['lowgravity', 'jumppower-high'], tier: 2, family: 'stones', name: '번개 징검다리', theme: 'laser',
    platforms: [...PIT, ...chain(XS1, { w: 42 }), ...gates(XS1, [0, 1, 2, 3, 4, 5, 6], 1.5, 0.4)] },
  { id: 't3-15', incompatible: ['lowgravity', 'jumppower-high'], tier: 3, family: 'stones', name: '불꽃 징검다리', theme: 'fire',
    platforms: [...PIT, ...chain(XS2, { w: 38 }), crushOver(XS2, 2, 60, TA * 2, 0.4), crushOver(XS2, 4, 60, TA * 2, 2.4), crushOver(XS2, 6, 60, TA * 2, 4.0),
      ...gates(XS2, [0, 2, 3, 5], 1.2, 0.5)] },

  // ---- drop ----
  { id: 't1-16', incompatible: ['jumppower-low', 'wind-left'], tier: 1, family: 'drop', name: '뛰어내려 잡기', theme: 'drop',
    platforms: dropTower({ lower: LOWER1(), upper: (t) => [P(336, t + 90, 40), P(336, t + 180, 40), P(215, t + 270, 46), P(336, t + 360, 44)] }) },
  { id: 't2-17', incompatible: ['jumppower-low', 'wind-left'], tier: 2, family: 'drop', name: '톱날 우물', theme: 'saw',
    platforms: dropTower({ lower: [P(62, 90, 52), P(110, 180, 52), SPR(48, 270, 56)],
      extra: [SAW_X(215, 430, 55, TWO_PI / TA, 0.5)],
      upper: (t) => [P(336, t + 90, 40), CR(336, t + 180, 40), P(215, t + 270, 42), MOV(300, t + 360, 46, 26, 1.2, 1)] }) },
  { id: 't2-18', incompatible: ['lowgravity', 'jumppower-low', 'wind-left', 'crumbleall'], tier: 2, family: 'drop', name: '번개 우물', theme: 'laser',
    platforms: dropTower({ lower: [P(62, 90, 52), ICE(110, 180, 52), SPR(48, 270, 56)],
      extra: [LASER_V(175, 400, 510, TA, 1.4, 0.3)],
      upper: (t) => [P(336, t + 90, 40), P(336, t + 180, 40), P(215, t + 270, 42), P(336, t + 360, 40),
        LASER_V(274, t + 190, t + 320, TA, 1.5, 0.8), LASER_V(274, t + 280, t + 410, TA, 1.5, 2.1)] }) },
  { id: 't3-16', incompatible: ['jumppower-low', 'wind-left'], tier: 3, family: 'drop', name: '불꽃 우물', theme: 'fire', finalGate: true,
    platforms: dropTower({ lower: [P(62, 90, 46), ICE(110, 180, 46), SPR(48, 270, 56)],
      extra: [LASER_V(165, 430, 520, TA, 1.2, 0.5)],
      upper: (t) => [P(336, t + 90, 40), CR(336, t + 180, 40), P(215, t + 270, 40), P(336, t + 360, 40),
        SAW_Y(274, t + 240, 40, TWO_PI / TA, 0.6), SAW_Y(274, t + 330, 40, TWO_PI / TA, 2.0)] }) },

  // ---- airjump ----
  { id: 't1-17', incompatible: ['lowgravity', 'jumppower-high'], tier: 1, family: 'airjump', name: '두 번 뛰기 계단', theme: 'air',
    platforms: [...PIT, ...chain(LADDER, { y0: 100, dy: 100, w: 84 })] },
  { id: 't2-19', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 2, family: 'airjump', name: '넓은 점프 계단', theme: 'wide',
    platforms: [...PIT, ...chain([295, 65, 295, 65, 295, 65, 295], { y0: 100, dy: 100, w: 70, kinds: { 1: ICE, 3: CR, 5: ICE } })] },
  { id: 't2-20', incompatible: ['lowgravity', 'jumppower-high'], tier: 2, family: 'airjump', name: '쇠뭉치 계단', theme: 'crusher',
    platforms: [...PIT, ...chain(LADDER, { y0: 100, dy: 100, w: 74 }),
      ...[1, 3, 5].map((i) => CRUSH(LADDER[i], 50, 100 + i * 100 + 12, 78, TA * 2, i * 0.9))] },
  { id: 't3-17', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 3, family: 'airjump', name: '번개 계단', theme: 'laser',
    platforms: [...PIT, ...chain(LADDER, { y0: 100, dy: 100, w: 58 }),
      ...[0, 1, 2, 3, 4, 5].map((i) => LASER_V(180, 100 + i * 100 + 95, 100 + i * 100 + 185, TA, 1.1, i * 1.1))] },

  // ---- mixed: ladder -> spring -> drop -> climb ----
  { id: 't1-18', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 1, family: 'mixed', name: '세 박자 연습', theme: 'mixed',
    platforms: dropTower({ spY: 300, lava: false, lower: [P(70, 100, 84), P(262, 200, 84), SPR(48, 300, 56)],
      upper: (t) => [P(336, t + 90, 40), P(215, t + 180, 46), P(336, t + 290, 44)] }) },
  { id: 't2-21', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 2, family: 'mixed', name: '번개 세 박자', theme: 'laser',
    platforms: dropTower({ spY: 300, lava: false, lower: [P(70, 100, 78), P(262, 200, 78), SPR(48, 300, 56),
        LASER_V(166, 120, 240, TA, 1.4, 0.4)],
      upper: (t) => [P(336, t + 90, 40), MOV(215, t + 180, 46, 30, 1.2, 1), P(336, t + 290, 44)] }) },
  { id: 't2-22', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 2, family: 'mixed', name: '쇠뭉치 세 박자', theme: 'crusher',
    platforms: dropTower({ spY: 300, lava: false, lower: [P(70, 100, 78), CR(262, 200, 70), SPR(48, 300, 56)],
      upper: (t) => [P(336, t + 90, 40), P(215, t + 180, 44), P(336, t + 290, 44), CRUSH(215, 50, t + 180 + 12, 70, TA * 2, 0.8)] }) },
  { id: 't3-18', incompatible: ['lowgravity', 'jumppower-low', 'jumppower-high'], tier: 3, family: 'mixed', name: '마지막 세 박자', theme: 'final', finalGate: true,
    platforms: dropTower({ spY: 300, lava: false, lower: [P(70, 100, 72), P(262, 200, 72), SPR(48, 300, 52),
        LASER_V(166, 120, 240, TA, 1.4, 0.4)],
      upper: (t) => [P(336, t + 90, 40), CR(215, t + 180, 42), P(336, t + 290, 40),
        LASER_V(274, t + 190, t + 290, TA, 1.4, 1.0), SAW_X(250, t + 235, 30, TWO_PI / TA, 0.5)] }) },
];
