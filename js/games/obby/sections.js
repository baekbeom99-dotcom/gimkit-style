// 못깨는 타워: hand-authored section patterns (pure data, no DOM).
// Coordinates are RELATIVE to the section base: y = 0 is the entry rest platform's top surface, y goes UP,
// x is the left edge inside the 360px jump world. Every section starts on the entry rest platform
// REST_ENTRY and ends on the exit rest platform REST_EXIT (y = SECTION_H); patterns list only the
// platforms in between - sectionPlatforms() adds the two rest platforms (index 0 = entry, 1 = exit).
// Platform schema = the jump map's ({ x, y, w, type:'static'|'moving'|'spike', surface, feature?, belt?,
// baseX/range/speed/phase for moving }). Moving platforms of one section share one `speed`.
// Spikes ({type:'spike'}, SPIKE_H = 16 tall, deadly from every side) sit on a platform's surface or float
// as hazard blocks (`ceiling: true` = a spike strip hanging just over a walkway: render it pointing down;
// `wall: true` = one 16px piece of a vertical spike pillar).
// `incompatible: [envKind]` lists the stepPlayer-env mutators (tower.js ENV_KINDS) under which the pattern
// is NOT clearable (tests/obby-mutators.test.js proves both directions); `finalGate: true` marks patterns
// for the last slot; `theme` is a free-form hint for decoration / the HUD. The 🧱 crumbleAll flag name is
// 'crumbleall' (no pattern needs it at the moment). `gate: true` on a platform marks a piece the intended route
// must stand on (slab patterns; checked by tests/obby-structures.test.js).
//
// Every pattern has a `family` (its skeleton; tower.js never stacks two sections of the same family and picks the
// family before the pattern, so no skeleton dominates): 'switchback' = tower3 below, 'slab-*' = slabs() below.
// Design rules (why the layouts look like this): a double jump climbs ~177px and, with a late air-jump press,
// carries ~210px sideways at +130px; the 🪶 / ⏱-high mutators reach ~215px; platforms are one-way. Open ledge layouts
// therefore get skipped, so every skeleton is built from walkways under spike hoods (walk, never jump):
//  * switchback (tower3): three floors, each a walkway under a spike ceiling 35px over the floor (5px head room) with a
//    spike pillar (`wall: true`) on the ceiling's entry end so nobody hops over the strip; floors 180px apart (> a
//    double jump) joined only at their open ends by risers, moving rafts or a spring.
//  * slabs: eight full-width floors 87px apart, a hood 66px over each with a single window per hood (see slabs()).
// Time comes from the walk itself: belts pushing against you, ice, crumble pieces you must not stop on, and moving
// joints / ferries (a raft swinging in a gap of the walkway) you must wait for. Ceilings never hang over open ends
// or within 190px above the entry rest (switchback), so the 🪶 / ⏱ arcs stay safe; the tests prove every pattern
// under each mutator env, mirrored and with applyCrumbleAll, and that its fastest route walks the whole structure.
export const SECTION_H = 780;
export const WORLD_W = 360;
export const REST_X = 110, REST_W = 140;
export const REST_ENTRY = Object.freeze({ x: REST_X, y: 0, w: REST_W, type: 'static', surface: 'normal' });
export const REST_EXIT = Object.freeze({ x: REST_X, y: SECTION_H, w: REST_W, type: 'static', surface: 'normal' });

// --- tiny builders (centre-x based, rounded to whole px) ---
const P = (cx, y, w, more = {}) => ({ x: Math.round(cx - w / 2), y, w, type: 'static', surface: 'normal', ...more });
const ICE = (cx, y, w, more = {}) => P(cx, y, w, { surface: 'ice', ...more });
const CR = (cx, y, w, more = {}) => P(cx, y, w, { surface: 'crumble', ...more });
const BELT = (cx, y, w, belt, more = {}) => P(cx, y, w, { surface: 'conveyor', belt, ...more });
const SPRING = (cx, y, w, more = {}) => P(cx, y, w, { feature: 'spring', ...more });
const MOV = (cx, y, w, range, speed, phase = 0, more = {}) => {
  const x = Math.round(cx - w / 2);
  return { x, y, w, type: 'moving', surface: 'normal', baseX: x, range, speed, phase, ...more };
};
const SPIKE = (x, y, w = 30) => ({ x, y, w, type: 'spike' });
// spike strip hanging as a ceiling over a walkway: walk under it, never jump under it
const CEIL = (x0, x1, y) => ({ x: x0, y, w: x1 - x0, type: 'spike', ceiling: true });
// a wide platform whose surface is spikes except a `pocket`-wide safe spot in the middle (precise landing)
const POCKET = (cx, y, w = 90, pocket = 46) => {
  const side = (w - pocket) / 2, x = Math.round(cx - w / 2);
  return [P(cx, y, w), SPIKE(x, y, side), SPIKE(x + w - side, y, side)];
};
// vertical spike pillar: stacked SPIKE_H (16px) pieces from y0 up to (just under) y1, render hint wall:true
const WALL = (x, y0, y1, w = 14) => {
  const out = [];
  for (let y = y0; y + 16 <= y1; y += 16) out.push({ x, y, w, type: 'spike', wall: true });
  return out;
};
const PI = Math.PI;

