// Jump map world logic: pure functions, no DOM. World y goes UP (feet height in px).
export const WORLD_W = 360;
export const PX_PER_M = 40;            // 40px of height = 1m (score unit)
export const GRAVITY = 1400;           // px/s^2
export const JUMP_V = 518;             // px/s (~30% lower than the old 620)
export const MAX_JUMP_HEIGHT = 96;     // ~ JUMP_V^2 / (2 * GRAVITY)
export const DOUBLE_JUMP_V = 478;      // air jump sets vy to this (~85% of the single height)
export const DOUBLE_JUMP_HEIGHT = 82;  // ~ DOUBLE_JUMP_V^2 / (2 * GRAVITY)
export const REACH_MARGIN = 20;        // safety margin kept below the theoretical double-jump reach
export const MAX_GAP = MAX_JUMP_HEIGHT + DOUBLE_JUMP_HEIGHT - REACH_MARGIN; // 158
export const MOVE_SPEED = 175;         // px/s
export const PLAYER_HALF_W = 11;
export const PLAYER_H = 30;
export const SPIKE_H = 16;
export const MOVING_START_Y = 240;     // 6m
export const SPIKE_START_Y = 320;      // 8m
export const INVINCIBLE_SEC = 1.5;
export const COYOTE_SEC = 0.1;         // a tiny grace after walking off a ledge
export const JUMP_BUFFER_SEC = 0.12;   // press just before landing still counts

// ---- task 15: new elements, introduced step by step ----
export const SPRING_V = 730;           // spring pad bounce: peak ~190px (~2x a single jump), no energy cost
export const SPRING_PAD_HALF = 20;     // the pad is the centre 40px of a spring platform
export const SPRING_START_Y = 400;     // 10m
export const ICE_ACCEL = 150;          // px/s^2 while on ice (낮을수록 출발이 느리고 미끄러움; 이전 260)
export const ICE_DECEL = 40;           // px/s^2 sliding to a stop on ice (낮을수록 오래 미끄러짐; 이전 90, 최고 속도에서 약 380px 미끄러짐)
export const BELT_SPEED = 70;          // px/s conveyor push
export const CRUMBLE_SEC = 0.5;        // standing time before a crumble platform falls
export const WIND_SPEED = 45;          // px/s horizontal push inside a wind zone
export const ITEM_R = 14;
export const ENERGY_START_Y = 480;     // 12m
export const QUIZ_START_Y = 1000;      // 25m
export const ENERGY_ITEM_GAIN = 3;
export const CHECKPOINT_EVERY = 2000;  // 50m
const CP_CALM = 260;                   // no stone rows/hazards on the way up to a checkpoint
const ITEM_MIN_PLATFORMS = 6;          // at most one item within any 6 consecutive platforms

// Height sections (20m = 800px), one primary gimmick each. Pure and independent of chunk borders.
export const SECTION_PX = 800;
export const UNLOCK_Y = { plain: 0, moving: 240, stones: 320, spikes: 320, crumble: 800, ice: 1400, conveyor: 2000, wind: 2800 };
const HEAVY = new Set(['stones', 'spikes', 'crumble', 'ice', 'conveyor', 'wind']);
const PLAIN_AFTER_HEAVY = 0.5, PLAIN_AFTER_LIGHT = 0.06;

function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
// deterministic integer hash -> [0,1)
function hashU(n, salt = 0, seed = 0) {
  return mix(mix(Math.imul(n | 0, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA6B)) ^ mix(seed | 0)) / 4294967296;
}

