// 3D 탑쌓기: 순수 논리 (DOM 없음)
// slab = { cx, cz, w, d }  (중심과 크기, 월드 단위). w = x축 크기, d = z축 크기. 높이는 SLAB_H 고정.
export const SLAB_H = 28;
export const BASE_SIZE = 200;
export const TOLERANCE = 4;     // 이 이내는 퍼펙트
export const REGROW = 6;        // 퍼펙트 연속 시 회복량(양 축)
export const REGROW_FROM = 3;   // 이미 콤보가 이 값 이상일 때 다음 퍼펙트부터 회복
export const AMPLITUDE = 220; // 새 블록이 중앙에 닿기까지 ~1.5초(260일 때 1.8초는 답답해서 줄임)
export const SPEED_BASE = 140;
export const SPEED_PER_LAYER = 6;
export const SPEED_CAP = 420;

export function speedFor(layer) {
  return Math.min(SPEED_CAP, SPEED_BASE + SPEED_PER_LAYER * layer);
}

// 층 1 = x축, 층 2 = z축, ...
export function axisFor(layer) {
  return layer % 2 === 1 ? 'x' : 'z';
}

export function hueFor(base, layer) {
  return (((base + 12 * layer) % 360) + 360) % 360;
}

// 이동 거리 s -> 위치(-amp..amp, s=0에서 -amp). 주기 = 4*amp 거리.
export function triangle(s, amp = AMPLITUDE) {
  const period = 4 * amp;
  const p = ((s % period) + period) % period;
  return p < 2 * amp ? -amp + p : 3 * amp - p;
}

// 이동 블록이 한 번 왕복하는 데 걸리는 시간
export function periodFor(layer, amp = AMPLITUDE) {
  return (4 * amp) / speedFor(layer);
}

// 층마다 시작하는 쪽이 번갈아 바뀐다 (+1 / -1)
export function sideFor(layer) {
  return layer % 2 === 0 ? 1 : -1;
}

// t초 지난 시점의 중심 기준 오프셋
export function offsetAt(layer, t, amp = AMPLITUDE) {
  return sideFor(layer) * triangle(speedFor(layer) * t, amp);
}

export function createBase(size = BASE_SIZE) {
  return { cx: 0, cz: 0, w: size, d: size };
}

// layer 층의 이동 블록(t초 시점). prev 의 크기/중심을 물려받고 이동 축만 오프셋
export function movingAt(prev, layer, t) {
  const axis = axisFor(layer);
  const m = { cx: prev.cx, cz: prev.cz, w: prev.w, d: prev.d };
  const off = offsetAt(layer, t);
  if (axis === 'x') m.cx += off; else m.cz += off;
  return { axis, slab: m, offset: off };
}

// 놓기. axis 로 이동하던 moving 을 prev 위에 놓는다.
// 반환 { kind:'perfect'|'cut'|'miss', slab, debris, combo, offset }
export function place(prev, moving, axis, combo = 0, tolerance = TOLERANCE, cap = BASE_SIZE) {
  const isX = axis === 'x';
  const pc = isX ? prev.cx : prev.cz;
  const mc = isX ? moving.cx : moving.cz;
  const size = isX ? moving.w : moving.d;
  const offset = mc - pc;
  const abs = Math.abs(offset);

  if (abs <= tolerance) {
    let w = moving.w, d = moving.d;
    if (combo >= REGROW_FROM) { w = Math.min(cap, w + REGROW); d = Math.min(cap, d + REGROW); }
    return { kind: 'perfect', slab: { cx: prev.cx, cz: prev.cz, w, d }, debris: null, combo: combo + 1, offset };
  }
  const overlap = size - abs;
  if (overlap <= 0) {
    return { kind: 'miss', slab: null, debris: { cx: moving.cx, cz: moving.cz, w: moving.w, d: moving.d }, combo: 0, offset };
  }
  // 겹침 구간의 중점
  const lo = Math.max(mc - size / 2, pc - size / 2);
  const hi = Math.min(mc + size / 2, pc + size / 2);
  const newC = (lo + hi) / 2;
  const mLo = mc - size / 2, mHi = mc + size / 2;
  // 튀어나온 구간
  const dLo = offset > 0 ? hi : mLo;
  const dHi = offset > 0 ? mHi : lo;
  const dC = (dLo + dHi) / 2;
  const dS = dHi - dLo;
  const slab = isX ? { cx: newC, cz: moving.cz, w: overlap, d: moving.d } : { cx: moving.cx, cz: newC, w: moving.w, d: overlap };
  const debris = isX ? { cx: dC, cz: moving.cz, w: dS, d: moving.d } : { cx: moving.cx, cz: dC, w: moving.w, d: dS };
  return { kind: 'cut', slab, debris, combo: 0, offset };
}