// walkway made of short pieces with 4px joints (walkable without jumping), from x0 to x1
const pieces = (x0, x1, y, w, make) => {
  const out = [];
  for (let x = x0; x + w <= x1 + 0.5; x += w + 4) out.push(make(x + w / 2, y, w));
  return out;
};

// ---- the three-floor switchback skeleton (SECTION_H = 780; side "R" = right, tower.js mirrors at random) ----
//  band 1: r1 (y 90, right) -> floor F1 (y 180, walk right -> left) -> r2 (y 270, left)
//  band 2: floor F2 (y 360, walk left -> right) -> r3 (y 450, right)
//  band 3: floor F3 (y 540, walk right -> left) -> r4 (y 630, left) -> r5 (y 705) -> exit (y 780)
// Every floor is a walkway under a spike ceiling 35px above it (walk, never jump there) that can only be
// entered / left at its open ends; open ends of consecutive floors are 180px apart (> double jump), so the
// only way up is the whole zigzag. A band can instead be a RAFT crossing (edge ledge -> moving raft ->
// opposite edge ledge, 250px apart) and the top can be a SPRING launch to the exit.
const FLOOR = [
  { y: 180, x0: 40, x1: 340, entry: 'R', ceil: [105, 275] },
  { y: 360, x0: 20, x1: 320, entry: 'L', ceil: [85, 255] },
  { y: 540, x0: 40, x1: 340, entry: 'R', ceil: [105, 275] },
];
// floor kinds: 'plain' | 'ice' | 'crumble' | 'belt' (pushes against the walk) | 'beltWith' (pushes along:
// do not ride it off the end) | 'joint1' (one moving joint, wait on the wide entry piece) | 'joint2' (two
// moving joints with a small middle piece) ; { endSpike: true } puts a spike on the floor's far end.
function floor(i, kind, o = {}) {
  const f = FLOOR[i], { y, x0, x1 } = f, R = f.entry === 'R';
  // ceiling 35px over the walk + a spike pillar on its entry end up to 165px (stops jumping over the strip)
  // + a spike strip 1px under the floor everywhere except the entry end: a walkway can only be entered at its
  //   entry end, never from below (closes the shortcuts a different jump height would open)
  const out = [
    CEIL(f.ceil[0], f.ceil[1], y + 35), ...WALL(R ? f.ceil[1] - 14 : f.ceil[0], y + 51, y + 165),
    CEIL(R ? Math.max(0, x0 - 14) : f.ceil[0], R ? f.ceil[1] : Math.min(WORLD_W, x1 + 14), y - 17),
    // hood 60px over the entry end: arrive there from the ledge below, but never jump on upward from it
    CEIL(R ? f.ceil[1] : Math.max(0, x0 - 14), R ? Math.min(WORLD_W, x1 + 14) : f.ceil[0], y + 60),
  ];
  const sp = o.speed ?? 1.4, ph = o.phase ?? 0;
  const span = (a, b, make = P) => make((a + b) / 2, y, b - a);
  // a position along the walk: d = 0 at the entry end, 300 at the exit end
  const at = (d) => (R ? x1 - d : x0 + d);
  const seg = (d0, d1, make) => span(Math.min(at(d0), at(d1)), Math.max(at(d0), at(d1)), make);
  // joint: a 40px raft swinging 20px inside an 80px gap starting d0 along the walk (touches one side at a time)
  const joint = (d0, phase) => {
    const lo = Math.min(at(d0), at(d0 + 80));
    return MOV(lo + 40, y, 40, 20, sp, phase);
  };
  if (kind === 'plain') out.push(span(x0, x1));
  else if (kind === 'ice') out.push(span(x0, x1, ICE));
  else if (kind === 'crumble') out.push(...pieces(x0, x1, y, o.piece ?? 50, CR));
  else if (kind === 'belt' || kind === 'beltWith') {
    const v = o.belt ?? 70, against = R ? v : -v;
    out.push(BELT((x0 + x1) / 2, y, x1 - x0, kind === 'belt' ? against : -against));
  } else if (kind === 'joint1') {
    out.push(seg(0, 170), joint(170, ph), seg(250, 300));
  } else if (kind === 'joint2') {
    out.push(seg(0, 60), joint(60, ph), seg(140, 180), joint(180, ph + (o.lag ?? 2)), seg(260, 300));
  } else throw new Error('floor kind ' + kind);
  if (o.endSpike) out.push(SPIKE(R ? x0 : x1 - 16, y, 16));
  return out;
}
// raft band b (0 = band 1, 1 = band 2): edge ledge (floor height) -> a raft at the same height crossing the
// 250px gap -> opposite edge ledge 90px up. The raft stays 180px under the next floor's open ends.
function raft(b, o = {}) {
  const y = b === 0 ? 180 : 360, startR = b === 0;
  const L = o.ledge ?? P, w = o.w ?? 50;
  const a = startR ? L(355 - w / 2, y, w) : L(5 + w / 2, y, w);
  const z = startR ? L(5 + w / 2, y + 90, w) : L(355 - w / 2, y + 90, w);
  return [a, MOV(180, y, o.raftW ?? 70, 85, o.speed ?? 1.4, o.phase ?? 0), z];
}
const RISER = { r1: [300, 90, 70], r2: [60, 270, 70], r3: [300, 450, 70], r4: [60, 630, 70], r5: [120, 705, 60] };
// tower3({ f:[kind|[kind,opts]|null x3], band1:'raft'opts, band2:'raft'opts, top:'spring', r:{r1:fn..}, extra:[] })
function tower3(spec) {
  const out = [];
  const riser = (k) => {
    const v = spec.r && spec.r[k];
    if (v === null) return [];
    if (typeof v === 'function') return [].concat(v(...RISER[k]));
    return [P(...RISER[k])];
  };
  out.push(...riser('r1'));
  if (spec.band1) out.push(...raft(0, spec.band1));
  else out.push(...floor(0, ...[].concat(spec.f[0])), ...riser('r2'));
  if (spec.band2) out.push(...raft(1, spec.band2));
  else out.push(...floor(1, ...[].concat(spec.f[1])), ...riser('r3'));
  out.push(...floor(2, ...[].concat(spec.f[2])));
  if (spec.top === 'spring') out.push(SPRING(60, 580, 60));
  else out.push(...riser('r4'), ...riser('r5'));
  out.push(...(spec.extra || []));
  return out;
}
// riser variants: narrow ledge with a spike on its outer side, ice / crumble ledges, 2-step stones
const needle = (w = 40) => (cx, y) => {
  const out = [P(cx, y, w)];
  out.push(cx > 180 ? SPIKE(Math.round(cx + w / 2) + 2, y, 16) : SPIKE(Math.round(cx - w / 2) - 18, y, 16));
  return out;
};
const iceR = (w = 50) => (cx, y) => ICE(cx, y, w);
const crR = (w = 50) => (cx, y) => CR(cx, y, w);
const stones = (cx, y) => [P(cx + (cx > 180 ? -20 : 20), y - 40, 50), P(cx, y, 56)];