const planCache = new Map();
function computePlan(i, seed, prev) {
  if (i === 0) return { gimmick: 'moving' }; // the first lesson: moving platforms from 6m
  const prevG = prev[i - 1].gimmick;
  if (prevG !== 'plain' && hashU(i, 1, seed) < (HEAVY.has(prevG) ? PLAIN_AFTER_HEAVY : PLAIN_AFTER_LIGHT)) return { gimmick: 'plain' };
  const end = (i + 1) * SECTION_PX;
  const cands = Object.keys(UNLOCK_Y).filter((k) => k !== 'plain' && k !== prevG && UNLOCK_Y[k] < end);
  const wt = (k) => (k === 'moving' ? 2.2 : k === 'spikes' ? 2 : 1) * (UNLOCK_Y[k] >= i * SECTION_PX - SECTION_PX ? 2 : 1); // favour freshly unlocked ones
  const total = cands.reduce((a, k) => a + wt(k), 0);
  let r = hashU(i, 2, seed) * total;
  for (const k of cands) { r -= wt(k); if (r < 0) return { gimmick: k }; }
  return { gimmick: cands[cands.length - 1] };
}
export function sectionPlan(index, seed = 0) {
  index = Math.max(0, Math.floor(index));
  let arr = planCache.get(seed);
  if (!arr) {
    if (planCache.size > 16) planCache.clear();
    arr = [];
    planCache.set(seed, arr);
  }
  while (arr.length <= index) arr.push(computePlan(arr.length, seed, arr));
  return arr[index];
}
// Gimmick active at height y: the section's one, but only from its unlock height on.
export function gimmickAtY(y, seed = 0) {
  const g = sectionPlan(Math.floor(Math.max(0, y) / SECTION_PX), seed).gimmick;
  return y >= UNLOCK_Y[g] ? g : 'plain';
}

// Wind zones [{y0,y1,vx}] for the 'wind' sections (70m+): 1-2 zones of 250-400px, alternating direction.
export function generateWindZones(fromY, toY, seed = 0) {
  const out = [];
  const s1 = Math.floor(toY / SECTION_PX);
  for (let si = Math.max(0, Math.floor(fromY / SECTION_PX)); si <= s1; si++) {
    if (sectionPlan(si, seed).gimmick !== 'wind') continue;
    const start = Math.max(si * SECTION_PX, UNLOCK_Y.wind), avail = (si + 1) * SECTION_PX - start;
    if (avail < 250) continue;
    const n = avail >= 700 && hashU(si, 3, seed) < 0.5 ? 2 : 1;
    const slot = avail / n;
    const dir0 = hashU(si, 4, seed) < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const hMax = Math.min(400, Math.floor(slot - (n > 1 ? 20 : 0)));
      const h = 250 + Math.floor(hashU(si, 5 + k, seed) * (hMax - 250 + 1));
      const y0 = Math.floor(start + k * slot + hashU(si, 8 + k, seed) * (slot - h));
      const z = { y0, y1: y0 + h, vx: dir0 * (k % 2 ? -1 : 1) * WIND_SPEED };
      if (z.y1 >= fromY && z.y0 <= toY) out.push(z);
    }
  }
  return out;
}

// Vertical step between platforms varies per step (ratio of the single-jump height).
// Early (< 10m): 0.6-0.9. Later: 60% 0.6-0.95 (single jump), 30% 0.95-1.25 (needs the double jump),
// 10% 1.25-1.5 (tight double-jump hops). Never above MAX_GAP.
export const STEP_RATIO = 0.8;
export const STEP_EARLY_Y = 400;
export function stepRatio(y, rng) {
  if (y < STEP_EARLY_Y) return 0.6 + 0.3 * rng();
  const r = rng();
  if (r < 0.6) return 0.6 + 0.35 * rng();
  if (r < 0.9) return 0.95 + 0.3 * rng();
  return 1.25 + 0.25 * rng();
}
// Constant nominal step, used by index.js to join chunks (always reachable).
export function gapAt() {
  return MAX_JUMP_HEIGHT * STEP_RATIO; // 76.8
}

// Platform width tiers: narrow [38,48], medium [58,80], wide [92,120]; mix depends on height.
export const STONE_START_Y = 320;      // 8m: stepping-stone rows ('징검다리') begin
export function pickWidth(y, rng) {
  const pNarrow = y < 200 ? 0 : Math.min(0.55, 0.12 + y * 0.00012);
  const pWide = Math.max(0.1, 0.35 - y * 0.0001);
  const r = rng();
  const t = r < pNarrow ? [38, 48] : r < pNarrow + pWide ? [92, 120] : [58, 80];
  return Math.round(t[0] + rng() * (t[1] - t[0]));
}

// Horizontal spread (max center-to-center shift between neighbouring platforms, px).
// Learning zone (< 10m) keeps the old +-100; it widens to +-160 by ~40m. The widest hops
// (edge gap ~100px) are beyond a plain single jump, so they ask for a run-up or the double jump.
export const SPREAD_EARLY = 100;
export const SPREAD_MAX = 160;
export function horizontalSpread(y) {
  return Math.min(SPREAD_MAX, SPREAD_EARLY + Math.max(0, y - 400) * 0.05);
}