// 월드 -> 화면 (아이소메트릭, 원근 없음). 카메라 월드점 (cx,cz,cy)이 (ox,oy)에 온다.
export const ISO_X = 0.866;
export const ISO_Y = 0.5;
export function project(x, z, y, k, cam, ox, oy) {
  return {
    sx: ox + ((x - cam.x) - (z - cam.z)) * k * ISO_X,
    sy: oy + ((x - cam.x) + (z - cam.z)) * k * ISO_Y - (y - cam.y) * k,
  };
}

// ---- 쌓을 때 반짝이는 효과 (순수 함수) ----
export const SPARKLE_SWEEP_SEC = 0.5;
export const SPARKLE_SWEEP_PERFECT_SEC = 0.7;
export const SPARKLE_STAR_SEC = 0.35;        // 별 하나가 반짝이는 시간
export const SPARKLE_STAGGER = 0.06;

export function sparkleDuration(perfect) {
  const n = sparkleCount(0, perfect);
  const sweep = perfect ? SPARKLE_SWEEP_PERFECT_SEC : SPARKLE_SWEEP_SEC;
  if (n <= 0) return sweep; // 별이 없으면 빛줄기 시간만
  return Math.max(sweep, (n - 1) * SPARKLE_STAGGER + SPARKLE_STAR_SEC + 0.1);
}

// 일반 4~6개 (층 번호로 결정). 퍼펙트는 별 모양 효과 없음(빛줄기와 흰 고리만).
export function sparkleCount(layer, perfect) {
  if (perfect) return 0;
  return 4 + (((layer % 3) + 3) % 3);
}

function hash01(n) {
  let x = (Math.imul(n | 0, 374761393) + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 층 번호와 경과 시간 t로 정해지는 반짝임 상태.
// sweep: 0..1 (끝나면 null), stars: 윗면 안쪽 좌표 u,v(0..1), scale/alpha(0..1)
export function sparkleAt(layer, t, perfect = false) {
  const sweepDur = perfect ? SPARKLE_SWEEP_PERFECT_SEC : SPARKLE_SWEEP_SEC;
  const sweep = t >= 0 && t < sweepDur ? t / sweepDur : null;
  const n = sparkleCount(layer, perfect);
  const stars = [];
  for (let i = 0; i < n; i++) {
    const p = (t - i * SPARKLE_STAGGER) / SPARKLE_STAR_SEC;
    if (p <= 0 || p >= 1) continue;
    const s = Math.sin(Math.PI * p);
    stars.push({
      u: 0.1 + 0.8 * hash01(layer * 31 + i * 7 + 1),
      v: 0.1 + 0.8 * hash01(layer * 17 + i * 13 + 5),
      scale: s * (perfect ? 1.5 : 1),
      alpha: s,
    });
  }
  return { sweep, stars };
}

export function sparkleDone(t, perfect) { return t >= sparkleDuration(perfect); }

// ---- 게임 종료 리뷰: 탑 전체가 화면에 들어오는 시점 ----
export const PLAY_K = 0.57;
export const REVIEW_K_MIN = 0.06;

// slabs[i] = 층 i의 slab (층 i는 y = i*SLAB_H ~ (i+1)*SLAB_H). W,H = 논리 화면, pad = { top, bottom, side }.
// 반환 { k, ox, oy }: project(x,z,y,k,{x:0,z:0,y:0},ox,oy) 로 그리면 탑 전체가 패딩 안쪽 사각형에 들어간다.
export function fitView(slabs, W, H, pad = {}, playK = PLAY_K) {
  const top = pad.top ?? 0, bottom = pad.bottom ?? 0, side = pad.side ?? 0;
  const aw = Math.max(1, W - 2 * side), ah = Math.max(1, H - top - bottom);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const addPt = (x, z, y) => {
    const sx = (x - z) * ISO_X, sy = (x + z) * ISO_Y - y;
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  };
  const list = slabs && slabs.length ? slabs : [createBase()];
  list.forEach((s, i) => {
    for (const x of [s.cx - s.w / 2, s.cx + s.w / 2]) for (const z of [s.cz - s.d / 2, s.cz + s.d / 2]) {
      addPt(x, z, i * SLAB_H); addPt(x, z, (i + 1) * SLAB_H);
    }
  });
  const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
  const k = Math.min(playK, Math.max(REVIEW_K_MIN, Math.min(aw / bw, ah / bh)));
  const ox = W / 2 - k * (minX + maxX) / 2;
  const oy = top + ah / 2 - k * (minY + maxY) / 2;
  return { k, ox, oy };
}