// =====================================================================================================
// Second skeleton: STACKED SLABS (family 'slab-*'). Eight full-width floors 87px apart (y 93, 180 ... 702), each
// under a spike hood 66px over it that spans the whole width except ONE window (the hole). You walk to the
// window, jump through it and land on the next floor right above it, under the next hood, whose window is
// elsewhere. The hoods are full width, so no other column leads up (also not with the 🪶 / ⏱ high jumps: a jump
// through a window peaks at most +26px over the next floor, the next hood starts at +66; the second floor is
// 180px above the entry rest, so the first window cannot be used from the rest), and under a hood a
// jump is impossible (walk only), so floors can only be crossed by walking: belts, ice, crumble pieces and
// swinging rafts (joint = small gap, ferry = wide gap) make the time. A window never lies over the entry /
// exit rest (x 110..250) on the first / last floor. Why not open ledge shafts, spring chains, stone rows,
// pocket fields: the solver proves them clearable but 🪶 / ⏱ high jumps (reach ~215px) climb two ledges at once.
// `gate: true` marks what the route cannot avoid: every floor that must be walked (and every raft)
// (tests/obby-structures.test.js).
// floors[k] = { hole (x of the window centre), kind: 'plain'|'ice'|'crumble'|'belt'|'joint'|'ferry', piece, belt,
// gap, phase }; speed = swing speed of the rafts.
// =====================================================================================================
const G = (p) => ({ ...p, gate: true });
const HOOD = 66;   // hood height over a slab floor
function slabs({ floors, y0 = 94, dy = 86, hw = 48, speed = 1.2 }) {
  const out = [];
  floors.forEach((fl, k) => {
    const y = y0 + k * dy, from = k ? floors[k - 1].hole : 180, to = fl.hole;
    const free = Math.abs(to - from) - 2 * hw - 4;   // a gap must stay under the hood: a window would let you jump across it
    let kind = fl.kind || 'plain';
    const x0 = 10, x1 = 350;
    if ((kind === 'joint' || kind === 'ferry') && (free < 60 || k === 0)) kind = 'plain';   // no room for a gap (the first floor: from the entry rest a jump clears it)
    // gate = the whole floor when it must be walked (the window is not above the previous one) and every raft:
    // the route cannot avoid them (a double jump up a chimney of two aligned windows does skip a floor, by design)
    const walk = Math.abs(to - from) >= hw, Gw = (p) => (walk ? G(p) : p);
    if (kind === 'plain') out.push(Gw(P((x0 + x1) / 2, y, x1 - x0)));
    else if (kind === 'ice') out.push(Gw(ICE((x0 + x1) / 2, y, x1 - x0)));
    else if (kind === 'belt') out.push(Gw(BELT((x0 + x1) / 2, y, x1 - x0, (to >= from ? -1 : 1) * (fl.belt ?? 70))));
    else if (kind === 'crumble') out.push(...pieces(x0, x1, y, fl.piece ?? 50, CR));
    else if (kind === 'joint' || kind === 'ferry') {
      // a swinging raft in a gap midway between the window you came through and the next one
      const gap = Math.min(kind === 'joint' ? 80 : fl.gap ?? 120, free), rw = 40, range = (gap - rw) / 2;
      const m = Math.round((from + to) / 2), g0 = m - gap / 2, g1 = m + gap / 2;
      out.push(P((x0 + g0) / 2, y, g0 - x0), G(MOV(m, y, rw, range, speed, fl.phase ?? k * 1.1)), P((g1 + x1) / 2, y, x1 - g1));
    } else throw new Error('slab kind ' + kind);
    if (to - hw > 0) out.push(CEIL(0, to - hw, y + HOOD));
    if (to + hw < WORLD_W) out.push(CEIL(to + hw, WORLD_W, y + HOOD));
  });
  return out;
}
// window layouts (x of the window centre per floor); win() pairs them with floor kinds (a gap that does not fit
// under the hood, or on the first floor, becomes a plain floor)
const EDGE = [60, 300, 60, 300, 60, 300, 60, 300];      // far edge to far edge: long walks
const NEAR = [90, 270, 90, 270, 90, 270, 90, 270];      // two inner windows: short walks
const CHIM = [300, 300, 60, 60, 300, 300, 60, 60];      // pairs of windows above each other: a chimney, then a long walk
const SPIRAL = [60, 300, 180, 60, 300, 180, 60, 300];   // left, right, middle, ...
const WAVE = [60, 180, 300, 180, 60, 180, 300, 300];    // left to right and back
const win = (holes, kinds, o = {}) => holes.map((hole, k) => ({ hole, kind: Array.isArray(kinds) ? kinds[k % kinds.length] : kinds, ...o }));