export function createPlayer(x, y) {
  return {
    x, y, vy: 0, vx: 0, landedOn: null, onGround: false, ground: null,
    coyote: 0, jumpBuf: 0, airJumped: false, invincible: 0, fallLimit: -Infinity, facing: 1,
  };
}

// Platform = { x, y, w, type: 'static'|'moving'|'spike', surface: 'normal'|'ice'|'conveyor'|'crumble' }
//   (+ belt for conveyors, feature 'spring'|'checkpoint', baseX/range/speed/phase for moving).
// First platform is exactly at fromY; later ones are spaced by a random fraction of gapAt().
// opts.startX: center x of the previous platform so chunks chain smoothly.
// opts.seed: per-game seed for the section planner. opts.carry: object kept by the caller between
// chunks (next checkpoint / spring heights) so rules hold across chunk borders.
// Spikes sit beside a platform, only on the side away from the previous/next solid platform,
// so they are never on the path between platforms (and never on the last platform of a chunk).
export function generatePlatforms(fromY, toY, rng, opts = {}) {
  const seed = opts.seed ?? 0;
  const carry = opts.carry || {};
  if (carry.cpY === undefined) carry.cpY = Math.max(CHECKPOINT_EVERY, Math.ceil(fromY / CHECKPOINT_EVERY) * CHECKPOINT_EVERY);
  if (carry.springY === undefined) carry.springY = Math.max(SPRING_START_Y, fromY) + 250;
  if (carry.after === undefined) carry.after = 0;
  const solids = [];
  const wantSpike = [];
  let y = fromY;
  let cx = opts.startX ?? (60 + rng() * 240);
  let first = opts.startX === undefined;
  let prevStone = false;
  let ratio = 0;
  while (y <= toY) {
    const cp = y >= carry.cpY;                                   // this platform is the 50m checkpoint
    const calm = cp || carry.after > 0 || y >= carry.cpY - CP_CALM; // keep the area around a checkpoint plain
    const g = calm ? 'plain' : gimmickAtY(y, seed);
    if (!first && !prevStone && g === 'stones' && rng() < 0.5) {
      // stepping-stone row: n narrow bricks laid out horizontally, each a separate hop
      // wide gaps (hard): 30-34px bricks, 4 per row (5 rarely), edge gap 56-76px (44-50 for 5), clamped to fit the screen
      const n = rng() < 0.1 ? 5 : 4;
      const w = 30 + Math.round(rng() * 4);
      const gp = Math.min(n === 5 ? 44 + rng() * 6 : 56 + rng() * 20, (348 - n * w) / (n - 1));
      const span = (n - 1) * (w + gp);
      const dir = cx < 180 ? 1 : -1;
      const lo = dir > 0 ? w / 2 + 4 : w / 2 + 4 + span;
      const hi = dir > 0 ? 356 - w / 2 - span : 356 - w / 2;
      let c = Math.min(hi, Math.max(lo, cx));
      let by = y;
      for (let i = 0; i < n; i++) {
        solids.push({ x: Math.round(c - w / 2), y: by, w, type: 'static', surface: 'normal', stone: true });
        wantSpike.push(false);
        cx = c;
        c += dir * (w + gp);
        by += rng() * 16;
      }
      y = solids[solids.length - 1].y;
      prevStone = true;
      ratio = stepRatio(y, rng);
      y += MAX_JUMP_HEIGHT * ratio;
      continue;
    }
    prevStone = false;
    const movingP = g === 'moving' ? Math.min(0.5, 0.25 + (y - MOVING_START_Y) / 1600) : 0.06;
    const moving = !calm && y >= MOVING_START_Y && rng() < movingP;
    let w = pickWidth(y, rng);
    let surface = 'normal', belt;
    if (moving) w = Math.max(w, 60);
    else if (cp) w = 120 + Math.round(rng() * 12);
    else if (g === 'crumble' && rng() < 0.55) { surface = 'crumble'; w = Math.max(w, 58); }
    else if (g === 'ice' && rng() < 0.55) { surface = 'ice'; w = Math.max(w, 70); }
    else if (g === 'conveyor' && rng() < 0.55) { surface = 'conveyor'; w = Math.max(w, 70); belt = (rng() < 0.5 ? -1 : 1) * BELT_SPEED; }
    if (!first) {
      const spread = horizontalSpread(y) * (ratio > 1.25 ? 0.6 : 1);
      // early: uniform shift (easy); later: always a real sideways hop, 40-100% of the spread
      const mag = y < MOVING_START_Y ? rng() * spread : spread * (0.4 + 0.6 * rng());
      cx += (rng() < 0.5 ? -1 : 1) * mag;
    }
    const range = moving ? 24 + Math.round(rng() * 16) : 0;
    const margin = w / 2 + range;
    cx = Math.min(WORLD_W - margin, Math.max(margin, cx));
    const x = Math.round(cx - w / 2);
    if (moving) {
      solids.push({ x, y, w, type: 'moving', surface: 'normal', baseX: x, range, speed: 0.8 + rng() * 0.7, phase: rng() * Math.PI * 2 });
      wantSpike.push(false);
    } else {
      const plat = { x, y, w, type: 'static', surface };
      if (belt) plat.belt = belt;
      let spring = false;
      if (cp) {
        plat.feature = 'checkpoint';
        plat.cp = Math.round(carry.cpY / PX_PER_M);
        carry.cpY += CHECKPOINT_EVERY;
        carry.after = 1;
      } else {
        if (carry.after > 0) carry.after--;
        if (!first && !calm && surface === 'normal' && w >= 58 && y >= carry.springY) {
          plat.feature = 'spring'; spring = true;
          carry.springY = y + 800 + rng() * 400;
        }
      }
      solids.push(plat);
      const spikeP = g === 'spikes' ? 0.7 : 0.18;
      wantSpike.push(!calm && !spring && surface === 'normal' && y >= SPIKE_START_Y && rng() < spikeP);
    }
    first = false;
    ratio = stepRatio(y, rng);
    y += MAX_JUMP_HEIGHT * ratio;
  }
  const span = (p) => (p.type === 'moving' ? [p.baseX - p.range, p.baseX + p.w + p.range] : [p.x, p.x + p.w]);
  const out = [];
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i];
    out.push(p);
    const next = solids[i + 1];
    if (!wantSpike[i] || !next) continue;
    const prev = solids[i - 1];
    const [pl, pr] = span(p);
    const sw = 36;
    const cand = [
      { x: pr + 26, ok: pr + 26 + sw <= WORLD_W },
      { x: pl - 26 - sw, ok: pl - 26 - sw >= 0 },
    ];
    for (const c of cand) {
      if (!c.ok) continue;
      const clear = [prev, next].every((n) => {
        if (!n) return true;
        const [l, r] = span(n);
        return c.x + sw <= l - 4 || c.x >= r + 4;
      });
      if (clear) { out.push({ x: c.x, y: p.y, w: sw, type: 'spike' }); break; }
    }
  }
  return out;
}

// Pickups (not platforms): { type: 'energy'|'quiz', x, y (centre), taken: false }.
// energy (+3, from 12m, ~1 per 40m) hovers 50-70px above a narrow/stone platform (a small detour);
// quiz block (from 25m, ~1 per 60m) floats 60-90px above a wide platform. Never in the first 12m,
// never over spikes/platforms, at most one item per 6 consecutive platforms. `carry` persists between chunks.
export function generateItems(platforms, fromY, toY, rng, carry = {}) {
  if (carry.energyY === undefined) carry.energyY = Math.max(ENERGY_START_Y, fromY) + 300;
  if (carry.quizY === undefined) carry.quizY = Math.max(QUIZ_START_Y, fromY) + 500;
  if (carry.since === undefined) carry.since = 99; // platforms passed since the last item
  const solids = platforms.filter((q) => q.type !== 'spike' && !q.gone).sort((a, b) => a.y - b.y);
  const R = ITEM_R + 6;
  const blocked = (ix, iy) => platforms.some((q) => {
    if (q.type === 'spike') return ix + R > q.x && ix - R < q.x + q.w && iy + R > q.y && iy - R < q.y + SPIKE_H + 2;
    const l = q.type === 'moving' ? q.baseX - q.range : q.x, r = q.type === 'moving' ? q.baseX + q.w + q.range : q.x + q.w;
    return ix + R > l && ix - R < r && iy + R > q.y - 16 && iy - R < q.y;
  });
  const items = [];
  // the last two solids are skipped: the next chunk's first platform may sit right above them
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i];
    if (!(p.stone && i > 0 && solids[i - 1].stone)) carry.since++; // a stone row counts as one platform
    if (i >= solids.length - 2 || p.y < fromY || p.y > toY || p.type !== 'static') continue;
    if (carry.since < ITEM_MIN_PLATFORMS) continue;
    if ([solids[i - 1], p, solids[i + 1]].some((q) => q && q.feature === 'checkpoint')) continue;
    let type = null;
    if (p.y >= carry.quizY && p.w >= 92) type = 'quiz';
    else if (p.y >= carry.energyY && (p.stone || p.w <= 60 || p.y >= carry.energyY + 500)) type = 'energy';
    if (!type) continue;
    const iy = type === 'energy' ? p.y + 50 + rng() * 20 : p.y + 60 + rng() * 30;
    const off = (rng() * 2 - 1) * (type === 'energy' ? Math.min(24, p.w / 2) : Math.min(16, p.w / 4));
    const ix = Math.min(WORLD_W - 20, Math.max(20, p.x + p.w / 2 + off));
    if (blocked(ix, iy)) continue;
    items.push({ type, x: Math.round(ix), y: Math.round(iy), taken: false });
    carry.since = 0;
    if (type === 'energy') carry.energyY = p.y + 1400 + rng() * 400;
    else carry.quizY = p.y + 600 + rng() * 400;
  }
  return items;
}