export const SECTIONS = [
  // ---------------- tier 1 쉬움: plain walkways, wide ledges, one gentle idea each (target 6-10 s) ----------------
  { id: 't1-01', tier: 1, name: '가시 천장 복도', theme: 'hall', platforms: tower3({ f: ['plain', 'plain', 'plain'] }) },
  { id: 't1-02', tier: 1, name: '징검다리 오르기', theme: 'stones', platforms: tower3({
    f: ['plain', 'plain', 'plain'], r: { r1: stones, r2: stones, r3: stones, r4: stones } }) },
  { id: 't1-03', tier: 1, name: '통통 스프링', theme: 'spring', platforms: tower3({ f: ['plain', 'crumble', 'plain'], top: 'spring' }) },
  { id: 't1-04', tier: 1, name: '흔들 뗏목', theme: 'moving', platforms: tower3({ f: ['plain', null, 'plain'], band2: { speed: 1.2 } }) },
  { id: 't1-05', tier: 1, name: '살짝 미끄러운 복도', theme: 'ice', platforms: tower3({ f: ['plain', 'ice', 'plain'] }) },
  { id: 't1-06', tier: 1, name: '부서지는 복도', theme: 'crumble', platforms: tower3({ f: [['crumble', { piece: 70 }], 'plain', ['crumble', { piece: 70 }]] }) },
  { id: 't1-07', tier: 1, name: '데굴데굴 컨베이어', theme: 'conveyor', platforms: tower3({ f: ['beltWith', 'belt', 'plain'] }) },
  { id: 't1-08', tier: 1, name: '가시 조심', theme: 'spikes', platforms: tower3({
    f: ['plain', ['plain', { endSpike: true }], 'plain'], r: { r2: needle(56), r3: needle(56), r4: needle(56) } }) },
  { id: 't1-09', tier: 1, name: '움직이는 다리', theme: 'moving', platforms: tower3({ f: ['plain', ['joint1', { speed: 1.6 }], 'plain'] }) },

  // ---------------- tier 2 보통: two ideas mixed, slower floors, timing (target 10-16 s) ----------------
  { id: 't2-01', tier: 2, name: '뗏목 건너뛰기', theme: 'moving', platforms: tower3({
    f: [['belt', { belt: 100 }], null, ['joint1', { speed: 1.1, phase: 1 }]], band2: { speed: 1.1, phase: 2, w: 44 },
    r: { r1: stones, r2: needle(44), r4: stones, r5: needle(44) } }) },
  { id: 't2-02', tier: 2, name: '얼음 복도', theme: 'ice', platforms: tower3({
    f: ['ice', ['joint1', { speed: 1.4 }], ['belt', { belt: 90 }]], r: { r2: iceR(), r3: iceR(), r4: iceR() } }) },
  { id: 't2-03', tier: 2, name: '무너지는 복도', theme: 'crumble', platforms: tower3({
    f: ['crumble', ['belt', { belt: 110 }], ['belt', { belt: 90 }]], r: { r1: stones, r2: crR(56), r3: stones, r4: crR(56) } }) },
  { id: 't2-04', tier: 2, name: '거꾸로 컨베이어', theme: 'conveyor', platforms: tower3({ f: [['belt', { belt: 90 }], ['belt', { belt: 90 }], ['belt', { belt: 90 }]] }) },
  { id: 't2-05', tier: 2, name: '스프링 사다리', theme: 'spring', platforms: tower3({
    f: [['belt', { belt: 90 }], ['joint1', { speed: 1.5 }], 'ice'], top: 'spring', r: { r2: needle(50), r3: needle(50) } }) },
  { id: 't2-06', tier: 2, name: '가시 사이 통과', theme: 'spikes', platforms: tower3({
    f: [['belt', { belt: 90, endSpike: true }], ['ice', { endSpike: true }], ['belt', { belt: 90, endSpike: true }]],
    r: { r1: needle(46), r2: needle(46), r3: needle(46), r4: needle(46), r5: needle(46) } }) },
  { id: 't2-07', tier: 2, name: '흔들 부서짐', theme: 'crumble', platforms: tower3({
    f: [['joint1', { speed: 1.1 }], null, ['belt', { belt: 90 }]], band2: { speed: 1.1, phase: 1, ledge: CR, w: 46 }, r: { r2: crR(50) } }) },
  { id: 't2-08', tier: 2, name: '미끄러운 공장', theme: 'ice', platforms: tower3({ f: ['ice', ['belt', { belt: 110 }], ['ice', { endSpike: true }]], r: { r1: stones, r3: iceR(50) } }) },
  { id: 't2-09', tier: 2, name: '움직이는 복도', theme: 'moving', platforms: tower3({
    f: [['joint1', { speed: 1.6 }], ['joint1', { speed: 1.6, phase: 2 }], ['joint1', { speed: 1.6, phase: 4 }]] }) },

  // ---------------- tier 3 어려움: longer, timed and precise (target 14-24 s) ----------------
  { id: 't3-01', tier: 3, name: '바늘 끝 발판', theme: 'stones', platforms: tower3({
    f: [['belt', { endSpike: true }], ['joint2', { speed: 1.2 }], ['belt', { endSpike: true }]],
    r: { r1: needle(38), r2: needle(38), r3: needle(38), r4: needle(38), r5: needle(38) } }) },
  { id: 't3-02', tier: 3, name: '얼음 외나무다리', theme: 'ice', platforms: tower3({
    f: [['ice', { endSpike: true }], ['joint2', { speed: 1.0, phase: 1 }], ['belt', { belt: 100, endSpike: true }]],
    r: { r2: iceR(44), r3: iceR(44), r4: iceR(44), r5: iceR(44) } }) },
  { id: 't3-03', tier: 3, name: '무너지는 뗏목', theme: 'moving', platforms: tower3({
    f: [null, ['joint2', { speed: 1.0 }], ['belt', { belt: 115, endSpike: true }]], band1: { speed: 1.0, ledge: CR, w: 42, raftW: 54 },
    r: { r1: stones, r3: crR(44), r4: stones, r5: crR(44) } }) },
  { id: 't3-04', tier: 3, name: '시계태엽 복도', theme: 'moving', platforms: tower3({
    f: [['joint2', { speed: 1.1 }], ['joint2', { speed: 1.1, phase: 2 }], ['joint2', { speed: 1.1, phase: 4 }]],
    r: { r2: needle(44), r4: needle(44) } }) },
  { id: 't3-05', tier: 3, name: '컨베이어 미로', theme: 'conveyor', finalGate: true, platforms: tower3({
    f: [['belt', { belt: 110, endSpike: true }], ['joint2', { speed: 1.2, phase: 3 }], ['belt', { belt: 110, endSpike: true }]],
    r: { r2: needle(42), r3: crR(46), r4: needle(42) } }) },
  { id: 't3-06', tier: 3, name: '스프링 바늘길', theme: 'spring', platforms: tower3({
    f: [['joint2', { speed: 1.2 }], ['belt', { belt: 105, endSpike: true }], ['crumble', { piece: 44 }]], top: 'spring',
    r: { r1: needle(40), r2: needle(40), r3: needle(40) } }) },
  { id: 't3-07', tier: 3, name: '가시밭 징검다리', theme: 'spikes', platforms: tower3({
    f: [['belt', { belt: 100, endSpike: true }], ['joint2', { speed: 1.2, phase: 1 }], ['ice', { endSpike: true }]],
    r: { r1: needle(38), r2: needle(38), r3: needle(38), r4: needle(38), r5: needle(38) } }) },
  { id: 't3-08', tier: 3, name: '마지막 관문', theme: 'final', finalGate: true, platforms: tower3({
    f: [['joint2', { speed: 1.2 }], null, ['joint2', { speed: 1.2, phase: 3 }]], band2: { speed: 1.2, phase: 1, ledge: CR, w: 42, raftW: 54 },
    r: { r1: iceR(44), r2: crR(44), r4: needle(40), r5: iceR(44) } }) },
  { id: 't3-09', tier: 3, name: '얼음 공장', theme: 'ice', platforms: tower3({
    f: [['ice', { endSpike: true }], ['belt', { endSpike: true }], ['joint2', { speed: 1.2, phase: 2 }]],
    r: { r1: iceR(44), r2: iceR(44), r3: iceR(44), r4: crR(44) } }) },

  // ---------------- new structures: stacked slabs (family != 'switchback'), see slabs() ----------------
  // tier 1
  { id: 't1-10', tier: 1, family: 'slab-edge', name: '지그재그 창문 탑', theme: 'hall', platforms: slabs({ floors: win(EDGE, 'plain') }) },
  { id: 't1-11', tier: 1, family: 'slab-near', name: '가까운 창문', theme: 'hall', platforms: slabs({ floors: win(NEAR, 'plain') }) },
  { id: 't1-12', tier: 1, family: 'slab-chimney', name: '쌍둥이 굴뚝', theme: 'hall', platforms: slabs({ floors: win(CHIM, 'plain') }) },
  { id: 't1-13', tier: 1, family: 'slab-spiral', name: '빙글빙글 창문', theme: 'hall', platforms: slabs({ floors: win(SPIRAL, 'plain') }) },
  { id: 't1-14', tier: 1, family: 'slab-wave', name: '물결 창문', theme: 'ice', platforms: slabs({ floors: win(WAVE, 'ice') }) },
  // tier 2
  { id: 't2-10', tier: 2, family: 'slab-edge', name: '거꾸로 창문 탑', theme: 'conveyor', platforms: slabs({ floors: win(EDGE, 'belt') }) },
  { id: 't2-11', tier: 2, family: 'slab-near', name: '창문 사이 뗏목', theme: 'moving', platforms: slabs({ speed: 1.1, floors: win(NEAR, 'ferry') }) },
  { id: 't2-12', tier: 2, family: 'slab-spiral', name: '돌고 도는 창문', theme: 'moving', platforms: slabs({ floors: win(SPIRAL, ['plain', 'ferry', 'plain', 'belt', 'plain', 'ferry', 'plain', 'ice']) }) },
  { id: 't2-13', tier: 2, family: 'slab-chimney', name: '뗏목 굴뚝', theme: 'moving', platforms: slabs({ floors: win(CHIM, ['ferry', 'plain', 'plain', 'plain', 'ferry', 'plain', 'ferry', 'plain']) }) },
  { id: 't2-14', tier: 2, family: 'slab-near', name: '컨베이어 창문', theme: 'conveyor', platforms: slabs({ floors: win(NEAR, 'belt', { belt: 100 }) }) },
  // tier 3
  { id: 't3-10', tier: 3, family: 'slab-edge', name: '뗏목 창문 탑', theme: 'moving', platforms: slabs({ speed: 1.0, floors: win(EDGE, 'ferry') }) },
  { id: 't3-11', tier: 3, family: 'slab-near', name: '느린 뗏목 창문', theme: 'moving', platforms: slabs({ speed: 0.9, floors: win(NEAR, ['ferry', 'ferry', 'belt', 'ferry'], { belt: 100 }) }) },
  { id: 't3-12', tier: 3, family: 'slab-spiral', name: '소용돌이 창문', theme: 'conveyor', platforms: slabs({ floors: win(SPIRAL, ['ferry', 'plain', 'belt', 'ferry']) }) },
  { id: 't3-13', tier: 3, family: 'slab-chimney', name: '굴뚝 관문', theme: 'final', finalGate: true, platforms: slabs({ floors: win(CHIM, ['ferry', 'plain']) }) },
  { id: 't3-14', tier: 3, family: 'slab-edge', name: '창문 관문', theme: 'final', finalGate: true, platforms: slabs({ speed: 1.0, floors: win(EDGE, ['ferry', 'joint']) }) },
].map((s) => ({ family: 'switchback', ...s, platforms: s.platforms.flat() }));

export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

function withDefaults(p) {
  if (p.type === 'spike') return { ...p };
  return { surface: 'normal', ...p };
}

// The full platform list of a section in relative coords: [entry rest, exit rest, ...pattern platforms].
export function sectionPlatforms(pattern) {
  return [{ ...REST_ENTRY }, { ...REST_EXIT }, ...pattern.platforms.map(withDefaults)];
}

// Horizontal mirror inside the 360px world: x -> 360 - x - w; moving platforms move the opposite way
// (baseX mirrored, phase + PI), conveyor belts flip direction.
export function mirrorPlatform(p) {
  const q = { ...p, x: WORLD_W - p.x - p.w };
  if (p.type === 'moving') {
    q.baseX = WORLD_W - p.baseX - p.w;
    q.phase = (p.phase || 0) + Math.PI;
  }
  if (p.belt) q.belt = -p.belt;
  return q;
}
export function mirrorPattern(pattern) {
  return { ...pattern, mirrored: !pattern.mirrored, platforms: pattern.platforms.map(mirrorPlatform) };
}

// Is the pattern proven clearable under a stepPlayer-env mutator kind?
export function isCompatible(pattern, kind) {
  return !(pattern.incompatible || []).includes(kind);
}