// Does the player's body (x +- half width, y..y+PLAYER_H) touch the item circle?
export function itemTouches(player, item) {
  const nx = Math.min(player.x + PLAYER_HALF_W, Math.max(player.x - PLAYER_HALF_W, item.x));
  const ny = Math.min(player.y + PLAYER_H, Math.max(player.y, item.y));
  return (nx - item.x) ** 2 + (ny - item.y) ** 2 <= ITEM_R * ITEM_R;
}

// Respawn spot after a fall: the last safe platform if it is still valid (not a spike / not crumbled)
// and on screen above the touch pads (feet at least RESPAWN_MIN_ABOVE_CAM px above the camera bottom),
// otherwise the lowest visible solid platform above that line (never higher than needed, so no free
// height) - or a checkpoint platform just above it (within 160px).
export const RESPAWN_MIN_ABOVE_CAM = 150;
export function pickRespawnPlatform(platforms, lastSafe, camY) {
  const minY = camY + RESPAWN_MIN_ABOVE_CAM;
  const ok = (q) => q.type !== 'spike' && !q.gone;
  if (lastSafe && ok(lastSafe) && lastSafe.y >= minY) return lastSafe;
  let p = null, cp = null;
  for (const q of platforms) {
    if (!ok(q) || q.y < minY) continue;
    if (!p || q.y < p.y) p = q;
    if (q.feature === 'checkpoint' && (!cp || q.y < cp.y)) cp = q;
  }
  if (p && cp && cp.y - p.y <= 160) return cp;
  return p || platforms.find((q) => ok(q) && q.y >= camY) || platforms[0];
}

const windAt = (zones, y) => {
  let v = 0;
  if (zones) for (const z of zones) if (y >= z.y0 && y <= z.y1) v += z.vx;
  return v;
};
const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

// Advances the player one tick. input = { left, right, jump (a fresh press), canJump (default true) }.
// env = { wind: [{y0,y1,vx}], gravityScale (default 1), jumpScale (default 1: multiplies the ground AND
// air jump launch speed; springs are unaffected) } (all optional; defaults leave the jump map unchanged).
// Events: 'landed' | 'fell' | 'jumped' (ground) | 'doubleJumped' (the one air jump) | 'hit' |
// 'blocked' (a jump wanted but canJump is false) | 'sprang' (spring pad bounce) | 'crumbled'.
export function stepPlayer(state, input, dt, platforms, env = {}) {
  const events = [];
  const s = state;
  const gScale = (env && env.gravityScale) ?? 1;
  const jScale = (env && env.jumpScale) ?? 1;

  if (input.jump) s.jumpBuf = JUMP_BUFFER_SEC;
  if (s.invincible > 0) s.invincible = Math.max(0, s.invincible - dt);

  // horizontal
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) s.facing = dir;
  const g0 = s.onGround ? s.ground : null;
  if (g0 && g0.dx) s.x += g0.dx;
  if (g0 && g0.surface === 'ice') {
    // slippery: speed builds up / bleeds off gradually
    s.vx = dir ? toward(s.vx || 0, dir * MOVE_SPEED, ICE_ACCEL * dt) : toward(s.vx || 0, 0, ICE_DECEL * dt);
    s.x += s.vx * dt;
  } else {
    s.vx = 0;
    s.x += dir * MOVE_SPEED * dt;
  }
  if (g0 && g0.surface === 'conveyor') s.x += (g0.belt || 0) * dt;
  s.x += windAt(env && env.wind, s.y) * dt;
  const cl = Math.min(WORLD_W - PLAYER_HALF_W, Math.max(PLAYER_HALF_W, s.x));
  const wallPinned = cl !== s.x;
  if (wallPinned) s.vx = 0;
  s.x = cl;

  // still supported? (pinned against the world wall, the body's centre must still be over the platform:
  // otherwise a belt pushing you into the wall would hold you on a ledge you are mostly hanging off)
  if (s.onGround) {
    const g = s.ground;
    if (!g || g.gone || s.x + PLAYER_HALF_W < g.x || s.x - PLAYER_HALF_W > g.x + g.w ||
        (wallPinned && (s.x < g.x || s.x > g.x + g.w))) {
      s.onGround = false;
      s.ground = null;
      s.coyote = COYOTE_SEC;
    }
  } else if (s.coyote > 0) {
    s.coyote = Math.max(0, s.coyote - dt);
  }

  // crumble: the platform gives way after CRUMBLE_SEC of standing on it
  if (s.onGround && s.ground.surface === 'crumble') {
    const gp = s.ground;
    gp.crumbleT = (gp.crumbleT || 0) + dt;
    if (gp.crumbleT >= CRUMBLE_SEC) {
      gp.gone = true;
      s.onGround = false;
      s.ground = null;
      s.coyote = COYOTE_SEC;
      events.push('crumbled');
    }
  }

  // jump (ground, or just after leaving a ledge)
  if (s.jumpBuf > 0) {
    s.jumpBuf = Math.max(0, s.jumpBuf - dt);
    if (s.onGround || s.coyote > 0) {
      if (input.canJump === false) {
        s.jumpBuf = 0;
        events.push('blocked');
      } else {
        s.jumpBuf = 0;
        s.coyote = 0;
        s.onGround = false;
        s.ground = null;
        s.vy = JUMP_V * jScale;
        events.push('jumped');
      }
    } else if (input.jump && !s.airJumped) {
      // fresh press while airborne: one extra jump per airtime (replaces the current vy)
      s.jumpBuf = 0;
      if (input.canJump === false) {
        events.push('blocked');
      } else {
        s.airJumped = true;
        s.vy = DOUBLE_JUMP_V * jScale;
        events.push('doubleJumped');
      }
    }
  }

  // vertical
  if (s.onGround) {
    s.vy = 0;
    s.y = s.ground.y;
  } else {
    const prevY = s.y;
    const prevVy = s.vy;
    s.y += s.vy * dt - 0.5 * GRAVITY * gScale * dt * dt;
    s.vy -= GRAVITY * gScale * dt;
    if (prevVy <= 0 || s.vy <= 0) {
      let best = null;
      for (const p of platforms) {
        if (p.type === 'spike' || p.gone) continue;
        if (s.x + PLAYER_HALF_W < p.x || s.x - PLAYER_HALF_W > p.x + p.w) continue;
        if (prevY >= p.y - 0.001 && s.y <= p.y && s.vy <= 0 && (!best || p.y > best.y)) best = p;
      }
      if (best) {
        s.y = best.y;
        s.vy = 0;
        s.onGround = true;
        s.ground = best;
        s.landedOn = best;
        s.coyote = 0;
        s.airJumped = false;
        events.push('landed');
        if (best.feature === 'spring' && Math.abs(s.x - (best.x + best.w / 2)) <= SPRING_PAD_HALF) {
          // automatic bounce, free of energy; the air jump is available again
          s.vy = SPRING_V;
          s.onGround = false;
          s.ground = null;
          events.push('sprang');
        }
      }
    }
  }

  // spikes
  if (s.invincible <= 0) {
    for (const p of platforms) {
      if (p.type !== 'spike') continue;
      if (s.x + PLAYER_HALF_W > p.x + 3 && s.x - PLAYER_HALF_W < p.x + p.w - 3 &&
          s.y < p.y + SPIKE_H && s.y + PLAYER_H > p.y) {
        s.invincible = INVINCIBLE_SEC;
        s.onGround = false;
        s.ground = null;
        s.vy = 360;
        events.push('hit');
        break;
      }
    }
  }

  if (s.y < s.fallLimit) events.push('fell');
  return { state: s, events };
}
